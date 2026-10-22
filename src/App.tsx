import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Bell,
  Check,
  ChevronDown,
  Clock,
  Command,
  Copy,
  Cpu,
  ExternalLink,
  Folder,
  Globe,
  Keyboard,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MemoryStick,
  Moon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Square,
  Sun,
  Route,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  autoDetectAndRegister,
  batchServiceAction,
  clearServiceLogs,
  deleteServiceConfig,
  diagnoseService,
  fetchDashboardSnapshot,
  fetchServiceLogs,
  hibernateToTray,
  openFrontendUrl,
  restartService,
  saveServiceConfig,
  setServiceEncoding,
  startService,
  stopService,
} from "./api";
import ProxyPage, { ServiceProxyNote } from "./ProxyPage";
import type {
  DashboardSnapshot,
  DiagnoseReport,
  LogEntry,
  PlatformMetrics,
  ProxyOpenRequest,
  ServiceConfig,
  ServiceType,
  ServiceView,
} from "./types";

type FilterKey = "all" | "running" | "error" | "stopped";
type DrawerTab = "overview" | "logs" | "config" | "diagnose";
type Theme = "day" | "night";
type ToastKind = "success" | "info" | "error";
type ModalKind = "service" | "detect" | "settings" | "shortcuts" | null;
type MascotMood = "idle" | "happy" | "sleep" | "worry";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

interface MenuEntry {
  label?: string;
  icon?: ReactNode;
  note?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface MenuState {
  left: number;
  top: number;
  header?: string;
  note?: string;
  items: MenuEntry[];
}

interface ConfirmState {
  title: string;
  body: string;
  list?: { name: string; note?: string }[];
  note?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const TYPE_META: Record<ServiceType, { label: string; mono: string; cls: string }> = {
  exe: { label: "EXE 程序", mono: "EXE", cls: "t-exe" },
  nginx: { label: "Nginx", mono: "NG", cls: "t-nginx" },
  node: { label: "Node.js", mono: "JS", cls: "t-node" },
  python: { label: "Python", mono: "PY", cls: "t-python" },
  script: { label: "BAT / PS1", mono: ">_", cls: "t-script" },
};

const STATUS_META = {
  running: { label: "运行中", cls: "is-running" },
  stopped: { label: "已停止", cls: "is-stopped" },
  error: { label: "需要关心", cls: "is-error" },
} as const;

const GROUP_COLORS: Record<string, string> = {
  "AI 推理": "#8e6fe8",
  "AI Agent 项目": "#2fa98f",
  折枝: "#e85d8f",
  网关与中间件: "#3d8fd6",
  开发工具: "#d99a2b",
};

const SORT_OPTIONS = [
  { key: "recent", label: "按最近启动" },
  { key: "name", label: "按名称" },
  { key: "cpu", label: "按占用" },
] as const;

const TYPE_ORDER: ServiceType[] = ["exe", "python", "node", "nginx", "script"];

const EMPTY_METRICS: PlatformMetrics = {
  selfPid: 0,
  selfMemoryMb: 0,
  totalManagedCpu: 0,
  totalManagedMemoryMb: 0,
  runningCount: 0,
  totalCount: 0,
  activePorts: [],
  agentApiPort: 19527,
  webviewHibernationEnabled: true,
};

const EMPTY_FORM: ServiceConfig = {
  id: "",
  name: "",
  group: "默认分组",
  serviceType: "python",
  executable: "python",
  scriptPath: "",
  args: [],
  cwd: "",
  env: {},
  encoding: "utf-8",
  autoRestart: true,
  port: null,
  frontendUrl: "",
  autoStartOnRegister: false,
};

const TYPE_DEFAULTS: Record<ServiceType, { executable: string; encoding: string }> = {
  python: { executable: "python", encoding: "utf-8" },
  node: { executable: "node", encoding: "utf-8" },
  nginx: { executable: "D:/Develop/Windows/Nginx/nginx.exe", encoding: "utf-8" },
  exe: { executable: "D:/Tools/app.exe", encoding: "utf-8" },
  script: { executable: "powershell.exe", encoding: "gbk" },
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatFullDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((value) => String(value).padStart(2, "0")).join(":");
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

function baseName(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function commandFor(service: ServiceView): string {
  const executable = baseName(service.executable) || service.executable;
  const script = service.scriptPath ? baseName(service.scriptPath) : "";
  const args = service.args?.join(" ") ?? "";
  return [executable, script, args].filter(Boolean).join(" ");
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function presenceLabel(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return { main: "夜深了", side: "夜深啦", line: "小闪把灯调暗了一点。" };
  if (hour < 11) return { main: "早上好", side: "早上好呀", line: "今天也从一杯热茶开始吧。" };
  if (hour < 13) return { main: "中午好", side: "中午好呀", line: "记得吃饭，服务交给小闪。" };
  if (hour < 18) return { main: "下午好", side: "下午好呀", line: "下午也一起加油吧。" };
  return { main: "晚上好", side: "晚上好呀", line: "今天也辛苦啦～" };
}

function dateLabel(date: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

function typeIcon(service: ServiceView, extra = "") {
  const meta = TYPE_META[service.serviceType] ?? TYPE_META.exe;
  return <span className={`fm-type-icon ${meta.cls} ${extra}`}>{meta.mono}</span>;
}

function statusPill(service: ServiceView, busy?: string) {
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

function Mascot({
  size = 40,
  mood = "idle",
  full = false,
  className = "",
}: {
  size?: number;
  mood?: MascotMood;
  full?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`mascot-slot ${className}`}
      data-avatar={full ? "full" : undefined}
      style={{ "--mascot-size": `${size}px` } as CSSProperties}
    >
      <span className="mascot-photo" data-mood={mood}>
        <span className="mascot-img" />
      </span>
    </span>
  );
}

function Sparkline({ color }: { color: string }) {
  const values = [10, 12, 9, 13, 11, 14, 10, 12, 9, 11, 8, 10];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 62;
      const y = 21 - ((value - min) / Math.max(1, max - min)) * 15;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="fm-sparkline" viewBox="0 0 62 24" aria-hidden="true" style={{ "--stat-color": color } as CSSProperties}>
      <polyline points={`0,24 ${points} 62,24`} className="fill" />
      <polyline points={points} />
    </svg>
  );
}

function ModalFrame({
  children,
  onClose,
  className = "",
  label = "对话框",
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className="fm-modal-root is-open">
      <div
        className="fm-modal-backdrop"
        data-modal-backdrop=""
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className={`fm-modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="fm-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`fm-toast ${toast.kind === "success" ? "" : toast.kind === "error" ? "is-error" : "is-info"}`}>
          <span className="fm-toast-icon">
            {toast.kind === "success" ? <Check className="i" /> : toast.kind === "error" ? <AlertTriangle className="i" /> : <Sparkles className="i" />}
          </span>
          <div className="fm-toast-copy">
            {toast.title ? <b>{toast.title}</b> : null}
            {toast.title && toast.message ? " " : null}
            {toast.message ?? ""}
          </div>
          {toast.action ? (
            <button
              className="fm-toast-action"
              onClick={() => {
                toast.action?.onClick();
                onClose(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button className="fm-toast-close" onClick={() => onClose(toast.id)} aria-label="关闭提示">
            <X className="i" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MenuPanel({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  return (
    <>
      <div className="fm-menu-overlay" onClick={onClose} />
      <div className="fm-menu" style={{ left: menu.left, top: menu.top, width: 232 }} role="menu">
        {menu.header ? <div className="fm-menu-head">{menu.header}</div> : null}
        {menu.items.map((item, index) =>
          item.divider ? (
            <div className="fm-menu-divider" key={`divider-${index}`} />
          ) : (
            <button
              key={`${item.label}-${index}`}
              className={`fm-menu-item ${item.danger ? "is-danger" : ""} ${item.checked ? "is-checked" : ""}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick?.();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.note ? <small>{item.note}</small> : null}
            </button>
          )
        )}
        {menu.note ? <div className="fm-menu-note">{menu.note}</div> : null}
      </div>
    </>
  );
}

export default function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const logCursorRef = useRef(0);
  const logEpochRef = useRef(0);
  const logPullingRef = useRef(false);

