import { Activity, AlertTriangle, Clock, Copy, Cpu, ExternalLink, Globe, Loader2, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Search, Shield, Square, Terminal, Trash2, X } from "lucide-react";
import type { Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import { Mascot } from "../../components/Mascot";
import { ServiceProxyNote } from "../../ProxyPage";
import type { DiagnoseReport, LogEntry, ProxyOpenRequest, ServiceView } from "../../types";
import { TYPE_META, commandFor, statusPill, typeIcon } from "./servicePresentation";
import type { DrawerTab, ServiceAction } from "./servicePresentation";

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

interface ServiceDrawerProps {
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  activeService: ServiceView | null;
  services: ServiceView[];
  busyAction: string | undefined;
  activeDiagnose: DiagnoseReport | null;
  diagnoseLoading: boolean;
  activeLogs: LogEntry[];
  logLevel: string;
  logQuery: string;
  logFollow: boolean;
  logCursor: number;
  logBoxRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  selectTab: (tab: DrawerTab) => void;
  setLogLevel: (level: string) => void;
  setLogQuery: (query: string) => void;
  setLogFollow: Dispatch<SetStateAction<boolean>>;
  copyLogs: () => void;
  clearLogs: () => Promise<void>;
  changeEncoding: (encoding: string) => Promise<void>;
  copyText: (text: string, title: string) => Promise<void>;
  toggleService: (service: ServiceView) => void;
  runServiceAction: (id: string, action: ServiceAction) => Promise<void>;
  runDiagnose: (id: string) => Promise<void>;
  openFrontend: (service: ServiceView) => Promise<void>;
  openEdit: (service: ServiceView) => void;
  openCardMenu: (event: MouseEvent<HTMLElement>, service: ServiceView) => void;
  openProxies: (request?: ProxyOpenRequest | null) => void;
}

export function ServiceDrawer({
  drawerOpen,
  drawerTab,
  activeService,
  services,
  busyAction,
  activeDiagnose,
  diagnoseLoading,
  activeLogs,
  logLevel,
  logQuery,
  logFollow,
  logCursor,
  logBoxRef,
  onClose,
  selectTab,
  setLogLevel,
  setLogQuery,
  setLogFollow,
  copyLogs,
  clearLogs,
  changeEncoding,
  copyText,
  toggleService,
  runServiceAction,
  runDiagnose,
  openFrontend,
  openEdit,
  openCardMenu,
  openProxies,
}: ServiceDrawerProps) {
  return (
    <div className={`fm-drawer ${drawerOpen && activeService ? "is-open" : ""}`} aria-hidden={!drawerOpen || !activeService}>
      <div className="fm-drawer-backdrop" onClick={onClose} />
      {activeService ? (
        <aside className="fm-drawer-panel" role="dialog" aria-modal="false" aria-label="服务详情">
          <div className="fm-drawer-head">
            <div className="fm-drawer-titlebar">
              {typeIcon(activeService)}
              <div className="fm-drawer-title">
                <h2>
                  {activeService.name}
                  {busyAction ? statusPill(activeService, busyAction) : null}
                </h2>
                <p>
                  {activeService.group} · {activeService.port ? `127.0.0.1:${activeService.port}` : "无监控端口"} ·{" "}
                  {activeService.pid ? `PID ${activeService.pid}` : "无进程"}
                </p>
              </div>
              <button className="fm-drawer-close" onClick={onClose} aria-label="关闭详情">
                <X className="i" />
              </button>
            </div>
            <div className="fm-drawer-statusline">
              {statusPill(activeService, busyAction)}
              <span className="fm-status neutral">{activeService.autoRestart ? "自动重启 · 开" : "自动重启 · 关"}</span>
              <span className="fm-status neutral">{TYPE_META[activeService.serviceType].label}</span>
            </div>
            <div className="fm-drawer-actions">
              <button
                className={`fm-btn fm-drawer-main ${busyAction ? "start is-busy" : activeService.status === "running" ? "stop" : activeService.status === "error" ? "retry" : "start"}`}
                onClick={() => toggleService(activeService)}
                disabled={Boolean(busyAction)}
              >
                {busyAction ? <Loader2 className="i" /> : activeService.status === "running" ? <Square className="i" /> : activeService.status === "error" ? <RefreshCw className="i" /> : <Play className="i" />}
                {busyAction ? "处理中…" : activeService.status === "running" ? "停止服务" : activeService.status === "error" ? "重试启动" : "启动服务"}
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
                      {activeLogs.length} 行 · 游标 #{logCursor}
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
  );
}
