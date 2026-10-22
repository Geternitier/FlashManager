use crate::job_object::{kill_process_tree_fallback, ProcessJob};
use crate::models::{
    DashboardSnapshot, DiagnoseReport, LogEntry, LogPage, PersistentConfigFile, PlatformMetrics,
    ProxyApplyReport, ProxyPreview, ProxyRule, ServiceConfig, ServiceStatus, ServiceType,
    ServiceView,
};
use crate::proxy::{self, RenderRoute};
use chrono::Local;
use encoding_rs::{GBK, UTF_8};
use std::collections::{HashMap, VecDeque};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const MAX_LOG_LINES: usize = 2000;
const CREATE_NO_WINDOW: u32 = 0x08000000;
pub const AGENT_API_PORT: u16 = 19527;

pub struct ManagedServiceInstance {
    pub config: ServiceConfig,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub started_at: Option<Instant>,
    pub last_started_ms: Option<u64>,
    pub cpu_usage: f32,
    pub memory_mb: f32,
    pub port_active: bool,
    pub logs: VecDeque<LogEntry>,
    pub log_origin: u64,
    pub next_log_seq: u64,
    pub generation: u64,
    pub job: Option<Arc<ProcessJob>>,
    pub stop_requested: bool,
}

impl ManagedServiceInstance {
    pub fn new(config: ServiceConfig) -> Self {
        let mut instance = Self {
            config: config.clone(),
            status: ServiceStatus::Stopped,
            pid: None,
            started_at: None,
            last_started_ms: None,
            cpu_usage: 0.0,
            memory_mb: 0.0,
            port_active: false,
            logs: VecDeque::with_capacity(64),
            log_origin: 0,
            next_log_seq: 0,
            generation: 0,
            job: None,
            stop_requested: false,
        };
        instance.push_log(
            "SYS",
            format!(
                "[FlashManager] 已加载服务配置 ({:?}): {}",
                config.service_type, config.executable
            ),
        );
        instance
    }

    pub fn push_log(&mut self, level: &str, text: String) {
        if self.logs.len() >= MAX_LOG_LINES {
            self.logs.pop_front();
            self.log_origin = self.log_origin.saturating_add(1);
        }
        self.logs.push_back(LogEntry {
            time: now_time_str(),
            level: level.to_string(),
            text,
        });
        self.next_log_seq = self.next_log_seq.saturating_add(1);
    }

    pub fn to_view(&self) -> ServiceView {
        let uptime_seconds = match (self.status == ServiceStatus::Running, self.started_at) {
            (true, Some(t)) => t.elapsed().as_secs(),
            _ => 0,
        };
        ServiceView {
            id: self.config.id.clone(),
            name: self.config.name.clone(),
            group: self.config.group.clone(),
            service_type: self.config.service_type.clone(),
            executable: self.config.executable.clone(),
            script_path: self.config.script_path.clone(),
            args: self.config.args.clone(),
            cwd: self.config.cwd.clone(),
            env: self.config.env.clone(),
            encoding: self.config.encoding.clone(),
            auto_restart: self.config.auto_restart,
            port: self.config.port,
            frontend_url: self.config.frontend_url.clone(),
            status: self.status.clone(),
            pid: self.pid,
            cpu_usage: self.cpu_usage,
            memory_mb: self.memory_mb,
            uptime_seconds,
            port_active: self.port_active,
            last_started_at: self.last_started_ms,
            logs: Vec::new(),
        }
    }
}

pub struct SupervisorState {
    pub services: Vec<ManagedServiceInstance>,
    pub sys: System,
    pub config_dir: PathBuf,
    pub services_d_dir: PathBuf,
    pub config_file: PathBuf,
    pub proxy_file: PathBuf,
    pub proxy_rules: Vec<ProxyRule>,
}

#[derive(Clone)]
pub struct SupervisorHandle {
    pub inner: Arc<Mutex<SupervisorState>>,
    pub token: Arc<String>,
}

impl SupervisorHandle {
    pub fn new(base_dir: PathBuf) -> Self {
        let config_dir = base_dir.join("config");
        let services_d_dir = config_dir.join("services.d");
        if let Err(err) = std::fs::create_dir_all(&services_d_dir) {
            crate::report_error(&format!(
                "无法创建配置目录 {}\n{}",
                services_d_dir.display(),
                err
            ));
        }
        let config_file = config_dir.join("services.json");
        let proxy_file = config_dir.join("proxies.json");
        let proxy_rules = proxy::load_rules(&proxy_file);
        let token = Arc::new(load_or_create_token(&config_dir));

        let initial_configs = load_or_init_configs(&config_file, &base_dir);
        let services = initial_configs
            .into_iter()
            .map(ManagedServiceInstance::new)
            .collect();

        let state = SupervisorState {
            services,
            sys: System::new(),
            config_dir,
            services_d_dir,
            config_file,
            proxy_file,
            proxy_rules,
        };

        let handle = Self {
            inner: Arc::new(Mutex::new(state)),
            token,
        };

        handle.spawn_background_monitors();
        handle
    }

