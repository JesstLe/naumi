export type PopoverPlacement = { left: number; top: number; width: number; maxHeight: number; side: "above" | "below" };

/** Fit the scroll container to the space beside its anchor, not to the whole viewport. */
export function canvasPopoverPlacement(anchor: { left: number; top: number; bottom: number }, viewport: { width: number; height: number }, contentHeight: number, preferredWidth = 336): PopoverPlacement {
  const margin = 8, gap = 8;
  const width = Math.max(1, Math.min(preferredWidth, viewport.width - margin * 2));
  const above = Math.max(0, anchor.top - gap - margin);
  const below = Math.max(0, viewport.height - margin - anchor.bottom - gap);
  const side = contentHeight <= above || contentHeight > below && above >= below ? "above" : "below";
  const maxHeight = Math.max(1, Math.min(side === "above" ? above : below, viewport.height - margin * 2));
  const height = Math.min(contentHeight, maxHeight);
  const top = side === "above" ? anchor.top - gap - height : anchor.bottom + gap;
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - margin - width)),
    top: Math.max(margin, Math.min(top, viewport.height - margin - height)),
    width, maxHeight, side,
  };
}
