"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasActionMenuItem } from "./canvas-action-menu";

const CloseContext = createContext<() => void>(() => {});
const RootContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

function moveMenuFocus(panel: HTMLDivElement | null, key: string) {
  const buttons = Array.from(panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = key === "Home" ? 0 : key === "End" ? buttons.length - 1 : (index + (key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

/** Stable component identity preserves keyboard focus while canvas state refreshes. */
export function ContextMenuItem({ label, hk, onClick, danger, disabled, icon: Icon, action }: {
  label: string; hk?: string; onClick?: () => void; danger?: boolean; disabled?: boolean;
  icon?: LucideIcon; action?: string;
}) {
  const close = useContext(CloseContext);
  return <button type="button" role="menuitem" disabled={disabled} aria-disabled={disabled || undefined} data-action={action}
    onClick={() => { if (disabled) return; close(); onClick?.(); }}
    className={cn("flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315fc8]",
      disabled ? "canvas-ui-muted cursor-default opacity-40" : danger ? "text-[#d9534f] hover:bg-[#ff6b63]/12" : "canvas-ui-action")}>
    <span className="flex min-w-0 items-center gap-2.5">{Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}<span className="truncate">{label}</span></span>{hk && <span className="canvas-ui-muted text-xs opacity-70">{hk}</span>}
  </button>;
}

/** Keep the parent menu open; portal into its focus scope to escape scroll/animation clipping. */
export function ContextMenuSubmenu({ label, disabled, items }: {
  label: string; disabled?: boolean; items: CanvasActionMenuItem[];
}) {
  const root = useContext(RootContext);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusOnOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ left: 8, top: 8 });
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const hide = (restoreFocus = false) => {
    cancelClose();
    if (restoreFocus || panel.current?.contains(document.activeElement)) anchor.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  const show = (focus = false) => {
    if (disabled) return;
    cancelClose(); focusOnOpen.current = focus; setOpen(true);
    if (focus && open) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  };
  const scheduleClose = () => { cancelClose(); timer.current = setTimeout(() => hide(), 160); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return;
    const fit = () => {
      if (!anchor.current || !panel.current) return;
      const trigger = anchor.current.getBoundingClientRect(), menu = panel.current.getBoundingClientRect();
      const right = trigger.right + 10, left = trigger.left - menu.width - 10;
      setPoint({
        left: Math.max(8, Math.min(right + menu.width <= window.innerWidth - 8 ? right : left >= 8 ? left : trigger.left, window.innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(trigger.top - 6, window.innerHeight - menu.height - 8)),
      });
    };
    fit();
    if (focusOnOpen.current) panel.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(fit); observer.observe(panel.current);
    // The parent refits on resize too; measure after its new position is committed.
    let frame = 0;
    const refit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    window.addEventListener("resize", refit); window.addEventListener("scroll", fit, true);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", refit); window.removeEventListener("scroll", fit, true); };
  }, [open]);
  return <>
    <button ref={anchor} type="button" role="menuitem" disabled={disabled} aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? id : undefined}
      className="canvas-ui-action flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-default disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315fc8]"
      onPointerEnter={() => show()} onPointerLeave={scheduleClose} onClick={() => show(true)}
      onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node | null)) hide(); }}
      onKeyDown={event => {
        if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); show(true); }
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); hide(true); }
      }}>
      <span>{label}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
    {open && root?.current && createPortal(
      <div ref={panel} id={id} role="menu" aria-label={label} data-testid="canvas-node-type-menu"
        style={{ position: "fixed", ...point, maxHeight: "calc(100dvh - 16px)", maxWidth: "calc(100vw - 16px)" }}
        className="canvas-ui-surface z-[1000] w-[192px] overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-lg"
        onPointerEnter={cancelClose} onPointerLeave={scheduleClose}
        onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}
        onKeyDown={event => {
          if (["ArrowLeft", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); hide(true); return; }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); moveMenuFocus(panel.current, event.key);
          }
        }}>
        {items.map(item => <ContextMenuItem key={item.id} action={item.id} label={item.label} icon={item.icon} disabled={item.disabled} onClick={item.onSelect} />)}
      </div>, root.current
    )}
  </>;
}

/** Cursor anchored, measured after render; text/image/batch actions share one surface. */
export function ContextMenuSurface({ x, y, light, onClose, children }: {
  x: number; y: number; light: boolean; onClose: () => void; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const restoreRequested = useRef(false);
  const close = useRef(onClose); close.current = onClose;
  const [point, setPoint] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!panel.current) return;
    restore.current = document.activeElement as HTMLElement | null;
    const fit = () => {
      // menu-pop scales the panel during entry; fit its final layout size.
      const { offsetWidth: width, offsetHeight: height } = panel.current!;
      setPoint({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) });
    };
    fit();
    panel.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(fit); observer.observe(panel.current);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [x, y]);
  useEffect(() => {
    const focusMenu = (event?: FocusEvent) => {
      if (event?.target instanceof Node && root.current?.contains(event.target)) return;
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
  return <div ref={root} data-canvas-hotkeys-blocked="true" className={light ? "canvas-ui-light" : "canvas-ui-dark"}
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
        moveMenuFocus(panel.current, event.key);
      }}><RootContext.Provider value={root}><CloseContext.Provider value={onClose}>{children}</CloseContext.Provider></RootContext.Provider></div>
  </div>;
}
