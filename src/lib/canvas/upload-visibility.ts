type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Insets = { top: number; right: number; bottom: number; left: number };

/** Change only the viewport; never rearrange/persist nodes or wait on offscreen DOM. */
export function canvasFocusViewport(node: Rect, view: Size, insets: Insets, minZoom = 0.01) {
  if (![node.x, node.y, node.width, node.height, view.width, view.height,
    insets.top, insets.right, insets.bottom, insets.left].every(Number.isFinite) ||
    node.width <= 0 || node.height <= 0 || view.width <= 0 || view.height <= 0) return null;
  const left = Math.min(view.width / 3, Math.max(16, insets.left + 24));
  const right = Math.min(view.width / 3, Math.max(16, insets.right + 24));
  const top = Math.min(view.height / 3, Math.max(24, insets.top + 48));
  const bottom = Math.min(view.height / 3, Math.max(24, insets.bottom + 24));
  const width = view.width - left - right, height = view.height - top - bottom;
  const zoom = Math.max(minZoom, Math.min(1, width / (node.width + 64), height / (node.height + 64)));
  return { x: left + width / 2 - (node.x + node.width / 2) * zoom,
    y: top + height / 2 - (node.y + node.height / 2) * zoom, zoom };
}
