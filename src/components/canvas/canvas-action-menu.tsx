"use client";
import { useFeatureAccess } from "@/lib/feature-access/client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { canvasPopoverPlacement, type PopoverPlacement } from "@/lib/canvas/popover-placement";
import { cn } from "@/lib/utils";

export type CanvasActionMenuItem = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
};

/** Portal keeps node actions reachable outside the toolbar's horizontal scroller. */
export function CanvasActionMenu({ label, light, items, disabled = false,
  open: controlledOpen, onOpenChange, triggerIcon: TriggerIcon = MoreHorizontal,
  triggerClassName, triggerTestId, menuTestId = "canvas-node-action-menu", dataTool,
  iconOnly = false, triggerRef,
}: {
  label: string;
  light: boolean;
  items: CanvasActionMenuItem[];
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerIcon?: LucideIcon;
  triggerClassName?: string;
  triggerTestId?: string;
  menuTestId?: string;
  dataTool?: string;
  iconOnly?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { can } = useFeatureAccess();
  const requirements: Record<string, string> = { workflow: "comfyui", video: "video", assistant: "agent", relight: "generate" };
  items = items.filter(item => !requirements[item.id] || can(requirements[item.id]));
  const id = useId();
  const internalAnchor = useRef<HTMLButtonElement>(null);
  const anchor = triggerRef ?? internalAnchor;
  const panel = useRef<HTMLDivElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const change = useRef(onOpenChange); change.current = onOpenChange;
  const setOpen = useCallback((value: boolean) => { setInternalOpen(value); change.current?.(value); }, []);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) anchor.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return;
    setPlacement(canvasPopoverPlacement(anchor.current.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight }, panel.current.scrollHeight + 2, 272));
  }, [open, anchor]);
  useLayoutEffect(() => {
    if (open && placement) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, placement]);
  useEffect(() => {
    if (!open) return;
    if (disabled) { setOpen(false); return; }
    const dismiss = () => setOpen(false);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      dismiss();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", scroll, true); };
  }, [open, disabled, setOpen]);

  return <>
    <button ref={anchor} type="button" title={label} aria-label={label} aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      data-testid={triggerTestId} data-tool={dataTool}
      onClick={() => { setPlacement(null); setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setPlacement(null); setOpen(true);
        }
      }}
      className={triggerClassName ?? "canvas-ui-action flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40"}>
      <TriggerIcon className={cn(iconOnly ? "h-[18px] w-[18px]" : "h-4 w-4", "shrink-0")} aria-hidden="true" />{!iconOnly && label}
    </button>
    {open && createPortal(
      <div data-canvas-hotkeys-blocked="true" className={cn("fixed inset-0 z-[200]", light ? "canvas-ui-light" : "canvas-ui-dark")}
        onPointerDown={event => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
          if (event.key === "Tab") { event.preventDefault(); close(true); }
        }}>
        <div ref={panel} id={id} role="menu" aria-label={label} data-testid={menuTestId}
          style={placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight } : { width: 272, visibility: "hidden" }}
          className="canvas-ui-surface fixed overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-lg"
          onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
            if (!buttons.length) return;
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}>
          {items.map(item => <button key={item.id} type="button" role="menuitem" data-action={item.id}
            disabled={item.disabled} title={item.hint} onClick={() => { close(true); item.onSelect(); }}
            className="canvas-ui-action flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315fc8]">
            <item.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-[13px] font-medium">{item.label}</span>
              {item.hint && <span className="canvas-ui-muted mt-0.5 block text-[11px] leading-4">{item.hint}</span>}
            </span>
          </button>)}
        </div>
      </div>, document.body
    )}
  </>;
}

/** Node editors use the same viewport fitting, without widening their toolbar. */
export function CanvasActionPanel({ anchorRef, label, light, width, onClose, children }: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  label: string;
  light: boolean;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!anchorRef.current || !panel.current) return;
      const next = canvasPopoverPlacement(anchorRef.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, panel.current.scrollHeight + 2, width);
      setPlacement(old => old && Object.keys(next).every(key => old[key as keyof PopoverPlacement] === next[key as keyof PopoverPlacement]) ? old : next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef, width]);
  const placed = placement !== null;
  useEffect(() => {
    if (placed) panel.current?.querySelector<HTMLElement>('textarea, button:not(:disabled)')?.focus({ preventScroll: true });
  }, [placed]); // Focus once, not again while the user types or scrolls.
  return createPortal(<div data-canvas-hotkeys-blocked="true" className={cn("fixed inset-0 z-[200]", light ? "canvas-ui-light" : "canvas-ui-dark")}
    onPointerDown={event => { if (event.target === event.currentTarget) close.current(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); anchorRef.current?.focus({ preventScroll: true }); }
      if (event.key === "Tab") {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
        const current = controls.indexOf(document.activeElement as HTMLElement);
        if (controls.length && (event.shiftKey && current <= 0 || !event.shiftKey && current === controls.length - 1)) {
          event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
        }
      }
    }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={label} data-testid="canvas-node-action-panel"
      style={placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight } : { width, visibility: "hidden" }}
      className="canvas-ui-surface fixed overflow-y-auto overscroll-contain rounded-xl border p-3 shadow-lg">
      {children}
    </div>
  </div>, document.body);
}
