export type DockPlacement = { left: number; top: number; width: number; maxHeight?: number };
export type ToolbarPlacement = { left: number; top: number };

/** Resolve both overlays together, including the bottom-sheet fallback. Dimensions
 * are CSS border-box pixels; the toolbar left remains its translated center. */
export function separateCanvasDocks(input: {
  dock: DockPlacement; toolbar: ToolbarPlacement;
  dockHeight: number; toolbarHeight: number;
  safeTop: number; safeBottom: number;
}): { dock: DockPlacement; toolbar: ToolbarPlacement } {
  const gap = 12;
  const safeTop = input.safeTop;
  const safeBottom = Math.max(safeTop + 1, input.safeBottom);
  const toolbarHeight = Math.min(input.toolbarHeight, Math.max(1, safeBottom - safeTop - gap));
  const maxHeight = Math.max(1, Math.min(input.dock.maxHeight ?? input.dockHeight, safeBottom - safeTop - toolbarHeight - gap));
  const dockHeight = Math.min(input.dockHeight, maxHeight);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
  const dock = { ...input.dock, maxHeight, top: clamp(input.dock.top, safeTop, safeBottom - dockHeight) };
  const toolbar = { ...input.toolbar, top: clamp(input.toolbar.top, safeTop, safeBottom - toolbarHeight) };
  if (dock.top + dockHeight + gap <= toolbar.top || toolbar.top + toolbarHeight + gap <= dock.top) return { dock, toolbar };

  const above = toolbar.top - gap - dockHeight;
  const below = toolbar.top + toolbarHeight + gap;
  if (above >= safeTop && (below + dockHeight > safeBottom || Math.abs(above - dock.top) <= Math.abs(below - dock.top))) {
    dock.top = above;
  } else if (below + dockHeight <= safeBottom) {
    dock.top = below;
  } else {
    // Neither side fits: place the action bar and a scrollable composer as one
    // stack. Never leave the composer footer underneath a higher-z-index bar.
    toolbar.top = safeTop;
    dock.top = safeTop + toolbarHeight + gap;
  }
  return { dock, toolbar };
}