    fn spawn_background_monitors(&self) {
        // 1. Resource & Port monitor loop (every 2 seconds)
        let handle_metrics = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(2)).await;
                handle_metrics.refresh_runtime_metrics();
            }
        });

        // 2. Hot-reload watcher for `config/services.d/*.json` (every 1.5 seconds)
        let handle_watcher = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut known_mtimes: HashMap<PathBuf, std::time::SystemTime> = HashMap::new();
            loop {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                let dir = {
                    let guard = handle_watcher.inner.lock().unwrap();
                    guard.services_d_dir.clone()
                };
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) != Some("json") {
                            continue;
                        }
                        let Ok(meta) = entry.metadata() else { continue };
                        let Ok(mtime) = meta.modified() else { continue };
                        let changed = known_mtimes.get(&path).map(|t| *t != mtime).unwrap_or(true);
                        if changed {
                            known_mtimes.insert(path.clone(), mtime);
                            if let Ok(raw) = std::fs::read_to_string(&path) {
                                if let Ok(cfg) = serde_json::from_str::<ServiceConfig>(&raw) {
                                    let auto_start = cfg.auto_start_on_register;
                                    let id = cfg.id.clone();
                                    let _ = handle_watcher.upsert_service(cfg, Some("services.d 热加载"));
                                    if auto_start {
                                        let _ = handle_watcher.start_service(&id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    pub fn save_configs_to_disk(&self) -> Result<(), String> {
        let (path, payload) = {
            let guard = self.inner.lock().unwrap();
            let payload = PersistentConfigFile {
                version: "1.0".to_string(),
                services: guard.services.iter().map(|s| s.config.clone()).collect(),
            };
            (guard.config_file.clone(), payload)
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                format!("无法创建配置目录 {}: {}", parent.display(), e)
            })?;
        }
        let json = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("配置序列化失败: {}", e))?;
        std::fs::write(&path, json)
            .map_err(|e| format!("写入配置失败 {}: {}", path.display(), e))?;
        Ok(())
    }

    fn note_save_error(&self, id: &str) {
        if let Err(err) = self.save_configs_to_disk() {
            self.append_log(id, "ERR", format!("[FlashManager] {}", err));
        }
    }

    pub fn refresh_runtime_metrics(&self) {
        let mut guard = self.inner.lock().unwrap();
        let self_pid = std::process::id();
        let mut pids_to_refresh = vec![Pid::from_u32(self_pid)];
        for svc in &guard.services {
            if let Some(pid) = svc.pid {
                pids_to_refresh.push(Pid::from_u32(pid));
            }
        }
        guard
            .sys
            .refresh_processes(ProcessesToUpdate::Some(&pids_to_refresh), true);

        let sys_ref = &guard.sys;
        let samples: Vec<(f32, f32, Option<u16>)> = guard
            .services
            .iter()
            .map(|svc| {
                if svc.status != ServiceStatus::Running {
                    return (0.0, 0.0, None);
                }
                let (cpu, mem) = if let Some(pid) = svc.pid {
                    if let Some(proc_info) = sys_ref.process(Pid::from_u32(pid)) {
                        (
                            proc_info.cpu_usage(),
                            (proc_info.memory() as f32) / (1024.0 * 1024.0),
                        )
                    } else {
                        (0.0, 0.0)
                    }
                } else {
                    (0.0, 0.0)
                };
                (cpu, mem, svc.config.port)
            })
            .collect();
        drop(guard);

        let ports: Vec<Option<u16>> = samples.iter().map(|(_, _, port)| *port).collect();
        let probed = probe_ports(&ports);

        let mut guard = self.inner.lock().unwrap();
        for (svc, ((cpu, mem, _), port_ok)) in guard
            .services
            .iter_mut()
            .zip(samples.into_iter().zip(probed.into_iter()))
        {
            svc.cpu_usage = cpu;
            svc.memory_mb = mem;
            svc.port_active = port_ok;
        }
    }

    pub fn get_snapshot(&self) -> DashboardSnapshot {
        let mut guard = self.inner.lock().unwrap();
        let self_pid = std::process::id();
        guard
            .sys
            .refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(self_pid)]), true);

        let self_memory_mb = guard
            .sys
            .process(Pid::from_u32(self_pid))
            .map(|p| (p.memory() as f32) / (1024.0 * 1024.0))
            .unwrap_or(8.4);

        let mut total_cpu = 0.0;
        let mut total_mem = 0.0;
        let mut running_count = 0;
        let mut active_ports = Vec::new();
        let mut views = Vec::with_capacity(guard.services.len());

        for svc in &guard.services {
            if svc.status == ServiceStatus::Running {
                running_count += 1;
                total_cpu += svc.cpu_usage;
                total_mem += svc.memory_mb;
                if let Some(port) = svc.config.port {
                    if svc.port_active {
                        active_ports.push(port);
                    }
                }
            }
            views.push(svc.to_view());
        }

        DashboardSnapshot {
            metrics: PlatformMetrics {
                self_pid,
                self_memory_mb,
                total_managed_cpu: total_cpu,
                total_managed_memory_mb: total_mem,
                running_count,
                total_count: views.len(),
                active_ports,
                agent_api_port: AGENT_API_PORT,
                webview_hibernation_enabled: true,
            },
            services: views,
        }
    }

    pub fn get_logs(&self, id: &str, after: u64) -> Result<LogPage, String> {
        let guard = self.inner.lock().unwrap();
        let svc = guard
            .services
            .iter()
            .find(|s| s.config.id == id)
            .ok_or_else(|| format!("未找到服务: {}", id))?;
        let start = if after < svc.log_origin {
            0
        } else {
            (after - svc.log_origin) as usize
        };
        let start = start.min(svc.logs.len());
        Ok(LogPage {
            cursor: svc.next_log_seq,
            entries: svc.logs.iter().skip(start).cloned().collect(),
        })
    }

    pub fn upsert_service(
        &self,
        mut config: ServiceConfig,
        source_note: Option<&str>,
    ) -> ServiceView {
        if config.id.trim().is_empty() {
            config.id = format!("svc-{}", chrono::Utc::now().timestamp_millis());
        }
        if config.cwd.trim().is_empty() {
            if let Some(parent) = Path::new(&config.executable).parent() {
                config.cwd = parent.to_string_lossy().to_string();
            }
        }

        let view = {
            let mut guard = self.inner.lock().unwrap();
            if let Some(existing) = guard.services.iter_mut().find(|s| s.config.id == config.id) {
                existing.config = config.clone();
                if let Some(note) = source_note {
                    existing.push_log("SYS", format!("[FlashManager] 配置已更新 ({})", note));
                }
                existing.to_view()
            } else {
                let mut instance = ManagedServiceInstance::new(config);
                if let Some(note) = source_note {
                    instance.push_log("SYS", format!("[FlashManager] 自动接入成功 ({})", note));
                }
                let v = instance.to_view();
                guard.services.insert(0, instance);
                v
            }
        };

        self.note_save_error(&view.id);
        view
    }

    pub fn delete_service(&self, id: &str) -> Result<(), String> {
        let _ = self.stop_service(id);
        {
            let mut guard = self.inner.lock().unwrap();
            guard.services.retain(|s| s.config.id != id);
        }
        self.save_configs_to_disk()
    }

    pub fn clear_logs(&self, id: &str) -> Result<(), String> {
        let mut guard = self.inner.lock().unwrap();
        if let Some(svc) = guard.services.iter_mut().find(|s| s.config.id == id) {
            svc.logs.clear();
            svc.log_origin = svc.next_log_seq;
            svc.push_log("SYS", "[FlashManager] 控制台日志已清空".to_string());
            Ok(())
        } else {
            Err(format!("Service not found: {}", id))
        }
    }

    pub fn set_encoding(&self, id: &str, encoding: &str) -> Result<(), String> {
        {
            let mut guard = self.inner.lock().unwrap();
            if let Some(svc) = guard.services.iter_mut().find(|s| s.config.id == id) {
                svc.config.encoding = encoding.to_lowercase();
                svc.push_log(
                    "SYS",
                    format!("[FlashManager] 字符编码已切换为: {}", encoding.to_uppercase()),
                );
            } else {
                return Err(format!("Service not found: {}", id));
            }
        }
        self.save_configs_to_disk()?;
        Ok(())
    }

    pub fn start_service(&self, id: &str) -> Result<ServiceView, String> {
        self.start_service_with_generation(id, None)
    }

    fn start_service_with_generation(
        &self,
        id: &str,
        expected_generation: Option<u64>,
    ) -> Result<ServiceView, String> {
        let (config, committed_gen) = {
            let mut guard = self.inner.lock().unwrap();
            let svc = guard
                .services
                .iter_mut()
                .find(|s| s.config.id == id)
                .ok_or_else(|| format!("未找到服务: {}", id))?;

            if svc.status == ServiceStatus::Running {
                return Ok(svc.to_view());
            }
            if let Some(expected) = expected_generation {
                if !restart_still_allowed(svc.stop_requested, expected, svc.generation) {
                    return Ok(svc.to_view());
                }
            }
            svc.generation = svc.generation.wrapping_add(1);
            let committed = svc.generation;
            svc.stop_requested = false;
            (svc.config.clone(), committed)
        };

        let (program, final_args, service_envs, effective_cwd) = build_runner_command(&config)?;
        let envs = overlay_registry_env(service_envs);

        let mut cmd = Command::new(&program);
        cmd.args(&final_args)
            .envs(&envs)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        if !effective_cwd.is_empty() && Path::new(&effective_cwd).exists() {
            cmd.current_dir(&effective_cwd);
        }

        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut guard = self.inner.lock().unwrap();
                if let Some(svc) = guard.services.iter_mut().find(|s| s.config.id == id) {
                    svc.status = ServiceStatus::Error;
                    svc.push_log(
                        "ERR",
                        format!(
                            "[FlashManager] 启动失败 ({} {}): {}",
                            program,
                            final_args.join(" "),
                            e
                        ),
                    );
                    return Err(format!("启动失败: {}", e));
                }
                return Err(format!("启动失败: {}", e));
            }
        };

        let pid = child.id().unwrap_or(0);
        let mut job_arc = if pid > 0 {
            match ProcessJob::create_and_assign(pid) {
                Ok(j) => Some(Arc::new(j)),
                Err(_) => None,
            }
        } else {
            None
        };

        let aborted = {
            let guard = self.inner.lock().unwrap();
            guard
                .services
                .iter()
                .find(|s| s.config.id == id)
                .map(|svc| svc.generation != committed_gen || svc.stop_requested)
                .unwrap_or(true)
        };
        if aborted {
            let _ = child.start_kill();
            drop(job_arc.take());
            if pid > 0 {
                kill_process_tree_fallback(pid);
            }
            let guard = self.inner.lock().unwrap();
            if let Some(svc) = guard.services.iter().find(|s| s.config.id == id) {
                return Ok(svc.to_view());
            }
            return Err("启动已取消".to_string());
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let view = {
            let mut guard = self.inner.lock().unwrap();
            let svc = guard
                .services
                .iter_mut()
                .find(|s| s.config.id == id)
                .ok_or_else(|| "服务已被移除".to_string())?;
            svc.status = ServiceStatus::Running;
            svc.pid = if pid > 0 { Some(pid) } else { None };
            svc.started_at = Some(Instant::now());
            svc.last_started_ms = Some(unix_millis());
            svc.job = job_arc;
            svc.push_log(
                "SYS",
                format!(
                    "[FlashManager] 进程已启动 (PID: {}) [Win32 JobObject 进程树保护已激活]",
                    pid
                ),
            );
            svc.push_log(
                "SYS",
                format!(
                    "[Runner] 命令: {} {}",
                    program,
                    final_args.join(" ")
                ),
            );
            svc.to_view()
        };

        // Spawn async stdout reader
        if let Some(out) = stdout {
            let handle_out = self.clone();
            let svc_id = id.to_string();
            tauri::async_runtime::spawn(async move {
                let mut reader = BufReader::new(out);
                let mut buf = Vec::with_capacity(512);
                while let Ok(n) = reader.read_until(b'\n', &mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let line = decode_console_bytes(&buf, &handle_out.get_encoding(&svc_id));
                    if !line.is_empty() {
                        handle_out.append_log(&svc_id, "OUT", line);
                    }
                    buf.clear();
                }
            });
        }

        // Spawn async stderr reader
        if let Some(err) = stderr {
            let handle_err = self.clone();
            let svc_id = id.to_string();
            tauri::async_runtime::spawn(async move {
                let mut reader = BufReader::new(err);
                let mut buf = Vec::with_capacity(512);
                while let Ok(n) = reader.read_until(b'\n', &mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let line = decode_console_bytes(&buf, &handle_err.get_encoding(&svc_id));
                    if !line.is_empty() {
                        handle_err.append_log(&svc_id, "ERR", line);
                    }
                    buf.clear();
                }
            });
        }

        // Spawn process exit watcher & optional auto-restart
        let handle_wait = self.clone();
        let svc_id = id.to_string();
        tauri::async_runtime::spawn(async move {
            let exit_status = child.wait().await;
            let mut should_restart = false;
            let mut scheduled_gen = 0u64;
            {
                let mut guard = handle_wait.inner.lock().unwrap();
                if let Some(svc) = guard.services.iter_mut().find(|s| s.config.id == svc_id) {
                    if svc.pid == Some(pid) {
                        svc.status = ServiceStatus::Stopped;
                        svc.pid = None;
                        svc.started_at = None;
                        svc.cpu_usage = 0.0;
                        svc.memory_mb = 0.0;
                        svc.port_active = false;
                        svc.job = None;

                        match exit_status {
                            Ok(status) => {
                                let code = status.code().unwrap_or(-1);
                                if svc.stop_requested || code == 0 {
                                    svc.push_log(
                                        "SYS",
                                        format!("[FlashManager] 进程已退出 (退出码: {})", code),
                                    );
                                } else {
                                    svc.push_log(
                                        "ERR",
                                        format!("[FlashManager] 进程异常退出 (退出码: {})", code),
                                    );
                                    if svc.config.auto_restart {
                                        should_restart = true;
                                        scheduled_gen = svc.generation;
                                        svc.push_log(
                                            "SYS",
                                            "[FlashManager] 已开启自动重启，将在 1.5 秒后重新拉起..."
                                                .to_string(),
                                        );
                                    }
                                }
                            }
                            Err(e) => {
                                svc.push_log("ERR", format!("[FlashManager] 进程等待错误: {}", e));
                            }
                        }
                    }
                }
            }

            if should_restart {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                let _ = handle_wait
                    .start_service_with_generation(&svc_id, Some(scheduled_gen));
            }
        });

        Ok(view)
    }

    pub fn stop_service(&self, id: &str) -> Result<ServiceView, String> {
        let (pid_opt, job_opt, config, was_running) = {
            let mut guard = self.inner.lock().unwrap();
            let svc = guard
                .services
                .iter_mut()
                .find(|s| s.config.id == id)
                .ok_or_else(|| format!("未找到服务: {}", id))?;

            let was_running = svc.status == ServiceStatus::Running;
            svc.stop_requested = true;
            svc.generation = svc.generation.wrapping_add(1);
            let pid_opt = svc.pid.take();
            let job_opt = svc.job.take();
            svc.status = ServiceStatus::Stopped;
            svc.started_at = None;
            svc.cpu_usage = 0.0;
            svc.memory_mb = 0.0;
            svc.port_active = false;
            (pid_opt, job_opt, svc.config.clone(), was_running)
        };

        if was_running {
            // For Nginx, try graceful stop first before JobObject termination
            if config.service_type == ServiceType::Nginx && Path::new(&config.executable).exists() {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let mut stop_cmd = std::process::Command::new(&config.executable);
                    if !config.cwd.is_empty() {
                        stop_cmd.args(["-p", &config.cwd]);
                    }
                    stop_cmd.args(["-s", "stop"]);
                    stop_cmd.creation_flags(CREATE_NO_WINDOW);
                    let _ = stop_cmd.output();
                }
            }

            if let Some(job) = job_opt {
                job.terminate();
            }
            if let Some(pid) = pid_opt {
                kill_process_tree_fallback(pid);
            }
        }

        let mut guard = self.inner.lock().unwrap();
        let svc = guard
            .services
            .iter_mut()
            .find(|s| s.config.id == id)
            .ok_or_else(|| format!("未找到服务: {}", id))?;
        if was_running {
            svc.push_log(
                "SYS",
                "[FlashManager] 已通过 Win32 JobObject 销毁整个进程树并释放端口。".to_string(),
            );
        }
        Ok(svc.to_view())
    }

    pub fn restart_service(&self, id: &str) -> Result<ServiceView, String> {
        let _ = self.stop_service(id)?;
        std::thread::sleep(Duration::from_millis(250));
        self.start_service(id)
    }

    pub fn batch_action(&self, group: Option<String>, action: &str) -> DashboardSnapshot {
        let ids: Vec<String> = {
            let guard = self.inner.lock().unwrap();
            guard
                .services
                .iter()
                .filter(|s| match &group {
                    Some(g) if g != "全部服务" && !g.is_empty() => &s.config.group == g,
                    _ => true,
                })
                .map(|s| s.config.id.clone())
                .collect()
        };

        for id in ids {
            if action == "start" {
                let _ = self.start_service(&id);
            } else if action == "stop" {
                let _ = self.stop_service(&id);
            }
        }

        self.get_snapshot()
    }

    pub fn diagnose_service(&self, id: &str, max_lines: usize) -> Result<DiagnoseReport, String> {
        self.refresh_runtime_metrics();
        let guard = self.inner.lock().unwrap();
        let svc = guard
            .services
            .iter()
            .find(|s| s.config.id == id)
            .ok_or_else(|| format!("未找到服务: {}", id))?;

        let port_active = match svc.config.port {
            Some(_) => svc.port_active,
            None => svc.status == ServiceStatus::Running,
        };

        let has_err = svc.logs.iter().rev().take(20).any(|l| l.level == "ERR");
        let healthy = svc.status == ServiceStatus::Running
            && (svc.config.port.is_none() || port_active)
            && !has_err;

        let summary = if healthy {
            format!(
                "服务 '{}' 运行正常 (PID: {:?}{})",
                svc.config.name,
                svc.pid,
                svc.config
                    .port
                    .map(|p| format!(", 端口 :{} 已就绪", p))
                    .unwrap_or_default()
            )
        } else if svc.status != ServiceStatus::Running {
            format!("服务 '{}' 当前未处于运行状态 ({:?})", svc.config.name, svc.status)
        } else {
            format!(
                "服务 '{}' 进程存活但存在告警或端口未就绪 (port_active={})",
                svc.config.name, port_active
            )
        };

        let recent_logs: Vec<LogEntry> = svc
            .logs
            .iter()
            .rev()
            .take(max_lines)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();

        Ok(DiagnoseReport {
            id: svc.config.id.clone(),
            name: svc.config.name.clone(),
            status: svc.status.clone(),
            pid: svc.pid,
            port: svc.config.port,
            port_active,
            healthy,
            summary,
            recent_logs,
        })
    }

    fn get_encoding(&self, id: &str) -> String {
        let guard = self.inner.lock().unwrap();
        guard
            .services
            .iter()
            .find(|s| s.config.id == id)
            .map(|s| s.config.encoding.clone())
            .unwrap_or_else(|| "utf-8".to_string())
    }

    pub fn append_log(&self, id: &str, level: &str, text: String) {
        let mut guard = self.inner.lock().unwrap();
        if let Some(svc) = guard.services.iter_mut().find(|s| s.config.id == id) {
            svc.push_log(level, text);
        }
    }

    pub fn list_proxy_rules(&self) -> Vec<ProxyRule> {
        self.inner.lock().unwrap().proxy_rules.clone()
    }

    pub fn upsert_proxy_rule(&self, rule: ProxyRule) -> Result<ProxyRule, String> {
        let rule = proxy::normalize_rule(&rule)?;
        let (stored, next, path) = {
            let guard = self.inner.lock().unwrap();
            let mut stored = rule;
            if stored.id.is_empty() {
                stored.id = new_proxy_id(&guard.proxy_rules);
            }
            let mut next = guard.proxy_rules.clone();
            if let Some(existing) = next.iter_mut().find(|item| item.id == stored.id) {
                *existing = stored.clone();
            } else {
                next.push(stored.clone());
            }
            proxy::ensure_unique(&next)?;
            check_proxy_target(&stored, &guard.services)?;
            (stored, next, guard.proxy_file.clone())
        };
        proxy::save_rules(&path, &next)?;
        self.inner.lock().unwrap().proxy_rules = next;
        Ok(stored)
    }

    pub fn delete_proxy_rule(&self, id: &str) -> Result<Vec<ProxyRule>, String> {
        let (next, path) = {
            let guard = self.inner.lock().unwrap();
            if !guard.proxy_rules.iter().any(|rule| rule.id == id) {
                return Err("找不到这条反代规则。".to_string());
            }
            let next: Vec<ProxyRule> = guard
                .proxy_rules
                .iter()
                .filter(|rule| rule.id != id)
                .cloned()
                .collect();
            (next, guard.proxy_file.clone())
        };
        proxy::save_rules(&path, &next)?;
        self.inner.lock().unwrap().proxy_rules = next.clone();
        Ok(next)
    }

    pub fn preview_proxy(&self, gateway_id: &str) -> Result<ProxyPreview, String> {
        let prepared = self.prepare_proxy(gateway_id)?;
        Ok(ProxyPreview {
            gateway_id: gateway_id.to_string(),
            config_path: prepared.config_path,
            conf: prepared.rendered,
            warnings: prepared.warnings,
            include_ready: prepared.include_ready,
        })
    }

    pub fn apply_proxy(&self, gateway_id: &str) -> Result<ProxyApplyReport, String> {
        let prepared = self.prepare_proxy(gateway_id)?;
        let installed = match proxy::install_routes(
            &prepared.layout,
            &prepared.rendered,
            &prepared.next_conf,
            prepared.running,
        ) {
            Ok(installed) => installed,
            Err(err) => {
                self.append_log(
                    gateway_id,
                    "ERR",
                    format!("[FlashManager] 反代应用失败: {}", err),
                );
                return Err(err);
            }
        };
        let summary = if installed.reloaded {
            "配置已写入并重载 Nginx。".to_string()
        } else if let Some(err) = &installed.reload_error {
            format!("配置已通过检查，但重载失败。{}", err)
        } else {
            "配置已写入并通过检查。Nginx 未运行，启动后生效。".to_string()
        };
        let level = if installed.reload_error.is_some() {
            "ERR"
        } else {
            "SYS"
        };
        self.append_log(gateway_id, level, format!("[FlashManager] {}", summary));
        Ok(ProxyApplyReport {
            gateway_id: gateway_id.to_string(),
            tested: true,
            reloaded: installed.reloaded,
            nginx_running: prepared.running,
            config_path: prepared.config_path,
            summary,
            warnings: prepared.warnings,
            output: installed.output,
            reload_error: installed.reload_error,
        })
    }

    fn prepare_proxy(&self, gateway_id: &str) -> Result<PreparedProxy, String> {
        let guard = self.inner.lock().unwrap();
        let gateway = guard
            .services
            .iter()
            .find(|svc| svc.config.id == gateway_id)
            .ok_or_else(|| "找不到这个 Nginx 网关。".to_string())?;
        if gateway.config.service_type != ServiceType::Nginx {
            return Err("这个服务不是 Nginx。".to_string());
        }
        let layout = proxy::nginx_layout(&gateway.config)?;
        let running = gateway.status == ServiceStatus::Running;
        let owned: Vec<ProxyRule> = guard
            .proxy_rules
            .iter()
            .filter(|rule| rule.gateway_id == gateway_id)
            .cloned()
            .collect();
        let mut warnings = Vec::new();
        let mut routes = Vec::new();
        for rule in owned.iter().filter(|rule| rule.enabled) {
            let target = guard
                .services
                .iter()
                .find(|svc| svc.config.id == rule.service_id)
                .ok_or_else(|| format!("规则「{}」的目标服务不存在。", rule.name))?;
            if target.config.service_type == ServiceType::Nginx {
                return Err(format!("规则「{}」的目标不能是 Nginx。", rule.name));
            }
            let port = target.config.port.ok_or_else(|| {
                format!(
                    "规则「{}」的目标服务「{}」没有监控端口。",
                    rule.name, target.config.name
                )
            })?;
            if port == rule.listen_port {
                return Err(format!(
                    "规则「{}」的监听端口不能和目标端口相同。",
                    rule.name
                ));
            }
            if target.status != ServiceStatus::Running {
                let msg = format!(
                    "目标服务「{}」当前没有在运行，反代过去会连不上。",
                    target.config.name
                );
                if !warnings.contains(&msg) {
                    warnings.push(msg);
                }
            }
            routes.push(RenderRoute {
                id: rule.id.clone(),
                listen_host: rule.listen_host.clone(),
                listen_port: rule.listen_port,
                location: rule.location.clone(),
                upstream_port: port,
                websocket: rule.websocket,
                strip_prefix: rule.strip_prefix,
            });
        }
        let current = proxy::read_conf_text(&layout.conf_file)?;
        let include = proxy::ensure_include(&current)?;
        warnings.extend(proxy::listen_warnings(&current, &owned));
        let rendered = proxy::render_routes(&routes, proxy::conf_has_upgrade_map(&current));
        let config_path = layout.routes_file.display().to_string();
        Ok(PreparedProxy {
            layout,
            rendered,
            next_conf: include.conf,
            include_ready: !include.changed,
            warnings,
            running,
            config_path,
        })
    }
}

