export type EdgeHoverPoint = { x: number; y: number };

/** A decorative cursor hint must not update the controlled graph on every
 * pointer event. Keep the newest point, with at most one DOM write per frame.
 * A cleared hint cannot be resurrected by a previously queued callback. */
export function createEdgeHoverController(
  paint: (point: EdgeHoverPoint | null) => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (id: number) => void,
) {
  let pending: EdgeHoverPoint | null = null;
  let frame: number | null = null;
  let generation = 0;
  return {
    show(point: EdgeHoverPoint) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      pending = point;
      if (frame !== null) return;
      const token = generation;
      frame = requestFrame(() => {
        if (token !== generation) return;
        frame = null;
        paint(pending);
      });
    },
    clear() {
      generation++;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pending = null;
      paint(null);
    },
  };
}
