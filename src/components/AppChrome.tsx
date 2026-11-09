import { AlertTriangle, Bell, ChevronDown, Keyboard, LayoutGrid, Moon, Pause, Play, Search, Settings, Sun, Route } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { ServiceType } from "../types";
import { TYPE_META, TYPE_ORDER } from "../features/services/servicePresentation";
import type { FilterKey, ServiceCounts } from "../features/services/servicePresentation";
import { Mascot } from "./Mascot";
import type { MascotMood } from "./Mascot";
import type { Theme } from "./AppDialogs";

const GROUP_COLORS: Record<string, string> = {
  "AI 推理": "#8e6fe8",
  "AI Agent 项目": "#2fa98f",
  折枝: "#e85d8f",
  网关与中间件: "#3d8fd6",
  开发工具: "#d99a2b",
};

interface AppTopbarProps {
  loading: boolean;
  connected: boolean;
  theme: Theme;
  errorCount: number;
  resetFilters: () => void;
  openPalette: () => void;
  setTheme: (theme: Theme) => void;
  openBell: (event: MouseEvent<HTMLElement>) => void;
  openUserMenu: (event: MouseEvent<HTMLElement>) => void;
}

export function AppTopbar({
  loading,
  connected,
  theme,
  errorCount,
  resetFilters,
  openPalette,
  setTheme,
  openBell,
  openUserMenu,
}: AppTopbarProps) {
  return (
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
      <button className="fm-omni" onClick={openPalette}>
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
  );
}

interface ServiceSidebarProps {
  greet: { side: string; line: string };
  heroMood: MascotMood;
  counts: ServiceCounts;
  groups: string[];
  groupStats: Record<string, { total: number; running: number }>;
  typeCounts: Record<string, number>;
  page: "services" | "proxies";
  filter: FilterKey;
  group: string;
  type: "all" | ServiceType;
  setPage: (page: "services" | "proxies") => void;
  setFilter: (filter: FilterKey) => void;
  setGroup: (group: string) => void;
  setType: (type: "all" | ServiceType) => void;
  resetFilters: () => void;
  openProxies: () => void;
  openSettings: () => void;
  openShortcuts: () => void;
}

export function ServiceSidebar({
  greet,
  heroMood,
  counts,
  groups,
  groupStats,
  typeCounts,
  page,
  filter,
  group,
  type,
  setPage,
  setFilter,
  setGroup,
  setType,
  resetFilters,
  openProxies,
  openSettings,
  openShortcuts,
}: ServiceSidebarProps) {
  return (
    <aside className="fm-side">
      <button className="fm-greet-card" onClick={resetFilters} aria-label="和本鱼打招呼">
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

      <div className="fm-side-foot">
        <button onClick={openSettings}>
          <Settings className="i" />
          设置
        </button>
        <button onClick={openShortcuts}>
          <Keyboard className="i" />
          快捷键
        </button>
      </div>
    </aside>
  );
}