struct PreparedProxy {
    layout: proxy::NginxLayout,
    rendered: String,
    next_conf: String,
    include_ready: bool,
    warnings: Vec<String>,
    running: bool,
    config_path: String,
}

fn check_proxy_target(rule: &ProxyRule, services: &[ManagedServiceInstance]) -> Result<(), String> {
    let gateway = services
        .iter()
        .find(|svc| svc.config.id == rule.gateway_id)
        .ok_or_else(|| "请选择一个 Nginx 服务作为网关。".to_string())?;
    if gateway.config.service_type != ServiceType::Nginx {
        return Err("请选择一个 Nginx 服务作为网关。".to_string());
    }
    let target = services
        .iter()
        .find(|svc| svc.config.id == rule.service_id)
        .ok_or_else(|| "请选择要转发到的 Web 服务。".to_string())?;
    if target.config.service_type == ServiceType::Nginx {
        return Err("目标需要是带监控端口的 Web 服务。".to_string());
    }
    let port = target
        .config
        .port
        .ok_or_else(|| "目标服务没有监控端口，无法作为上游。".to_string())?;
    if port == rule.listen_port {
        return Err("监听端口不能和目标服务的端口相同。".to_string());
    }
    Ok(())
}

fn new_proxy_id(existing: &[ProxyRule]) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut n = 0u32;
    loop {
        let id = format!("proxy-{:x}{:x}", nanos, n);
        if !existing.iter().any(|rule| rule.id == id) {
            return id;
        }
        n = n.saturating_add(1);
    }
}

