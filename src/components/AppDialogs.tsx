import { AlertTriangle, X } from "lucide-react";
import { Mascot } from "./Mascot";
import { ModalFrame } from "./overlays";

export type Theme = "day" | "night";

export interface ConfirmState {
  title: string;
  body: string;
  list?: { name: string; note?: string }[];
  note?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  confirmState: ConfirmState;
  onClose: () => void;
}

export function ConfirmDialog({
  confirmState,
  onClose,
}: ConfirmDialogProps) {
  return (
    <ModalFrame onClose={onClose} className="is-small" label={confirmState.title}>
      <div className="fm-modal-head">
        <span className="fm-modal-mascot">
          <Mascot size={40} mood="worry" />
        </span>
        <div className="fm-modal-head-copy">
          <h2>请确认这一步</h2>
          <p>这个动作会立即生效，影响范围如下。</p>
        </div>
        <button className="fm-modal-close" onClick={onClose} aria-label="关闭">
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
        <button className="fm-btn fm-btn-soft" onClick={onClose}>
          取消
        </button>
        <button
          className={`fm-btn ${confirmState.danger ? "fm-btn-danger" : "fm-btn-primary"}`}
          onClick={() => {
            const action = confirmState.onConfirm;
            onClose();
            void action();
          }}
        >
          {confirmState.confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
}

interface SettingsDialogProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  reduceMotion: boolean;
  setReduceMotion: (reduceMotion: boolean) => void;
  onClose: () => void;
}

export function SettingsDialog({
  theme,
  setTheme,
  reduceMotion,
  setReduceMotion,
  onClose,
}: SettingsDialogProps) {
  return (
    <ModalFrame onClose={onClose} label="偏好设置">
      <div className="fm-modal-head">
        <span className="fm-modal-mascot">
          <Mascot size={40} mood="idle" />
        </span>
        <div className="fm-modal-head-copy">
          <h2>小屋偏好</h2>
          <p>让界面更像你习惯的样子。所有设置只影响本机显示。</p>
        </div>
        <button className="fm-modal-close" onClick={onClose} aria-label="关闭">
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
        <button className="fm-btn fm-btn-primary" onClick={onClose}>
          完成
        </button>
      </div>
    </ModalFrame>
  );
}

interface ShortcutsDialogProps {
  onClose: () => void;
}

export function ShortcutsDialog({
  onClose,
}: ShortcutsDialogProps) {
  return (
    <ModalFrame onClose={onClose} className="is-small" label="快捷键">
      <div className="fm-modal-head">
        <span className="fm-modal-mascot">
          <Mascot size={40} mood="happy" />
        </span>
        <div className="fm-modal-head-copy">
          <h2>快捷键</h2>
          <p>键盘是第二条主路径。焦点在哪，操作就发生在哪。</p>
        </div>
        <button className="fm-modal-close" onClick={onClose} aria-label="关闭">
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
        <button className="fm-btn fm-btn-primary" onClick={onClose}>
          知道了
        </button>
      </div>
    </ModalFrame>
  );
}
