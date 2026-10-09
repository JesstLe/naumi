"use client";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { canvasPopoverPlacement, type PopoverPlacement } from "@/lib/canvas/popover-placement";

export function CanvasParameterPopover({ anchorRef, light, onClose, children }: { anchorRef: RefObject<HTMLButtonElement>; light: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const update = () => {
      if (!panel.current || !anchorRef.current) return;
      const next = canvasPopoverPlacement(anchorRef.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, panel.current.scrollHeight + 2);
      setPlacement(old => old && Object.keys(next).every(key => old[key as keyof PopoverPlacement] === next[key as keyof PopoverPlacement]) ? old : next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    if (anchorRef.current) observer.observe(anchorRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); anchorRef.current?.focus({ preventScroll: true }); } };
    document.addEventListener("keydown", escape);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); document.removeEventListener("keydown", escape); };
  }, [anchorRef]);
  // The composer can move after collision resolution without a window resize.
  // The primitive equality check makes this settle after one placement update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!panel.current || !anchorRef.current) return;
    const next = canvasPopoverPlacement(anchorRef.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, panel.current.scrollHeight + 2);
    setPlacement(old => old && Object.keys(next).every(key => old[key as keyof PopoverPlacement] === next[key as keyof PopoverPlacement]) ? old : next);
  });
  return createPortal(<div className={`fixed inset-0 z-[200] ${light ? "canvas-ui-light" : "canvas-ui-dark"}`} onClick={onClose} onWheel={event => event.stopPropagation()}>
    <div ref={panel} role="dialog" aria-label="比例与分辨率" data-testid="canvas-generation-parameters"
      onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
      style={placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight } : { width: 336, visibility: "hidden" }}
      className="canvas-ui-surface fixed overflow-y-auto overscroll-contain rounded-2xl border p-4">
      {children}
    </div>
  </div>, document.body);
}
