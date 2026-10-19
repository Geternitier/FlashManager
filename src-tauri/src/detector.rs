use crate::models::{ServiceConfig, ServiceType};
use std::collections::HashMap;
use std::path::Path;

/// Automatically inspects a local project directory or file path and infers a `ServiceConfig`
/// so AI Agents (or users) can register any newly developed software with a single path.
pub fn auto_detect_service(
    target_path: &str,
    custom_name: Option<String>,
    custom_group: Option<String>,
) -> Result<ServiceConfig, String> {
    let path = Path::new(target_path.trim());
    if !path.exists() {
        return Err(format!("目标路径不存在: {}", target_path));
    }

    let (dir_path, explicit_file) = if path.is_file() {
        (
            path.parent().unwrap_or_else(|| Path::new(".")).to_path_buf(),
            Some(path.to_path_buf()),
        )
    } else {
        (path.to_path_buf(), None)
    };

    // 1. Check if `.flashservice.json` exists in directory
    let manifest_path = dir_path.join(".flashservice.json");
    if manifest_path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&manifest_path) {
            if let Ok(mut cfg) = serde_json::from_str::<ServiceConfig>(&raw) {
                if cfg.cwd.trim().is_empty() {
                    cfg.cwd = dir_path.to_string_lossy().to_string();
                }
                if let Some(n) = custom_name {
                    cfg.name = n;
                }
                if let Some(g) = custom_group {
                    cfg.group = g;
                }
                if cfg.id.trim().is_empty() {
                    let ident = cfg
                        .script_path
                        .clone()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| cfg.executable.clone());
                    cfg.id = stable_service_id(service_type_key(&cfg.service_type), Path::new(&ident));
                }
                return Ok(cfg);
            }
        }
    }

    let folder_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Local-Service")
        .to_string();

    let name = custom_name.unwrap_or_else(|| format!("{} (Auto)", folder_name));
    let group = custom_group.unwrap_or_else(|| "AI Agent 项目".to_string());
    let cwd = dir_path.to_string_lossy().to_string();

    // If an explicit file was passed, infer from its extension
    if let Some(file) = explicit_file {
        let ext = file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let file_str = file.to_string_lossy().to_string();
        let file_name = file.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if file_name.eq_ignore_ascii_case("nginx.exe") {
            let id = stable_service_id("nginx", &file);
            return Ok(ServiceConfig {
                id,
                name,
                group,
                service_type: ServiceType::Nginx,
                executable: file_str,
                script_path: None,
                args: vec!["-c".to_string(), "conf/nginx.conf".to_string()],
                cwd,
                env: HashMap::new(),
                encoding: "utf-8".to_string(),
                auto_restart: false,
                port: Some(8080),
                auto_start_on_register: false,
                frontend_url: None,
            });
        }

        match ext.as_str() {
            "py" => {
                let py_exec = detect_python_executable(&dir_path);
                let port = scan_file_for_port(&file);
                let id = stable_service_id("python", &file);
                return Ok(ServiceConfig {
                    id,
                    name,
                    group,
                    service_type: ServiceType::Python,
                    executable: py_exec,
                    script_path: Some(file_str),
                    args: Vec::new(),
                    cwd,
                    env: HashMap::new(),
                    encoding: "utf-8".to_string(),
                    auto_restart: true,
                    port,
                    auto_start_on_register: false,
                frontend_url: None,
                });
            }
            "js" | "mjs" | "cjs" => {
                let port = scan_file_for_port(&file);
                let id = stable_service_id("node", &file);
                return Ok(ServiceConfig {
                    id,
                    name,
                    group,
                    service_type: ServiceType::Node,
                    executable: "node".to_string(),
                    script_path: Some(file_str),
                    args: Vec::new(),
                    cwd,
                    env: HashMap::new(),
                    encoding: "utf-8".to_string(),
                    auto_restart: true,
                    port,
                    auto_start_on_register: false,
                frontend_url: None,
                });
            }
            "bat" | "cmd" | "ps1" => {
                let id = stable_service_id("script", &file);
                return Ok(ServiceConfig {
                    id,
                    name,
                    group,
                    service_type: ServiceType::Script,
                    executable: file_str.clone(),
                    script_path: Some(file_str),
                    args: Vec::new(),
                    cwd,
                    env: HashMap::new(),
                    encoding: "gbk".to_string(),
                    auto_restart: false,
                    port: None,
                    auto_start_on_register: false,
                frontend_url: None,
                });
            }
            _ => {
                let id = stable_service_id("exe", &file);
                return Ok(ServiceConfig {
                    id,
                    name,
                    group,
                    service_type: ServiceType::Exe,
                    executable: file_str,
                    script_path: None,
                    args: Vec::new(),
                    cwd,
                    env: HashMap::new(),
                    encoding: "utf-8".to_string(),
                    auto_restart: false,
                    port: None,
                    auto_start_on_register: false,
                frontend_url: None,
                });
            }
        }
    }

    // 2. Directory inspection: Check for Nginx
    let nginx_exe = dir_path.join("nginx.exe");
    if nginx_exe.exists() {
        let id = stable_service_id("nginx", &nginx_exe);
        return Ok(ServiceConfig {
            id,
            name,
            group,
            service_type: ServiceType::Nginx,
            executable: nginx_exe.to_string_lossy().to_string(),
            script_path: None,
            args: vec!["-c".to_string(), "conf/nginx.conf".to_string()],
            cwd,
            env: HashMap::new(),
            encoding: "utf-8".to_string(),
            auto_restart: false,
            port: Some(8080),
            auto_start_on_register: false,
                frontend_url: None,
        });
    }

    // 3. Check for Python entrypoints (`main.py`, `app.py`, `server.py`, `run.py`, `manage.py`)
    let py_candidates = ["main.py", "app.py", "server.py", "run.py", "manage.py", "index.py"];
    for candidate in py_candidates {
        let p = dir_path.join(candidate);
        if p.exists() {
            let py_exec = detect_python_executable(&dir_path);
            let port = scan_file_for_port(&p);
            let id = stable_service_id("python", &p);
            return Ok(ServiceConfig {
                id,
                name,
                group,
                service_type: ServiceType::Python,
                executable: py_exec,
                script_path: Some(p.to_string_lossy().to_string()),
                args: Vec::new(),
                cwd,
                env: HashMap::new(),
                encoding: "utf-8".to_string(),
                auto_restart: true,
                port,
                auto_start_on_register: false,
                frontend_url: None,
            });
        }
    }

    // 4. Check for Node.js project (`package.json` or common entrypoints)
    let node_candidates = [
        "index.js",
        "server.js",
        "app.js",
        "main.js",
        "src/index.js",
        "src/server.js",
        "dist/index.js",
        "dist/main.js",
    ];
    for candidate in node_candidates {
        let p = dir_path.join(candidate);
        if p.exists() {
            let port = scan_file_for_port(&p);
            let id = stable_service_id("node", &p);
            return Ok(ServiceConfig {
                id,
                name,
                group,
                service_type: ServiceType::Node,
                executable: "node".to_string(),
                script_path: Some(p.to_string_lossy().to_string()),
                args: Vec::new(),
                cwd,
                env: HashMap::new(),
                encoding: "utf-8".to_string(),
                auto_restart: true,
                port,
                auto_start_on_register: false,
                frontend_url: None,
            });
        }
    }

    // 5. Fallback: find any `.py`, `.js`, or `.exe` in the directory
    if let Ok(entries) = std::fs::read_dir(&dir_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if ext == "py" {
                    let py_exec = detect_python_executable(&dir_path);
                    let port = scan_file_for_port(&p);
                    let id = stable_service_id("python", &p);
                    return Ok(ServiceConfig {
                        id,
                        name,
                        group,
                        service_type: ServiceType::Python,
                        executable: py_exec,
                        script_path: Some(p.to_string_lossy().to_string()),
                        args: Vec::new(),
                        cwd,
                        env: HashMap::new(),
                        encoding: "utf-8".to_string(),
                        auto_restart: true,
                        port,
                        auto_start_on_register: false,
                frontend_url: None,
                    });
                } else if ext == "js" {
                    let port = scan_file_for_port(&p);
                    let id = stable_service_id("node", &p);
                    return Ok(ServiceConfig {
                        id,
                        name,
                        group,
                        service_type: ServiceType::Node,
                        executable: "node".to_string(),
                        script_path: Some(p.to_string_lossy().to_string()),
                        args: Vec::new(),
                        cwd,
                        env: HashMap::new(),
                        encoding: "utf-8".to_string(),
                        auto_restart: true,
                        port,
                        auto_start_on_register: false,
                frontend_url: None,
                    });
                } else if ext == "exe" {
                    let id = stable_service_id("exe", &p);
                    return Ok(ServiceConfig {
                        id,
                        name,
                        group,
                        service_type: ServiceType::Exe,
                        executable: p.to_string_lossy().to_string(),
                        script_path: None,
                        args: Vec::new(),
                        cwd,
                        env: HashMap::new(),
                        encoding: "utf-8".to_string(),
                        auto_restart: false,
                        port: None,
                        auto_start_on_register: false,
                frontend_url: None,
                    });
                }
            }
        }
    }

    Err(format!(
        "无法在目录 '{}' 中识别出可运行的软件入口 (.py / .js / .exe / .flashservice.json)",
        target_path
    ))
}