fn build_runner_command(
    config: &ServiceConfig,
) -> Result<(String, Vec<String>, HashMap<String, String>, String), String> {
    let mut envs = config.env.clone();
    let mut args = Vec::new();
    let mut program = config.executable.trim().to_string();
    let cwd = config.cwd.trim().to_string();

    match config.service_type {
        ServiceType::Python => {
            if program.is_empty() {
                program = "python".to_string();
            }
            envs.entry("PYTHONUNBUFFERED".to_string())
                .or_insert_with(|| "1".to_string());
            envs.entry("PYTHONIOENCODING".to_string())
                .or_insert_with(|| "utf-8".to_string());
            if !config.args.iter().any(|a| a == "-u") {
                args.push("-u".to_string());
            }
            if let Some(script) = &config.script_path {
                if !script.trim().is_empty() {
                    args.push(script.trim().to_string());
                }
            }
            args.extend(config.args.clone());
        }
        ServiceType::Node => {
            if program.is_empty() {
                program = "node".to_string();
            }
            if let Some(script) = &config.script_path {
                if !script.trim().is_empty() {
                    args.push(script.trim().to_string());
                }
            }
            args.extend(config.args.clone());
        }
        ServiceType::Nginx => {
            if !cwd.is_empty() && !config.args.iter().any(|a| a == "-p") {
                args.push("-p".to_string());
                args.push(cwd.clone());
            }
            args.extend(config.args.clone());
        }
        ServiceType::Script => {
            let target = config
                .script_path
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| program.clone());

            if target.to_lowercase().ends_with(".ps1") {
                program = "powershell.exe".to_string();
                args.extend([
                    "-NoProfile".to_string(),
                    "-ExecutionPolicy".to_string(),
                    "Bypass".to_string(),
                    "-File".to_string(),
                    target,
                ]);
                args.extend(config.args.clone());
            } else {
                program = "cmd.exe".to_string();
                args.extend(["/d".to_string(), "/s".to_string(), "/c".to_string(), target]);
                args.extend(config.args.clone());
            }
        }
        ServiceType::Exe => {
            args.extend(config.args.clone());
        }
    }

    if program.is_empty() {
        return Err("可执行程序路径不能为空".to_string());
    }

    Ok((program, args, envs, cwd))
}

