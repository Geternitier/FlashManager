fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first().map(|s| s.as_str()) else {
        print_usage();
        std::process::exit(2);
    };

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime");

    let code = rt.block_on(run_cli(cmd, &args[1..]));
    std::process::exit(code);
}

fn print_usage() {
    eprintln!(
        "用法:\n  flash-manager-cli auto-detect <path> [--name 名称] [--group 分组] [--no-start]\n  flash-manager-cli register <service.json> [--start|--no-start]\n  flash-manager-cli start|stop|restart|diagnose <service-id>\n  flash-manager-cli status"
    );
}

async fn run_cli(cmd: &str, args: &[String]) -> i32 {
    let base_url = "http://127.0.0.1:19527/api/v1";
    match cmd {
        "auto-detect" => auto_detect(base_url, args).await,
        "register" => register(base_url, args).await,
        "start" | "stop" | "restart" => service_action(base_url, cmd, args).await,
        "diagnose" => diagnose(base_url, args).await,
        "status" => status(base_url).await,
        _ => {
            print_usage();
            2
        }
    }
}

async fn auto_detect(base_url: &str, args: &[String]) -> i32 {
    let Some(target_path) = args.first().cloned() else {
        eprintln!("用法: flash-manager-cli auto-detect <path> [--name 名称] [--group 分组] [--no-start]");
        return 2;
    };
    let mut group = Some("AI Agent 项目".to_string());
    let mut name = None;
    let mut start_now = true;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--group" if i + 1 < args.len() => {
                group = Some(args[i + 1].clone());
                i += 2;
            }
            "--name" if i + 1 < args.len() => {
                name = Some(args[i + 1].clone());
                i += 2;
            }
            "--no-start" => {
                start_now = false;
                i += 1;
            }
            "--start" => {
                start_now = true;
                i += 1;
            }
            _ => i += 1,
        }
    }

    let payload = serde_json::json!({
        "path": target_path,
        "name": name,
        "group": group,
        "startNow": start_now,
        "diagnoseMs": 1500
    });

    match send_http_json("POST", &format!("{}/services/auto-detect", base_url), Some(payload)).await {
        Ok(resp) => {
            println!("{}", resp);
            0
        }
        Err(_) => write_offline_manifest(&target_path, name, group, start_now),
    }
}

fn write_offline_manifest(
    target_path: &str,
    name: Option<String>,
    group: Option<String>,
    start_now: bool,
) -> i32 {
    match flash_manager_lib::detector::auto_detect_service(target_path, name, group) {
        Ok(mut cfg) => {
            cfg.auto_start_on_register = start_now;
            let dir = flash_manager_lib::resolve_data_root()
                .join("config")
                .join("services.d");
            if let Err(err) = std::fs::create_dir_all(&dir) {
                eprintln!("无法创建配置目录 {}: {}", dir.display(), err);
                return 1;
            }
            let file = dir.join(format!("{}.json", cfg.id));
            let json = match serde_json::to_string_pretty(&cfg) {
                Ok(json) => json,
                Err(err) => {
                    eprintln!("配置序列化失败: {}", err);
                    return 1;
                }
            };
            if let Err(err) = std::fs::write(&file, json) {
                eprintln!("写入配置失败 {}: {}", file.display(), err);
                return 1;
            }
            println!(
                "FlashManager offline: wrote service manifest to {}",
                file.display()
            );
            0
        }
        Err(err) => {
            eprintln!("Error: {}", err);
            1
        }
    }
}

