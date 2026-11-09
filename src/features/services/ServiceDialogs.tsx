import { AlertTriangle, ChevronDown, Folder, Loader2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Mascot } from "../../components/Mascot";
import { ModalFrame } from "../../components/overlays";
import type { ServiceConfig, ServiceType } from "../../types";
import { TYPE_DEFAULTS, TYPE_META, TYPE_ORDER } from "./servicePresentation";

interface ServiceFormDialogProps {
  editingId: string | null;
  form: ServiceConfig;
  formArgs: string;
  formError: string;
  saving: boolean;
  setForm: Dispatch<SetStateAction<ServiceConfig>>;
  setFormArgs: (args: string) => void;
  applyType: (type: ServiceType) => void;
  saveForm: (startAfter: boolean) => Promise<void>;
  onClose: () => void;
}

export function ServiceFormDialog({
  editingId,
  form,
  formArgs,
  formError,
  saving,
  setForm,
  setFormArgs,
  applyType,
  saveForm,
  onClose,
}: ServiceFormDialogProps) {
  return (
    <ModalFrame onClose={onClose} className="is-wide" label={editingId ? "编辑服务" : "添加服务"}>
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
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="关闭">
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
                启动参数 <small>JSON 字符串数组；每项是一个完整参数</small>
              </label>
              <textarea
                className="fm-input"
                rows={4}
                id="svcArgs"
                value={formArgs}
                onChange={(event) => setFormArgs(event.target.value)}
                placeholder={'["--port", "8787", "--name", "hello world"]'}
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
          <button type="button" className="fm-btn fm-btn-soft" onClick={onClose}>
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
  );
}

interface DetectServiceDialogProps {
  detectPath: string;
  detectGroup: string;
  detectBusy: boolean;
  detectError: string;
  setDetectPath: (path: string) => void;
  setDetectGroup: (group: string) => void;
  detectService: () => Promise<void>;
  onClose: () => void;
}

export function DetectServiceDialog({
  detectPath,
  detectGroup,
  detectBusy,
  detectError,
  setDetectPath,
  setDetectGroup,
  detectService,
  onClose,
}: DetectServiceDialogProps) {
  return (
    <ModalFrame onClose={onClose} label="自动识别服务">
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
            <h2>把文件夹交给本鱼</h2>
            <p>输入项目目录或脚本路径，自动识别 Python / Node / Nginx / EXE / BAT，并生成可确认的启动配置。</p>
          </div>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="关闭">
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
          {detectBusy ? <div role="status" className="fm-field-hint">正在读取目录并识别启动配置…</div> : null}
        </div>
        <div className="fm-modal-foot">
          <span className="fm-modal-foot-note">下一步确认启动配置，再选择仅保存或保存并启动</span>
          <button type="button" className="fm-btn fm-btn-soft" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="fm-btn fm-btn-primary" disabled={detectBusy}>
            {detectBusy ? <Loader2 className="i" /> : <Folder className="i" />}
            {detectBusy ? "正在识别…" : "识别并预览"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
