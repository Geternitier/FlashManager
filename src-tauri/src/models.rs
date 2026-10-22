use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceType {
    Exe,
    Nginx,
    Node,
    Python,
    Script,
}

impl Default for ServiceType {
    fn default() -> Self {
        ServiceType::Exe
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(default)]
    pub service_type: ServiceType,
    pub executable: String,
    #[serde(default)]
    pub script_path: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_encoding")]
    pub encoding: String,
    #[serde(default)]
    pub auto_restart: bool,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub frontend_url: Option<String>,
    #[serde(default)]
    pub auto_start_on_register: bool,
}

fn default_group() -> String {
    "默认分组".to_string()
}

fn default_encoding() -> String {
    "utf-8".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub time: String,
    pub level: String, // "SYS" | "OUT" | "ERR"
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPage {
    pub cursor: u64,
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceView {
    pub id: String,
    pub name: String,
    pub group: String,
    pub service_type: ServiceType,
    pub executable: String,
    pub script_path: Option<String>,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub encoding: String,
    pub auto_restart: bool,
    pub port: Option<u16>,
    pub frontend_url: Option<String>,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub cpu_usage: f32,
    pub memory_mb: f32,
    pub uptime_seconds: u64,
    pub port_active: bool,
    /// Unix 毫秒。只在启动时更新，停止后保留，供界面按最近启动排序。
    #[serde(default)]
    pub last_started_at: Option<u64>,
    pub logs: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformMetrics {
    pub self_pid: u32,
    pub self_memory_mb: f32,
    pub total_managed_cpu: f32,
    pub total_managed_memory_mb: f32,
    pub running_count: usize,
    pub total_count: usize,
    pub active_ports: Vec<u16>,
    pub agent_api_port: u16,
    pub webview_hibernation_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub metrics: PlatformMetrics,
    pub services: Vec<ServiceView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentConfigFile {
    pub version: String,
    pub services: Vec<ServiceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseReport {
    pub id: String,
    pub name: String,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub port_active: bool,
    pub healthy: bool,
    pub summary: String,
    pub recent_logs: Vec<LogEntry>,
}

fn default_true() -> bool {
    true
}

fn default_listen_host() -> String {
    "127.0.0.1".to_string()
}

fn default_location() -> String {
    "/".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRule {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub gateway_id: String,
    #[serde(default = "default_listen_host")]
    pub listen_host: String,
    pub listen_port: u16,
    #[serde(default = "default_location")]
    pub location: String,
    pub service_id: String,
    #[serde(default = "default_true")]
    pub websocket: bool,
    #[serde(default = "default_true")]
    pub strip_prefix: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyFile {
    pub version: String,
    pub rules: Vec<ProxyRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyPreview {
    pub gateway_id: String,
    pub config_path: String,
    pub conf: String,
    pub warnings: Vec<String>,
    pub include_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyApplyReport {
    pub gateway_id: String,
    pub tested: bool,
    pub reloaded: bool,
    pub nginx_running: bool,
    pub config_path: String,
    pub summary: String,
    pub warnings: Vec<String>,
    pub output: String,
    pub reload_error: Option<String>,
}
