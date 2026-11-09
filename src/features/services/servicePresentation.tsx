import type { ServiceType, ServiceView } from "../../types";

export type FilterKey = "all" | "running" | "error" | "stopped";
export type DrawerTab = "overview" | "logs" | "config" | "diagnose";
export type ServiceAction = "start" | "stop" | "restart";
export type ServiceCounts = Record<Exclude<FilterKey, "all"> | "total", number>;

export const TYPE_META: Record<ServiceType, { label: string; mono: string; cls: string }> = {
  exe: { label: "EXE 程序", mono: "EXE", cls: "t-exe" },
  nginx: { label: "Nginx", mono: "NG", cls: "t-nginx" },
  node: { label: "Node.js", mono: "JS", cls: "t-node" },
  python: { label: "Python", mono: "PY", cls: "t-python" },
  script: { label: "BAT / PS1", mono: ">_", cls: "t-script" },
};

export const STATUS_META = {
  running: { label: "运行中", cls: "is-running" },
  stopped: { label: "已停止", cls: "is-stopped" },
  error: { label: "需要关心", cls: "is-error" },
} as const;

export const TYPE_ORDER: ServiceType[] = ["exe", "python", "node", "nginx", "script"];

export const TYPE_DEFAULTS: Record<ServiceType, { executable: string; encoding: string }> = {
  python: { executable: "python", encoding: "utf-8" },
  node: { executable: "node", encoding: "utf-8" },
  nginx: { executable: "D:/Develop/Windows/Nginx/nginx.exe", encoding: "utf-8" },
  exe: { executable: "D:/Tools/app.exe", encoding: "utf-8" },
  script: { executable: "powershell.exe", encoding: "gbk" },
};

function baseName(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function commandFor(service: ServiceView): string {
  const executable = baseName(service.executable) || service.executable;
  const script = service.scriptPath ? baseName(service.scriptPath) : "";
  const args = service.args?.join(" ") ?? "";
  return [executable, script, args].filter(Boolean).join(" ");
}

export function typeIcon(service: ServiceView, extra = "") {
  const meta = TYPE_META[service.serviceType] ?? TYPE_META.exe;
  return <span className={`fm-type-icon ${meta.cls} ${extra}`}>{meta.mono}</span>;
}

export function statusPill(service: ServiceView, busy?: string) {
  if (busy) {
    const labels: Record<string, string> = { start: "启动中", stop: "停止中", restart: "重启中" };
    return (
      <span className="fm-status is-pending">
        <i />
        {labels[busy] ?? "处理中"}
      </span>
    );
  }
  const meta = STATUS_META[service.status];
  return (
    <span className={`fm-status ${meta.cls}`}>
      <i />
      {meta.label}
    </span>
  );
}
