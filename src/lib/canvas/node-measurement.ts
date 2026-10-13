/** Virtualized nodes cannot wait for offscreen DOM measurement to enter fitView.
 * Only seed a box that the renderer already explicitly fixes in numeric pixels.
 * Real ResizeObserver measurements still take precedence; auto-sized nodes keep
 * React Flow's normal measurement path. No content/coordinates are changed. */
export function knownCanvasNodeMeasurement(style: { width?: unknown; height?: unknown } | undefined) {
  const width = style?.width, height = style?.height;
  if (typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { width, height };
}