fn decode_console_bytes(bytes: &[u8], encoding_pref: &str) -> String {
    let trimmed = bytes
        .strip_suffix(b"\r\n")
        .or_else(|| bytes.strip_suffix(b"\n"))
        .unwrap_or(bytes);
    if trimmed.is_empty() {
        return String::new();
    }

    if encoding_pref.eq_ignore_ascii_case("gbk") {
        let (cow, _, _) = GBK.decode(trimmed);
        return cow.into_owned();
    }

    // Try strict UTF-8 first; if invalid sequences exist (e.g. Windows CP936 output), fallback to GBK
    if let Ok(utf8_str) = std::str::from_utf8(trimmed) {
        return utf8_str.to_string();
    }
    let (cow, _, had_errors) = UTF_8.decode(trimmed);
    if !had_errors {
        cow.into_owned()
    } else {
        let (gbk_cow, _, _) = GBK.decode(trimmed);
        gbk_cow.into_owned()
    }
}

pub fn is_local_port_open(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(120)).is_ok()
}

pub fn now_time_str() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn load_or_init_configs(config_file: &Path, _base_dir: &Path) -> Vec<ServiceConfig> {
    // autoStartOnRegister is ignored on this startup load. It only applies when a
    // services.d file is hot-loaded, or when the register API is called.
    if config_file.exists() {
        if let Ok(raw) = std::fs::read_to_string(config_file) {
            if let Ok(parsed) = serde_json::from_str::<PersistentConfigFile>(&raw) {
                return parsed.services;
            }
        }
    }

    Vec::new()
}

