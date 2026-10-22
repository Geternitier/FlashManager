export type ServiceType = "exe" | "nginx" | "node" | "python" | "script";

export type ServiceStatus = "running" | "stopped" | "error";

export interface LogEntry {
  time: string;
  level: "SYS" | "OUT" | "ERR" | string;
  text: string;
}

export interface LogPage {
  cursor: number;
  entries: LogEntry[];
}

export interface ServiceConfig {
  id: string;
  name: string;
  group: string;
  serviceType: ServiceType;
  executable: string;
  scriptPath?: string | null;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  encoding: string;
  autoRestart: boolean;
  port?: number | null;
  frontendUrl?: string | null;
  autoStartOnRegister?: boolean;
}

export interface ServiceView extends ServiceConfig {
  status: ServiceStatus;
  pid?: number | null;
  cpuUsage: number;
  memoryMb: number;
  uptimeSeconds: number;
  portActive: boolean;
  lastStartedAt?: number | null;
  logs: LogEntry[];
}

export interface PlatformMetrics {
  selfPid: number;
  selfMemoryMb: number;
  totalManagedCpu: number;
  totalManagedMemoryMb: number;
  runningCount: number;
  totalCount: number;
  activePorts: number[];
  agentApiPort: number;
  webviewHibernationEnabled: boolean;
}

export interface DashboardSnapshot {
  metrics: PlatformMetrics;
  services: ServiceView[];
}

export interface DiagnoseReport {
  id: string;
  name: string;
  status: ServiceStatus;
  pid?: number | null;
  port?: number | null;
  portActive: boolean;
  healthy: boolean;
  summary: string;
  recentLogs: LogEntry[];
}

export interface ProxyRule {
  id: string;
  name: string;
  enabled: boolean;
  gatewayId: string;
  listenHost: string;
  listenPort: number;
  location: string;
  serviceId: string;
  websocket: boolean;
  stripPrefix: boolean;
}

export interface ProxyPreview {
  gatewayId: string;
  configPath: string;
  conf: string;
  warnings: string[];
  includeReady: boolean;
}

export interface ProxyApplyReport {
  gatewayId: string;
  tested: boolean;
  reloaded: boolean;
  nginxRunning: boolean;
  configPath: string;
  summary: string;
  warnings: string[];
  output: string;
  reloadError?: string | null;
}

export interface ProxyOpenRequest {
  gatewayId?: string;
  serviceId?: string;
  edit?: boolean;
}
