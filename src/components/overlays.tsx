import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useDialogFocus } from "../useDialogFocus";

type ToastKind = "success" | "info" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export interface MenuEntry {
  label?: string;
  icon?: ReactNode;
  note?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export interface MenuState {
  left: number;
  top: number;
  header?: string;
  note?: string;
  items: MenuEntry[];
}

export function ModalFrame({
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
  const dialogRef = useDialogFocus();
  return (
    <div className="fm-modal-root is-open">
      <div
        className="fm-modal-backdrop"
        data-modal-backdrop=""
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div ref={dialogRef} className={`fm-modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ToastStack({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
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

export function MenuPanel({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
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
