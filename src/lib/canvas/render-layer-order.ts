export type PaintBox = { left: number; top: number; right: number; bottom: number };
export type BackgroundPaint = { box: PaintBox; borderOnly?: boolean; title?: PaintBox };
const intersects = (a: PaintBox, b: PaintBox) => a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
const inside = (a: PaintBox, b: PaintBox, inset: number) => a.left > b.left + inset && a.right < b.right - inset && a.top > b.top + inset && a.bottom < b.bottom - inset;
const finite = (box: PaintBox) => Object.values(box).every(Number.isFinite) && box.right >= box.left && box.bottom >= box.top;

/** Promotion changes the nodes container's stacking context. Permit it only if
 * no negative-layer painted area can overlap an edge's painted bounds. Groups
 * have transparent interiors, so interior edges retain exactly the same pixels.
 * Conservative rectangle bounds may disable optimization, never omit content. */
export function canCompositeCanvasLayers(background: BackgroundPaint[], edges: PaintBox[], borderInset = 1) {
  if (!Number.isFinite(borderInset) || borderInset < 0 ||
      background.some(paint => !finite(paint.box) || paint.title && !finite(paint.title)) || edges.some(box => !finite(box))) return false;
  for (const paint of background) for (const edge of edges) {
    if (paint.title && intersects(paint.title, edge)) return false;
    if (intersects(paint.box, edge) && (!paint.borderOnly || !inside(edge, paint.box, borderInset))) return false;
  }
  return true;
}
