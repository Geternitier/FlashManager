import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, RefreshCw, Route, Trash2, X } from "lucide-react";
import { applyProxy, deleteProxyRule, fetchProxyRules, openFrontendUrl, previewProxy, saveProxyRule } from "./api";
import type { ProxyApplyReport, ProxyOpenRequest, ProxyPreview, ProxyRule, ServiceView } from "./types";

const EMPTY_RULE: ProxyRule = {
  id: "",
  name: "",
  enabled: true,
  gatewayId: "",
  listenHost: "127.0.0.1",
  listenPort: 18080,
  location: "/",
  serviceId: "",
  websocket: true,
  stripPrefix: true,
};

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "操作没有完成";
}

export function proxyPublicUrl(rule: Pick<ProxyRule, "listenHost" | "listenPort" | "location">): string {
  const host = rule.listenHost === "0.0.0.0" ? "127.0.0.1" : rule.listenHost;
  const path = rule.location === "/" ? "/" : `${rule.location}/`;
  return `http://${host}:${rule.listenPort}${path}`;
}

function hostMode(host: string): string {
  if (host === "127.0.0.1" || host === "0.0.0.0") return host;
  return "custom";
}

export function ServiceProxyNote({
  service,
  services,
  onOpen,
}: {
  service: ServiceView;
  services: ServiceView[];
  onOpen: (request: ProxyOpenRequest) => void;
}) {
  const [rules, setRules] = useState<ProxyRule[]>([]);

  useEffect(() => {
    let cancel = false;
    fetchProxyRules()
      .then((items) => {
        if (!cancel) setRules(items);
      })
      .catch(() => {
        if (!cancel) setRules([]);
      });
    return () => {
      cancel = true;
    };
  }, [service.id]);

  if (service.serviceType !== "nginx" && !service.port) return null;

  const mine =
    service.serviceType === "nginx"
      ? rules.filter((rule) => rule.gatewayId === service.id)
      : rules.filter((rule) => rule.serviceId === service.id);
  const names = new Map(services.map((item) => [item.id, item.name]));

  return (
    <div className="fm-detail-section">
      <h4>
        <Route className="i" />
        反向代理
      </h4>
      {mine.length ? (
        <div className="fm-proxy-links">
          {mine.slice(0, 4).map((rule) => (
            <div key={rule.id} className="fm-proxy-link">
              <b>{proxyPublicUrl(rule)}</b>
              <small>{service.serviceType === "nginx" ? names.get(rule.serviceId) || "目标服务" : rule.name}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="fm-proxy-note">{service.serviceType === "nginx" ? "这个网关还没有反代规则。" : "还没有把这个服务暴露出去。"}</p>
      )}
      <button
        className="fm-btn fm-btn-soft"
        onClick={() =>
          onOpen(
            service.serviceType === "nginx"
              ? { gatewayId: service.id }
              : { serviceId: service.id, edit: true }
          )
        }
      >
        <Route className="i" />
        {service.serviceType === "nginx" ? "管理反代" : "暴露到反代"}
      </button>
    </div>
  );
}

export default function ProxyPage({
  services,
  request,
  onRequestConsumed,
  onAddNginx,
  onToast,
}: {
  services: ServiceView[];
  request: ProxyOpenRequest | null;
  onRequestConsumed: () => void;
  onAddNginx: () => void;
  onToast: (toast: { kind: "success" | "info" | "error"; title: string; message?: string }) => void;
}) {
  const gateways = useMemo(() => services.filter((service) => service.serviceType === "nginx"), [services]);
  const targets = useMemo(
    () => services.filter((service) => service.serviceType !== "nginx" && service.port),
    [services]
  );
  const [rules, setRules] = useState<ProxyRule[]>([]);
  const [gatewayId, setGatewayId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<ProxyRule>(EMPTY_RULE);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ProxyPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [report, setReport] = useState<ProxyApplyReport | null>(null);
  const [pendingDelete, setPendingDelete] = useState("");

  const reload = async () => {
    const next = await fetchProxyRules();
    setRules(next);
    return next;
  };

  useEffect(() => {
    let cancel = false;
    reload()
      .catch((error) => {
        if (!cancel) onToast({ kind: "error", title: "反代规则没有读出来", message: errorText(error) });
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (gatewayId && (gateways.some((gateway) => gateway.id === gatewayId) || rules.some((rule) => rule.gatewayId === gatewayId))) {
      return;
    }
    if (gateways[0]) setGatewayId(gateways[0].id);
  }, [gateways, gatewayId, rules]);

  useEffect(() => {
    if (!request) return;
    const nextGateway = request.gatewayId || gateways[0]?.id || "";
    if (nextGateway) setGatewayId(nextGateway);
    if (request.edit) {
      const target = services.find((service) => service.id === request.serviceId);
      setForm({
        ...EMPTY_RULE,
        gatewayId: nextGateway,
        serviceId: request.serviceId || "",
        name: target ? `${target.name} 反代` : "",
      });
      setFormError("");
      setEditorOpen(true);
    }
    onRequestConsumed();
  }, [request]);

  const gatewayReady = gateways.some((gateway) => gateway.id === gatewayId);
  useEffect(() => {
    if (!gatewayId || !gatewayReady) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    let cancel = false;
    previewProxy(gatewayId)
      .then((next) => {
        if (!cancel) {
          setPreview(next);
          setPreviewError("");
        }
      })
      .catch((error) => {
        if (!cancel) {
          setPreview(null);
          setPreviewError(errorText(error));
        }
      });
    return () => {
      cancel = true;
    };
  }, [gatewayId, gatewayReady, rules]);

  const visible = rules
    .filter((rule) => rule.gatewayId === gatewayId)
    .slice()
    .sort((left, right) => left.listenPort - right.listenPort || left.location.localeCompare(right.location));
  const groups = new Map<string, ProxyRule[]>();
  for (const rule of visible) {
    const key = `${rule.listenHost}:${rule.listenPort}`;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }
  const serviceName = (id: string) => services.find((service) => service.id === id)?.name || "服务已删除";

  const openCreate = () => {
    setForm({
      ...EMPTY_RULE,
      gatewayId,
      serviceId: targets[0]?.id || "",
      name: targets[0] ? `${targets[0].name} 反代` : "",
    });
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (rule: ProxyRule) => {
    setForm({ ...rule });
    setFormError("");
    setEditorOpen(true);
    setPendingDelete("");
  };

  const applyGateway = async (id: string) => {
    setApplying(true);
    try {
      const next = await applyProxy(id);
      setReport(next);
      if (next.reloadError) {
        onToast({ kind: "error", title: "Nginx 没有重载", message: next.summary });
      } else {
        onToast({ kind: "success", title: "反代已应用", message: next.summary });
      }
      return true;
    } catch (error) {
      const message = errorText(error);
      setReport(null);
      onToast({ kind: "error", title: "没有应用到 Nginx", message });
      return false;
    } finally {
      setApplying(false);
    }
  };

  const saveForm = async () => {
    const name = form.name.trim();
    const location = form.location.trim() || "/";
    if (!name) {
      setFormError("给这条反代起一个名字。");
      return;
    }
    if (!form.gatewayId) {
      setFormError("请选择一个 Nginx 服务作为网关。");
      return;
    }
    if (!form.serviceId) {
      setFormError("请选择要转发到的 Web 服务。");
      return;
    }
    if (!form.listenPort || form.listenPort < 1 || form.listenPort > 65535) {
      setFormError("监听端口需要在 1 到 65535 之间。");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const saved = await saveProxyRule({
        ...form,
        name,
        location,
        listenHost: form.listenHost.trim(),
        stripPrefix: location === "/" ? false : form.stripPrefix,
      });
      await reload();
      setGatewayId(saved.gatewayId);
      setEditorOpen(false);
      await applyGateway(saved.gatewayId);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (rule: ProxyRule) => {
    if (pendingDelete !== rule.id) {
      setPendingDelete(rule.id);
      return;
    }
    setPendingDelete("");
    setSaving(true);
    try {
      await deleteProxyRule(rule.id);
      await reload();
      await applyGateway(rule.gatewayId);
    } catch (error) {
      onToast({ kind: "error", title: "删除失败", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: ProxyRule) => {
    setSaving(true);
    try {
      await saveProxyRule({ ...rule, enabled: !rule.enabled });
      await reload();
      await applyGateway(rule.gatewayId);
    } catch (error) {
      onToast({ kind: "error", title: "没有改成", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  if (!loading && gateways.length === 0) {
    return (
      <section className="fm-proxy">
        <div className="fm-empty">
          <span className="fm-proxy-empty-icon">
            <Route className="i" />
          </span>
          <h3>先请一个 Nginx 网关</h3>
          <p>反代规则会写进这个 Nginx 自己的配置目录，原来手写的站点不会被改掉。</p>
          <button className="fm-btn fm-btn-primary" onClick={onAddNginx}>
            <Plus className="i" />
            添加 Nginx
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="fm-proxy">
      <header className="fm-proxy-head">
        <div>
          <span className="fm-eyebrow">网关</span>
          <h1>反向代理</h1>
          <p>同一个端口可以整站转发，也可以按路径挂多个服务。应用时只重写 FlashManager 生成的配置。</p>
        </div>
        <div className="fm-proxy-actions">
          <button className="fm-btn fm-btn-soft" disabled={!gatewayId || applying} onClick={() => void applyGateway(gatewayId)}>
            <RefreshCw className={`i ${applying ? "fm-spin" : ""}`} />
            应用到 Nginx
          </button>
          <button className="fm-btn fm-btn-primary" onClick={openCreate} disabled={!targets.length}>
            <Plus className="i" />
            新增规则
          </button>
        </div>
      </header>

      {gateways.length > 1 ? (
        <div className="fm-proxy-gateways" role="tablist" aria-label="选择网关">
          {gateways.map((gateway) => (
            <button
              key={gateway.id}
              className={gateway.id === gatewayId ? "is-active" : ""}
              onClick={() => setGatewayId(gateway.id)}
            >
              {gateway.name}
              <small>{gateway.status === "running" ? "运行中" : "未运行"}</small>
            </button>
          ))}
        </div>
      ) : null}

      {!targets.length ? <p className="fm-proxy-note">还没有带监控端口的 Web 服务，可以先添加一个，再把它挂到反代上。</p> : null}

      {previewError ? (
        <div className="fm-danger-note">
          <span>{previewError}</span>
        </div>
      ) : null}
      {preview && !preview.includeReady ? (
        <p className="fm-proxy-note">应用时会在 http 块里加入 FlashManager 的 include，其它 server 保持原样。</p>
      ) : null}
      {preview?.warnings.map((warning) => (
        <div className="fm-danger-note" key={warning}>
          <span>{warning}</span>
        </div>
      ))}
      {report ? (
        <p className={`fm-proxy-note ${report.reloadError ? "is-warn" : ""}`}>
          {report.summary}
          {report.configPath ? ` 配置文件：${report.configPath}` : ""}
        </p>
      ) : null}

      {editorOpen ? (
        <form
          className="fm-proxy-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveForm();
          }}
        >
          <div className="fm-proxy-editor-head">
            <b>{form.id ? "编辑规则" : "新增规则"}</b>
            <button type="button" className="fm-drawer-close" onClick={() => setEditorOpen(false)} aria-label="关闭编辑">
              <X className="i" />
            </button>
          </div>
          {formError ? (
            <div className="fm-danger-note">
              <span>{formError}</span>
            </div>
          ) : null}
          <div className="fm-form-grid">
            <div className="fm-field">
              <label htmlFor="proxyName">名称</label>
              <input id="proxyName" className="fm-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：RAG 控制台" />
            </div>
            <div className="fm-field">
              <label htmlFor="proxyGateway">网关</label>
              <select id="proxyGateway" className="fm-select" value={form.gatewayId} onChange={(event) => setForm({ ...form, gatewayId: event.target.value })}>
                <option value="">选择 Nginx</option>
                {gateways.map((gateway) => (
                  <option key={gateway.id} value={gateway.id}>
                    {gateway.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="fm-field">
              <label htmlFor="proxyHost">监听地址</label>
              <select
                id="proxyHost"
                className="fm-select"
                value={hostMode(form.listenHost)}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm({ ...form, listenHost: value === "custom" ? "" : value });
                }}
              >
                <option value="127.0.0.1">仅本机 127.0.0.1</option>
                <option value="0.0.0.0">所有网卡 0.0.0.0</option>
                <option value="custom">指定 IPv4</option>
              </select>
            </div>
            {hostMode(form.listenHost) === "custom" ? (
              <div className="fm-field">
                <label htmlFor="proxyHostCustom">指定地址</label>
                <input id="proxyHostCustom" className="fm-input" value={form.listenHost} onChange={(event) => setForm({ ...form, listenHost: event.target.value })} placeholder="192.168.3.12" />
              </div>
            ) : null}
            <div className="fm-field">
              <label htmlFor="proxyPort">监听端口</label>
              <input
                id="proxyPort"
                className="fm-input"
                type="number"
                min={1}
                max={65535}
                value={form.listenPort || ""}
                onChange={(event) => setForm({ ...form, listenPort: event.target.value ? Number(event.target.value) : 0 })}
              />
            </div>
            <div className="fm-field">
              <label htmlFor="proxyLocation">
                路径 <small>/ 表示整站</small>
              </label>
              <input id="proxyLocation" className="fm-input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="/ 或 /rag" />
            </div>
            <div className="fm-field">
              <label htmlFor="proxyService">目标服务</label>
              <select id="proxyService" className="fm-select" value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}>
                <option value="">选择服务</option>
                {targets.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} :{service.port}
                  </option>
                ))}
                {form.serviceId && !targets.some((service) => service.id === form.serviceId) ? (
                  <option value={form.serviceId}>{serviceName(form.serviceId)}</option>
                ) : null}
              </select>
            </div>
          </div>
          <div className="fm-proxy-checks">
            <label className="fm-checkline">
              <input type="checkbox" checked={form.websocket} onChange={(event) => setForm({ ...form, websocket: event.target.checked })} />
              <span>转发 WebSocket</span>
            </label>
            {form.location.trim() !== "/" && form.location.trim() !== "" ? (
              <label className="fm-checkline">
                <input type="checkbox" checked={form.stripPrefix} onChange={(event) => setForm({ ...form, stripPrefix: event.target.checked })} />
                <span>转发时去掉路径前缀</span>
              </label>
            ) : null}
            <label className="fm-checkline">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
              <span>启用</span>
            </label>
          </div>
          <div className="fm-proxy-editor-foot">
            <span className="fm-field-hint">保存后会立刻写入 Nginx 并检查配置。检查失败时，磁盘上的 Nginx 配置会还原。</span>
            <button className="fm-btn fm-btn-primary" type="submit" disabled={saving || applying}>
              {saving ? "保存中" : "保存并应用"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="fm-proxy-note">正在读取规则…</p>
      ) : visible.length === 0 ? (
        <div className="fm-empty fm-proxy-empty">
          <h3>这个网关还是空的</h3>
          <p>整站用路径 /，和别人共用一个端口时再写成 /rag 这样的路径。</p>
        </div>
      ) : (
        <div className="fm-proxy-groups">
          {[...groups.entries()].map(([listen, items]) => (
            <article key={listen} className="fm-proxy-group">
              <header>
                <b>{listen}</b>
                <small>{items.length > 1 || items.some((rule) => rule.location !== "/") ? "按路径" : "整站"}</small>
              </header>
              {items.map((rule) => (
                <div key={rule.id} className={`fm-proxy-row ${rule.enabled ? "" : "is-off"}`}>
                  <div>
                    <b>{rule.location === "/" ? "整站 /" : rule.location}</b>
                    <small>
                      {rule.name} → {serviceName(rule.serviceId)}
                      {rule.websocket ? " · WebSocket" : ""}
                      {rule.location !== "/" && rule.stripPrefix ? " · 去前缀" : ""}
                    </small>
                  </div>
                  <div className="fm-proxy-row-actions">
                    <button className="fm-mini-btn" title="打开" aria-label="打开反代地址" onClick={() => void openFrontendUrl(proxyPublicUrl(rule))}>
                      <ExternalLink className="i" />
                    </button>
                    <button className="fm-btn fm-btn-soft" onClick={() => openEdit(rule)}>
                      编辑
                    </button>
                    <button className="fm-btn fm-btn-soft" disabled={saving} onClick={() => void toggleRule(rule)}>
                      {rule.enabled ? "停用" : "启用"}
                    </button>
                    <button className={`fm-btn ${pendingDelete === rule.id ? "fm-btn-danger" : "fm-btn-soft"}`} disabled={saving} onClick={() => void removeRule(rule)}>
                      <Trash2 className="i" />
                      {pendingDelete === rule.id ? "确认删除" : "删除"}
                    </button>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}

      {preview?.conf ? (
        <details className="fm-proxy-preview">
          <summary>将写入的配置</summary>
          <pre>{preview.conf}</pre>
        </details>
      ) : null}
    </section>
  );
}