pub fn probe_ports(ports: &[Option<u16>]) -> Vec<bool> {
    ports
        .iter()
        .map(|port| port.map(is_local_port_open).unwrap_or(false))
        .collect()
}

pub fn restart_still_allowed(
    stop_requested: bool,
    expected_generation: u64,
    current_generation: u64,
) -> bool {
    !stop_requested && expected_generation == current_generation
}

fn overlay_registry_env(service_env: HashMap<String, String>) -> HashMap<String, String> {
    #[cfg(windows)]
    {
        let mut merged = HashMap::new();
        let machine_ok = read_env_hive(
            winreg::HKLM,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            &mut merged,
        );
        let mut user_env = HashMap::new();
        let _user_ok = read_env_hive(winreg::HKCU, "Environment", &mut user_env);
        let machine_path = lookup_env(&merged, "Path").map(str::to_string);
        let user_path = lookup_env(&user_env, "Path").map(str::to_string);
        for (key, value) in user_env {
            if !key.eq_ignore_ascii_case("Path") {
                insert_env(&mut merged, key, value);
            }
        }
        if machine_ok {
            if let Some(combined) = combine_path(machine_path.as_deref(), user_path.as_deref()) {
                insert_env(&mut merged, "Path".to_string(), combined);
            }
        }
        expand_env_map(&mut merged);
        for (key, value) in service_env {
            insert_env(&mut merged, key, value);
        }
        merged
    }
    #[cfg(not(windows))]
    {
        service_env
    }
}

