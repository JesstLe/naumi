/** A display-only label. Values are existing original-image metadata, never
 * canvas bounds or preview-thumbnail dimensions. No media reads or I/O. */
export function ImagePixelSize({width,height}:{width?:number|null;height?:number|null}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width! <= 0 || height! <= 0) return null;
  const label = `${width} × ${height}`;
  return <span data-testid="image-pixel-size" aria-label={`原图像素 ${label}`}
    className="pointer-events-none shrink-0 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums canvas-ui-muted">
    {label}
  </span>;
}
