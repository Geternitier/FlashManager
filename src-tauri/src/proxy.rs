//! Nginx reverse-proxy rules. Generated files live beside the gateway's
//! nginx.conf and the hand-written server blocks are left untouched.

use crate::models::{ProxyFile, ProxyRule, ServiceConfig, ServiceType};
use encoding_rs::GBK;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;

const BEGIN_MARK: &str = "# BEGIN FlashManager";
const END_MARK: &str = "# END FlashManager";
const INCLUDE_LINE: &str = "include flash-manager/*.conf;";
const INCLUDE_HINT: &str = "\
没有找到 http { }。请在 http 块内手工加入这三行：
# BEGIN FlashManager
include flash-manager/*.conf;
# END FlashManager";

#[derive(Debug, Clone)]
pub struct NginxLayout {
    pub executable: String,
    pub cwd: PathBuf,
    pub conf_arg: String,
    pub conf_file: PathBuf,
    pub routes_file: PathBuf,
}

#[derive(Debug, Clone)]
pub struct RenderRoute {
    pub id: String,
    pub listen_host: String,
    pub listen_port: u16,
    pub location: String,
    pub upstream_port: u16,
    pub websocket: bool,
    pub strip_prefix: bool,
}

#[derive(Debug, Clone)]
pub struct IncludeEdit {
    pub conf: String,
    pub changed: bool,
}

#[derive(Debug, Clone)]
pub struct InstallResult {
    pub reloaded: bool,
    pub output: String,
    pub reload_error: Option<String>,
}

struct DiskSnapshot {
    nginx_conf: Vec<u8>,
    routes: Option<Vec<u8>>,
}

struct NginxOutput {
    success: bool,
    output: String,
}

pub fn load_rules(path: &Path) -> Vec<ProxyRule> {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(err) => {
            crate::report_error(&format!("无法读取反代配置 {}: {}", path.display(), err));
            return Vec::new();
        }
    };
    match serde_json::from_str::<ProxyFile>(&raw) {
        Ok(file) => file.rules,
        Err(err) => {
            crate::report_error(&format!("反代配置格式无效 {}: {}", path.display(), err));
            Vec::new()
        }
    }
}

pub fn save_rules(path: &Path, rules: &[ProxyRule]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            format!("无法创建配置目录 {}: {}", parent.display(), err)
        })?;
    }
    let payload = ProxyFile {
        version: "1".to_string(),
        rules: rules.to_vec(),
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|err| format!("反代配置序列化失败: {}", err))?;
    std::fs::write(path, json)
        .map_err(|err| format!("写入反代配置失败 {}: {}", path.display(), err))
}

pub fn normalize_rule(rule: &ProxyRule) -> Result<ProxyRule, String> {
    let name = rule.name.trim();
    if name.is_empty() {
        return Err("给这条反代起一个名字。".to_string());
    }
    if name.chars().count() > 80 {
        return Err("名称最多 80 个字。".to_string());
    }
    if name.chars().any(|ch| ch.is_control() || matches!(ch, '#' | ';' | '{' | '}')) {
        return Err("名称里不能包含 # ; { } 或换行。".to_string());
    }
    if rule.listen_port == 0 {
        return Err("监听端口需要在 1 到 65535 之间。".to_string());
    }
    let gateway_id = rule.gateway_id.trim();
    if gateway_id.is_empty() {
        return Err("请选择一个 Nginx 服务作为网关。".to_string());
    }
    let service_id = rule.service_id.trim();
    if service_id.is_empty() {
        return Err("请选择要转发到的 Web 服务。".to_string());
    }
    let location = normalize_location(&rule.location)?;
    Ok(ProxyRule {
        id: rule.id.trim().to_string(),
        name: name.to_string(),
        enabled: rule.enabled,
        gateway_id: gateway_id.to_string(),
        listen_host: normalize_host(&rule.listen_host)?,
        listen_port: rule.listen_port,
        location: location.clone(),
        service_id: service_id.to_string(),
        websocket: rule.websocket,
        strip_prefix: location != "/" && rule.strip_prefix,
    })
}

pub fn ensure_unique(rules: &[ProxyRule]) -> Result<(), String> {
    let mut locations: HashMap<String, String> = HashMap::new();
    let mut hosts_by_port: HashMap<String, Vec<String>> = HashMap::new();
    for rule in rules {
        let loc_key = format!(
            "{}|{}|{}|{}",
            rule.gateway_id, rule.listen_host, rule.listen_port, rule.location
        );
        if let Some(other) = locations.insert(loc_key, rule.name.clone()) {
            return Err(format!(
                "监听 {}:{} 上的路径 {} 与「{}」重复。",
                rule.listen_host, rule.listen_port, rule.location, other
            ));
        }
        let port_key = format!("{}|{}", rule.gateway_id, rule.listen_port);
        let hosts = hosts_by_port.entry(port_key).or_default();
        if !hosts.contains(&rule.listen_host) {
            hosts.push(rule.listen_host.clone());
        }
    }
    for rule in rules {
        let port_key = format!("{}|{}", rule.gateway_id, rule.listen_port);
        let hosts = &hosts_by_port[&port_key];
        if hosts.iter().any(|host| host == "0.0.0.0") && hosts.len() > 1 {
            return Err(format!(
                "端口 {} 已使用 0.0.0.0，不能再为同一网关添加其它监听地址。",
                rule.listen_port
            ));
        }
    }
    Ok(())
}

pub fn nginx_layout(config: &ServiceConfig) -> Result<NginxLayout, String> {
    if config.service_type != ServiceType::Nginx {
        return Err("反代网关必须是 Nginx 服务。".to_string());
    }
    let cwd_raw = config.cwd.trim();
    if cwd_raw.is_empty() {
        return Err("Nginx 服务没有工作目录，无法定位 nginx.conf。".to_string());
    }
    let executable = config.executable.trim();
    if executable.is_empty() {
        return Err("Nginx 服务没有可执行文件。".to_string());
    }
    let cwd = PathBuf::from(cwd_raw);
    let conf_arg = conf_arg_from(&config.args);
    let conf_path = PathBuf::from(&conf_arg);
    let conf_file = if conf_path.is_absolute() {
        conf_path
    } else {
        cwd.join(&conf_arg)
    };
    let conf_dir = conf_file.parent().ok_or_else(|| {
        format!("无法确定配置目录: {}", conf_file.display())
    })?;
    Ok(NginxLayout {
        executable: executable.to_string(),
        cwd,
        conf_arg,
        routes_file: conf_dir.join("flash-manager").join("routes.conf"),
        conf_file,
    })
}

pub fn read_conf_text(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|err| {
        format!("无法读取 {}: {}", path.display(), err)
    })?;
    String::from_utf8(bytes).map_err(|_| {
        format!("{} 需要保存为 UTF-8。", path.display())
    })
}

pub fn conf_has_upgrade_map(nginx_conf: &str) -> bool {
    nginx_conf.lines().any(|line| {
        let code = strip_comment(line);
        code.contains("map")
            && code.contains("$http_upgrade")
            && code.contains("$connection_upgrade")
    })
}

pub fn ensure_include(nginx_conf: &str) -> Result<IncludeEdit, String> {
    if nginx_conf.contains(BEGIN_MARK) {
        if !nginx_conf.contains(END_MARK) {
            return Err(
                "nginx.conf 里的 FlashManager 标记不完整。请补上 # END FlashManager，或删掉开头标记后重试。"
                    .to_string(),
            );
        }
        return Ok(IncludeEdit {
            conf: nginx_conf.to_string(),
            changed: false,
        });
    }
    let idx = http_insert_at(nginx_conf)?;
    let nl = if nginx_conf.contains("\r\n") { "\r\n" } else { "\n" };
    let mut block = String::new();
    if idx > 0 && !nginx_conf[..idx].ends_with('\n') {
        block.push_str(nl);
    }
    block.push_str("    ");
    block.push_str(BEGIN_MARK);
    block.push_str(nl);
    block.push_str("    ");
    block.push_str(INCLUDE_LINE);
    block.push_str(nl);
    block.push_str("    ");
    block.push_str(END_MARK);
    block.push_str(nl);
    let mut conf = String::with_capacity(nginx_conf.len() + block.len());
    conf.push_str(&nginx_conf[..idx]);
    conf.push_str(&block);
    conf.push_str(&nginx_conf[idx..]);
    Ok(IncludeEdit { conf, changed: true })
}

pub fn listen_warnings(nginx_conf: &str, rules: &[ProxyRule]) -> Vec<String> {
    let existing = parse_listens(nginx_conf);
    let mut warnings = Vec::new();
    let mut seen = HashSet::new();
    for rule in rules.iter().filter(|rule| rule.enabled) {
        if rule.listen_port == 19527 {
            let msg = format!(
                "监听端口 {} 是 FlashManager 的 Agent API，Nginx 可能无法绑定。",
                rule.listen_port
            );
            if seen.insert(msg.clone()) {
                warnings.push(msg);
            }
        }
        let host = if rule.listen_host == "0.0.0.0" {
            "*"
        } else {
            rule.listen_host.as_str()
        };
        let conflict = existing.iter().any(|(existing_host, existing_port)| {
            *existing_port == rule.listen_port
                && (existing_host == "*" || host == "*" || existing_host == host)
        });
        if conflict {
            let msg = format!(
                "监听 {}:{} 与 nginx.conf 里已有的 listen 重叠。手写的 server 不会被修改，但请求可能进错站点。",
                rule.listen_host, rule.listen_port
            );
            if seen.insert(msg.clone()) {
                warnings.push(msg);
            }
        }
    }
    warnings
}

pub fn render_routes(routes: &[RenderRoute], main_has_map: bool) -> String {
    let mut out = String::from(
        "# FlashManager managed reverse proxy routes.\n# Do not edit. The app rewrites this file.\n",
    );
    if routes.is_empty() {
        out.push_str("# No enabled rules.\n");
        return out;
    }
    let need_map = !main_has_map && routes.iter().any(|route| route.websocket);
    if need_map {
        out.push_str(
            "\nmap $http_upgrade $connection_upgrade {\n    default upgrade;\n    ''      close;\n}\n",
        );
    }
    let mut groups: BTreeMap<(u16, String), Vec<&RenderRoute>> = BTreeMap::new();
    for route in routes {
        groups
            .entry((route.listen_port, route.listen_host.clone()))
            .or_default()
            .push(route);
    }
    for ((port, host), mut group) in groups {
        group.sort_by(|left, right| {
            let left_root = left.location == "/";
            let right_root = right.location == "/";
            left_root
                .cmp(&right_root)
                .then_with(|| left.location.cmp(&right.location))
        });
        out.push_str("\nserver {\n");
        out.push_str(&format!("    listen {}:{};\n", host, port));
        out.push_str("    server_name _;\n");
        out.push_str("    client_max_body_size 16m;\n");
        for route in group {
            out.push_str(&format!("\n    # rule {}\n", route.id));
            if route.location == "/" {
                out.push_str("    location / {\n");
                push_proxy(&mut out, route, false);
                out.push_str("    }\n");
            } else {
                out.push_str(&format!("    location = {} {{\n", route.location));
                out.push_str(&format!("        return 308 {}/;\n", route.location));
                out.push_str("    }\n\n");
                out.push_str(&format!("    location ^~ {}/ {{\n", route.location));
                push_proxy(&mut out, route, route.strip_prefix);
                out.push_str("    }\n");
            }
        }
        out.push_str("}\n");
    }
    out
}

pub fn install_routes(
    layout: &NginxLayout,
    rendered: &str,
    next_nginx: &str,
    nginx_running: bool,
) -> Result<InstallResult, String> {
    let snap = snapshot_disk(layout)?;
    if let Some(parent) = layout.routes_file.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            format!("无法创建 {}: {}", parent.display(), err)
        })?;
    }
    std::fs::write(&layout.routes_file, rendered).map_err(|err| {
        format!("写入 {} 失败: {}", layout.routes_file.display(), err)
    })?;
    if next_nginx.as_bytes() != snap.nginx_conf.as_slice() {
        if let Err(err) = std::fs::write(&layout.conf_file, next_nginx) {
            let _ = restore_disk(layout, &snap);
            return Err(format!("写入 {} 失败: {}", layout.conf_file.display(), err));
        }
    }
    let test = match run_nginx(layout, false) {
        Ok(output) => output,
        Err(err) => {
            let _ = restore_disk(layout, &snap);
            return Err(format!("{}\n已还原配置。", err));
        }
    };
    if !test.success {
        let _ = restore_disk(layout, &snap);
        return Err(format!("nginx -t 没有通过，已还原配置。\n{}", test.output));
    }
    if !nginx_running {
        return Ok(InstallResult {
            reloaded: false,
            output: test.output,
            reload_error: None,
        });
    }
    match run_nginx(layout, true) {
        Ok(reload) if reload.success => Ok(InstallResult {
            reloaded: true,
            output: join_output(&test.output, &reload.output),
            reload_error: None,
        }),
        Ok(reload) => Ok(InstallResult {
            reloaded: false,
            output: join_output(&test.output, &reload.output),
            reload_error: Some(reload.output),
        }),
        Err(err) => Ok(InstallResult {
            reloaded: false,
            output: join_output(&test.output, &err),
            reload_error: Some(err),
        }),
    }
}

fn push_proxy(out: &mut String, route: &RenderRoute, strip: bool) {
    let target = if strip {
        format!("http://127.0.0.1:{}/", route.upstream_port)
    } else {
        format!("http://127.0.0.1:{}", route.upstream_port)
    };
    out.push_str(&format!("        proxy_pass {};\n", target));
    out.push_str("        proxy_http_version 1.1;\n");
    out.push_str("        proxy_set_header Host $host;\n");
    out.push_str("        proxy_set_header X-Real-IP $remote_addr;\n");
    out.push_str("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n");
    out.push_str("        proxy_set_header X-Forwarded-Proto $scheme;\n");
    if route.websocket {
        out.push_str("        proxy_set_header Upgrade $http_upgrade;\n");
        out.push_str("        proxy_set_header Connection $connection_upgrade;\n");
    }
    out.push_str("        proxy_read_timeout 3600s;\n");
}

fn normalize_location(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let raw = if trimmed.is_empty() { "/" } else { trimmed };
    if !raw.starts_with('/') {
        return Err("路径需要以 / 开头。".to_string());
    }
    if raw.chars().any(|ch| {
        !matches!(ch, '/' | 'A'..='Z' | 'a'..='z' | '0'..='9' | '.' | '_' | '~' | '-')
    }) {
        return Err("路径只能包含字母、数字和 / . _ ~ -。".to_string());
    }
    if raw.contains("//") || raw.split('/').any(|part| part == "." || part == "..") {
        return Err("路径不能包含 . 或 .. 段。".to_string());
    }
    if raw == "/" {
        return Ok("/".to_string());
    }
    let trimmed = raw.trim_end_matches('/');
    if trimmed.is_empty() {
        return Ok("/".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_host(raw: &str) -> Result<String, String> {
    let host = raw.trim();
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() != 4 || parts.iter().any(|part| !valid_octet(part)) {
        return Err("监听地址只能是 IPv4，例如 127.0.0.1 或 0.0.0.0。".to_string());
    }
    let canonical = parts
        .iter()
        .map(|part| part.parse::<u8>().unwrap_or(0).to_string())
        .collect::<Vec<_>>()
        .join(".");
    Ok(canonical)
}

fn valid_octet(part: &str) -> bool {
    if part.is_empty() || part.len() > 3 {
        return false;
    }
    if part.len() > 1 && part.starts_with('0') {
        return false;
    }
    part.bytes().all(|byte| byte.is_ascii_digit()) && part.parse::<u8>().is_ok()
}

fn conf_arg_from(args: &[String]) -> String {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "-c" {
            if let Some(value) = iter.next() {
                let value = value.trim();
                if !value.is_empty() {
                    return value.to_string();
                }
            }
        }
    }
    "conf/nginx.conf".to_string()
}

fn http_insert_at(src: &str) -> Result<usize, String> {
    let mut offset = 0;
    for line in src.split_inclusive('\n') {
        if line_opens_http(line) {
            return Ok(offset + line.len());
        }
        offset += line.len();
    }
    Err(INCLUDE_HINT.to_string())
}

fn line_opens_http(line: &str) -> bool {
    let code = strip_comment(line);
    let trimmed = code.trim();
    let Some(rest) = trimmed.strip_prefix("http") else {
        return false;
    };
    rest.trim_start().starts_with('{')
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(index) => &line[..index],
        None => line,
    }
}

fn parse_listens(nginx_conf: &str) -> Vec<(String, u16)> {
    let mut out = Vec::new();
    let mut skipping = false;
    for line in nginx_conf.lines() {
        let trimmed = line.trim();
        if trimmed.contains(BEGIN_MARK) {
            skipping = true;
            continue;
        }
        if trimmed.contains(END_MARK) {
            skipping = false;
            continue;
        }
        if skipping {
            continue;
        }
        let code = strip_comment(line).trim();
        let Some(rest) = code.strip_prefix("listen") else {
            continue;
        };
        if !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let Some(token) = rest.trim().split_whitespace().next() else {
            continue;
        };
        let token = token.trim_end_matches(';');
        if let Some(parsed) = parse_listen_token(token) {
            out.push(parsed);
        }
    }
    out
}

fn parse_listen_token(token: &str) -> Option<(String, u16)> {
    if token.starts_with('[') {
        return None;
    }
    if let Some((host, port)) = token.rsplit_once(':') {
        let port = port.parse().ok()?;
        let host = if host == "*" || host == "0.0.0.0" {
            "*".to_string()
        } else {
            host.to_string()
        };
        return Some((host, port));
    }
    if token.chars().all(|ch| ch.is_ascii_digit()) {
        return Some(("*".to_string(), token.parse().ok()?));
    }
    None
}

fn snapshot_disk(layout: &NginxLayout) -> Result<DiskSnapshot, String> {
    let nginx_conf = std::fs::read(&layout.conf_file).map_err(|err| {
        format!("无法读取 {}: {}", layout.conf_file.display(), err)
    })?;
    let routes = if layout.routes_file.exists() {
        Some(std::fs::read(&layout.routes_file).map_err(|err| {
            format!("无法读取 {}: {}", layout.routes_file.display(), err)
        })?)
    } else {
        None
    };
    Ok(DiskSnapshot { nginx_conf, routes })
}

fn restore_disk(layout: &NginxLayout, snap: &DiskSnapshot) -> Result<(), String> {
    std::fs::write(&layout.conf_file, &snap.nginx_conf).map_err(|err| {
        format!("还原 {} 失败: {}", layout.conf_file.display(), err)
    })?;
    match &snap.routes {
        Some(bytes) => {
            if let Some(parent) = layout.routes_file.parent() {
                std::fs::create_dir_all(parent).map_err(|err| {
                    format!("无法创建 {}: {}", parent.display(), err)
                })?;
            }
            std::fs::write(&layout.routes_file, bytes).map_err(|err| {
                format!("还原 {} 失败: {}", layout.routes_file.display(), err)
            })?;
        }
        None => {
            if layout.routes_file.exists() {
                std::fs::remove_file(&layout.routes_file).map_err(|err| {
                    format!("删除 {} 失败: {}", layout.routes_file.display(), err)
                })?;
            }
        }
    }
    Ok(())
}

fn run_nginx(layout: &NginxLayout, reload: bool) -> Result<NginxOutput, String> {
    let mut cmd = std::process::Command::new(&layout.executable);
    cmd.current_dir(&layout.cwd)
        .arg("-p")
        .arg(&layout.cwd)
        .arg("-c")
        .arg(&layout.conf_arg);
    if reload {
        cmd.arg("-s").arg("reload");
    } else {
        cmd.arg("-t");
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let output = cmd.output().map_err(|err| {
        format!("无法执行 {}：{}", layout.executable, err)
    })?;
    let mut text = decode_output(&output.stdout);
    let err_text = decode_output(&output.stderr);
    if !err_text.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&err_text);
    }
    let text = text.trim().to_string();
    let success = output.status.success();
    let output = if text.is_empty() && !success {
        format!("nginx 退出码 {}", output.status.code().unwrap_or(-1))
    } else {
        text
    };
    Ok(NginxOutput { success, output })
}

fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => text.trim().to_string(),
        Err(_) => GBK.decode(bytes).0.trim().to_string(),
    }
}

fn join_output(left: &str, right: &str) -> String {
    match (left.is_empty(), right.is_empty()) {
        (true, true) => String::new(),
        (false, true) => left.to_string(),
        (true, false) => right.to_string(),
        (false, false) => format!("{}\n{}", left, right),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = "\
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 127.0.0.1:80;
        listen 192.168.3.12:80;
        server_name _;
        client_max_body_size 16m;

        location / {
            proxy_pass http://127.0.0.1:18473;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_read_timeout 3600s;
        }
    }
}
";

    fn rule(name: &str, port: u16, location: &str) -> ProxyRule {
        ProxyRule {
            id: format!("id-{}", name),
            name: name.to_string(),
            enabled: true,
            gateway_id: "gw".to_string(),
            listen_host: "127.0.0.1".to_string(),
            listen_port: port,
            location: location.to_string(),
            service_id: "svc".to_string(),
            websocket: true,
            strip_prefix: true,
        }
    }

    fn route(id: &str, port: u16, location: &str, upstream: u16, strip: bool) -> RenderRoute {
        RenderRoute {
            id: id.to_string(),
            listen_host: "127.0.0.1".to_string(),
            listen_port: port,
            location: location.to_string(),
            upstream_port: upstream,
            websocket: true,
            strip_prefix: strip,
        }
    }

    #[test]
    fn path_rules_share_one_server() {
        let conf = render_routes(
            &[
                route("rag", 8080, "/rag", 8787, true),
                route("console", 8080, "/console", 8790, false),
            ],
            true,
        );
        assert_eq!(conf.matches("server {").count(), 1);
        assert!(conf.contains("listen 127.0.0.1:8080;"));
        assert!(conf.contains("location ^~ /console/"));
        assert!(conf.contains("location ^~ /rag/"));
        assert!(conf.contains("proxy_pass http://127.0.0.1:8787/;"));
        assert!(conf.contains("proxy_pass http://127.0.0.1:8790;"));
        assert!(conf.contains("return 308 /rag/;"));
        assert!(!conf.contains("map $http_upgrade"));
    }

    #[test]
    fn root_and_path_share_a_listen() {
        let conf = render_routes(
            &[
                route("root", 18080, "/", 8787, false),
                route("rag", 18080, "/rag", 8791, true),
            ],
            false,
        );
        assert_eq!(conf.matches("server {").count(), 1);
        assert!(conf.contains("location / {"));
        assert!(conf.contains("location ^~ /rag/"));
        assert!(conf.contains("proxy_pass http://127.0.0.1:8787;"));
        assert_eq!(conf.matches("map $http_upgrade").count(), 1);
    }

    #[test]
    fn separate_ports_become_separate_servers() {
        let conf = render_routes(
            &[
                route("a", 18080, "/", 8787, false),
                route("b", 18081, "/", 8788, false),
            ],
            true,
        );
        assert_eq!(conf.matches("server {").count(), 2);
    }

    #[test]
    fn websocket_headers_follow_the_rule() {
        let mut plain = route("plain", 18080, "/", 8787, false);
        plain.websocket = false;
        let conf = render_routes(&[plain], false);
        assert!(!conf.contains("Upgrade"));
        assert!(!conf.contains("map $http_upgrade"));
    }

    #[test]
    fn rejects_injected_location() {
        let mut bad = rule("bad", 18080, "/; evil");
        assert!(normalize_rule(&bad).is_err());
        bad.location = "/rag/../admin".to_string();
        assert!(normalize_rule(&bad).is_err());
        bad.location = "/rag/".to_string();
        let ok = normalize_rule(&bad).unwrap();
        assert_eq!(ok.location, "/rag");
    }

    #[test]
    fn duplicate_locations_and_overlapping_hosts_are_rejected() {
        let mut second = rule("two", 18080, "/rag");
        second.id = "id-two".to_string();
        let err = ensure_unique(&[rule("one", 18080, "/rag"), second]).unwrap_err();
        assert!(err.contains("重复"));

        let mut wide = rule("wide", 18080, "/");
        wide.listen_host = "0.0.0.0".to_string();
        let mut narrow = rule("narrow", 18080, "/rag");
        narrow.listen_host = "127.0.0.1".to_string();
        let err = ensure_unique(&[wide, narrow]).unwrap_err();
        assert!(err.contains("0.0.0.0"));
    }

    #[test]
    fn include_keeps_hand_written_server_and_map() {
        let once = ensure_include(FIXTURE).unwrap();
        assert!(once.changed);
        assert!(once.conf.contains(BEGIN_MARK));
        assert!(once.conf.contains(INCLUDE_LINE));
        assert!(once.conf.contains("map $http_upgrade $connection_upgrade {"));
        assert!(once.conf.contains("listen 127.0.0.1:80;"));
        assert!(once.conf.contains("listen 192.168.3.12:80;"));
        assert!(once.conf.contains("proxy_pass http://127.0.0.1:18473;"));
        assert_eq!(once.conf.matches("map $http_upgrade").count(), 1);
        let marker_at = once.conf.find(BEGIN_MARK).unwrap();
        let mime_at = once.conf.find("include       mime.types;").unwrap();
        assert!(marker_at < mime_at);
        let twice = ensure_include(&once.conf).unwrap();
        assert!(!twice.changed);
        assert_eq!(once.conf, twice.conf);
        assert!(conf_has_upgrade_map(FIXTURE));
    }

    #[test]
    fn warns_when_listen_matches_hand_written_server() {
        let mut occupied = rule("occupied", 80, "/");
        occupied.listen_host = "127.0.0.1".to_string();
        let warnings = listen_warnings(FIXTURE, &[occupied, rule("free", 18080, "/")]);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("127.0.0.1:80"));
    }

    #[test]
    fn install_restores_conf_when_nginx_cannot_run() {
        let dir = std::env::temp_dir().join(format!(
            "flash-manager-proxy-{}-{}",
            std::process::id(),
            "restore"
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let conf = dir.join("nginx.conf");
        let original = "http {\n    server { listen 127.0.0.1:80; }\n}\n";
        std::fs::write(&conf, original).unwrap();
        let layout = NginxLayout {
            executable: "fm-definitely-missing-nginx.exe".to_string(),
            cwd: dir.clone(),
            conf_arg: "nginx.conf".to_string(),
            conf_file: conf.clone(),
            routes_file: dir.join("flash-manager").join("routes.conf"),
        };
        let edited = ensure_include(original).unwrap();
        let err = install_routes(&layout, "# FlashManager\n", &edited.conf, false).unwrap_err();
        assert!(err.contains("已还原"));
        assert_eq!(std::fs::read_to_string(&conf).unwrap(), original);
        assert!(!layout.routes_file.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