#[cfg(windows)]
fn read_env_hive(root: &winreg::RegKey, subkey: &str, into: &mut HashMap<String, String>) -> bool {
    use winreg::enums::{REG_EXPAND_SZ, REG_SZ};
    use winreg::types::FromRegValue;
    let Ok(key) = root.open_subkey(subkey) else {
        return false;
    };
    for item in key.enum_values() {
        let Ok((name, value)) = item else { continue };
        if value.vtype != REG_SZ && value.vtype != REG_EXPAND_SZ {
            continue;
        }
        if name.is_empty() {
            continue;
        }
        if let Ok(text) = String::from_reg_value(&value) {
            insert_env(into, name, text);
        }
    }
    true
}

fn lookup_env<'a>(map: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    map.iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
        .map(|(_, value)| value.as_str())
}

fn insert_env(map: &mut HashMap<String, String>, key: String, value: String) {
    if let Some(existing) = map
        .keys()
        .find(|name| name.eq_ignore_ascii_case(&key))
        .cloned()
    {
        if existing != key {
            map.remove(&existing);
        }
    }
    map.insert(key, value);
}

fn combine_path(machine: Option<&str>, user: Option<&str>) -> Option<String> {
    match (machine.filter(|s| !s.is_empty()), user.filter(|s| !s.is_empty())) {
        (None, None) => None,
        (Some(machine), None) => Some(machine.to_string()),
        (None, Some(user)) => Some(user.to_string()),
        (Some(machine), Some(user)) => Some(format!("{};{}", machine.trim_end_matches(';'), user)),
    }
}