  const [now, setNow] = useState(new Date());
  const [services, setServices] = useState<ServiceView[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const [selectedId, setSelectedId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [diagnose, setDiagnose] = useState<DiagnoseReport | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [group, setGroup] = useState("全部服务");
  const [type, setType] = useState<"all" | ServiceType>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["key"]>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState<"services" | "proxies">("services");
  const [proxyRequest, setProxyRequest] = useState<ProxyOpenRequest | null>(null);

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("fm-theme") === "night" ? "night" : "day"));
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("fm-motion") === "1");

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [staleIds, setStaleIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceConfig>(EMPTY_FORM);
  const [formArgs, setFormArgs] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [detectPath, setDetectPath] = useState("");
  const [detectGroup, setDetectGroup] = useState("AI Agent 项目");
  const [detectBusy, setDetectBusy] = useState(false);
  const [detectError, setDetectError] = useState("");

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevel, setLogLevel] = useState("all");
  const [logQuery, setLogQuery] = useState("");
  const [logFollow, setLogFollow] = useState(true);

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.action ? 7600 : 4200);
  };

  const removeToast = (id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  const applySnapshot = (snapshot: DashboardSnapshot) => {
    setServices(snapshot.services);
    setMetrics(snapshot.metrics);
    setLastUpdated(Date.now());
    setConnected(true);
    setLoading(false);
  };

  const refresh = async () => {
    try {
      const snapshot = await fetchDashboardSnapshot();
      applySnapshot(snapshot);
      setSelectedId((current) => (current && snapshot.services.some((service) => service.id === current) ? current : snapshot.services[0]?.id ?? ""));
    } catch {
      setConnected(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const snapshot = await fetchDashboardSnapshot();
        if (cancelled) return;
        applySnapshot(snapshot);
        setSelectedId((current) => (current && snapshot.services.some((service) => service.id === current) ? current : snapshot.services[0]?.id ?? ""));
      } catch {
        if (!cancelled) {
          setConnected(false);
          setLoading(false);
        }
      }
    };
    void pull();
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("fm-theme", theme);
      localStorage.setItem("fm-motion", reduceMotion ? "1" : "0");
    } catch {
      // Local storage can be unavailable in hardened webviews.
    }
  }, [theme, reduceMotion]);

  useEffect(() => {
    if ("matchMedia" in window && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduceMotion(true);
    }
  }, []);

  useEffect(() => {
    if (selectedId && !services.some((service) => service.id === selectedId)) {
      setSelectedId(services[0]?.id ?? "");
      setDrawerOpen(false);
    }
  }, [services, selectedId]);

  useEffect(() => {
    setDiagnose(null);
  }, [selectedId]);

  useEffect(() => {
    logEpochRef.current += 1;
    const epoch = logEpochRef.current;
    logCursorRef.current = 0;
    logPullingRef.current = false;
    setLogs([]);
    if (!selectedId) return;

    let cancelled = false;
    const pull = async () => {
      if (cancelled || logPullingRef.current) return;
      logPullingRef.current = true;
      try {
        const page = await fetchServiceLogs(selectedId, logCursorRef.current);
        if (cancelled || epoch !== logEpochRef.current) return;
        logCursorRef.current = page.cursor;
        if (page.entries.length) {
          setLogs((current) => [...current, ...page.entries].slice(-2000));
        }
      } catch {
        // The backend may be starting up; the next poll retries.
      } finally {
        if (epoch === logEpochRef.current) logPullingRef.current = false;
      }
    };

    void pull();
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      logPullingRef.current = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (drawerTab !== "logs" || !logFollow || !logBoxRef.current) return;
    logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs, logFollow, drawerTab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable));

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal(null);
        setConfirmState(null);
        setPaletteOpen((current) => {
          if (!current) {
            setPaletteQuery("");
            setPaletteIndex(0);
          }
          return !current;
        });
        return;
      }

      if (event.key === "Escape") {
        if (paletteOpen) {
          event.preventDefault();
          setPaletteOpen(false);
          return;
        }
        if (confirmState) {
          event.preventDefault();
          setConfirmState(null);
          return;
        }
        if (modal) {
          event.preventDefault();
          setModal(null);
          return;
        }
        if (menu) {
          event.preventDefault();
          setMenu(null);
          return;
        }
        if (drawerOpen) {
          event.preventDefault();
          setDrawerOpen(false);
          return;
        }
      }

      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        openAdd();
      } else if (event.key.toLowerCase() === "l" && !event.ctrlKey && !event.metaKey && !event.altKey && selectedId) {
        event.preventDefault();
        setDrawerOpen(true);
        setDrawerTab("logs");
      } else if (event.key === "?") {
        event.preventDefault();
        setModal("shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, confirmState, modal, menu, drawerOpen, selectedId]);

  const counts = useMemo(() => {
    const running = services.filter((service) => service.status === "running").length;
    const error = services.filter((service) => service.status === "error").length;
    return { total: services.length, running, error, stopped: services.length - running - error };
  }, [services]);

  const groups = useMemo(() => {
    const names = Array.from(new Set(services.map((service) => service.group)));
    return ["全部服务", ...names];
  }, [services]);

  const groupStats = useMemo(() => {
    const result: Record<string, { total: number; running: number }> = {};
    for (const service of services) {
      const item = result[service.group] ?? { total: 0, running: 0 };
      item.total += 1;
      if (service.status === "running") item.running += 1;
      result[service.group] = item;
    }
    return result;
  }, [services]);

  const typeCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const service of services) {
      result[service.serviceType] = (result[service.serviceType] ?? 0) + 1;
    }
    return result;
  }, [services]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = services.filter((service) => {
      if (filter === "running" && service.status !== "running") return false;
      if (filter === "error" && service.status !== "error") return false;
      if (filter === "stopped" && service.status !== "stopped") return false;
      if (group !== "全部服务" && service.group !== group) return false;
      if (type !== "all" && service.serviceType !== type) return false;
      if (!query) return true;
      const haystack = [
        service.name,
        service.group,
        service.serviceType,
        service.executable,
        service.scriptPath ?? "",
        service.cwd,
        String(service.port ?? ""),
        String(service.pid ?? ""),
        commandFor(service),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "cpu") return b.cpuUsage - a.cpuUsage;
      return (b.lastStartedAt ?? 0) - (a.lastStartedAt ?? 0) || a.name.localeCompare(b.name, "zh-CN");
    });
    return filtered;
  }, [services, filter, group, type, search, sort]);

  const selectedService = services.find((service) => service.id === selectedId) ?? null;
  const activeService = selectedService;
  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (logLevel !== "all" && entry.level !== logLevel) return false;
      if (query && !entry.text.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [logs, logLevel, logQuery]);

  const activeDiagnose = diagnose && activeService && diagnose.id === activeService.id ? diagnose : null;
  const greet = greetingFor(now);
  const errorCount = counts.error;
  const heroMood: MascotMood = errorCount > 0 ? "worry" : services.length === 0 ? "sleep" : "happy";
  const heroSub = loading
    ? "正在连接本地守护进程，稍等一下下…"
    : !connected
      ? "还没有连上本地守护进程，界面会自动重试。"
      : services.length === 0
        ? "小屋还空着。把第一个服务请进来，或者把文件夹交给小闪。"
        : errorCount > 0
          ? `${counts.running} 个小伙伴在认真工作，${errorCount} 个需要你摸摸。`
          : counts.running === 0
            ? "小屋现在很安静，服务都停着；需要时再叫醒它们。"
            : `${counts.running} 个小伙伴都在乖乖运行，今天很稳。`;

  const activeLogs = filteredLogs;

  const pushServiceToast = (service: ServiceView | undefined, action: "start" | "stop" | "restart") => {
    if (!service) return;
    const title = action === "start" ? "已启动" : action === "stop" ? "已停止" : "已重启";
    const message = `「${service.name}」${action === "start" ? "正在运行" : action === "stop" ? "已安全停下" : "已重新跑起来"}`;
    if (action === "stop") {
      pushToast({
        kind: "info",
        title,
        message,
        action: { label: "重新启动", onClick: () => void runServiceAction(service.id, "start") },
      });
    } else if (action === "start") {
      pushToast({
        kind: "success",
        title,
        message,
        action: { label: "撤销", onClick: () => void runServiceAction(service.id, "stop") },
      });
    } else {
      pushToast({ kind: "success", title, message });
    }
  };

  const runServiceAction = async (id: string, action: "start" | "stop" | "restart") => {
    setBusy((current) => ({ ...current, [id]: action }));
    try {
      if (action === "start") await startService(id);
      else if (action === "stop") await stopService(id);
      else await restartService(id);
      await refresh();
      setStaleIds((current) => current.filter((item) => item !== id));
      pushServiceToast(services.find((service) => service.id === id), action);
    } catch (error) {
      pushToast({ kind: "error", title: "操作没有完成", message: errorText(error) });
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const toggleService = (service: ServiceView) => {
    if (busy[service.id]) return;
    void runServiceAction(service.id, service.status === "running" ? "stop" : "start");
  };

  const scopeForBatch = group === "全部服务" ? null : group;

  const startAll = async () => {
    try {
      const snapshot = await batchServiceAction(scopeForBatch, "start");
      applySnapshot(snapshot);
      pushToast({ kind: "success", title: "批量启动完成", message: `${scopeForBatch ?? "全部"} 服务已开始运行` });
    } catch (error) {
      pushToast({ kind: "error", title: "批量启动失败", message: errorText(error) });
    }
  };

  const askBatchStop = () => {
    const running = services.filter((service) => service.status === "running" && (scopeForBatch === null || service.group === scopeForBatch));
    if (!running.length) {
      pushToast({ kind: "info", title: "没有需要停止的服务", message: "当前范围内都是停止状态。" });
      return;
    }
    setConfirmState({
      title: `要让 ${running.length} 个服务先休息吗？`,
      body: `即将停止「${scopeForBatch ?? "全部服务"}」中正在运行的服务。正在写入文件的进程可能会被中断，请确认没有关键任务在跑。`,
      list: running.map((service) => ({ name: service.name, note: service.port ? `:${service.port}` : "无端口" })),
      note: "停止后会在提示条里保留重新启动入口；JobObject 会同时回收整棵子进程树。",
      confirmLabel: `停止 ${running.length} 个服务`,
      danger: true,
      onConfirm: async () => {
        try {
          const snapshot = await batchServiceAction(scopeForBatch, "stop");
          applySnapshot(snapshot);
          pushToast({ kind: "info", title: "批量停止完成", message: `${running.length} 个服务已休息` });
        } catch (error) {
          pushToast({ kind: "error", title: "批量停止失败", message: errorText(error) });
        }
      },
    });
  };

  const restartErrors = async () => {
    const errors = services.filter((service) => service.status === "error");
    if (!errors.length) {
      pushToast({ kind: "info", title: "没有异常服务", message: "当前一切正常。" });
      return;
    }
    for (const service of errors) {
      try {
        await restartService(service.id);
      } catch {
        // Continue with the remaining services.
      }
    }
    await refresh();
    pushToast({ kind: "success", title: "异常已处理", message: `${errors.length} 个服务已重新启动` });
  };

  const askDelete = (service: ServiceView) => {
    setConfirmState({
      title: `要和「${service.name}」说再见吗？`,
      body: "会从小屋里移除这条配置。本地文件、日志与程序本身都不会被删除，之后仍可以重新添加。",
      note: "移除后可以在提示条里撤销；正在运行的服务请先停止。",
      confirmLabel: "移除配置",
      danger: true,
      onConfirm: async () => {
        const restore: ServiceConfig = {
          id: service.id,
          name: service.name,
          group: service.group,
          serviceType: service.serviceType,
          executable: service.executable,
          scriptPath: service.scriptPath ?? null,
          args: service.args ?? [],
          cwd: service.cwd,
          env: service.env ?? {},
          encoding: service.encoding,
          autoRestart: service.autoRestart,
          port: service.port ?? null,
          frontendUrl: service.frontendUrl ?? null,
          autoStartOnRegister: false,
        };
        try {
          const snapshot = await deleteServiceConfig(service.id);
          applySnapshot(snapshot);
          if (selectedId === service.id) setDrawerOpen(false);
          pushToast({
            kind: "info",
            title: "已移除",
            message: `「${service.name}」的配置已移出小屋`,
            action: {
              label: "撤销",
              onClick: async () => {
                try {
                  const restored = await saveServiceConfig(restore, false);
                  await refresh();
                  setSelectedId(restored.id);
                  pushToast({ kind: "success", title: "已恢复", message: `「${service.name}」回到了小屋` });
                } catch (error) {
                  pushToast({ kind: "error", title: "恢复失败", message: errorText(error) });
                }
              },
            },
          });
        } catch (error) {
          pushToast({ kind: "error", title: "移除失败", message: errorText(error) });
        }
      },
    });
  };

  const openFrontend = async (service: ServiceView) => {
    const url = normalizeUrl(service.frontendUrl ?? "");
    if (!url) {
      pushToast({ kind: "info", title: "还没有前端地址", message: "可以在配置里添加一个 Web 地址。" });
      return;
    }
    try {
      await openFrontendUrl(url);
    } catch (error) {
      pushToast({ kind: "error", title: "打开失败", message: errorText(error) });
    }
  };

  const copyText = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ kind: "success", title, message: "" });
    } catch {
      pushToast({ kind: "error", title: "复制失败", message: "当前环境不允许访问剪贴板。" });
    }
  };

  const openDrawer = (id: string, tab: DrawerTab = "overview") => {
    setSelectedId(id);
    setDrawerOpen(true);
    setDrawerTab(tab);
    setMenu(null);
  };

  const selectTab = (tab: DrawerTab) => {
    setDrawerTab(tab);
    if (tab === "diagnose" && activeService && activeDiagnose?.id !== activeService.id && !diagnoseLoading) {
      void runDiagnose(activeService.id);
    }
  };

  const runDiagnose = async (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setDrawerTab("diagnose");
    setDiagnoseLoading(true);
    try {
      const report = await diagnoseService(id);
      setDiagnose(report);
    } catch (error) {
      pushToast({ kind: "error", title: "诊断失败", message: errorText(error) });
    } finally {
      setDiagnoseLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!activeService) return;
    try {
      const snapshot = await clearServiceLogs(activeService.id);
      applySnapshot(snapshot);
      setLogs([]);
      logCursorRef.current = 0;
      pushToast({ kind: "success", title: "日志已清空", message: "新的输出会继续出现在这里。" });
    } catch (error) {
      pushToast({ kind: "error", title: "清空失败", message: errorText(error) });
    }
  };

  const changeEncoding = async (encoding: string) => {
    if (!activeService) return;
    try {
      const snapshot = await setServiceEncoding(activeService.id, encoding);
      applySnapshot(snapshot);
      pushToast({ kind: "success", title: "编码已更新", message: encoding.toUpperCase() });
    } catch (error) {
      pushToast({ kind: "error", title: "更新编码失败", message: errorText(error) });
    }
  };

  const copyLogs = () => {
    const text = filteredLogs.map((entry) => `[${entry.time}] ${entry.level} ${entry.text}`).join("\n");
    void copyText(text || "（没有可见日志）", "可见日志已复制");
  };

  const openAdd = (preset?: ServiceType) => {
    const serviceType = preset ?? "python";
    const defaults = TYPE_DEFAULTS[serviceType];
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      group: serviceType === "nginx" && (group === "全部服务" || page === "proxies") ? "网关与中间件" : group === "全部服务" ? "AI Agent 项目" : group,
      serviceType,
      executable: defaults.executable,
      encoding: defaults.encoding,
      cwd: serviceType === "nginx" ? "D:/Develop/Windows/Nginx" : "",
      autoRestart: serviceType === "nginx" ? false : EMPTY_FORM.autoRestart,
    });
    setFormArgs(serviceType === "nginx" ? "-c conf/nginx.conf" : "");
    setFormError("");
    setModal("service");
    setMenu(null);
  };

  const openProxies = (request: ProxyOpenRequest | null = null) => {
    setProxyRequest(request);
    setPage("proxies");
    setDrawerOpen(false);
  };

  const openEdit = (service: ServiceView) => {
    setEditingId(service.id);
    setForm({
      ...service,
      scriptPath: service.scriptPath ?? "",
      frontendUrl: service.frontendUrl ?? "",
    });
    setFormArgs((service.args ?? []).join(" "));
    setFormError("");
    setModal("service");
    setMenu(null);
  };

  const applyType = (nextType: ServiceType) => {
    const defaults = TYPE_DEFAULTS[nextType];
    setForm((current) => ({
      ...current,
      serviceType: nextType,
      executable: defaults.executable,
      encoding: defaults.encoding,
      scriptPath: nextType === "python" || nextType === "node" || nextType === "script" ? current.scriptPath ?? "" : "",
    }));
  };

  const saveForm = async (startAfter: boolean) => {
    const scriptNeeded = ["python", "node", "script"].includes(form.serviceType);
    const name = form.name.trim();
    const executable = form.executable.trim();
    const scriptPath = (form.scriptPath ?? "").trim();
    if (!name) {
      setFormError("给服务起一个名字，方便在列表里找到它。");
      return;
    }
    if (!executable) {
      setFormError("请填写启动程序或解释器。");
      return;
    }
    if (scriptNeeded && !scriptPath) {
      setFormError("这个运行器需要指定要执行的脚本。");
      return;
    }

    const config: ServiceConfig = {
      ...form,
      name,
      group: form.group.trim() || "默认分组",
      executable,
      scriptPath: scriptNeeded ? scriptPath : null,
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : [],
      cwd: form.cwd.trim(),
      env: form.env ?? {},
      port: form.port ? Number(form.port) : null,
      frontendUrl: normalizeUrl(form.frontendUrl ?? "") || null,
      autoStartOnRegister: false,
    };

    setSaving(true);
    setFormError("");
    try {
      const wasRunning = editingId ? services.find((service) => service.id === editingId)?.status === "running" : false;
      const saved = await saveServiceConfig(config, false);
      setSelectedId(saved.id);

      if (editingId) {
        if (wasRunning) {
          setStaleIds((current) => (current.includes(saved.id) ? current : [...current, saved.id]));
          pushToast({
            kind: "success",
            title: "配置已保存",
            message: "运行中的服务需要重启后才会应用新配置。",
            action: { label: "立即重启", onClick: () => void runServiceAction(saved.id, "restart") },
          });
        } else {
          pushToast({ kind: "success", title: "配置已保存", message: `「${saved.name}」已更新` });
        }
      } else if (startAfter) {
        try {
          await startService(saved.id);
          pushToast({ kind: "success", title: "已加入并启动", message: `「${saved.name}」正在运行` });
        } catch (error) {
          pushToast({ kind: "error", title: "已保存，但启动失败", message: errorText(error) });
        }
      } else {
        pushToast({ kind: "success", title: "已加入小屋", message: `「${saved.name}」现在就等你启动了` });
      }

      setModal(null);
      await refresh();
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const detectService = async () => {
    if (!detectPath.trim()) {
      setDetectError("输入项目文件夹或脚本路径后，小闪才能开始找。");
      return;
    }
    setDetectBusy(true);
    setDetectError("");
    try {
      const saved = await autoDetectAndRegister(detectPath.trim(), undefined, detectGroup.trim() || undefined, true);
      setModal(null);
      setSelectedId(saved.id);
      await refresh();
      pushToast({ kind: "success", title: "已自动接入并启动", message: `「${saved.name}」· ${saved.group}` });
    } catch (error) {
      setDetectError(errorText(error));
    } finally {
      setDetectBusy(false);
    }
  };

  const hibernate = async () => {
    try {
      const ok = await hibernateToTray();
      if (!ok) {
        pushToast({ kind: "info", title: "浏览器预览模式", message: "休眠到托盘只在 Tauri 桌面端可用。" });
      }
    } catch (error) {
      pushToast({ kind: "error", title: "休眠失败", message: errorText(error) });
    }
  };

  const openMenu = (event: ReactMouseEvent<HTMLElement>, items: MenuEntry[], header?: string, note?: string) => {
    const app = appRef.current;
    if (!app) return;
    const appRect = app.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = 18 + (header ? 26 : 0) + (note ? 30 : 0) + items.reduce((sum, item) => sum + (item.divider ? 9 : 32), 0);
    let left = rect.left - appRect.left;
    if (left + 232 > appRect.width - 8) left = appRect.width - 232 - 8;
    left = Math.max(8, left);
    let top = rect.bottom - appRect.top + 5;
    if (top + estimatedHeight > appRect.height - 8 && rect.top - appRect.top > estimatedHeight + 8) {
      top = rect.top - appRect.top - estimatedHeight - 5;
    }
    top = Math.max(8, Math.min(top, appRect.height - estimatedHeight - 8));
    setMenu({ left, top, header, note, items });
  };

  const openBatchMenu = (event: ReactMouseEvent<HTMLElement>) => {
    const scopeLabel = scopeForBatch ?? "全部服务";
    const scoped = services.filter((service) => scopeForBatch === null || service.group === scopeForBatch);
    const running = scoped.filter((service) => service.status === "running").length;
    const stopped = scoped.filter((service) => service.status !== "running").length;
    const errors = scoped.filter((service) => service.status === "error").length;
    openMenu(
      event,
      [
        { label: "启动范围内服务", note: `${stopped} 个`, icon: <Play className="i" />, disabled: !stopped, onClick: () => void startAll() },
        { label: "停止范围内服务", note: `${running} 个`, icon: <Square className="i" />, danger: true, disabled: !running, onClick: askBatchStop },
        { label: "重启异常服务", note: `${errors} 个`, icon: <RefreshCw className="i" />, disabled: !errors, onClick: () => void restartErrors() },
        { divider: true },
        { label: "从文件夹自动识别", icon: <Folder className="i" />, onClick: () => setModal("detect") },
      ],
      "批量操作",
      `范围：${scopeLabel} · 危险操作会先确认，完成后可恢复。`
    );
  };

  const openUserMenu = (event: ReactMouseEvent<HTMLElement>) => {
    openMenu(
      event,
      [
        { label: "偏好设置", icon: <Settings className="i" />, onClick: () => setModal("settings") },
        { label: "快捷键", icon: <Keyboard className="i" />, note: "?", onClick: () => setModal("shortcuts") },
        { divider: true },
        { label: "休眠到系统托盘", icon: <Moon className="i" />, onClick: () => void hibernate() },
        {
          label: "关于 FlashManager",
          icon: <Sparkles className="i" />,
          onClick: () => pushToast({ kind: "info", title: "FlashManager v0.1.0", message: "Tauri v2 + React 18 · Sugar Star UI" }),
        },
      ],
      "小屋设置"
    );
  };

  const openBell = (event: ReactMouseEvent<HTMLElement>) => {
    const errors = services.filter((service) => service.status === "error");
    openMenu(
      event,
      errors.length
        ? errors.map((service) => ({
            label: `${service.name}：端口或进程没有响应`,
            icon: <AlertTriangle className="i" />,
            danger: true,
            onClick: () => void runDiagnose(service.id),
          }))
        : [{ label: "没有新的通知", icon: <Check className="i" />, disabled: true }],
      errors.length ? `通知 · ${errors.length}` : "通知",
      errors.length ? "点击一条通知可直接打开诊断。" : undefined
    );
  };

  const openCardMenu = (event: ReactMouseEvent<HTMLElement>, service: ServiceView) => {
    openMenu(
      event,
      [
        { label: "查看详情", icon: <Activity className="i" />, onClick: () => openDrawer(service.id, "overview") },
        { label: "查看实时日志", icon: <Terminal className="i" />, onClick: () => openDrawer(service.id, "logs") },
        service.frontendUrl ? { label: "打开前端", icon: <ExternalLink className="i" />, onClick: () => void openFrontend(service) } : null,
        { divider: true },
        { label: "重启服务", icon: <RefreshCw className="i" />, onClick: () => void runServiceAction(service.id, "restart") },
        { label: "运行健康诊断", icon: <Activity className="i" />, onClick: () => void runDiagnose(service.id) },
        { label: "编辑配置", icon: <Pencil className="i" />, onClick: () => openEdit(service) },
        { label: "复制启动命令", icon: <Copy className="i" />, onClick: () => void copyText(commandFor(service), "启动命令已复制") },
        { divider: true },
        { label: "移除服务配置", icon: <Trash2 className="i" />, danger: true, onClick: () => askDelete(service) },
      ].filter(Boolean) as MenuEntry[],
      service.name,
      "移除只删除配置，不会动本地文件。"
    );
  };

  const resetFilters = () => {
    setFilter("all");
    setGroup("全部服务");
    setType("all");
    setSearch("");
    setView("grid");
  };

  const cycleSort = () => {
    const index = SORT_OPTIONS.findIndex((option) => option.key === sort);
    setSort(SORT_OPTIONS[(index + 1) % SORT_OPTIONS.length].key);
  };

  const formatActionLabel = (service: ServiceView) => {
    if (busy[service.id]) return busy[service.id] === "stop" ? "停止中…" : busy[service.id] === "restart" ? "重启中…" : "启动中…";
    if (service.status === "running") return "停止";
    if (service.status === "error") return "重试";
    return "启动";
  };

  const commandItems = [
    { label: "添加服务", hint: "手动填写配置", icon: <Plus className="i" />, run: openAdd },
    { label: "从文件夹自动识别", hint: "交给小闪", icon: <Folder className="i" />, run: () => setModal("detect") },
    { label: "全部启动", hint: "启动所有未运行服务", icon: <Play className="i" />, run: () => void startAll() },
    { label: "全部停止", hint: "先确认影响范围", icon: <Square className="i" />, run: askBatchStop },
    { label: "重启异常服务", hint: "只处理需要关心的", icon: <RefreshCw className="i" />, run: () => void restartErrors() },
    { label: "偏好设置", hint: "主题 / 动效", icon: <Settings className="i" />, run: () => setModal("settings") },
    { label: "快捷键", hint: "键盘地图", icon: <Keyboard className="i" />, run: () => setModal("shortcuts") },
    { label: "切换樱昼 / 樱夜", hint: "外观", icon: theme === "day" ? <Moon className="i" /> : <Sun className="i" />, run: () => setTheme(theme === "day" ? "night" : "day") },
  ];

  const paletteServices = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return services.filter((service) => {
      if (!query) return true;
      return `${service.name} ${service.group} ${commandFor(service)} ${service.port ?? ""}`.toLowerCase().includes(query);
    });
  }, [services, paletteQuery]);

  const paletteCommands = commandItems.filter((item) => {
    const query = paletteQuery.trim().toLowerCase();
    return !query || `${item.label} ${item.hint}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (paletteOpen) {
      window.setTimeout(() => paletteInputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const executePaletteService = (service: ServiceView) => {
    setPaletteOpen(false);
    openDrawer(service.id, "overview");
  };

  const executePaletteCommand = (run: () => void) => {
    setPaletteOpen(false);
    run();
  };

  const filterOptions: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "全部", count: counts.total },
    { key: "running", label: "运行中", count: counts.running },
    { key: "error", label: "需关注", count: counts.error },
    { key: "stopped", label: "已停止", count: counts.stopped },
  ];

  const sortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? "按最近启动";

  return (
    <div
      ref={appRef}
      className={`fm-app ${reduceMotion ? "reduce-motion" : ""}`}
      data-theme={theme}
      data-moe="2"
    >
      <header className="fm-topbar">
        <button className="fm-brand" onClick={resetFilters} aria-label="回到总览">
          <span className="fm-brand-avatar">
            <Mascot size={38} mood="idle" />
          </span>
          <span className="fm-brand-text">
            <b>FlashManager</b>
            <small>本地服务小屋</small>
          </span>
        </button>
        <span className={`fm-live-pill ${connected ? "" : "is-off"}`}>
          <i />
          {loading ? "连接中" : connected ? "守护中" : "未连接"}
        </span>
        <button className="fm-omni" onClick={() => setPaletteOpen(true)}>
          <Search className="i" />
          <span>搜索服务、分组或操作…</span>
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </button>
        <div className="fm-top-actions">
          <button className="fm-iconbtn" onClick={() => setTheme(theme === "day" ? "night" : "day")} aria-label="切换樱昼 / 樱夜">
            <Sun className="i fm-icon-sun" />
            <Moon className="i fm-icon-moon" />
          </button>
          <button className="fm-iconbtn fm-bell" onClick={openBell} aria-label="通知">
            <Bell className="i" />
            {errorCount > 0 ? <span className="fm-badge">{errorCount}</span> : null}
          </button>
          <button className="fm-avatar" onClick={openUserMenu} aria-label="设置与更多">
            <Mascot size={32} mood="happy" />
          </button>
        </div>
      </header>

      <div className="fm-body">
        <aside className="fm-side">
          <button className="fm-greet-card" onClick={resetFilters} aria-label="和闪打招呼">
            <span className="fm-greet-mascot">
              <Mascot size={64} mood={heroMood} />
            </span>
            <span className="fm-greet-copy">
              <b>{greet.side}</b>
              <small>{greet.line}</small>
            </span>
            <span className="fm-greet-spark">✦</span>
          </button>
          <div className="fm-side-summary">
            <i />
            <b>{counts.running}</b> 个在运行 · <b>{counts.error}</b> 个需关注
          </div>

          <nav className="fm-nav" aria-label="服务视图">
            <span className="fm-nav-title">小屋</span>
            <button
              className={page === "services" && group === "全部服务" && filter === "all" ? "is-active" : ""}
              onClick={() => {
                setPage("services");
                setFilter("all");
                setGroup("全部服务");
                setType("all");
              }}
            >
              <LayoutGrid className="i" />
              <span>总览</span>
              <small>{counts.total}</small>
            </button>
            <button
              className={page === "services" && filter === "running" ? "is-active" : ""}
              onClick={() => {
                setPage("services");
                setFilter("running");
                setGroup("全部服务");
                setType("all");
              }}
            >
              <Play className="i" />
              <span>正在运行</span>
              <small>{counts.running}</small>
            </button>
            <button
              className={page === "services" && filter === "error" ? "is-active" : ""}
              onClick={() => {
                setPage("services");
                setFilter("error");
                setGroup("全部服务");
                setType("all");
              }}
            >
              <AlertTriangle className="i" />
              <span>需要关心</span>
              <small className="is-danger">{counts.error}</small>
            </button>
            <button
              className={page === "services" && filter === "stopped" ? "is-active" : ""}
              onClick={() => {
                setPage("services");
                setFilter("stopped");
                setGroup("全部服务");
                setType("all");
              }}
            >
              <Pause className="i" />
              <span>已停止</span>
              <small>{counts.stopped}</small>
            </button>
            <button className={page === "proxies" ? "is-active" : ""} onClick={() => openProxies()}>
              <Route className="i" />
              <span>反向代理</span>
            </button>
          </nav>

          <nav className="fm-nav fm-groups" aria-label="服务分组">
            <span className="fm-nav-title">分组</span>
            {groups.map((name) => {
              const stat = name === "全部服务" ? { total: counts.total, running: counts.running } : groupStats[name] ?? { total: 0, running: 0 };
              const active = group === name;
              return (
                <button
                  key={name}
                  className={`fm-group-btn ${page === "services" && active ? "is-active" : ""}`}
                  onClick={() => {
                    setPage("services");
                    setGroup(name);
                    setFilter("all");
                    setType("all");
                  }}
                  style={{ "--group-color": GROUP_COLORS[name] ?? (name === "全部服务" ? "#8e6fe8" : "#2fa98f") } as CSSProperties}
                  title={`运行中 ${stat.running} / 共 ${stat.total}`}
                >
                  <span className="fm-group-dot" />
                  <span>{name}</span>
                  <small>
                    <i className="run">{stat.running}</i>/{stat.total}
                  </small>
                </button>
              );
            })}
          </nav>

          <details className="fm-typebox">
            <summary>
              <span>运行器类型</span>
              <small>{counts.total}</small>
              <ChevronDown className="i" />
            </summary>
            <div className="fm-type-list">
              <button
                className={page === "services" && type === "all" ? "is-active" : ""}
                onClick={() => {
                  setPage("services");
                  setType("all");
                  setFilter("all");
                  setGroup("全部服务");
                }}
              >
                <span className="fm-mono-icon" style={{ background: "var(--fm-line)", color: "var(--fm-muted)" }}>
                  ·
                </span>
                <span>全部类型</span>
                <small>{counts.total}</small>
              </button>
              {TYPE_ORDER.map((serviceType) => {
                const meta = TYPE_META[serviceType];
                return (
                  <button
                    key={serviceType}
                    className={page === "services" && type === serviceType ? "is-active" : ""}
                    onClick={() => {
                      setPage("services");
                      setType(serviceType);
                      setFilter("all");
                      setGroup("全部服务");
                    }}
                  >
                    <span className="fm-mono-icon" style={{ background: "var(--fm-surface-2)", color: "var(--fm-ink-2)" }}>
                      {meta.mono}
                    </span>
                    <span>{meta.label}</span>
                    <small>{typeCounts[serviceType] ?? 0}</small>
                  </button>
                );
              })}
            </div>
          </details>

          <div className="fm-guard">
            <span className="fm-guard-icon">
              <Shield className="i" />
            </span>
            <div>
              <b>Win32 进程树守护</b>
              <small>停止时整棵树一起回收</small>
            </div>
            <span className="fm-guard-ok" title="运行正常">
              ✓
            </span>
          </div>

          <div className="fm-side-foot">
            <button onClick={() => setModal("settings")}>
              <Settings className="i" />
              设置
            </button>
            <button onClick={() => setModal("shortcuts")}>
              <Keyboard className="i" />
              快捷键
            </button>
          </div>
        </aside>

        <main className="fm-main">
          <div className="fm-scroll">
            {page === "proxies" ? (
              <ProxyPage
                services={services}
                request={proxyRequest}
                onRequestConsumed={() => setProxyRequest(null)}
                onAddNginx={() => openAdd("nginx")}
                onToast={pushToast}
              />
            ) : (
            <>
            <section className="fm-hero">
              <div className="fm-hero-copy">
                <span className="fm-eyebrow">{dateLabel(now)}</span>
                <h1>
                  <span>{greet.main}</span>，<span className="fm-soft">今天也辛苦啦</span>
                </h1>
                <p>{heroSub}</p>
              </div>
              <div className="fm-hero-side">
                <div className="fm-hero-mascot" role="button" tabIndex={0} aria-label="和小闪打招呼">
                  <Mascot size={88} mood={heroMood} />
                  <span className="fm-bubble">都交给我吧～</span>
                </div>
                <div className="fm-hero-actions">
                  <button className="fm-btn fm-btn-soft" onClick={openBatchMenu}>
                    <Layers className="i" />
                    批量操作
                    <ChevronDown className="i fm-chev" />
                  </button>
                  <button className="fm-btn fm-btn-primary" onClick={() => openAdd()}>
                    <Plus className="i" />
                    添加服务
                  </button>
                </div>
              </div>
            </section>

            {!connected && !loading ? (
              <button className="fm-attention" onClick={() => void refresh()}>
                <span className="fm-attention-icon">
                  <AlertTriangle className="i" />
                </span>
                <span className="fm-attention-copy">
                  <b>还没有连上本地守护进程</b>
                  <small>请确认 FlashManager 后端正在运行；界面会自动重试，点这里立即重试。</small>
                </span>
                <span className="fm-attention-link">
                  重试 <ArrowRight className="i" />
                </span>
              </button>
            ) : null}

            {errorCount > 0 && services.length > 0 ? (
              <button
                className="fm-attention"
                onClick={() => {
                  setFilter("error");
                  setGroup("全部服务");
                  setType("all");
                }}
              >
                <span className="fm-attention-icon">
                  <AlertTriangle className="i" />
                </span>
                <span className="fm-attention-copy">
                  <b>有 {errorCount} 个小伙伴需要关心</b>
                  <small>打开诊断可以看到影响、原因和下一步处理。</small>
                </span>
                <span className="fm-attention-link">
                  去看看 <ArrowRight className="i" />
                </span>
              </button>
            ) : null}

            <section className="fm-stats" aria-label="全局指标">
              <button
                className="fm-stat"
                onClick={() => setFilter("running")}
                style={{ "--stat-color": "var(--fm-mint)", "--stat-wash": "var(--fm-mint-soft)" } as CSSProperties}
                aria-label="查看运行中的服务"
              >
                <span className="fm-stat-top">
                  <span className="fm-stat-icon">
                    <Play className="i" />
                  </span>
                  运行中
                </span>
                <span className="fm-stat-value">
                  <b>{counts.running}</b>
                  <small>/ {counts.total}</small>
                </span>
                <span className="fm-stat-sub">
                  <span className="up">{counts.total ? Math.round((counts.running / counts.total) * 100) : 0}%</span> 健康在线
                </span>
                <span className="fm-stat-bar">
                  <span style={{ width: `${counts.total ? Math.round((counts.running / counts.total) * 100) : 0}%` }} />
                </span>
              </button>
              <button
                className="fm-stat"
                onClick={() => setFilter("all")}
                style={{ "--stat-color": "var(--fm-sky)", "--stat-wash": "var(--fm-sky-soft)" } as CSSProperties}
                aria-label="查看 CPU 总览"
              >
                <span className="fm-stat-top">
                  <span className="fm-stat-icon">
                    <Cpu className="i" />
                  </span>
                  托管 CPU
                </span>
                <span className="fm-stat-value">
                  <b>{metrics.totalManagedCpu.toFixed(1)}</b>
                  <small>%</small>
                </span>
                <span className="fm-stat-sub">{counts.running} 个进程正在计入</span>
                <Sparkline color="var(--fm-sky)" />
              </button>
              <button
                className="fm-stat"
                onClick={() => setFilter("all")}
                style={{ "--stat-color": "var(--fm-lilac)", "--stat-wash": "var(--fm-lilac-soft)" } as CSSProperties}
                aria-label="查看内存总览"
              >
                <span className="fm-stat-top">
                  <span className="fm-stat-icon">
                    <MemoryStick className="i" />
                  </span>
                  托管内存
                </span>
                <span className="fm-stat-value">
                  <b>{Math.round(metrics.totalManagedMemoryMb)}</b>
                  <small>MB</small>
                </span>
                <span className="fm-stat-sub">平均 {counts.running ? Math.round(metrics.totalManagedMemoryMb / counts.running) : 0} MB / 服务</span>
                <span className="fm-stat-bar">
                  <span
                    style={{
                      width: `${Math.max(3, Math.min(100, Math.round(metrics.totalManagedMemoryMb / 10)))}%`,
                      background: "var(--fm-lilac)",
                    }}
                  />
                </span>
              </button>
              <button
                className="fm-stat"
                onClick={() => setFilter("running")}
                style={{ "--stat-color": "var(--fm-butter)", "--stat-wash": "var(--fm-butter-soft)" } as CSSProperties}
                aria-label="查看活跃端口"
              >
                <span className="fm-stat-top">
                  <span className="fm-stat-icon">
                    <Globe className="i" />
                  </span>
                  活跃端口
                </span>
                <span className="fm-stat-value">
                  <b>{metrics.activePorts.length}</b>
                  <small>个</small>
                </span>
                <span className="fm-stat-ports">
                  {metrics.activePorts.slice(0, 3).map((port) => (
                    <span key={port}>:{port}</span>
                  ))}
                  {metrics.activePorts.length > 3 ? <span className="more">+{metrics.activePorts.length - 3}</span> : null}
                  {!metrics.activePorts.length ? <span className="more">暂无</span> : null}
                </span>
              </button>
            </section>

            <div className="fm-toolbar">
              <div className="fm-filters" role="group" aria-label="状态筛选">
                {filterOptions.map((option) => (
                  <button
                    key={option.key}
                    className={`fm-chip ${filter === option.key ? "is-active" : ""}`}
                    onClick={() => {
                      setFilter(option.key);
                      setGroup("全部服务");
                    }}
                    aria-pressed={filter === option.key}
                  >
                    {option.label}
                    <b>{option.count}</b>
                  </button>
                ))}
              </div>
              <div className="fm-toolbar-right">
                <label className="fm-searchbox">
                  <Search className="i" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索名称、端口、路径…"
                    type="search"
                    autoComplete="off"
                  />
                  <kbd>/</kbd>
                </label>
                <button className="fm-sortbtn" onClick={cycleSort} title="切换排序" aria-label="切换排序">
                  <ArrowUpDown className="i" />
                  <span>{sortLabel}</span>
                </button>
                <div className="fm-viewtoggle" role="group" aria-label="视图切换">
                  <button
                    className={view === "grid" ? "is-active" : ""}
                    onClick={() => setView("grid")}
                    aria-label="卡片视图"
                    aria-pressed={view === "grid"}
                  >
                    <LayoutGrid className="i" />
                  </button>
                  <button
                    className={view === "list" ? "is-active" : ""}
                    onClick={() => setView("list")}
                    aria-label="列表视图"
                    aria-pressed={view === "list"}
                  >
                    <List className="i" />
                  </button>
                </div>
              </div>
            </div>

            <div className={`fm-grid ${view === "list" ? "is-list" : ""}`}>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div className="fm-skeleton" key={index} aria-hidden="true">
                    <span className="sk-top" />
                    <span className="sk-sub" />
                    <span className="sk-cmd" />
                    <span className="sk-bottom" />
                  </div>
                ))
              ) : services.length === 0 ? (
                <div className="fm-empty">
                  <span className="fm-empty-mascot">
                    <Mascot size={108} mood="sleep" />
                  </span>
                  <h3>小屋里还空空的…</h3>
                  <p>把第一个本地服务请进来吧。你可以手动填写，也可以直接把项目文件夹交给小闪，让它自己识别。</p>
                  <div className="fm-empty-actions">
                    <button className="fm-btn fm-btn-primary" onClick={() => openAdd()}>
                      <Plus className="i" />
                      添加第一个服务
                    </button>
                    <button className="fm-btn fm-btn-soft" onClick={() => setModal("detect")}>
                      <Folder className="i" />
                      从文件夹自动识别
                    </button>
                  </div>
                  <div className="fm-empty-steps">
                    <span>
                      <b>1</b> 添加服务
                    </span>
                    <span>
                      <b>2</b> 确认启动命令
                    </span>
                    <span>
                      <b>3</b> 安心托管
                    </span>
                  </div>
                </div>
              ) : visibleServices.length === 0 ? (
                <div className="fm-empty is-search">
                  <span className="fm-empty-mascot">
                    <Mascot size={84} mood="idle" />
                  </span>
                  <h3>没有找到符合条件的小伙伴</h3>
                  <p>试试换一个关键词，或者清掉状态、分组和类型筛选。小闪也可以帮你直接搜索整个小屋。</p>
                  <div className="fm-empty-actions">
                    <button className="fm-btn fm-btn-primary" onClick={resetFilters}>
                      清除筛选
                    </button>
                    <button className="fm-btn fm-btn-soft" onClick={() => setPaletteOpen(true)}>
                      <Search className="i" />
                      打开命令面板
                    </button>
                  </div>
                </div>
              ) : (
                visibleServices.map((service) => {
                  const meta = TYPE_META[service.serviceType] ?? TYPE_META.exe;
                  const busyAction = busy[service.id];
                  const running = service.status === "running";
                  const error = service.status === "error";
                  const primaryClass = busyAction ? "start is-busy" : running ? "stop" : error ? "retry" : "start";
                  const primaryIcon = busyAction ? <Loader2 className="i" /> : running ? <Square className="i" /> : error ? <RefreshCw className="i" /> : <Play className="i" />;
                  const isSelected = drawerOpen && selectedId === service.id;
                  return (
                    <article
                      key={service.id}
                      className={`fm-card ${error ? "is-error" : ""} ${isSelected ? "is-selected" : ""} ${busyAction ? "is-busy" : ""}`}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${service.name}，${STATUS_META[service.status].label}，按回车查看详情`}
                      onClick={() => openDrawer(service.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDrawer(service.id);
                        }
                      }}
                    >
                      <div className="fm-card-top">
                        <span className={`fm-type-icon ${meta.cls}`}>{meta.mono}</span>
                        <div className="fm-card-title">
                          <div className="fm-card-name">
                            <span className="fm-name-text">{service.name}</span>
                          </div>
                          <div className="fm-card-meta">
                            <span>{service.group}</span>
                            {staleIds.includes(service.id) ? <span className="fm-stale-tag">待重启</span> : null}
                          </div>
                        </div>
                        <div className="fm-card-top-right">
                          {statusPill(service, busyAction)}
                          <button
                            className="fm-kebab"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCardMenu(event, service);
                            }}
                            aria-label={`${service.name} 的更多操作`}
                          >
                            <MoreHorizontal className="i" />
                          </button>
                        </div>
                      </div>
                      {error ? (
                        <div className="fm-card-error">
                          <AlertTriangle className="i" />
                          <span>{service.port ? `端口 ${service.port} 没有响应或进程已退出` : "进程异常退出，看看诊断里的下一步。"}</span>
                          <b
                            onClick={(event) => {
                              event.stopPropagation();
                              void runDiagnose(service.id);
                            }}
                          >
                            去诊断
                          </b>
                        </div>
                      ) : (
                        <div className="fm-card-cmd">{commandFor(service)}</div>
                      )}
                      <div className="fm-card-bottom">
                        <div className="fm-card-stats">
                          <span className={`port ${service.port ? "" : "is-off"}`}>
                            <Globe className="i" />
                            {service.port ? `:${service.port}` : "—"}
                          </span>
                          <span>
                            <Clock className="i" />
                            {running ? (service.uptimeSeconds > 0 ? presenceLabel(service.uptimeSeconds) : "刚刚") : "—"}
                          </span>
                          <span>
                            <Cpu className="i" />
                            {running ? `${service.cpuUsage.toFixed(1)}%` : "0.0%"}
                          </span>
                          <span>
                            <MemoryStick className="i" />
                            {running ? `${Math.round(service.memoryMb)}M` : "0M"}
                          </span>
                        </div>
                        <div className="fm-card-actions">
                          {service.frontendUrl ? (
                            <button
                              className="fm-mini-btn open-frontend"
                              title="打开前端"
                              aria-label="打开前端"
                              onClick={(event) => {
                                event.stopPropagation();
                                void openFrontend(service);
                              }}
                            >
                              <ExternalLink className="i" />
                            </button>
                          ) : null}
                          <button
                            className="fm-mini-btn"
                            title="查看日志"
                            aria-label="查看日志"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDrawer(service.id, "logs");
                            }}
                          >
                            <Terminal className="i" />
                          </button>
                          <button
                            className={`fm-card-primary ${primaryClass}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleService(service);
                            }}
                            disabled={Boolean(busyAction)}
                          >
                            {primaryIcon}
                            {formatActionLabel(service)}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="fm-list-foot">
              <span>
                共 <b>{counts.total}</b> 个服务 · <b>{counts.running}</b> 个运行中
              </span>
              <span className="fm-sync is-live">
                <RefreshCw className="i" />
                最后更新 {timeAgo(lastUpdated, now.getTime())}
              </span>
            </div>
            </>
            )}
          </div>
        </main>

        <div className={`fm-drawer ${drawerOpen && activeService ? "is-open" : ""}`} aria-hidden={!drawerOpen || !activeService}>
          <div className="fm-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          {activeService ? (
            <aside className="fm-drawer-panel" role="dialog" aria-modal="false" aria-label="服务详情">
              <div className="fm-drawer-head">
                <div className="fm-drawer-titlebar">
                  {typeIcon(activeService)}
                  <div className="fm-drawer-title">
                    <h2>
                      {activeService.name}
                      {busy[activeService.id] ? statusPill(activeService, busy[activeService.id]) : null}
                    </h2>
                    <p>
                      {activeService.group} · {activeService.port ? `127.0.0.1:${activeService.port}` : "无监控端口"} ·{" "}
                      {activeService.pid ? `PID ${activeService.pid}` : "无进程"}
                    </p>
                  </div>
                  <button className="fm-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="关闭详情">
                    <X className="i" />
                  </button>
                </div>
                <div className="fm-drawer-statusline">
                  {statusPill(activeService, busy[activeService.id])}
                  <span className="fm-status neutral">{activeService.autoRestart ? "自动重启 · 开" : "自动重启 · 关"}</span>
                  <span className="fm-status neutral">{TYPE_META[activeService.serviceType].label}</span>
                </div>
                <div className="fm-drawer-actions">
                  <button
                    className={`fm-btn fm-drawer-main ${busy[activeService.id] ? "start is-busy" : activeService.status === "running" ? "stop" : activeService.status === "error" ? "retry" : "start"}`}
                    onClick={() => toggleService(activeService)}
                    disabled={Boolean(busy[activeService.id])}
                  >
                    {busy[activeService.id] ? <Loader2 className="i" /> : activeService.status === "running" ? <Square className="i" /> : activeService.status === "error" ? <RefreshCw className="i" /> : <Play className="i" />}
                    {busy[activeService.id] ? "处理中…" : activeService.status === "running" ? "停止服务" : activeService.status === "error" ? "重试启动" : "启动服务"}
                  </button>
                  <button
                    className="fm-drawer-iconbtn"
                    title="重启服务"
                    aria-label="重启服务"
                    onClick={() => void runServiceAction(activeService.id, "restart")}
                  >
                    <RefreshCw className="i" />
                  </button>
                  {activeService.frontendUrl ? (
                    <button className="fm-drawer-iconbtn" title="打开前端" aria-label="打开前端" onClick={() => void openFrontend(activeService)}>
                      <ExternalLink className="i" />
                    </button>
                  ) : null}
                  <button className="fm-drawer-iconbtn" title="健康诊断" aria-label="健康诊断" onClick={() => void runDiagnose(activeService.id)}>
                    <Activity className="i" />
                  </button>
                  <button className="fm-drawer-iconbtn" title="更多操作" aria-label="更多操作" onClick={(event) => openCardMenu(event, activeService)}>
                    <MoreHorizontal className="i" />
                  </button>
                </div>
              </div>

              <div className="fm-drawer-tabs" role="tablist" aria-label="详情页签">
                {(
                  [
                    ["overview", "概览"],
                    ["logs", "实时日志"],
                    ["config", "配置"],
                    ["diagnose", "诊断"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={drawerTab === key}
                    className={drawerTab === key ? "is-active" : ""}
                    onClick={() => selectTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="fm-drawer-body">
                {drawerTab === "overview" ? (
                  <>
                    <div className={`fm-overview-hero ${activeService.status === "error" ? "is-error" : ""}`}>
                      <Mascot
                        size={58}
                        mood={activeService.status === "running" ? "happy" : activeService.status === "error" ? "worry" : "sleep"}
                      />
                      <div>
                        <b>
                          {activeService.status === "running"
                            ? "正在乖乖运行"
                            : activeService.status === "error"
                              ? "遇到一点小问题"
                              : "在休息，随时可以叫醒"}
                        </b>
                        <small>
                          {activeService.status === "running"
                            ? `${formatDuration(activeService.uptimeSeconds)} · ${activeService.cpuUsage.toFixed(1)}% CPU · ${Math.round(activeService.memoryMb)} MB`
                            : activeService.status === "error"
                              ? "进程或端口没有正常响应，看看诊断里的下一步。"
                              : "停止状态不会占用 CPU 与内存，需要时再启动。"}
                        </small>
                      </div>
                    </div>
                    <div className="fm-overview-grid">
                      <div className="fm-metric-tile">
                        <small>
                          <Cpu className="i" />
                          PID
                        </small>
                        <b>{activeService.pid ?? "—"}</b>
                      </div>
                      <div className="fm-metric-tile">
                        <small>
                          <Globe className="i" />
                          端口
                        </small>
                        <b>{activeService.port ?? "—"}</b>
                      </div>
                      <div className="fm-metric-tile">
                        <small>
                          <Clock className="i" />
                          运行时长
                        </small>
                        <b>{formatFullDuration(activeService.uptimeSeconds)}</b>
                      </div>
                      <div className="fm-metric-tile">
                        <small>
                          <Shield className="i" />
                          进程树
                        </small>
                        <b>{activeService.status === "running" ? "已托管" : "—"}</b>
                      </div>
                    </div>
                    <div className="fm-detail-section">
                      <h4>
                        <Activity className="i" />
                        健康检查
                      </h4>
                      <div className="fm-health-list">
                        <div className={`fm-health-row ${activeService.status === "error" ? "is-warn" : ""}`}>
                          <span className="fm-health-icon">{activeService.status === "error" ? "!" : activeService.status === "running" ? "✓" : "·"}</span>
                          <span>进程状态</span>
                          <small>{activeService.status === "running" ? "运行中" : activeService.status === "error" ? "异常退出" : "未运行"}</small>
                        </div>
                        <div className={`fm-health-row ${activeService.port && !activeService.portActive ? "is-warn" : ""}`}>
                          <span className="fm-health-icon">{activeService.port && !activeService.portActive ? "!" : "✓"}</span>
                          <span>端口监听</span>
                          <small>{!activeService.port ? "未配置" : activeService.portActive ? "监听中" : "无响应"}</small>
                        </div>
                        <div className="fm-health-row">
                          <span className="fm-health-icon">✓</span>
                          <span>配置读取</span>
                          <small>通过</small>
                        </div>
                        <div className="fm-health-row">
                          <span className="fm-health-icon">✓</span>
                          <span>自动重启</span>
                          <small>{activeService.autoRestart ? "已开启" : "已关闭"}</small>
                        </div>
                      </div>
                    </div>
                    <div className="fm-detail-section">
                      <h4>
                        <Shield className="i" />
                        服务档案
                      </h4>
                      <div className="fm-kv">
                        <div className="fm-kv-row">
                          <span>启动命令</span>
                          <b title={commandFor(activeService)}>{commandFor(activeService)}</b>
                        </div>
                        <div className="fm-kv-row">
                          <span>工作目录</span>
                          <b title={activeService.cwd}>{activeService.cwd || "未设置"}</b>
                        </div>
                        <div className="fm-kv-row">
                          <span>控制台编码</span>
                          <b>{activeService.encoding.toUpperCase()}</b>
                        </div>
                        <div className="fm-kv-row">
                          <span>前端地址</span>
                          <b>{activeService.frontendUrl || "未配置"}</b>
                        </div>
                      </div>
                    </div>
                    <ServiceProxyNote service={activeService} services={services} onOpen={openProxies} />
                    {activeLogs.length ? (
                      <div className="fm-detail-section">
                        <h4>
                          <Terminal className="i" />
                          最近输出
                        </h4>
                        <div className="fm-diag-code">
                          {activeLogs
                            .slice(-4)
                            .map((entry) => `[${entry.time}] ${entry.level} ${entry.text}`)
                            .join("\n")}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {drawerTab === "logs" ? (
                  <div className="fm-log-wrap">
                    <div className="fm-log-toolbar">
                      {[
                        ["all", "全部"],
                        ["OUT", "输出"],
                        ["ERR", "错误"],
                        ["SYS", "系统"],
                      ].map(([key, label]) => (
                        <button key={key} className={`fm-log-filter ${logLevel === key ? "is-active" : ""}`} onClick={() => setLogLevel(key)}>
                          {label}
                        </button>
                      ))}
                      <label className="fm-log-search">
                        <Search className="i" />
                        <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="过滤日志…" type="search" />
                      </label>
                      <button
                        className={`fm-log-tool ${logFollow ? "is-active" : ""}`}
                        onClick={() => setLogFollow((current) => !current)}
                        title={logFollow ? "暂停跟随" : "继续跟随"}
                        aria-label={logFollow ? "暂停跟随" : "继续跟随"}
                      >
                        {logFollow ? <Pause className="i" /> : <Play className="i" />}
                      </button>
                      <button className="fm-log-tool" onClick={() => void clearLogs()} title="清空日志" aria-label="清空日志">
                        <Trash2 className="i" />
                      </button>
                      <button className="fm-log-tool" onClick={copyLogs} title="复制可见日志" aria-label="复制可见日志">
                        <Copy className="i" />
                      </button>
                    </div>
                    <div className="fm-console">
                      <div className="fm-console-bar">
                        <i />
                        <span>{activeService.name} · stdout / stderr</span>
                        <span className={logFollow ? "fm-console-live" : "fm-console-paused"}>{logFollow ? "● 实时跟随" : "Ⅱ 已暂停"}</span>
                      </div>
                      <div
                        ref={logBoxRef}
                        className="fm-console-lines"
                        onScroll={(event) => {
                          const box = event.currentTarget;
                          const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 12;
                          if (atBottom !== logFollow) setLogFollow(atBottom);
                        }}
                      >
                        {activeLogs.length ? (
                          activeLogs.map((entry, index) => (
                            <div className={`fm-log-line ${entry.level === "ERR" ? "is-err" : ""}`} key={`${entry.time}-${index}`}>
                              <span className="lt">{entry.time}</span>
                              <span className={`fm-log-level ${entry.level === "ERR" ? "err" : entry.level === "SYS" ? "sys" : "out"}`}>{entry.level}</span>
                              <span className="lx">{entry.text}</span>
                            </div>
                          ))
                        ) : (
                          <div className="fm-log-empty">
                            <Mascot size={58} mood="sleep" />
                            <b>这里暂时很安静</b>
                            <span>{logQuery || logLevel !== "all" ? "没有匹配的日志，试试换个关键词。" : "服务启动后，stdout / stderr 会出现在这里。"}</span>
                          </div>
                        )}
                      </div>
                      <div className="fm-log-footer">
                        <span>
                          {activeLogs.length} 行 · 游标 #{logCursorRef.current}
                        </span>
                        {!logFollow ? (
                          <button
                            className="fm-log-jump"
                            onClick={() => {
                              setLogFollow(true);
                              if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
                            }}
                          >
                            跳到底部 ↓
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {drawerTab === "config" ? (
                  <>
                    {activeService.status === "running" ? (
                      <div className="fm-config-warning">
                        <AlertTriangle className="i" />
                        <span>服务正在运行。修改配置后需要重启才会生效，界面会提示你是否立即重启。</span>
                      </div>
                    ) : null}
                    <div className="fm-kv">
                      <div className="fm-kv-row">
                        <span>运行器</span>
                        <b>{TYPE_META[activeService.serviceType].label}</b>
                      </div>
                      <div className="fm-kv-row">
                        <span>启动程序</span>
                        <b title={activeService.executable}>{activeService.executable}</b>
                      </div>
                      {activeService.scriptPath ? (
                        <div className="fm-kv-row">
                          <span>脚本路径</span>
                          <b title={activeService.scriptPath}>{activeService.scriptPath}</b>
                        </div>
                      ) : null}
                      <div className="fm-kv-row">
                        <span>启动参数</span>
                        <b>{activeService.args?.join(" ") || "—"}</b>
                      </div>
                      <div className="fm-kv-row">
                        <span>工作目录</span>
                        <b title={activeService.cwd}>{activeService.cwd || "未设置"}</b>
                      </div>
                      <div className="fm-kv-row">
                        <span>监控端口</span>
                        <b>{activeService.port ?? "未设置"}</b>
                      </div>
                      <div className="fm-kv-row">
                        <span>前端地址</span>
                        <b>{activeService.frontendUrl || "未设置"}</b>
                      </div>
                      <div className="fm-kv-row">
                        <span>控制台编码</span>
                        <b>
                          <select
                            className="fm-select"
                            value={activeService.encoding}
                            onChange={(event) => void changeEncoding(event.target.value)}
                            aria-label="控制台编码"
                            style={{ width: 112, height: 26, padding: "0 6px", fontSize: 11 }}
                          >
                            <option value="utf-8">UTF-8</option>
                            <option value="gbk">GBK</option>
                          </select>
                        </b>
                      </div>
                      <div className="fm-kv-row">
                        <span>自动重启</span>
                        <b className={activeService.autoRestart ? "ok" : "warn"}>{activeService.autoRestart ? "已开启" : "已关闭"}</b>
                      </div>
                    </div>
                    <div className="fm-detail-section">
                      <h4>
                        <Terminal className="i" />
                        环境变量
                      </h4>
                      <div className="fm-env-chips">
                        {Object.entries(activeService.env ?? {}).length ? (
                          Object.entries(activeService.env).map(([key, value]) => (
                            <span key={key}>
                              {key}={value}
                            </span>
                          ))
                        ) : (
                          <span>未设置自定义环境变量</span>
                        )}
                      </div>
                    </div>
                    <div className="fm-config-actions">
                      <button className="fm-btn fm-btn-primary" onClick={() => openEdit(activeService)}>
                        <Pencil className="i" />
                        编辑配置
                      </button>
                      <button className="fm-btn fm-btn-soft" onClick={() => void copyText(commandFor(activeService), "启动命令已复制")}>
                        <Copy className="i" />
                        复制启动命令
                      </button>
                    </div>
                  </>
                ) : null}

                {drawerTab === "diagnose" ? (
                  <>
                    <div className={`fm-diag-hero ${activeService.status === "error" ? "is-error" : ""}`}>
                      {diagnoseLoading ? (
                        <Loader2 className="i" />
                      ) : (
                        <Mascot
                          size={54}
                          mood={activeDiagnose ? (activeDiagnose.healthy ? "happy" : "worry") : activeService.status === "running" ? "happy" : activeService.status === "error" ? "worry" : "sleep"}
                        />
                      )}
                      <div>
                        <b>
                          {diagnoseLoading
                            ? "正在做一次健康检查…"
                            : activeDiagnose
                              ? activeDiagnose.healthy
                                ? "一切正常，可以放心"
                                : "发现一个需要处理的问题"
                              : activeService.status === "error"
                                ? "进程或端口异常"
                                : "还没有这次诊断的结果"}
                        </b>
                        <small>{activeDiagnose?.summary ?? "点击下方按钮，检查进程、端口与最近错误输出。"}</small>
                      </div>
                    </div>
                    <div className="fm-detail-section">
                      <h4>
                        <Shield className="i" />
                        检查项
                      </h4>
                      <div className="fm-health-list">
                        <div className={`fm-health-row ${activeService.status === "error" ? "is-warn" : ""}`}>
                          <span className="fm-health-icon">{activeService.status === "running" ? "✓" : activeService.status === "error" ? "!" : "·"}</span>
                          <span>进程存活</span>
                          <small>{activeService.status === "running" ? "正常" : activeService.status === "error" ? "失败" : "未运行"}</small>
                        </div>
                        <div className={`fm-health-row ${activeService.port && !activeService.portActive ? "is-warn" : ""}`}>
                          <span className="fm-health-icon">{activeService.port && !activeService.portActive ? "!" : "✓"}</span>
                          <span>端口监听</span>
                          <small>{!activeService.port ? "未配置" : activeService.portActive ? "监听中" : "无响应"}</small>
                        </div>
                        <div className="fm-health-row">
                          <span className="fm-health-icon">✓</span>
                          <span>配置读取</span>
                          <small>通过</small>
                        </div>
                        <div className="fm-health-row">
                          <span className="fm-health-icon">✓</span>
                          <span>进程树托管</span>
                          <small>{activeService.status === "running" ? "JobObject 已绑定" : "—"}</small>
                        </div>
                      </div>
                    </div>
                    {activeDiagnose?.recentLogs?.length ? (
                      <div className="fm-detail-section">
                        <h4>
                          <Terminal className="i" />
                          最近错误输出
                        </h4>
                        <div className="fm-diag-code">
                          {activeDiagnose.recentLogs
                            .slice(-4)
                            .map((entry) => `[${entry.time}] ${entry.level} ${entry.text}`)
                            .join("\n")}
                        </div>
                      </div>
                    ) : null}
                    <div className="fm-diag-actions">
                      <button className="fm-btn fm-btn-primary" onClick={() => void runDiagnose(activeService.id)} disabled={diagnoseLoading}>
                        {diagnoseLoading ? <Loader2 className="i" /> : <Activity className="i" />}
                        重新诊断
                      </button>
                      <button className="fm-btn fm-btn-soft" onClick={() => void runServiceAction(activeService.id, "restart")}>
                        <RefreshCw className="i" />
                        重启并再测
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />
      {menu ? <MenuPanel menu={menu} onClose={() => setMenu(null)} /> : null}

      {confirmState ? (
        <ModalFrame onClose={() => setConfirmState(null)} className="is-small" label={confirmState.title}>
          <div className="fm-modal-head">
            <span className="fm-modal-mascot">
              <Mascot size={40} mood="worry" />
            </span>
            <div className="fm-modal-head-copy">
              <h2>请确认这一步</h2>
              <p>这个动作会立即生效，影响范围如下。</p>
            </div>
            <button className="fm-modal-close" onClick={() => setConfirmState(null)} aria-label="关闭">
              <X className="i" />
            </button>
          </div>
          <div className="fm-modal-body">
            <div className="fm-confirm-body">
              <Mascot size={92} mood="worry" />
              <h3>{confirmState.title}</h3>
              <p>{confirmState.body}</p>
              {confirmState.list?.length ? (
                <div className="fm-confirm-list">
                  {confirmState.list.map((item) => (
                    <div key={item.name}>
                      <i style={{ background: "var(--fm-mint)" }} />
                      <span>{item.name}</span>
                      <small>{item.note ?? ""}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              {confirmState.note ? (
                <div className="fm-danger-note">
                  <AlertTriangle className="i" />
                  <span>{confirmState.note}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="fm-modal-foot">
            <button className="fm-btn fm-btn-soft" onClick={() => setConfirmState(null)}>
              取消
            </button>
            <button
              className={`fm-btn ${confirmState.danger ? "fm-btn-danger" : "fm-btn-primary"}`}
              onClick={() => {
                const action = confirmState.onConfirm;
                setConfirmState(null);
                void action();
              }}
            >
              {confirmState.confirmLabel}
            </button>
          </div>
        </ModalFrame>
      ) : null}

      {!confirmState && modal === "service" ? (
        <ModalFrame onClose={() => setModal(null)} className="is-wide" label={editingId ? "编辑服务" : "添加服务"}>
          <form
            className="fm-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveForm(true);
            }}
          >
            <div className="fm-modal-head">
              <span className="fm-modal-mascot">
                <Mascot size={40} mood={editingId ? "idle" : "happy"} />
              </span>
              <div className="fm-modal-head-copy">
                <h2>{editingId ? `调整「${form.name}」` : "把新伙伴请进小屋"}</h2>
                <p>{editingId ? "修改配置。正在运行的服务需要重启后才会生效。" : "只需要填最少的信息；高级项默认收起来，之后再改也来得及。"}</p>
              </div>
              <button type="button" className="fm-modal-close" onClick={() => setModal(null)} aria-label="关闭">
                <X className="i" />
              </button>
            </div>
            <div className="fm-modal-body">
              {formError ? (
                <div className="fm-danger-note" style={{ marginBottom: 12, width: "100%" }}>
                  <AlertTriangle className="i" />
                  <span>{formError}</span>
                </div>
              ) : null}
              <div className="fm-type-grid" role="radiogroup" aria-label="运行器类型">
                {TYPE_ORDER.map((serviceType) => {
                  const meta = TYPE_META[serviceType];
                  return (
                    <button
                      key={serviceType}
                      type="button"
                      className={`fm-type-choice ${form.serviceType === serviceType ? "is-active" : ""}`}
                      onClick={() => applyType(serviceType)}
                      role="radio"
                      aria-checked={form.serviceType === serviceType}
                    >
                      <span className={`fm-type-icon ${meta.cls}`}>{meta.mono}</span>
                      <b>{meta.label}</b>
                      <small>
                        {serviceType === "python"
                          ? ".py / .venv"
                          : serviceType === "node"
                            ? ".js / .mjs"
                            : serviceType === "nginx"
                              ? "网关"
                              : serviceType === "script"
                                ? ".bat / .ps1"
                                : ".exe"}
                      </small>
                    </button>
                  );
                })}
              </div>

              <div className="fm-form-grid">
                <div className="fm-field">
                  <label htmlFor="svcName">
                    显示名称 <span className="req">*</span>
                  </label>
                  <input
                    className="fm-input"
                    id="svcName"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="例如：DeepSeek RAG 助手"
                    autoComplete="off"
                  />
                </div>
                <div className="fm-field">
                  <label htmlFor="svcGroup">所属分组</label>
                  <input
                    className="fm-input"
                    id="svcGroup"
                    value={form.group}
                    onChange={(event) => setForm((current) => ({ ...current, group: event.target.value }))}
                    placeholder="例如：AI Agent 项目"
                    autoComplete="off"
                  />
                </div>
                <div className="fm-field span-2">
                  <label htmlFor="svcExecutable">
                    启动程序 <span className="req">*</span>
                  </label>
                  <div className="fm-input-row">
                    <input
                      className="fm-input"
                      id="svcExecutable"
                      value={form.executable}
                      onChange={(event) => setForm((current) => ({ ...current, executable: event.target.value }))}
                      placeholder="python / node / D:/Tools/app.exe"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="fm-btn fm-btn-soft"
                      onClick={() => setForm((current) => ({ ...current, executable: TYPE_DEFAULTS[current.serviceType].executable }))}
                    >
                      <Folder className="i" />
                      浏览
                    </button>
                  </div>
                  <span className="fm-field-hint">可以直接写 python / node，也可以填绝对路径。</span>
                </div>
                {["python", "node", "script"].includes(form.serviceType) ? (
                  <div className="fm-field span-2">
                    <label htmlFor="svcScript">
                      脚本文件路径 <span className="req">*</span>
                    </label>
                    <div className="fm-input-row">
                      <input
                        className="fm-input"
                        id="svcScript"
                        value={form.scriptPath ?? ""}
                        onChange={(event) => setForm((current) => ({ ...current, scriptPath: event.target.value }))}
                        placeholder="D:/Develop/my-service/server.py"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="fm-btn fm-btn-soft"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            scriptPath: current.serviceType === "python" ? "D:/Develop/my-service/server.py" : current.serviceType === "node" ? "D:/Develop/my-service/index.mjs" : "D:/Develop/Tools/clean.ps1",
                          }))
                        }
                      >
                        <Folder className="i" />
                        浏览
                      </button>
                    </div>
                    <span className="fm-field-hint">相对路径会按工作目录解析；探测到项目里的 .venv 时会优先使用它。</span>
                  </div>
                ) : null}
                <div className="fm-field">
                  <label htmlFor="svcPort">
                    监控端口 <small>选填</small>
                  </label>
                  <input
                    className="fm-input"
                    id="svcPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, port: event.target.value ? Number(event.target.value) : null }))}
                    placeholder="如 8787"
                  />
                </div>
                <div className="fm-field">
                  <label htmlFor="svcFrontend">
                    Web 前端地址 <small>选填</small>
                  </label>
                  <div className="fm-input-row">
                    <input
                      className="fm-input"
                      id="svcFrontend"
                      value={form.frontendUrl ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, frontendUrl: event.target.value }))}
                      placeholder="http://127.0.0.1:8787"
                    />
                    <button
                      type="button"
                      className="fm-btn fm-btn-soft"
                      onClick={() => setForm((current) => ({ ...current, frontendUrl: current.port ? `http://127.0.0.1:${current.port}` : "" }))}
                    >
                      用端口
                    </button>
                  </div>
                </div>
                <div className="fm-field span-2">
                  <label htmlFor="svcArgs">
                    启动参数 <small>空格分隔</small>
                  </label>
                  <input
                    className="fm-input"
                    id="svcArgs"
                    value={formArgs}
                    onChange={(event) => setFormArgs(event.target.value)}
                    placeholder="例如：--port 8787 --env dev"
                  />
                </div>
              </div>

              <details className="fm-advanced">
                <summary>
                  <ChevronDown className="i" />
                  高级设置 · 工作目录 / 编码 / 自动重启
                </summary>
                <div className="fm-advanced-body">
                  <div className="fm-form-grid">
                    <div className="fm-field span-2">
                      <label htmlFor="svcCwd">工作目录</label>
                      <input
                        className="fm-input"
                        id="svcCwd"
                        value={form.cwd}
                        onChange={(event) => setForm((current) => ({ ...current, cwd: event.target.value }))}
                        placeholder="留空则取程序或脚本所在目录"
                      />
                    </div>
                    <div className="fm-field">
                      <label htmlFor="svcEncoding">控制台编码</label>
                      <select
                        className="fm-select"
                        id="svcEncoding"
                        value={form.encoding}
                        onChange={(event) => setForm((current) => ({ ...current, encoding: event.target.value }))}
                      >
                        <option value="utf-8">UTF-8（推荐）</option>
                        <option value="gbk">GBK / CP936（中文批处理）</option>
                      </select>
                    </div>
                    <div className="fm-field">
                      <label>进程策略</label>
                      <label className="fm-checkline">
                        <input
                          type="checkbox"
                          checked={form.autoRestart}
                          onChange={(event) => setForm((current) => ({ ...current, autoRestart: event.target.checked }))}
                        />
                        异常退出时自动重启
                      </label>
                      <span className="fm-field-hint">环境变量沿用现有配置，不在这个表单里编辑。</span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <div className="fm-modal-foot">
              <span className="fm-modal-foot-note">{editingId ? "保存后可在详情里重启生效" : "保存后随时可以在详情里启动"}</span>
              <button type="button" className="fm-btn fm-btn-soft" onClick={() => setModal(null)}>
                取消
              </button>
              {editingId ? (
                <button type="button" className="fm-btn fm-btn-primary" disabled={saving} onClick={() => void saveForm(false)}>
                  {saving ? <Loader2 className="i" /> : null}
                  保存配置
                </button>
              ) : (
                <>
                  <button type="button" className="fm-btn fm-btn-soft" disabled={saving} onClick={() => void saveForm(false)}>
                    仅保存
                  </button>
                  <button type="submit" className="fm-btn fm-btn-primary" disabled={saving}>
                    {saving ? <Loader2 className="i" /> : null}
                    保存并启动
                  </button>
                </>
              )}
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {!confirmState && modal === "detect" ? (
        <ModalFrame onClose={() => setModal(null)} label="自动识别服务">
          <form
            className="fm-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              void detectService();
            }}
          >
            <div className="fm-modal-head">
              <span className="fm-modal-mascot">
                <Mascot size={40} mood="idle" />
              </span>
              <div className="fm-modal-head-copy">
                <h2>把文件夹交给小闪</h2>
                <p>输入项目目录或脚本路径，自动识别 Python / Node / Nginx / EXE / BAT，并生成可确认的启动配置。</p>
              </div>
              <button type="button" className="fm-modal-close" onClick={() => setModal(null)} aria-label="关闭">
                <X className="i" />
              </button>
            </div>
            <div className="fm-modal-body">
              {detectError ? (
                <div className="fm-danger-note" style={{ marginBottom: 12 }}>
                  <AlertTriangle className="i" />
                  <span>{detectError}</span>
                </div>
              ) : null}
              <div className="fm-field">
                <label htmlFor="detectPath">
                  项目目录或脚本路径 <span className="req">*</span>
                </label>
                <div className="fm-input-row">
                  <input
                    className="fm-input"
                    id="detectPath"
                    value={detectPath}
                    onChange={(event) => setDetectPath(event.target.value)}
                    placeholder="D:/Develop/Deepseek/my-service"
                    autoComplete="off"
                  />
                </div>
                <span className="fm-field-hint">会优先读取 .flashservice.json；没有的话按入口文件与 .venv 推断。</span>
              </div>
              <div className="fm-field">
                <label htmlFor="detectGroup">放进哪个分组</label>
                <input className="fm-input" id="detectGroup" value={detectGroup} onChange={(event) => setDetectGroup(event.target.value)} placeholder="AI Agent 项目" />
              </div>
              {detectBusy ? (
                <div className="fm-detect-steps">
                  <div className="fm-detect-step is-done">
                    <span className="fm-detect-dot">✓</span>
                    <span>读取目录与清单文件…</span>
                  </div>
                  <div className="fm-detect-step is-active">
                    <span className="fm-detect-dot">2</span>
                    <span>识别运行器与入口脚本…</span>
                  </div>
                  <div className="fm-detect-step">
                    <span className="fm-detect-dot">3</span>
                    <span>生成启动命令与端口建议…</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="fm-modal-foot">
              <span className="fm-modal-foot-note">识别结果会先确认；接入后会立即启动，可随时停止</span>
              <button type="button" className="fm-btn fm-btn-soft" onClick={() => setModal(null)}>
                取消
              </button>
              <button type="submit" className="fm-btn fm-btn-primary" disabled={detectBusy}>
                {detectBusy ? <Loader2 className="i" /> : <Folder className="i" />}
                {detectBusy ? "正在识别…" : "开始识别并接入"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {!confirmState && modal === "settings" ? (
        <ModalFrame onClose={() => setModal(null)} label="偏好设置">
          <div className="fm-modal-head">
            <span className="fm-modal-mascot">
              <Mascot size={40} mood="idle" />
            </span>
            <div className="fm-modal-head-copy">
              <h2>小屋偏好</h2>
              <p>让界面更像你习惯的样子。所有设置只影响本机显示。</p>
            </div>
            <button className="fm-modal-close" onClick={() => setModal(null)} aria-label="关闭">
              <X className="i" />
            </button>
          </div>
          <div className="fm-modal-body">
            <div className="fm-settings-section">
              <h3>外观</h3>
              <div className="fm-setting-row">
                <div className="fm-setting-copy">
                  <b>主题</b>
                  <small>樱昼是奶油底色，樱夜适合长时间盯日志。</small>
                </div>
                <div className="fm-segmented">
                  <button className={theme === "day" ? "is-active" : ""} onClick={() => setTheme("day")}>
                    樱昼
                  </button>
                  <button className={theme === "night" ? "is-active" : ""} onClick={() => setTheme("night")}>
                    樱夜
                  </button>
                </div>
              </div>
              <div className="fm-setting-row">
                <div className="fm-setting-copy">
                  <b>减少动效</b>
                  <small>关闭浮动与闪烁；系统开启“减少动态效果”时会自动生效。</small>
                </div>
                <label className="fm-switch">
                  <input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} />
                  <span />
                </label>
              </div>
            </div>
            <div className="fm-settings-section">
              <h3>说明</h3>
              <div className="fm-setting-row">
                <div className="fm-setting-copy">
                  <b>关于这个版本</b>
                  <small>FlashManager v0.1.0 · Tauri v2 + React 18 · Sugar Star UI</small>
                </div>
              </div>
            </div>
          </div>
          <div className="fm-modal-foot">
            <span className="fm-modal-foot-note">主题与动效偏好会保存在本机 localStorage</span>
            <button className="fm-btn fm-btn-primary" onClick={() => setModal(null)}>
              完成
            </button>
          </div>
        </ModalFrame>
      ) : null}

      {!confirmState && modal === "shortcuts" ? (
        <ModalFrame onClose={() => setModal(null)} className="is-small" label="快捷键">
          <div className="fm-modal-head">
            <span className="fm-modal-mascot">
              <Mascot size={40} mood="happy" />
            </span>
            <div className="fm-modal-head-copy">
              <h2>快捷键</h2>
              <p>键盘是第二条主路径。焦点在哪，操作就发生在哪。</p>
            </div>
            <button className="fm-modal-close" onClick={() => setModal(null)} aria-label="关闭">
              <X className="i" />
            </button>
          </div>
          <div className="fm-modal-body">
            <table className="fm-shortcut-table">
              <tbody>
                {[
                  ["打开 / 关闭命令面板", ["Ctrl", "K"]],
                  ["聚焦服务搜索", ["/"]],
                  ["添加服务", ["N"]],
                  ["打开选中服务的日志", ["L"]],
                  ["关闭抽屉 / 浮层", ["Esc"]],
                  ["显示快捷键表", ["?"]],
                ].map(([label, keys]) => (
                  <tr key={label as string}>
                    <td>{label}</td>
                    <td>
                      {(keys as string[]).map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fm-field-hint" style={{ marginTop: 10 }}>
              输入框内不会触发单字母快捷键，避免误操作。所有浮层都可以用 Esc 关闭。
            </p>
          </div>
          <div className="fm-modal-foot">
            <button className="fm-btn fm-btn-primary" onClick={() => setModal(null)}>
              知道了
            </button>
          </div>
        </ModalFrame>
      ) : null}

      {paletteOpen ? (
        <div className="fm-palette-root is-open">
          <div className="fm-palette-backdrop" onClick={() => setPaletteOpen(false)} />
          <div className="fm-palette" role="dialog" aria-modal="true" aria-label="命令面板">
            <div className="fm-palette-search">
              <Search className="i" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(event) => {
                  const total = paletteServices.length + paletteCommands.length;
                  if (!total) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPaletteIndex((current) => (current + 1) % total);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPaletteIndex((current) => (current - 1 + total) % total);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (paletteIndex < paletteServices.length) executePaletteService(paletteServices[paletteIndex]);
                    else executePaletteCommand(paletteCommands[paletteIndex - paletteServices.length].run);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setPaletteOpen(false);
                  }
                }}
                placeholder="搜索服务，或输入一个操作…"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="fm-palette-list">
              {!paletteServices.length && !paletteCommands.length ? (
                <div className="fm-palette-empty">
                  <Mascot size={70} mood="idle" />
                  <b>没有找到「{paletteQuery}」</b>
                  <span>试试服务名、端口，或“添加 / 停止 / 主题”。</span>
                </div>
              ) : null}
              {paletteServices.length ? (
                <>
                  <div className="fm-palette-group">服务 · {paletteServices.length}</div>
                  {paletteServices.map((service, index) => (
                    <button
                      key={service.id}
                      className={`fm-palette-item ${paletteIndex === index ? "is-focus" : ""}`}
                      onClick={() => executePaletteService(service)}
                      onMouseEnter={() => setPaletteIndex(index)}
                    >
                      {typeIcon(service)}
                      <span className="fm-palette-item-copy">
                        <b>{service.name}</b>
                        <small>
                          {service.group} · {service.port ? `:${service.port}` : "无端口"}
                        </small>
                      </span>
                      {statusPill(service)}
                      <span className="fm-palette-enter">↵</span>
                    </button>
                  ))}
                </>
              ) : null}
              {paletteCommands.length ? (
                <>
                  <div className="fm-palette-group">操作 · {paletteCommands.length}</div>
                  {paletteCommands.map((command, index) => {
                    const globalIndex = paletteServices.length + index;
                    return (
                      <button
                        key={command.label}
                        className={`fm-palette-item ${paletteIndex === globalIndex ? "is-focus" : ""}`}
                        onClick={() => executePaletteCommand(command.run)}
                        onMouseEnter={() => setPaletteIndex(globalIndex)}
                      >
                        <span className="fm-palette-icon">{command.icon}</span>
                        <span className="fm-palette-item-copy">
                          <b>{command.label}</b>
                          <small>{command.hint}</small>
                        </span>
                        <span className="fm-palette-enter">↵</span>
                      </button>
                    );
                  })}
                </>
              ) : null}
            </div>
            <div className="fm-palette-foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>选择
              </span>
              <span>
                <kbd>↵</kbd>执行
              </span>
              <span>
                <kbd>Esc</kbd>关闭
              </span>
              <span className="fm-palette-brand">
                <Command className="i" /> Ctrl K
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
