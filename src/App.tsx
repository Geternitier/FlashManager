import { useDialogFocus } from "./useDialogFocus";
import { parseServiceArgs } from "./serviceArgs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Copy,
  ExternalLink,
  Folder,
  Keyboard,
  LayoutGrid,
  List,
  Moon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  Sun,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  previewDetectedService,
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
import ProxyPage from "./ProxyPage";
import { AppTopbar, ServiceSidebar } from "./components/AppChrome";
import { ConfirmDialog, SettingsDialog, ShortcutsDialog } from "./components/AppDialogs";
import type { ConfirmState, Theme } from "./components/AppDialogs";
import { CommandPalette } from "./components/CommandPalette";
import type { MascotMood } from "./components/Mascot";
import { MenuPanel, ToastStack } from "./components/overlays";
import type { MenuEntry, MenuState, ToastItem } from "./components/overlays";
import { DetectServiceDialog, ServiceFormDialog } from "./features/services/ServiceDialogs";
import { ServiceDrawer } from "./features/services/ServiceDrawer";
import { ServiceGrid } from "./features/services/ServiceGrid";
import { ServiceSummary } from "./features/services/ServiceSummary";
import { TYPE_DEFAULTS, commandFor } from "./features/services/servicePresentation";
import type { DrawerTab, FilterKey } from "./features/services/servicePresentation";
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

type ModalKind = "service" | "detect" | "settings" | "shortcuts" | null;

const SORT_OPTIONS = [
  { key: "recent", label: "按最近启动" },
  { key: "name", label: "按名称" },
  { key: "cpu", label: "按占用" },
] as const;

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

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
  if (hour < 5) return { main: "夜深了", side: "夜深啦", line: "本鱼把灯调暗了一点。" };
  if (hour < 11) return { main: "早上好", side: "早上好呀", line: "今天也从一杯热茶开始吧。" };
  if (hour < 13) return { main: "中午好", side: "中午好呀", line: "记得吃饭，服务交给本鱼。" };
  if (hour < 18) return { main: "下午好", side: "下午好呀", line: "下午也一起加油吧。" };
  return { main: "晚上好", side: "晚上好呀", line: "今天也辛苦啦～" };
}

