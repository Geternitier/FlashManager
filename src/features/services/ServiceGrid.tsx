import { AlertTriangle, Clock, Cpu, ExternalLink, Folder, Globe, Loader2, MemoryStick, MoreHorizontal, Play, Plus, RefreshCw, Search, Square, Terminal } from "lucide-react";
import type { MouseEvent } from "react";
import { Mascot } from "../../components/Mascot";
import type { ServiceView } from "../../types";
import { STATUS_META, TYPE_META, commandFor, statusPill } from "./servicePresentation";
import type { DrawerTab } from "./servicePresentation";

function presenceLabel(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

function formatActionLabel(service: ServiceView, busyAction?: string) {
  if (busyAction) return busyAction === "stop" ? "停止中…" : busyAction === "restart" ? "重启中…" : "启动中…";
  if (service.status === "running") return "停止";
  if (service.status === "error") return "重试";
  return "启动";
}

interface ServiceGridProps {
  loading: boolean;
  totalServices: number;
  visibleServices: ServiceView[];
  view: "grid" | "list";
  selectedId: string | null;
  busy: Record<string, string>;
  openAdd: () => void;
  openDetect: () => void;
  openPalette: () => void;
  resetFilters: () => void;
  openDrawer: (id: string, tab?: DrawerTab) => void;
  openCardMenu: (event: MouseEvent<HTMLElement>, service: ServiceView) => void;
  runDiagnose: (id: string) => Promise<void>;
  openFrontend: (service: ServiceView) => Promise<void>;
  toggleService: (service: ServiceView) => void;
}

export function ServiceGrid({
  loading,
  totalServices,
  visibleServices,
  view,
  selectedId,
  busy,
  openAdd,
  openDetect,
  openPalette,
  resetFilters,
  openDrawer,
  openCardMenu,
  runDiagnose,
  openFrontend,
  toggleService,
}: ServiceGridProps) {
  return (
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
      ) : totalServices === 0 ? (
        <div className="fm-empty">
          <span className="fm-empty-mascot">
            <Mascot size={108} mood="sleep" />
          </span>
          <h3>小屋里还空空的…</h3>
          <p>把第一个本地服务请进来吧。你可以手动填写，也可以直接把项目文件夹交给本鱼，让我自己识别。</p>
          <div className="fm-empty-actions">
            <button className="fm-btn fm-btn-primary" onClick={() => openAdd()}>
              <Plus className="i" />
              添加第一个服务
            </button>
            <button className="fm-btn fm-btn-soft" onClick={openDetect}>
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
          <p>试试换一个关键词，或者清掉状态、分组和类型筛选。本鱼也可以帮你直接搜索整个小屋。</p>
          <div className="fm-empty-actions">
            <button className="fm-btn fm-btn-primary" onClick={resetFilters}>
              清除筛选
            </button>
            <button className="fm-btn fm-btn-soft" onClick={openPalette}>
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
          const isSelected = selectedId === service.id;
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
                    {service.needsRestart ? <span className="fm-stale-tag">待重启</span> : null}
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
                    {formatActionLabel(service, busyAction)}
                  </button>
                </div>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
