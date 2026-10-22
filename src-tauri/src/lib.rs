pub mod agent_api;
pub mod detector;
pub mod job_object;
pub mod models;
pub mod proxy;
pub mod supervisor;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use crate::agent_api::spawn_agent_http_server;
use crate::detector::auto_detect_service;
use crate::models::{
    DashboardSnapshot, DiagnoseReport, LogPage, ProxyApplyReport, ProxyPreview, ProxyRule,
    ServiceConfig, ServiceView,
};
use crate::supervisor::SupervisorHandle;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,     WindowEvent,
};

static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static INSTANCE_MUTEX: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(std::ptr::null_mut());

pub fn resolve_data_root() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    if !launched_from_cargo_target(&exe_dir) {
        return exe_dir;
    }

    exe_dir
        .parent()
        .and_then(|target_dir| target_dir.parent())
        .and_then(|parent| {
            if parent.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
                parent.parent().map(|root| root.to_path_buf())
            } else {
                Some(parent.to_path_buf())
            }
        })
        .unwrap_or(exe_dir)
}

fn launched_from_cargo_target(exe_dir: &Path) -> bool {
    let name = exe_dir.file_name().and_then(|value| value.to_str());
    let parent = exe_dir
        .parent()
        .and_then(|path| path.file_name())
        .and_then(|value| value.to_str());
    matches!(
        (parent, name),
        (Some("target"), Some("debug") | Some("release"))
    )
}

pub fn agent_token_path() -> PathBuf {
    resolve_data_root().join("config").join("agent.token")
}

pub fn read_agent_token() -> String {
    std::fs::read_to_string(agent_token_path())
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub fn focus_running_window() {
    if let Some(app) = APP_HANDLE.get() {
        show_or_recreate_main_window(app);
    }
}

pub fn report_error(text: &str) {
    let path = resolve_data_root().join("flashmanager-error.txt");
    let _ = std::fs::write(&path, text);
    #[cfg(windows)]
    message_box(text);
}

#[cfg(windows)]
fn message_box(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONWARNING, MB_OK};
    let body: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let title: Vec<u16> = "FlashManager".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONWARNING,
        );
    }
}

fn acquire_single_instance() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows_sys::Win32::System::Threading::CreateMutexW;
        let name: Vec<u16> = "Local\\FlashManager.SingleInstance\0"
            .encode_utf16()
            .collect();
        let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return true;
        }
        let already = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
        if already {
            unsafe {
                CloseHandle(handle);
            }
            return false;
        }
        INSTANCE_MUTEX.store(handle, Ordering::SeqCst);
        true
    }
    #[cfg(not(windows))]
    {
        true
    }
}

fn notify_existing_instance() {
    for _ in 0..15 {
        if request_focus_once() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    report_error("FlashManager 已在运行，但没有唤醒主窗口。请从托盘图标打开。");
}

fn request_focus_once() -> bool {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    let addr = SocketAddr::from(([127, 0, 0, 1], crate::supervisor::AGENT_API_PORT));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(200)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let req = b"POST /api/v1/focus HTTP/1.1\r\nHost: 127.0.0.1:19527\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    if stream.write_all(req).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    let n = stream.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).contains("200")
}

#[tauri::command]
fn get_dashboard_snapshot(sup: State<'_, SupervisorHandle>) -> DashboardSnapshot {
    sup.get_snapshot()
}

#[tauri::command]
fn get_service_logs(
    sup: State<'_, SupervisorHandle>,
    id: String,
    after: Option<u64>,
) -> Result<LogPage, String> {
    sup.get_logs(&id, after.unwrap_or(0))
}

#[tauri::command]
fn save_service_config(
    sup: State<'_, SupervisorHandle>,
    config: ServiceConfig,
    start_now: Option<bool>,
) -> Result<ServiceView, String> {
    let mut view = sup.upsert_service(config, Some("界面配置保存"));
    if start_now.unwrap_or(false) {
        view = sup.start_service(&view.id)?;
    }
    Ok(view)
}

#[tauri::command]
fn delete_service_config(
    sup: State<'_, SupervisorHandle>,
    id: String,
) -> Result<DashboardSnapshot, String> {
    sup.delete_service(&id)?;
    Ok(sup.get_snapshot())
}

#[tauri::command]
fn start_service_cmd(sup: State<'_, SupervisorHandle>, id: String) -> Result<ServiceView, String> {
    sup.start_service(&id)
}

#[tauri::command]
fn stop_service_cmd(sup: State<'_, SupervisorHandle>, id: String) -> Result<ServiceView, String> {
    sup.stop_service(&id)
}

#[tauri::command]
fn restart_service_cmd(
    sup: State<'_, SupervisorHandle>,
    id: String,
) -> Result<ServiceView, String> {
    sup.restart_service(&id)
}

#[tauri::command]
fn batch_service_action(
    sup: State<'_, SupervisorHandle>,
    group: Option<String>,
    action: String,
) -> DashboardSnapshot {
    sup.batch_action(group, &action)
}

#[tauri::command]
fn clear_service_logs(
    sup: State<'_, SupervisorHandle>,
    id: String,
) -> Result<DashboardSnapshot, String> {
    sup.clear_logs(&id)?;
    Ok(sup.get_snapshot())
}

#[tauri::command]
fn set_service_encoding(
    sup: State<'_, SupervisorHandle>,
    id: String,
    encoding: String,
) -> Result<DashboardSnapshot, String> {
    sup.set_encoding(&id, &encoding)?;
    Ok(sup.get_snapshot())
}

#[tauri::command]
fn auto_detect_and_register(
    sup: State<'_, SupervisorHandle>,
    path: String,
    name: Option<String>,
    group: Option<String>,
    start_now: Option<bool>,
) -> Result<ServiceView, String> {
    let cfg = auto_detect_service(&path, name, group)?;
    let mut view = sup.upsert_service(cfg, Some("智能目录探测接入"));
    if start_now.unwrap_or(true) {
        view = sup.start_service(&view.id)?;
    }
    Ok(view)
}

#[tauri::command]
fn diagnose_service_cmd(
    sup: State<'_, SupervisorHandle>,
    id: String,
) -> Result<DiagnoseReport, String> {
    sup.diagnose_service(&id, 50)
}

#[tauri::command]
fn open_frontend_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("前端地址需要以 http:// 或 https:// 开头".to_string());
    }
    if trimmed.chars().any(|c| c.is_control() || matches!(c, '"' | '\'' | '&' | '|' | '<' | '>')) {
        return Err("前端地址包含无法打开的字符".to_string());
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn list_proxy_rules(sup: State<'_, SupervisorHandle>) -> Vec<ProxyRule> {
    sup.list_proxy_rules()
}

#[tauri::command]
fn save_proxy_rule(
    sup: State<'_, SupervisorHandle>,
    rule: ProxyRule,
) -> Result<ProxyRule, String> {
    sup.upsert_proxy_rule(rule)
}

#[tauri::command]
fn delete_proxy_rule(
    sup: State<'_, SupervisorHandle>,
    id: String,
) -> Result<Vec<ProxyRule>, String> {
    sup.delete_proxy_rule(&id)
}

#[tauri::command]
fn preview_proxy_rules(
    sup: State<'_, SupervisorHandle>,
    gateway_id: String,
) -> Result<ProxyPreview, String> {
    sup.preview_proxy(&gateway_id)
}

#[tauri::command]
fn apply_proxy_rules(
    sup: State<'_, SupervisorHandle>,
    gateway_id: String,
) -> Result<ProxyApplyReport, String> {
    sup.apply_proxy(&gateway_id)
}

#[tauri::command]
fn hibernate_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.destroy();
    }
    Ok(())
}

