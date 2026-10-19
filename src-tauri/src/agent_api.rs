//! Local Loopback HTTP API (`127.0.0.1:19527`) for AI Agent Auto-Provisioning,
//! CLI commands, and browser-mode frontend communication.

use crate::detector::auto_detect_service;
use crate::models::{DashboardSnapshot, DiagnoseReport, LogPage, ServiceConfig, ServiceView};
use crate::supervisor::{SupervisorHandle, AGENT_API_PORT};
use axum::{
    body::Body,
    extract::{Path as AxumPath, Query, State},
    http::{header::AUTHORIZATION, Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterQuery {
    pub start_now: Option<bool>,
    pub diagnose_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub service: ServiceView,
    pub diagnose: Option<DiagnoseReport>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoDetectRequest {
    pub path: String,
    pub name: Option<String>,
    pub group: Option<String>,
    pub start_now: Option<bool>,
    pub diagnose_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchActionRequest {
    pub group: Option<String>,
    pub action: String, // "start" | "stop"
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseQuery {
    pub wait_ms: Option<u64>,
    pub lines: Option<usize>,
}

#[derive(Deserialize)]
pub struct LogQuery {
    pub after: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodingRequest {
    pub encoding: String,
}

pub fn spawn_agent_http_server(supervisor: SupervisorHandle) {
    tauri::async_runtime::spawn(async move {
        let app = Router::new()
            .route("/api/v1/health", get(health_handler))
            .route("/api/v1/snapshot", get(snapshot_handler))
            .route("/api/v1/services", get(snapshot_handler))
            .route("/api/v1/services/register", post(register_service_handler))
            .route("/api/v1/services/auto-detect", post(auto_detect_handler))
            .route("/api/v1/services/batch", post(batch_action_handler))
            .route("/api/v1/services/:id", delete(delete_service_handler))
            .route("/api/v1/services/:id/start", post(start_service_handler))
            .route("/api/v1/services/:id/stop", post(stop_service_handler))
            .route("/api/v1/services/:id/restart", post(restart_service_handler))
            .route("/api/v1/services/:id/clear-logs", post(clear_logs_handler))
            .route("/api/v1/services/:id/encoding", post(set_encoding_handler))
            .route("/api/v1/services/:id/diagnose", get(diagnose_service_handler))
            .route("/api/v1/services/:id/logs", get(logs_handler))
            .route("/api/v1/focus", post(focus_handler))
            .layer(middleware::from_fn_with_state(
                supervisor.clone(),
                authorize,
            ))
            .with_state(supervisor);

        let addr = SocketAddr::from(([127, 0, 0, 1], AGENT_API_PORT));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                let _ = axum::serve(listener, app).await;
            }
            Err(err) => {
                crate::report_error(&format!(
                    "FlashManager 无法监听 127.0.0.1:{}\n{}",
                    AGENT_API_PORT, err
                ));
            }
        }
    });
}

async fn authorize(
    State(sup): State<SupervisorHandle>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = req.uri().path();
    if path == "/api/v1/health" || path == "/api/v1/focus" {
        return Ok(next.run(req).await);
    }
    let expected = format!("Bearer {}", sup.token);
    let allowed = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(|value| value == expected)
        .unwrap_or(false);
    if !allowed {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(req).await)
}

async fn focus_handler() -> StatusCode {
    crate::focus_running_window();
    StatusCode::OK
}

async fn logs_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
    Query(query): Query<LogQuery>,
) -> Result<Json<LogPage>, (StatusCode, String)> {
    sup.get_logs(&id, query.after.unwrap_or(0))
        .map(Json)
        .map_err(|e| (StatusCode::NOT_FOUND, e))
}

async fn health_handler(State(sup): State<SupervisorHandle>) -> Json<serde_json::Value> {
    let snap = sup.get_snapshot();
    Json(serde_json::json!({
        "status": "ok",
        "service": "FlashManager Agent API",
        "agentApiPort": AGENT_API_PORT,
        "runningServices": snap.metrics.running_count,
        "totalServices": snap.metrics.total_count,
        "selfMemoryMb": snap.metrics.self_memory_mb
    }))
}

async fn snapshot_handler(State(sup): State<SupervisorHandle>) -> Json<DashboardSnapshot> {
    Json(sup.get_snapshot())
}

async fn register_service_handler(
    State(sup): State<SupervisorHandle>,
    Query(query): Query<RegisterQuery>,
    Json(config): Json<ServiceConfig>,
) -> Result<Json<RegisterResponse>, (StatusCode, String)> {
    let start_now = query.start_now.unwrap_or(config.auto_start_on_register);
    let mut view = sup.upsert_service(config, Some("Agent API 注册"));
    let id = view.id.clone();

    if start_now {
        view = sup
            .start_service(&id)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let diagnose = if let Some(wait_ms) = query.diagnose_ms {
        tokio::time::sleep(Duration::from_millis(wait_ms.min(10000))).await;
        sup.diagnose_service(&id, 50).ok()
    } else {
        None
    };

    Ok(Json(RegisterResponse {
        service: view,
        diagnose,
    }))
}

async fn auto_detect_handler(
    State(sup): State<SupervisorHandle>,
    Json(req): Json<AutoDetectRequest>,
) -> Result<Json<RegisterResponse>, (StatusCode, String)> {
    let mut cfg = auto_detect_service(&req.path, req.name, req.group)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let start_now = req.start_now.unwrap_or(true);
    cfg.auto_start_on_register = start_now;

    let mut view = sup.upsert_service(cfg, Some("Agent 智能目录探测"));
    let id = view.id.clone();

    if start_now {
        view = sup
            .start_service(&id)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let wait_ms = req.diagnose_ms.unwrap_or(1200);
    if start_now && wait_ms > 0 {
        tokio::time::sleep(Duration::from_millis(wait_ms.min(10000))).await;
    }
    let diagnose = sup.diagnose_service(&id, 50).ok();

    Ok(Json(RegisterResponse {
        service: view,
        diagnose,
    }))
}

async fn start_service_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ServiceView>, (StatusCode, String)> {
    sup.start_service(&id)
        .map(Json)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))
}

async fn stop_service_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ServiceView>, (StatusCode, String)> {
    sup.stop_service(&id)
        .map(Json)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))
}

async fn restart_service_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ServiceView>, (StatusCode, String)> {
    sup.restart_service(&id)
        .map(Json)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))
}