fn detect_python_executable(dir_path: &Path) -> String {
    let venv_candidates = [
        dir_path.join(".venv").join("Scripts").join("python.exe"),
        dir_path.join("venv").join("Scripts").join("python.exe"),
        dir_path.join("env").join("Scripts").join("python.exe"),
    ];
    for candidate in venv_candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    "python".to_string()
}

fn scan_file_for_port(file_path: &Path) -> Option<u16> {
    let Ok(content) = std::fs::read_to_string(file_path) else {
        return None;
    };
    // Simple heuristic scan for patterns like `port = 8000`, `PORT = 18081`, `.listen(3000`, `--port 8080`
    let patterns = ["port=", "port =", "PORT =", "PORT=", ".listen("];
    for line in content.lines().take(120) {
        let trimmed = line.trim();
        for pat in patterns {
            if let Some(idx) = trimmed.find(pat) {
                let rest = &trimmed[idx + pat.len()..];
                let digits: String = rest
                    .chars()
                    .skip_while(|c| !c.is_ascii_digit())
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(p) = digits.parse::<u16>() {
                    if p >= 80 && p <= 65534 {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

pub fn stable_service_id(kind: &str, path: &Path) -> String {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let key = format!(
        "{}|{}",
        kind,
        canonical.to_string_lossy().to_lowercase()
    );
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("svc-{:016x}", hash)
}

fn service_type_key(service_type: &ServiceType) -> &'static str {
    match service_type {
        ServiceType::Exe => "exe",
        ServiceType::Nginx => "nginx",
        ServiceType::Node => "node",
        ServiceType::Python => "python",
        ServiceType::Script => "script",
    }
}

#[cfg(test)]
mod tests {
    use super::stable_service_id;
    use std::path::Path;

    #[test]
    fn same_path_and_type_keep_the_same_id() {
        let path = Path::new("D:/Develop/example/server.py");
        assert_eq!(
            stable_service_id("python", path),
            stable_service_id("python", path)
        );
        assert_ne!(
            stable_service_id("python", path),
            stable_service_id("node", path)
        );
        assert_ne!(
            stable_service_id("python", path),
            stable_service_id("python", Path::new("D:/other/server.py"))
        );
    }
}