/// Restores or recreates the main WebView2 window when waking up from Tray Hibernation.
pub fn show_or_recreate_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("FlashManager — 本地软件与服务管理平台")
        .inner_size(1240.0, 800.0)
        .min_inner_size(980.0, 640.0)
        .center()
        .build();
}

fn setup_system_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "打开 FlashManager 主界面", true, None::<&str>)?;
    let start_all_item = MenuItem::with_id(app, "start_all", "▸ 一键全部启动", true, None::<&str>)?;
    let stop_all_item = MenuItem::with_id(app, "stop_all", "■ 一键全部停止", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "彻底退出并清理子进程", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &sep,
            &start_all_item,
            &stop_all_item,
            &sep,
            &quit_item,
        ],
    )?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        // Tauri shows the menu on left-button-up by default. TrackPopupMenu then
        // starts after the button is already released, so Windows leaves the
        // cursor as the blue app-starting circle until the next click.
        // Left click only restores the window; right click opens this menu.
        .show_menu_on_left_click(false)
        .tooltip("FlashManager — 本地软件与服务管理平台 (后台轻量运行中)")
        .on_menu_event(|app_handle, event| match event.id.as_ref() {
            "open" => {
                show_or_recreate_main_window(app_handle);
            }
            "start_all" => {
                if let Some(sup) = app_handle.try_state::<SupervisorHandle>() {
                    let _ = sup.batch_action(None, "start");
                }
            }
            "stop_all" => {
                if let Some(sup) = app_handle.try_state::<SupervisorHandle>() {
                    let _ = sup.batch_action(None, "stop");
                }
            }
            "quit" => {
                QUIT_REQUESTED.store(true, Ordering::SeqCst);
                if let Some(sup) = app_handle.try_state::<SupervisorHandle>() {
                    let _ = sup.batch_action(None, "stop");
                }
                app_handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_or_recreate_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if !acquire_single_instance() {
        notify_existing_instance();
        return;
    }

    let project_root = resolve_data_root();
    let supervisor = SupervisorHandle::new(project_root);

    let app = tauri::Builder::default()
        .manage(supervisor.clone())
        .setup(move |app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            spawn_agent_http_server(supervisor.clone());
            let _ = setup_system_tray(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // WebView Hibernation: when user clicks the window X button, destroy the WebView2
            // instance to free ~45MB of rendering memory while keeping the ~8MB Rust daemon in tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.destroy();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard_snapshot,
            get_service_logs,
            save_service_config,
            delete_service_config,
            start_service_cmd,
            stop_service_cmd,
            restart_service_cmd,
            batch_service_action,
            clear_service_logs,
            set_service_encoding,
            auto_detect_and_register,
            diagnose_service_cmd,
            open_frontend_url,
            list_proxy_rules,
            save_proxy_rule,
            delete_proxy_rule,
            preview_proxy_rules,
            apply_proxy_rules,
            hibernate_to_tray
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        // Closing the window only destroys the WebView. ExitRequested still fires because no
        // window remains, and that request is cancelled so the tray daemon keeps running.
        // The tray "彻底退出" item sets QUIT_REQUESTED first, so that exit is allowed through.
        if let RunEvent::ExitRequested { api, .. } = event {
            if !QUIT_REQUESTED.load(Ordering::SeqCst) {
                api.prevent_exit();
            }
        }
    });
}
