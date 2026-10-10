"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const CloseContext = createContext<() => void>(() => {});

/** Stable component identity preserves keyboard focus while canvas state refreshes. */
export function ContextMenuItem({ label, hk, onClick, danger, disabled }: {
  label: string; hk?: string; onClick?: () => void; danger?: boolean; disabled?: boolean;
}) {
  const close = useContext(CloseContext);
  return <button type="button" role="menuitem" disabled={disabled}
    onClick={() => { if (disabled) return; close(); onClick?.(); }}
    className={cn("flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315fc8]",
      disabled ? "canvas-ui-muted cursor-default opacity-40" : danger ? "text-[#d9534f] hover:bg-[#ff6b63]/12" : "canvas-ui-action")}>
    <span className="truncate">{label}</span>{hk && <span className="canvas-ui-muted text-xs opacity-70">{hk}</span>}
  </button>;
}

/** Cursor anchored, measured after render; text/image/batch actions share one surface. */
export function ContextMenuSurface({ x, y, light, onClose, children }: {
  x: number; y: number; light: boolean; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const restoreRequested = useRef(false);
  const close = useRef(onClose); close.current = onClose;
  const [point, setPoint] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!panel.current) return;
    restore.current = document.activeElement as HTMLElement | null;
    const fit = () => {
      const rect = panel.current!.getBoundingClientRect();
      setPoint({ left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    };
    fit();
    panel.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(fit); observer.observe(panel.current);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [x, y]);
  useEffect(() => {
    const focusMenu = (event?: FocusEvent) => {
      if (event?.target instanceof Node && panel.current?.contains(event.target)) return;
      panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    };
    // Selecting a node mounts its composer, whose autofocus must not steal menu keys.
    document.addEventListener("focusin", focusMenu);
    focusMenu();
    return () => {
      document.removeEventListener("focusin", focusMenu);
      if (restoreRequested.current && restore.current?.isConnected) restore.current.focus({ preventScroll: true });
    };
  }, []);
  return <div data-canvas-hotkeys-blocked="true" className={light ? "canvas-ui-light" : "canvas-ui-dark"}
    onKeyDown={event => {
      if (["Escape", "Tab"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); restoreRequested.current = true; close.current(); }
    }}>
    <div data-testid="canvas-context-menu-backdrop" className="fixed inset-0 z-[998]"
      onPointerDown={() => close.current()} onContextMenu={event => { event.preventDefault(); close.current(); }} />
    <div ref={panel} role="menu" aria-label="节点操作" data-testid="canvas-context-menu"
      onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}
      style={{ position: "fixed", ...point, maxHeight: "calc(100dvh - 16px)", maxWidth: "calc(100vw - 16px)" }}
      className="canvas-ui-surface menu-pop z-[999] w-[232px] overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-lg"
      onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}><CloseContext.Provider value={onClose}>{children}</CloseContext.Provider></div>
  </div>;
}