export default function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const logCursorRef = useRef(0);
  const snapshotVersionRef = useRef(0);
  const snapshotInFlightRef = useRef(false);
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
  const paletteDialogRef = useDialogFocus(paletteOpen);

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
    ++snapshotVersionRef.current;
    setServices(snapshot.services);
    setMetrics(snapshot.metrics);
    setLastUpdated(Date.now());
    setConnected(true);
    setLoading(false);
  };

  const refresh = async () => {
    const version = ++snapshotVersionRef.current;
    try {
      const snapshot = await fetchDashboardSnapshot();
      if (version !== snapshotVersionRef.current) return;
      applySnapshot(snapshot);
      setSelectedId((current) => (current && snapshot.services.some((service) => service.id === current) ? current : snapshot.services[0]?.id ?? ""));
    } catch {
      if (version !== snapshotVersionRef.current) return;
      setConnected(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let retryAfter = 0;
    let failures = 0;
    const pull = async () => {
      if (snapshotInFlightRef.current || Date.now() < retryAfter) return;
      snapshotInFlightRef.current = true;
      const version = ++snapshotVersionRef.current;
      try {
        const snapshot = await fetchDashboardSnapshot();
        if (cancelled || version !== snapshotVersionRef.current) return;
        failures = 0;
        applySnapshot(snapshot);
        setSelectedId((current) => (current && snapshot.services.some((service) => service.id === current) ? current : snapshot.services[0]?.id ?? ""));
      } catch {
        if (!cancelled && version === snapshotVersionRef.current) {
          retryAfter = Date.now() + Math.min(30000, 1000 * 2 ** ++failures);
          setConnected(false);
          setLoading(false);
        }
      } finally { snapshotInFlightRef.current = false; }
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

      if (modal || confirmState || document.querySelector('[role="dialog"][aria-modal="true"]:not(.fm-palette)')) {
        if (event.key === "Escape") {
          event.preventDefault();
          if (confirmState) setConfirmState(null);
          else if (modal) setModal(null);
        }
        return;
      }
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

      if (typing || paletteOpen) return;
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
        ? "小屋还空着。把第一个服务请进来，或者把文件夹交给本鱼。"
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

  const showBatchResult = (report: import("./types").BatchActionReport, action: string) => {
    const failures = report.results.filter((result) => result.error);
    pushToast({
      kind: failures.length ? "error" : "success",
      title: failures.length ? `批量${action}部分失败` : `批量${action}完成`,
      message: `${report.results.length - failures.length} 项成功，${failures.length} 项失败。` + failures.map((result) => `${services.find((s) => s.id === result.id)?.name ?? result.id}：${result.error}`).join("；"),
      action: failures.length ? { label: "重试失败项", onClick: () => { for (const result of failures) void runServiceAction(result.id, action === "启动" ? "start" : "stop"); } } : undefined,
    });
  };

  const startAll = async () => {
    try {
      const snapshot = await batchServiceAction(scopeForBatch, "start");
      applySnapshot(snapshot);
      showBatchResult(snapshot, "启动");
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
          showBatchResult(snapshot, "停止");
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
    setFormArgs(JSON.stringify(serviceType === "nginx" ? ["-c", "conf/nginx.conf"] : [], null, 2));
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
    setFormArgs(JSON.stringify(service.args ?? [], null, 2));
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
    if (saving) return;
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

    if (form.port != null && (!Number.isInteger(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535)) {
      setFormError("监控端口需要是 1 到 65535 之间的整数。");
      return;
    }
    let args: string[];
    try { args = parseServiceArgs(formArgs); }
    catch (error) { setFormError(errorText(error)); return; }
    const config: ServiceConfig = {
      ...form,
      name,
      group: form.group.trim() || "默认分组",
      executable,
      scriptPath: scriptNeeded ? scriptPath : null,
      args,
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
      setDetectError("输入项目文件夹或脚本路径后，本鱼才能开始找。");
      return;
    }
    setDetectBusy(true);
    setDetectError("");
    try {
      const config = await previewDetectedService(detectPath.trim(), detectGroup.trim() || undefined);
      const existing = services.find((service) => service.id === config.id);
      setEditingId(existing?.id ?? null);
      setForm({ ...config, autoStartOnRegister: false });
      setFormArgs(JSON.stringify(config.args ?? [], null, 2));
      setFormError("");
      setModal("service");
      pushToast({ kind: "info", title: "识别完成，请确认配置", message: existing ? "已识别到现有服务，确认后更新配置。" : "尚未保存或启动服务。" });
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

  const commandItems = [
    { label: "添加服务", hint: "手动填写配置", icon: <Plus className="i" />, run: openAdd },
    { label: "从文件夹自动识别", hint: "交给本鱼", icon: <Folder className="i" />, run: () => setModal("detect") },
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
      <AppTopbar
        loading={loading}
        connected={connected}
        theme={theme}
        errorCount={errorCount}
        resetFilters={resetFilters}
        openPalette={() => setPaletteOpen(true)}
        setTheme={setTheme}
        openBell={openBell}
        openUserMenu={openUserMenu}
      />

      <div className="fm-body">
        <ServiceSidebar
          greet={greet}
          heroMood={heroMood}
          counts={counts}
          groups={groups}
          groupStats={groupStats}
          typeCounts={typeCounts}
          page={page}
          filter={filter}
          group={group}
          type={type}
          setPage={setPage}
          setFilter={setFilter}
          setGroup={setGroup}
          setType={setType}
          resetFilters={resetFilters}
          openProxies={openProxies}
          openSettings={() => setModal("settings")}
          openShortcuts={() => setModal("shortcuts")}
        />

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
                <ServiceSummary
                  now={now}
                  greeting={greet.main}
                  heroSub={heroSub}
                  heroMood={heroMood}
                  loading={loading}
                  connected={connected}
                  counts={counts}
                  metrics={metrics}
                  refresh={refresh}
                  openBatchMenu={openBatchMenu}
                  openAdd={openAdd}
                  showErrors={() => {
                    setFilter("error");
                    setGroup("全部服务");
                    setType("all");
                  }}
                  setFilter={setFilter}
                />

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

                <ServiceGrid
                  loading={loading}
                  totalServices={services.length}
                  visibleServices={visibleServices}
                  view={view}
                  selectedId={drawerOpen ? selectedId : null}
                  busy={busy}
                  openAdd={openAdd}
                  openDetect={() => setModal("detect")}
                  openPalette={() => setPaletteOpen(true)}
                  resetFilters={resetFilters}
                  openDrawer={openDrawer}
                  openCardMenu={openCardMenu}
                  runDiagnose={runDiagnose}
                  openFrontend={openFrontend}
                  toggleService={toggleService}
                />

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

        <ServiceDrawer
          drawerOpen={drawerOpen}
          drawerTab={drawerTab}
          activeService={activeService}
          services={services}
          busyAction={activeService ? busy[activeService.id] : undefined}
          activeDiagnose={activeDiagnose}
          diagnoseLoading={diagnoseLoading}
          activeLogs={activeLogs}
          logLevel={logLevel}
          logQuery={logQuery}
          logFollow={logFollow}
          logCursor={logCursorRef.current}
          logBoxRef={logBoxRef}
          onClose={() => setDrawerOpen(false)}
          selectTab={selectTab}
          setLogLevel={setLogLevel}
          setLogQuery={setLogQuery}
          setLogFollow={setLogFollow}
          copyLogs={copyLogs}
          clearLogs={clearLogs}
          changeEncoding={changeEncoding}
          copyText={copyText}
          toggleService={toggleService}
          runServiceAction={runServiceAction}
          runDiagnose={runDiagnose}
          openFrontend={openFrontend}
          openEdit={openEdit}
          openCardMenu={openCardMenu}
          openProxies={openProxies}
        />
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />
      {menu ? <MenuPanel menu={menu} onClose={() => setMenu(null)} /> : null}

      {confirmState ? (
        <ConfirmDialog
          confirmState={confirmState}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      {!confirmState && modal === "service" ? (
        <ServiceFormDialog
          editingId={editingId}
          form={form}
          formArgs={formArgs}
          formError={formError}
          saving={saving}
          setForm={setForm}
          setFormArgs={setFormArgs}
          applyType={applyType}
          saveForm={saveForm}
          onClose={() => setModal(null)}
        />
      ) : null}

      {!confirmState && modal === "detect" ? (
        <DetectServiceDialog
          detectPath={detectPath}
          detectGroup={detectGroup}
          detectBusy={detectBusy}
          detectError={detectError}
          setDetectPath={setDetectPath}
          setDetectGroup={setDetectGroup}
          detectService={detectService}
          onClose={() => setModal(null)}
        />
      ) : null}

      {!confirmState && modal === "settings" ? (
        <SettingsDialog
          theme={theme}
          setTheme={setTheme}
          reduceMotion={reduceMotion}
          setReduceMotion={setReduceMotion}
          onClose={() => setModal(null)}
        />
      ) : null}

      {!confirmState && modal === "shortcuts" ? (
        <ShortcutsDialog onClose={() => setModal(null)} />
      ) : null}

      {paletteOpen ? (
        <CommandPalette
          paletteQuery={paletteQuery}
          paletteIndex={paletteIndex}
          paletteServices={paletteServices}
          paletteCommands={paletteCommands}
          paletteDialogRef={paletteDialogRef}
          setPaletteQuery={setPaletteQuery}
          setPaletteIndex={setPaletteIndex}
          executePaletteService={executePaletteService}
          executePaletteCommand={executePaletteCommand}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
    </div>
  );
}
