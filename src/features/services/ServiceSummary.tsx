import { AlertTriangle, ArrowRight, ChevronDown, Cpu, Globe, Layers, MemoryStick, Play, Plus } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import { Mascot } from "../../components/Mascot";
import type { MascotMood } from "../../components/Mascot";
import type { PlatformMetrics } from "../../types";
import type { FilterKey, ServiceCounts } from "./servicePresentation";

function dateLabel(date: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

interface ServiceSummaryProps {
  now: Date;
  greeting: string;
  heroSub: string;
  heroMood: MascotMood;
  loading: boolean;
  connected: boolean;
  counts: ServiceCounts;
  metrics: PlatformMetrics;
  refresh: () => Promise<void>;
  openBatchMenu: (event: MouseEvent<HTMLElement>) => void;
  openAdd: () => void;
  showErrors: () => void;
  setFilter: (filter: FilterKey) => void;
}

export function ServiceSummary({
  now,
  greeting,
  heroSub,
  heroMood,
  loading,
  connected,
  counts,
  metrics,
  refresh,
  openBatchMenu,
  openAdd,
  showErrors,
  setFilter,
}: ServiceSummaryProps) {
  return (
    <>
      <section className="fm-hero">
        <div className="fm-hero-copy">
          <span className="fm-eyebrow">{dateLabel(now)}</span>
          <h1>
            <span>{greeting}</span>，<span className="fm-soft">今天也辛苦啦</span>
          </h1>
          <p>{heroSub}</p>
        </div>
        <div className="fm-hero-side">
          <div className="fm-hero-mascot" role="button" tabIndex={0} aria-label="和本鱼打招呼">
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

      {counts.error > 0 && counts.total > 0 ? (
        <button
          className="fm-attention"
          onClick={showErrors}
        >
          <span className="fm-attention-icon">
            <AlertTriangle className="i" />
          </span>
          <span className="fm-attention-copy">
            <b>有 {counts.error} 个小伙伴需要关心</b>
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
    </>
  );
}