fn expand_env_map(map: &mut HashMap<String, String>) {
    let keys: Vec<String> = map.keys().cloned().collect();
    for _ in 0..4 {
        let mut changed = false;
        for key in &keys {
            let Some(raw) = map.get(key).cloned() else { continue };
            if !raw.contains('%') {
                continue;
            }
            let expanded = expand_percent(&raw, map);
            if expanded != raw {
                map.insert(key.clone(), expanded);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
}

fn expand_percent(raw: &str, map: &HashMap<String, String>) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' {
            if let Some(rel) = chars[i + 1..].iter().position(|c| *c == '%') {
                let name: String = chars[i + 1..i + 1 + rel].iter().collect();
                if !name.is_empty() {
                    let replacement = lookup_env(map, &name)
                        .map(str::to_string)
                        .or_else(|| std::env::var(&name).ok());
                    if let Some(value) = replacement {
                        out.push_str(&value);
                        i += rel + 2;
                        continue;
                    }
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn load_or_create_token(config_dir: &Path) -> String {
    let path = config_dir.join("agent.token");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let token = random_token();
    if let Err(err) = std::fs::write(&path, &token) {
        crate::report_error(&format!("无法写入令牌文件 {}: {}", path.display(), err));
    } else {
        restrict_token_acl(&path);
    }
    token
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    #[cfg(windows)]
    {
        use windows_sys::Win32::Security::Cryptography::BCryptGenRandom;
        let status = unsafe { BCryptGenRandom(std::ptr::null_mut(), bytes.as_mut_ptr(), 32, 0x2) };
        if status == 0 {
            return bytes.iter().map(|b| format!("{:02x}", b)).collect();
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:x}", nanos, std::process::id())
}

fn restrict_token_acl(path: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let user = std::env::var("USERNAME").unwrap_or_default();
        let domain = std::env::var("USERDOMAIN").unwrap_or_default();
        if user.is_empty() {
            return;
        }
        let account = if domain.is_empty() {
            user
        } else {
            format!("{}\\{}", domain, user)
        };
        let _ = std::process::Command::new("icacls")
            .arg(path)
            .arg("/inheritance:r")
            .arg("/grant:r")
            .arg(format!("{}:(R)", account))
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
}

#[cfg(test)]
mod tests {
    use super::{probe_ports, restart_still_allowed};

    #[test]
    fn manual_stop_blocks_auto_restart() {
        assert!(restart_still_allowed(false, 3, 3));
        assert!(!restart_still_allowed(true, 3, 3));
        assert!(!restart_still_allowed(false, 3, 4));
    }

    #[test]
    fn port_probe_runs_without_supervisor_lock() {
        let flags = probe_ports(&[None, Some(1)]);
        assert_eq!(flags.len(), 2);
        assert!(!flags[0]);
        assert!(!flags[1]);
    }
}
