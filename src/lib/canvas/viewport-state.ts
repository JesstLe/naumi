export type CanvasViewport = { x: number; y: number; zoom: number };

/** React state only feeds the zoom input/HUD. Full coordinates and live Dock
 * geometry are kept separately, and must still follow every move and its end. */
export function canvasZoomState(previous: CanvasViewport, next: CanvasViewport) {
  return previous.zoom === next.zoom ? previous : next;
}
