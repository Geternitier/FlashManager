import { Command, Search } from "lucide-react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { statusPill, typeIcon } from "../features/services/servicePresentation";
import type { ServiceView } from "../types";
import { Mascot } from "./Mascot";

interface PaletteCommand {
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  paletteQuery: string;
  paletteIndex: number;
  paletteServices: ServiceView[];
  paletteCommands: PaletteCommand[];
  paletteDialogRef: RefObject<HTMLDivElement>;
  setPaletteQuery: (query: string) => void;
  setPaletteIndex: Dispatch<SetStateAction<number>>;
  executePaletteService: (service: ServiceView) => void;
  executePaletteCommand: (run: () => void) => void;
  onClose: () => void;
}

export function CommandPalette({
  paletteQuery,
  paletteIndex,
  paletteServices,
  paletteCommands,
  paletteDialogRef,
  setPaletteQuery,
  setPaletteIndex,
  executePaletteService,
  executePaletteCommand,
  onClose,
}: CommandPaletteProps) {
  return (
    <div className="fm-palette-root is-open">
      <div className="fm-palette-backdrop" onClick={onClose} />
      <div ref={paletteDialogRef} tabIndex={-1} className="fm-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="fm-palette-search">
          <Search className="i" />
          <input
            value={paletteQuery}
            onChange={(event) => {
              setPaletteQuery(event.target.value);
              setPaletteIndex(0);
            }}
            onKeyDown={(event) => {
              const total = paletteServices.length + paletteCommands.length;
              if (!total) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setPaletteIndex((current) => (current + 1) % total);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setPaletteIndex((current) => (current - 1 + total) % total);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (paletteIndex < paletteServices.length) executePaletteService(paletteServices[paletteIndex]);
                else executePaletteCommand(paletteCommands[paletteIndex - paletteServices.length].run);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="搜索服务，或输入一个操作…"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="fm-palette-list">
          {!paletteServices.length && !paletteCommands.length ? (
            <div className="fm-palette-empty">
              <Mascot size={70} mood="idle" />
              <b>没有找到「{paletteQuery}」</b>
              <span>试试服务名、端口，或“添加 / 停止 / 主题”。</span>
            </div>
          ) : null}
          {paletteServices.length ? (
            <>
              <div className="fm-palette-group">服务 · {paletteServices.length}</div>
              {paletteServices.map((service, index) => (
                <button
                  key={service.id}
                  className={`fm-palette-item ${paletteIndex === index ? "is-focus" : ""}`}
                  onClick={() => executePaletteService(service)}
                  onMouseEnter={() => setPaletteIndex(index)}
                >
                  {typeIcon(service)}
                  <span className="fm-palette-item-copy">
                    <b>{service.name}</b>
                    <small>
                      {service.group} · {service.port ? `:${service.port}` : "无端口"}
                    </small>
                  </span>
                  {statusPill(service)}
                  <span className="fm-palette-enter">↵</span>
                </button>
              ))}
            </>
          ) : null}
          {paletteCommands.length ? (
            <>
              <div className="fm-palette-group">操作 · {paletteCommands.length}</div>
              {paletteCommands.map((command, index) => {
                const globalIndex = paletteServices.length + index;
                return (
                  <button
                    key={command.label}
                    className={`fm-palette-item ${paletteIndex === globalIndex ? "is-focus" : ""}`}
                    onClick={() => executePaletteCommand(command.run)}
                    onMouseEnter={() => setPaletteIndex(globalIndex)}
                  >
                    <span className="fm-palette-icon">{command.icon}</span>
                    <span className="fm-palette-item-copy">
                      <b>{command.label}</b>
                      <small>{command.hint}</small>
                    </span>
                    <span className="fm-palette-enter">↵</span>
                  </button>
                );
              })}
            </>
          ) : null}
        </div>
        <div className="fm-palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>选择
          </span>
          <span>
            <kbd>↵</kbd>执行
          </span>
          <span>
            <kbd>Esc</kbd>关闭
          </span>
          <span className="fm-palette-brand">
            <Command className="i" /> Ctrl K
          </span>
        </div>
      </div>
    </div>
  );
}
