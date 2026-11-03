import { useEffect, useRef } from "react";

export function useDialogFocus(open = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
    )).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? root).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0] ?? root;
      const last = items[items.length - 1] ?? root;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
        event.preventDefault(); first.focus();
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (!root.contains(event.target as Node)) (focusable()[0] ?? root).focus();
    };
    root.addEventListener("keydown", onKey);
    document.addEventListener("focusin", keepFocus);
    return () => {
      root.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", keepFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
