"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Scissors } from "lucide-react";
import { createEdgeHoverController, type EdgeHoverPoint } from "@/lib/canvas/edge-hover";

export type CanvasEdgeHoverHandle = { show(point: EdgeHoverPoint): void; clear(): void };

/** Purely decorative: selection, edge hit areas and deletion remain React Flow's
 * existing handlers. No scene state, persisted coordinate or media is changed. */
export const CanvasEdgeHoverHint = forwardRef<CanvasEdgeHoverHandle>(function CanvasEdgeHoverHint(_, forwarded) {
  const element = useRef<HTMLDivElement>(null);
  const controller = useMemo(() => createEdgeHoverController(point => {
    const hint = element.current;
    if (!hint) return;
    hint.style.display = point ? "" : "none";
    if (point) { hint.style.left = point.x + "px"; hint.style.top = point.y + "px"; }
  }, callback => requestAnimationFrame(callback), id => cancelAnimationFrame(id)), []);
  useImperativeHandle(forwarded, () => controller, [controller]);
  useEffect(() => () => controller.clear(), [controller]);
  return <div ref={element} data-testid="canvas-edge-hover-hint" aria-hidden="true"
    className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ display: "none" }}>
    <span className="canvas-ui-surface flex h-8 w-8 items-center justify-center rounded-full border shadow-lg backdrop-blur">
      <Scissors className="h-4 w-4" />
    </span>
  </div>;
});