async fn delete_service_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<DashboardSnapshot>, (StatusCode, String)> {
    sup.delete_service(&id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(sup.get_snapshot()))
}

async fn clear_logs_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<DashboardSnapshot>, (StatusCode, String)> {
    sup.clear_logs(&id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(sup.get_snapshot()))
}

async fn set_encoding_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<EncodingRequest>,
) -> Result<Json<DashboardSnapshot>, (StatusCode, String)> {
    sup.set_encoding(&id, &req.encoding)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(sup.get_snapshot()))
}

async fn batch_action_handler(
    State(sup): State<SupervisorHandle>,
    Json(req): Json<BatchActionRequest>,
) -> Json<DashboardSnapshot> {
    Json(sup.batch_action(req.group, &req.action))
}

async fn diagnose_service_handler(
    State(sup): State<SupervisorHandle>,
    AxumPath(id): AxumPath<String>,
    Query(query): Query<DiagnoseQuery>,
) -> Result<Json<DiagnoseReport>, (StatusCode, String)> {
    if let Some(wait_ms) = query.wait_ms {
        if wait_ms > 0 {
            tokio::time::sleep(Duration::from_millis(wait_ms.min(10000))).await;
        }
    }
    let lines = query.lines.unwrap_or(50);
    sup.diagnose_service(&id, lines)
        .map(Json)
        .map_err(|e| (StatusCode::NOT_FOUND, e))
}