async fn register(base_url: &str, args: &[String]) -> i32 {
    let Some(file) = args.first() else {
        eprintln!("用法: flash-manager-cli register <service.json> [--start|--no-start]");
        return 2;
    };
    let mut start_now = None;
    for flag in args.iter().skip(1) {
        match flag.as_str() {
            "--start" => start_now = Some(true),
            "--no-start" => start_now = Some(false),
            _ => {}
        }
    }
    let raw = match std::fs::read_to_string(file) {
        Ok(raw) => raw,
        Err(err) => {
            eprintln!("无法读取 {}: {}", file, err);
            return 1;
        }
    };
    let mut body: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(body) => body,
        Err(err) => {
            eprintln!("JSON 无法解析: {}", err);
            return 1;
        }
    };
    let start = start_now.unwrap_or_else(|| {
        body.get("autoStartOnRegister")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    });
    if let Some(obj) = body.as_object_mut() {
        obj.insert("autoStartOnRegister".to_string(), serde_json::json!(start));
    }
    let url = format!(
        "{}/services/register?startNow={}&diagnoseMs=1500",
        base_url, start
    );
    match send_http_json("POST", &url, Some(body)).await {
        Ok(resp) => {
            println!("{}", resp);
            0
        }
        Err(err) => {
            eprintln!("Error: {}", err);
            1
        }
    }
}

async fn service_action(base_url: &str, cmd: &str, args: &[String]) -> i32 {
    let Some(id) = args.first() else {
        eprintln!("用法: flash-manager-cli {} <service-id>", cmd);
        return 2;
    };
    match send_http_json(
        "POST",
        &format!("{}/services/{}/{}", base_url, id, cmd),
        None,
    )
    .await
    {
        Ok(resp) => {
            println!("{}", resp);
            0
        }
        Err(err) => {
            eprintln!("Error: {}", err);
            1
        }
    }
}

async fn diagnose(base_url: &str, args: &[String]) -> i32 {
    let Some(id) = args.first() else {
        eprintln!("用法: flash-manager-cli diagnose <service-id>");
        return 2;
    };
    match send_http_json(
        "GET",
        &format!("{}/services/{}/diagnose?waitMs=1000", base_url, id),
        None,
    )
    .await
    {
        Ok(resp) => {
            println!("{}", resp);
            0
        }
        Err(err) => {
            eprintln!("Error: {}", err);
            1
        }
    }
}

async fn status(base_url: &str) -> i32 {
    match send_http_json("GET", &format!("{}/health", base_url), None).await {
        Ok(resp) => {
            println!("{}", resp);
            0
        }
        Err(_) => {
            eprintln!("FlashManager daemon is not running on 127.0.0.1:19527");
            1
        }
    }
}

async fn send_http_json(
    method: &str,
    url: &str,
    body: Option<serde_json::Value>,
) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    let path = url
        .strip_prefix("http://127.0.0.1:19527")
        .unwrap_or("/api/v1/health");
    let mut stream = TcpStream::connect("127.0.0.1:19527")
        .await
        .map_err(|e| e.to_string())?;

    let body_bytes = body
        .map(|v| serde_json::to_vec(&v).unwrap_or_default())
        .unwrap_or_default();
    let token = flash_manager_lib::read_agent_token();
    if token.is_empty() && !path.starts_with("/api/v1/health") {
        return Err(format!(
            "找不到令牌文件 {}。请先启动一次 FlashManager。",
            flash_manager_lib::agent_token_path().display()
        ));
    }
    let auth = if token.is_empty() {
        String::new()
    } else {
        format!("Authorization: Bearer {}\r\n", token)
    };

    let req = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:19527\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        method,
        path,
        auth,
        body_bytes.len()
    );

    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    if !body_bytes.is_empty() {
        stream
            .write_all(&body_bytes)
            .await
            .map_err(|e| e.to_string())?;
    }

    let mut resp = String::new();
    stream
        .read_to_string(&mut resp)
        .await
        .map_err(|e| e.to_string())?;

    let body = if let Some(idx) = resp.find("\r\n\r\n") {
        resp[idx + 4..].to_string()
    } else {
        resp.clone()
    };
    if resp.starts_with("HTTP/1.1 401") || resp.starts_with("HTTP/1.0 401") {
        return Err("接口拒绝了令牌。请确认 config/agent.token 与正在运行的 FlashManager 一致。".to_string());
    }
    if let Some(status) = resp.split_whitespace().nth(1) {
        if status.starts_with('4') || status.starts_with('5') {
            return Err(body);
        }
    }
    Ok(body)
}
