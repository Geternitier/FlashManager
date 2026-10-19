import { invoke } from "@tauri-apps/api/core";
import { DashboardSnapshot, DiagnoseReport, LogPage, ServiceConfig, ServiceView } from "./types";

const AGENT_HTTP_BASE = "http://127.0.0.1:19527/api/v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (isTauriRuntime()) {
    return await invoke<DashboardSnapshot>("get_dashboard_snapshot");
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/snapshot`);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function fetchServiceLogs(id: string, after = 0): Promise<LogPage> {
  if (isTauriRuntime()) {
    return await invoke<LogPage>("get_service_logs", { id, after });
  }
  const res = await fetch(
    `${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/logs?after=${after}`
  );
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function startService(id: string): Promise<ServiceView> {
  if (isTauriRuntime()) {
    return await invoke<ServiceView>("start_service_cmd", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/start`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function stopService(id: string): Promise<ServiceView> {
  if (isTauriRuntime()) {
    return await invoke<ServiceView>("stop_service_cmd", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function restartService(id: string): Promise<ServiceView> {
  if (isTauriRuntime()) {
    return await invoke<ServiceView>("restart_service_cmd", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/restart`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function saveServiceConfig(
  config: ServiceConfig,
  startNow: boolean = false
): Promise<ServiceView> {
  if (isTauriRuntime()) {
    return await invoke<ServiceView>("save_service_config", { config, startNow });
  }
  const res = await fetch(
    `${AGENT_HTTP_BASE}/services/register?startNow=${startNow ? "true" : "false"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.service;
}

export async function deleteServiceConfig(id: string): Promise<DashboardSnapshot> {
  if (isTauriRuntime()) {
    return await invoke<DashboardSnapshot>("delete_service_config", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function batchServiceAction(
  group: string | null,
  action: "start" | "stop"
): Promise<DashboardSnapshot> {
  if (isTauriRuntime()) {
    return await invoke<DashboardSnapshot>("batch_service_action", { group, action });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group, action }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function clearServiceLogs(id: string): Promise<DashboardSnapshot> {
  if (isTauriRuntime()) {
    return await invoke<DashboardSnapshot>("clear_service_logs", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/clear-logs`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function setServiceEncoding(
  id: string,
  encoding: string
): Promise<DashboardSnapshot> {
  if (isTauriRuntime()) {
    return await invoke<DashboardSnapshot>("set_service_encoding", { id, encoding });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/encoding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encoding }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function autoDetectAndRegister(
  path: string,
  name?: string,
  group?: string,
  startNow: boolean = true
): Promise<ServiceView> {
  if (isTauriRuntime()) {
    return await invoke<ServiceView>("auto_detect_and_register", {
      path,
      name: name || null,
      group: group || null,
      startNow,
    });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/auto-detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name, group, startNow }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.service;
}

export async function diagnoseService(id: string): Promise<DiagnoseReport> {
  if (isTauriRuntime()) {
    return await invoke<DiagnoseReport>("diagnose_service_cmd", { id });
  }
  const res = await fetch(`${AGENT_HTTP_BASE}/services/${encodeURIComponent(id)}/diagnose`);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function openFrontendUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("open_frontend_url", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function hibernateToTray(): Promise<boolean> {
  if (isTauriRuntime()) {
    await invoke("hibernate_to_tray");
    return true;
  }
  return false;
}
