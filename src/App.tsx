import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  DiagnoseReport,
  LogEntry,
  PlatformMetrics,
  ServiceConfig,
  ServiceType,
  ServiceView,
} from "./types";

const TYPE_META: Record<
  ServiceType,
  { label: string; iconBg: string; dotColor: string; title: string }
> = {
  nginx: {
    label: "NGINX",
    iconBg: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300",
    dotColor: "bg-emerald-400",
    title: "Nginx / 网关",
  },
  node: {
    label: "NODE",
    iconBg: "from-lime-500/20 to-green-500/10 border-lime-500/30 text-lime-300",
    dotColor: "bg-lime-400",
    title: "Node.js 脚本",
  },
  python: {
    label: "PYTHON",
    iconBg: "from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-300",
    dotColor: "bg-amber-400",
    title: "Python 脚本",
  },
  exe: {
    label: "EXE",
    iconBg: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300",
    dotColor: "bg-purple-400",
    title: "通用 EXE 程序",
  },
  script: {
    label: "SCRIPT",
    iconBg: "from-cyan-500/20 to-sky-500/10 border-cyan-500/30 text-cyan-300",
    dotColor: "bg-cyan-400",
    title: "BAT / PowerShell",
  },
};

function normalizeFrontendUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

function formatUptime(secs: number): string {
  if (!secs || secs <= 0) return "-";
  const h = Math.floor(secs / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}

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

export default function App() {
  const [services, setServices] = useState<ServiceView[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics>({
    selfPid: 0,
    selfMemoryMb: 8.2,
    totalManagedCpu: 0,
    totalManagedMemoryMb: 0,
    runningCount: 0,
    totalCount: 0,
    activePorts: [],
    agentApiPort: 19527,
    webviewHibernationEnabled: true,
  });

  const [selectedGroup, setSelectedGroup] = useState<string>("全部服务");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [logFilter, setLogFilter] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [staleConfigIds, setStaleConfigIds] = useState<string[]>([]);

  // Modals state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [formState, setFormState] = useState<ServiceConfig>(EMPTY_FORM);
  const [argsInput, setArgsInput] = useState<string>("");
  const [startImmediately, setStartImmediately] = useState<boolean>(false);

  const [isAgentModalOpen, setIsAgentModalOpen] = useState<boolean>(false);
  const [detectPath, setDetectPath] = useState<string>("D:/Develop/Deepseek/FlashManager/demo-services");
  const [detectGroup, setDetectGroup] = useState<string>("AI Agent 项目");
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseReport | null>(null);
  const [trayBannerVisible, setTrayBannerVisible] = useState<boolean>(false);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const logCursorRef = useRef(0);
  const logEpochRef = useRef(0);
  const logPullingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const refreshData = async () => {
    try {
      const snap = await fetchDashboardSnapshot();
      setMetrics(snap.metrics);
      setServices(snap.services);
      setSelectedServiceId((prev) => {
        if (prev && snap.services.some((s) => s.id === prev)) return prev;
        return snap.services[0]?.id || "";
      });
    } catch {
      // Backend might still be warming up
    }
  };

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    logEpochRef.current += 1;
    logCursorRef.current = 0;
    setConsoleLogs([]);
    if (!selectedServiceId) return;
    const epoch = logEpochRef.current;
    let cancelled = false;
    const pull = async () => {
      if (logPullingRef.current) return;
      logPullingRef.current = true;
      const myEpoch = logEpochRef.current;
      const after = logCursorRef.current;
      try {
        const page = await fetchServiceLogs(selectedServiceId, after);
        if (cancelled || myEpoch !== logEpochRef.current) return;
        logCursorRef.current = page.cursor;
        if (page.entries.length > 0) {
          setConsoleLogs((prev) => {
            const merged = [...prev, ...page.entries];
            return merged.length > 2000 ? merged.slice(merged.length - 2000) : merged;
          });
        }
      } catch {
        // The log endpoint can lag behind the first snapshot.
      } finally {
        if (myEpoch === logEpochRef.current) {
          logPullingRef.current = false;
        }
      }
    };
    void pull();
    const timer = setInterval(() => void pull(), 1000);
    return () => {
      cancelled = true;
      logPullingRef.current = false;
      clearInterval(timer);
      void epoch;
    };
  }, [selectedServiceId]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.group) set.add(s.group);
    });
    return ["全部服务", ...Array.from(set)];
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return services.filter((s) => {
      const matchGroup = selectedGroup === "全部服务" || s.group === selectedGroup;
      const matchType = selectedType === "all" || s.serviceType === selectedType;
      const matchQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.executable.toLowerCase().includes(q) ||
        (s.scriptPath || "").toLowerCase().includes(q) ||
        String(s.port || "").includes(q) ||
        String(s.pid || "").includes(q);
      return matchGroup && matchType && matchQuery;
    });
  }, [services, selectedGroup, selectedType, searchQuery]);

  const activeService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || services[0] || null,
    [services, selectedServiceId]
  );

  const filteredLogs = useMemo(() => {
    const q = logFilter.toLowerCase().trim();
    if (!q) return consoleLogs;
    return consoleLogs.filter((l) => l.text.toLowerCase().includes(q));
  }, [consoleLogs, logFilter]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, activeService?.id, autoScroll]);

  const handleToggleService = async (svc: ServiceView) => {
    try {
      if (svc.status === "running") {
        await stopService(svc.id);
        showToast(`已停止服务: ${svc.name}`);
      } else {
        await startService(svc.id);
        setStaleConfigIds((prev) => prev.filter((id) => id !== svc.id));
        showToast(`已启动服务: ${svc.name}`);
      }
      await refreshData();
    } catch (e: any) {
      showToast(`操作失败: ${e?.message || String(e)}`);
    }
  };

  const handleRestartService = async (svc: ServiceView) => {
    try {
      await restartService(svc.id);
      setStaleConfigIds((prev) => prev.filter((id) => id !== svc.id));
      showToast(`已重启服务: ${svc.name}`);
      await refreshData();
    } catch (e: any) {
      showToast(`重启失败: ${e?.message || String(e)}`);
    }
  };

  const handleBatch = async (group: string | null, action: "start" | "stop") => {
    try {
      const snap = await batchServiceAction(group, action);
      setMetrics(snap.metrics);
      setServices(snap.services);
      showToast(
        `${action === "start" ? "批量启动" : "批量停止"}完成 (${group || "全部服务"})`
      );
    } catch (e: any) {
      showToast(`批处理失败: ${e?.message || String(e)}`);
    }
  };

  const openCreateModal = () => {
    setFormState({
      ...EMPTY_FORM,
      id: "",
      group: selectedGroup === "全部服务" ? "默认分组" : selectedGroup,
    });
    setArgsInput("");
    setStartImmediately(true);
    setIsConfigModalOpen(true);
  };

  const openEditModal = (svc: ServiceView) => {
    setFormState({
      id: svc.id,
      name: svc.name,
      group: svc.group,
      serviceType: svc.serviceType,
      executable: svc.executable,
      scriptPath: svc.scriptPath || "",
      args: svc.args,
      cwd: svc.cwd,
      env: svc.env || {},
      encoding: svc.encoding || "utf-8",
      autoRestart: svc.autoRestart,
      port: svc.port || null,
      frontendUrl: svc.frontendUrl || "",
      autoStartOnRegister: false,
    });
    setArgsInput((svc.args || []).join(" "));
    setStartImmediately(false);
    setIsConfigModalOpen(true);
  };

  const handleSelectFormType = (type: ServiceType) => {
    let defaultExec = formState.executable;
    if (type === "python") defaultExec = "python";
    else if (type === "node") defaultExec = "node";
    else if (type === "nginx") defaultExec = "D:/Tools/nginx-1.24.0/nginx.exe";
    else if (type === "exe") defaultExec = "D:/Tools/app.exe";
    else if (type === "script") defaultExec = "D:/Tools/start.bat";

    setFormState((prev) => ({
      ...prev,
      serviceType: type,
      executable: defaultExec,
      encoding: type === "script" ? "gbk" : "utf-8",
    }));
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.executable.trim()) {
      showToast("请填写软件名称与可执行程序/解释器路径");
      return;
    }
    const parsedArgs = argsInput
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    try {
      const existing = services.find((s) => s.id === formState.id);
      const wasRunning = existing?.status === "running";
      const saved = await saveServiceConfig(
        {
          ...formState,
          args: parsedArgs,
          scriptPath: formState.scriptPath?.trim() || null,
          frontendUrl: normalizeFrontendUrl(formState.frontendUrl || ""),
        },
        false
      );
      setIsConfigModalOpen(false);
      setSelectedServiceId(saved.id);
      if (wasRunning) {
        const restartNow = window.confirm(
          `「${saved.name}」正在运行。新配置要重启后才会生效。现在重启吗？`
        );
        if (restartNow) {
          await restartService(saved.id);
          setStaleConfigIds((prev) => prev.filter((id) => id !== saved.id));
          showToast(`已保存并重启: ${saved.name}`);
        } else {
          setStaleConfigIds((prev) =>
            prev.includes(saved.id) ? prev : [...prev, saved.id]
          );
          showToast("已保存。配置未生效，重启后才会应用");
        }
      } else if (startImmediately) {
        await startService(saved.id);
        setStaleConfigIds((prev) => prev.filter((id) => id !== saved.id));
        showToast(`已保存并启动: ${saved.name}`);
      } else {
        showToast(`已保存服务: ${saved.name}`);
      }
      await refreshData();
    } catch (err: any) {
      showToast(`保存失败: ${err?.message || String(err)}`);
    }
  };

  const handleOpenFrontend = async (svc: ServiceView) => {
    const url = normalizeFrontendUrl(svc.frontendUrl || "");
    if (!url) {
      showToast("这个服务还没有配置前端地址");
      return;
    }
    try {
      await openFrontendUrl(url);
      if (svc.status !== "running") {
        showToast(`已打开 ${url}，服务当前未运行`);
      }
    } catch (e: any) {
      showToast(`打开失败: ${e?.message || String(e)}`);
    }
  };

  const handleDeleteService = async (svc: ServiceView) => {
    try {
      const snap = await deleteServiceConfig(svc.id);
      setMetrics(snap.metrics);
      setServices(snap.services);
      showToast(`已移除服务: ${svc.name}`);
    } catch (e: any) {
      showToast(`删除失败: ${e?.message || String(e)}`);
    }
  };

  const handleAutoDetectSubmit = async () => {
    if (!detectPath.trim()) {
      showToast("请输入要智能探测的项目目录或脚本路径");
      return;
    }
    try {
      const view = await autoDetectAndRegister(
        detectPath.trim(),
        undefined,
        detectGroup.trim() || "AI Agent 项目",
        true
      );
      setSelectedServiceId(view.id);
      await refreshData();
      const diag = await diagnoseService(view.id);
      setDiagnoseResult(diag);
      showToast(`Agent 自动配置并启动成功: ${view.name}`);
    } catch (e: any) {
      showToast(`自动探测失败: ${e?.message || String(e)}`);
    }
  };

  const handleRunDiagnose = async (id: string) => {
    try {
      const diag = await diagnoseService(id);
      setDiagnoseResult(diag);
      setIsAgentModalOpen(true);
    } catch (e: any) {
      showToast(`诊断失败: ${e?.message || String(e)}`);
    }
  };

  const handleHibernate = async () => {
    const ok = await hibernateToTray();
    if (!ok) {
      setTrayBannerVisible((v) => !v);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#090D16] text-slate-200 select-none">
      {/* 顶部全局导航与性能状态条 */}
      <header className="h-14 border-b border-slate-800/80 bg-[#0D1322]/95 px-4 flex items-center justify-between gap-3 shrink-0">
        {/* 左侧：品牌与引擎轻量状态 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white">
                FlashManager
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                Tauri v2 · Rust
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                内核内存:{" "}
                <strong className="text-emerald-300 font-mono">
                  {metrics.selfMemoryMb.toFixed(1)} MB
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Agent 端口:{" "}
                <strong className="text-cyan-300 font-mono">
                  127.0.0.1:{metrics.agentApiPort}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* 中间：受管服务全局指标仪表 */}
        <div className="hidden lg:flex items-center gap-5 bg-slate-900/90 border border-slate-800/90 rounded-xl px-4 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">运行中</span>
            <span className="text-xs font-mono font-semibold text-emerald-400">
              {metrics.runningCount} / {metrics.totalCount}
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">托管 CPU</span>
            <span className="text-xs font-mono font-semibold text-sky-400">
              {metrics.totalManagedCpu.toFixed(1)}%
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">托管内存</span>
            <span className="text-xs font-mono font-semibold text-indigo-300">
              {metrics.totalManagedMemoryMb.toFixed(1)} MB
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">活跃端口</span>
            <div className="flex items-center gap-1">
              {metrics.activePorts.length > 0 ? (
                metrics.activePorts.map((p) => (
                  <span
                    key={p}
                    className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  >
                    :{p}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">无</span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：全局一键批处理与 Agent 自动接入 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleBatch(null, "start")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition"
          >
            ▸ 全部启动
          </button>
          <button
            onClick={() => handleBatch(null, "stop")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition"
          >
            ■ 全部停止
          </button>
          <button
            onClick={() => {
              setDiagnoseResult(null);
              setIsAgentModalOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition"
          >
            ⚡ Agent 自动接入
          </button>
          <button
            onClick={openCreateModal}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/30 flex items-center gap-1.5 transition"
          >
            + 添加软件
          </button>
          <button
            onClick={handleHibernate}
            title="最小化到系统托盘并释放 WebView2 内存"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </header>

      {/* 主体两栏工作区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧分组与运行器类型导航 */}
        <aside className="w-52 border-r border-slate-800/80 bg-[#0B101D] flex flex-col justify-between p-3 shrink-0">
          <div className="space-y-5">
            <div>
              <div className="px-2 mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  服务分组
                </span>
              </div>
              <nav className="space-y-1">
                {groups.map((g) => {
                  const list =
                    g === "全部服务"
                      ? services
                      : services.filter((s) => s.group === g);
                  const runningInGroup = list.filter(
                    (s) => s.status === "running"
                  ).length;
                  const active = selectedGroup === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setSelectedGroup(g)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                        active
                          ? "bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 font-medium"
                          : "text-slate-300 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <span className="truncate">{g}</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        {runningInGroup > 0 && (
                          <span className="text-emerald-400">{runningInGroup}▸</span>
                        )}
                        <span className="text-slate-400">{list.length}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div>
              <div className="px-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  按运行器类型
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <button
                  onClick={() => setSelectedType("all")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition ${
                    selectedType === "all"
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    全部类型
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {services.length}
                  </span>
                </button>
                {(["nginx", "node", "python", "exe", "script"] as ServiceType[]).map(
                  (t) => {
                    const meta = TYPE_META[t];
                    const count = services.filter((s) => s.serviceType === t).length;
                    return (
                      <button
                        key={t}
                        onClick={() => setSelectedType(t)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition ${
                          selectedType === t
                            ? "bg-slate-800 text-white"
                            : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                          {meta.title}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {count}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* 底部：Win32 进程树保护说明 */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-200">
                Win32 进程树守护
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                JobObject
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              停止服务时自动销毁整棵派生子进程树，彻底释放监听端口。
            </p>
          </div>
        </aside>

        {/* 右侧主区域：上方服务卡片列表 + 下方实时日志控制台 */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090D16] overflow-hidden">
          {/* 搜索与当前分组快捷操作栏 */}
          <div className="h-11 border-b border-slate-800/80 px-4 flex items-center justify-between gap-3 shrink-0 bg-[#0B101D]/60">
            <div className="relative flex-1 max-w-sm">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                type="text"
                placeholder="搜索软件名称、端口(:18081)、路径或 PID..."
                className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500/70 rounded-lg px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none transition"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 mr-1">
                <strong className="text-slate-200">{selectedGroup}</strong> (
                {filteredServices.length})
              </span>
              <button
                onClick={() => handleBatch(selectedGroup, "start")}
                className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border border-slate-700/80 transition"
              >
                ▸ 启动本组
              </button>
              <button
                onClick={() => handleBatch(selectedGroup, "stop")}
                className="px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-rose-300 border border-slate-700/80 transition"
              >
                ■ 停止本组
              </button>
            </div>
          </div>

          {/* 服务卡片列表 */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
            {filteredServices.map((s) => {
              const meta = TYPE_META[s.serviceType] || TYPE_META.exe;
              const isRunning = s.status === "running";
              const isSelected = s.id === activeService?.id;
              const cmdPreview = [
                s.executable,
                s.scriptPath || "",
                ...(s.args || []),
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedServiceId(s.id)}
                  className={`rounded-xl border transition cursor-pointer px-3.5 py-2.5 ${
                    isSelected
                      ? "bg-slate-900/95 border-indigo-500/60 shadow-md shadow-indigo-950/30"
                      : "bg-[#0D1322]/75 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* 左侧信息 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-lg bg-gradient-to-br ${meta.iconBg} border flex items-center justify-center font-mono text-[10px] font-bold shrink-0`}
                      >
                        {meta.label}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-white truncate">
                            {s.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              isRunning
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : s.status === "error"
                                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            } flex items-center gap-1 font-medium`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isRunning
                                  ? "bg-emerald-400 animate-pulse"
                                  : s.status === "error"
                                  ? "bg-rose-400"
                                  : "bg-slate-500"
                              }`}
                            />
                            {isRunning
                              ? "运行中"
                              : s.status === "error"
                              ? "启动异常"
                              : "已停止"}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/70">
                            {s.group}
                          </span>
                          {staleConfigIds.includes(s.id) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              配置未生效
                            </span>
                          )}
                          {s.port && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                s.portActive
                                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                  : "bg-slate-800/60 text-slate-400 border border-slate-700/50"
                              }`}
                            >
                              :{s.port} {s.portActive ? "●" : ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                          {cmdPreview}
                        </div>
                      </div>
                    </div>

                    {/* 中间实时监控指标 */}
                    <div className="flex items-center gap-4 shrink-0 text-right font-mono text-[11px]">
                      <div className="w-14">
                        <div className="text-[10px] text-slate-500">PID</div>
                        <div className={isRunning ? "text-slate-200" : "text-slate-600"}>
                          {isRunning && s.pid ? s.pid : "-"}
                        </div>
                      </div>
                      <div className="w-12">
                        <div className="text-[10px] text-slate-500">CPU</div>
                        <div className={isRunning ? "text-sky-400" : "text-slate-600"}>
                          {isRunning ? `${s.cpuUsage.toFixed(1)}%` : "0.0%"}
                        </div>
                      </div>
                      <div className="w-16">
                        <div className="text-[10px] text-slate-500">内存</div>
                        <div
                          className={isRunning ? "text-indigo-300" : "text-slate-600"}
                        >
                          {isRunning ? `${s.memoryMb.toFixed(1)}M` : "0.0M"}
                        </div>
                      </div>
                      <div className="w-16 hidden xl:block">
                        <div className="text-[10px] text-slate-500">时长</div>
                        <div
                          className={isRunning ? "text-emerald-400" : "text-slate-600"}
                        >
                          {formatUptime(s.uptimeSeconds)}
                        </div>
                      </div>
                    </div>

                    {/* 右侧操作按钮 */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {normalizeFrontendUrl(s.frontendUrl || "") && (
                        <button
                          onClick={() => handleOpenFrontend(s)}
                          title={normalizeFrontendUrl(s.frontendUrl || "") || "打开前端"}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition"
                        >
                          打开
                        </button>
                      )}
                      {isRunning ? (
                        <>
                          <button
                            onClick={() => handleToggleService(s)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition"
                          >
                            ■ 停止
                          </button>
                          <button
                            onClick={() => handleRestartService(s)}
                            title="重启服务"
                            className="px-2 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                          >
                            ↻
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleToggleService(s)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition"
                        >
                          ▸ 启动
                        </button>
                      )}
                      <button
                        onClick={() => handleRunDiagnose(s.id)}
                        title="Agent 健康诊断"
                        className="px-2 py-1 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700/80 transition"
                      >
                        诊断
                      </button>
                      <button
                        onClick={() => openEditModal(s)}
                        title="编辑配置"
                        className="px-2 py-1 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteService(s)}
                        title="删除软件"
                        className="px-2 py-1 rounded-lg text-xs bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部停靠：实时标准输出/错误控制台 */}
          <section className="h-56 border-t border-slate-800 bg-[#060911] flex flex-col shrink-0">
            <div className="h-9 border-b border-slate-800/80 px-4 flex items-center justify-between bg-[#0B101D]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeService?.status === "running"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-slate-500"
                  }`}
                />
                <span className="text-xs font-semibold text-slate-200">
                  实时日志控制台
                </span>
                {activeService && (
                  <>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {activeService.name}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {activeService.status === "running" && activeService.pid
                        ? `PID: ${activeService.pid}`
                        : "已停止"}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                      cwd: {activeService.cwd}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  type="text"
                  placeholder="过滤日志关键字..."
                  className="bg-slate-900 border border-slate-700/80 rounded px-2 py-0.5 text-[11px] font-mono text-slate-200 placeholder-slate-500 outline-none w-36"
                />
                <select
                  value={activeService?.encoding || "utf-8"}
                  onChange={async (e) => {
                    if (activeService) {
                      await setServiceEncoding(activeService.id, e.target.value);
                      await refreshData();
                    }
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded px-2 py-0.5 text-[11px] font-mono text-slate-300 outline-none"
                >
                  <option value="utf-8">UTF-8</option>
                  <option value="gbk">GBK (CP936)</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span>自动滚屏</span>
                </label>
                <button
                  onClick={async () => {
                    if (activeService) {
                      logEpochRef.current += 1;
                      logCursorRef.current = 0;
                      logPullingRef.current = false;
                      setConsoleLogs([]);
                      await clearServiceLogs(activeService.id);
                    }
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                >
                  清屏
                </button>
              </div>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-1 leading-relaxed select-text"
            >
              {filteredLogs.map((l, idx) => {
                const badgeClass =
                  l.level === "ERR"
                    ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                    : l.level === "SYS"
                    ? "text-cyan-300 bg-cyan-500/10 border-cyan-500/30"
                    : "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
                const textClass =
                  l.level === "ERR"
                    ? "text-rose-300"
                    : l.level === "SYS"
                    ? "text-cyan-200"
                    : "text-slate-200";
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 hover:bg-slate-900/60 px-1.5 py-0.5 rounded"
                  >
                    <span className="text-slate-500 shrink-0">{l.time}</span>
                    <span
                      className={`px-1 rounded text-[10px] border ${badgeClass} shrink-0`}
                    >
                      {l.level}
                    </span>
                    <span className={`${textClass} break-all`}>{l.text}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* 添加 / 编辑本地软件弹窗 */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveConfig}
            className="w-full max-w-xl bg-[#0E1525] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {formState.id ? "编辑本地受管软件 / 脚本" : "添加本地受管软件 / 脚本"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  支持 EXE 原生程序、Nginx、Node.js 脚本、Python 脚本及 BAT/PS1 批处理
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  软件运行器类型
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(
                    ["python", "node", "nginx", "exe", "script"] as ServiceType[]
                  ).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectFormType(t)}
                      className={`py-2 px-2 rounded-lg border text-center transition ${
                        formState.serviceType === t
                          ? "border-indigo-500 bg-indigo-500/15 text-indigo-200 font-medium"
                          : "border-slate-700 bg-slate-900/80 text-slate-300"
                      }`}
                    >
                      {TYPE_META[t].title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">显示名称 *</label>
                  <input
                    value={formState.name}
                    onChange={(e) =>
                      setFormState({ ...formState, name: e.target.value })
                    }
                    placeholder="例如：DeepSeek 本地 API 服务"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">所属分组</label>
                  <input
                    value={formState.group}
                    onChange={(e) =>
                      setFormState({ ...formState, group: e.target.value })
                    }
                    placeholder="例如：Python 脚本 / 网关与中间件"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {formState.serviceType === "python"
                    ? "Python 解释器路径 (支持 python 或 venv/conda 绝对路径) *"
                    : formState.serviceType === "node"
                    ? "Node.js 运行时路径 (node 或 node.exe 绝对路径) *"
                    : "可执行程序路径 (Executable Path) *"}
                </label>
                <input
                  value={formState.executable}
                  onChange={(e) =>
                    setFormState({ ...formState, executable: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>

              {(formState.serviceType === "python" ||
                formState.serviceType === "node" ||
                formState.serviceType === "script") && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    脚本文件路径 (.py / .js / .bat / .ps1)
                  </label>
                  <input
                    value={formState.scriptPath || ""}
                    onChange={(e) =>
                      setFormState({ ...formState, scriptPath: e.target.value })
                    }
                    placeholder="例如：D:/Develop/Deepseek/FlashManager/demo-services/mock_rag_server.py"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1">
                    启动参数 (空格分隔)
                  </label>
                  <input
                    value={argsInput}
                    onChange={(e) => setArgsInput(e.target.value)}
                    placeholder="例如：--port 8080 --env dev"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    监控端口 (选填)
                  </label>
                  <input
                    type="number"
                    value={formState.port || ""}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        port: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="如 8080"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-400">Web 前端地址</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!formState.port) {
                        showToast("请先填写监控端口");
                        return;
                      }
                      setFormState({
                        ...formState,
                        frontendUrl: `http://127.0.0.1:${formState.port}`,
                      });
                    }}
                    className="text-[11px] text-sky-300 hover:text-sky-200"
                  >
                    用监控端口生成
                  </button>
                </div>
                <input
                  value={formState.frontendUrl || ""}
                  onChange={(e) =>
                    setFormState({ ...formState, frontendUrl: e.target.value })
                  }
                  placeholder="留空表示没有前端。例如 http://127.0.0.1:8080"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  填写后，服务卡片会出现「打开」按钮，用系统浏览器打开这个地址。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    工作目录 (Working Directory)
                  </label>
                  <input
                    value={formState.cwd}
                    onChange={(e) =>
                      setFormState({ ...formState, cwd: e.target.value })
                    }
                    placeholder="留空则默认取程序所在目录"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">控制台字符编码</label>
                  <select
                    value={formState.encoding}
                    onChange={(e) =>
                      setFormState({ ...formState, encoding: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none"
                  >
                    <option value="utf-8">UTF-8 (默认推荐)</option>
                    <option value="gbk">GBK / CP936 (中文批处理兼容)</option>
                  </select>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.autoRestart}
                    onChange={(e) =>
                      setFormState({ ...formState, autoRestart: e.target.checked })
                    }
                    className="accent-indigo-500 rounded"
                  />
                  <span>异常退出时自动重启 (Auto-Restart)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span className="text-emerald-300">保存后立即启动</span>
                </label>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                保存配置
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI Agent 自动配置与诊断中心弹窗 */}
      {isAgentModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-[#0E1525] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-cyan-950/40 to-indigo-950/30">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    AI Agent 自动配置与诊断中心 (Agent Auto-Provisioning)
                  </h3>
                  <p className="text-[11px] text-cyan-300/80 mt-0.5">
                    本地 API: http://127.0.0.1:{metrics.agentApiPort} · 热加载目录:
                    config/services.d/*.json
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAgentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* 智能目录一键探测表单 */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                <div className="font-semibold text-cyan-300">
                  ⚡ 智能目录/脚本自动探测接入 (Auto-Detect)
                </div>
                <p className="text-[11px] text-slate-400">
                  输入任意项目目录或脚本路径，自动识别{" "}
                  <code className="text-slate-200">
                    Python (.venv) / Node.js / Nginx / EXE / .flashservice.json
                  </code>{" "}
                  并自动完成配置与启动：
                </p>
                <div className="flex gap-2">
                  <input
                    value={detectPath}
                    onChange={(e) => setDetectPath(e.target.value)}
                    placeholder="输入项目文件夹或脚本路径，如 D:/Develop/Deepseek/my-service"
                    className="flex-1 bg-[#060911] border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-slate-100 outline-none focus:border-cyan-500"
                  />
                  <input
                    value={detectGroup}
                    onChange={(e) => setDetectGroup(e.target.value)}
                    placeholder="所属分组"
                    className="w-36 bg-[#060911] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleAutoDetectSubmit}
                    className="px-4 py-1.5 rounded-lg font-medium bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 transition"
                  >
                    自动识别并启动
                  </button>
                </div>
              </div>

              {/* 诊断报告展示 */}
              {diagnoseResult && (
                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    diagnoseResult.healthy
                      ? "bg-emerald-950/20 border-emerald-500/40"
                      : "bg-rose-950/20 border-rose-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold ${
                        diagnoseResult.healthy ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      诊断结论：{diagnoseResult.summary}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      status={diagnoseResult.status} | portActive=
                      {String(diagnoseResult.portActive)}
                    </span>
                  </div>
                </div>
              )}

              {/* Agent CLI / HTTP 调用说明 */}
              <div className="space-y-1.5">
                <div className="text-slate-300 font-medium">
                  AI Agent 自动调用命令 (已内置 Cursor Skill)：
                </div>
                <pre className="bg-[#060911] border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-cyan-200 overflow-x-auto select-text">
{`# 方式 1：Agent 通过 CLI 自动扫描项目目录并注册启动
flash-manager auto-detect "D:/Develop/Deepseek/my-app" --group "AI Agent 项目" --start

# 方式 2：Agent 通过 PowerShell / HTTP API 自动注册并获取健康诊断
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:${metrics.agentApiPort}/api/v1/services/auto-detect" \`
  -ContentType "application/json" -Body '{"path":"D:/Develop/Deepseek/my-app","startNow":true}'`}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setIsAgentModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 托盘休眠说明浮层 (浏览器预览模式下展示) */}
      {trayBannerVisible && (
        <div className="fixed bottom-4 right-4 z-40 w-80 rounded-2xl bg-[#0E1628]/95 border border-cyan-500/40 shadow-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              系统托盘轻量休眠已就绪
            </span>
            <button
              onClick={() => setTrayBannerVisible(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              关闭提示
            </button>
          </div>
          <div className="text-[11px] text-slate-300 space-y-1 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="flex justify-between">
              <span>桌面窗口关闭行为：</span>
              <span className="text-emerald-400 font-mono">销毁 WebView2 (~45MB)</span>
            </div>
            <div className="flex justify-between">
              <span>Rust 守护进程内存：</span>
              <span className="text-cyan-300 font-mono">
                {metrics.selfMemoryMb.toFixed(1)} MB
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-indigo-600/95 text-white text-xs font-medium shadow-xl border border-indigo-400/40">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
