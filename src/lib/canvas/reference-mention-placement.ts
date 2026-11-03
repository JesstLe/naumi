export type MentionAnchor = { left: number; top: number; bottom: number; width: number };
export type MentionViewport = { width: number; height: number; left?: number; top?: number };
export type MentionPlacement = { left: number; top: number; width: number; maxHeight: number; columns: number; side: 'top' | 'bottom' };

/** The list belongs to the viewport, not to the Dock's scrolling body. */
export function referenceMentionPlacement(anchor: MentionAnchor, viewport: MentionViewport, count: number): MentionPlacement {
  const padding = 8, gap = 6;
  const viewLeft = viewport.left || 0, viewTop = viewport.top || 0;
  const viewWidth = Math.max(1, viewport.width), viewHeight = Math.max(1, viewport.height);
  const availableWidth = Math.max(1, viewWidth - padding * 2);
  const width = Math.min(760, availableWidth, Math.max(360, anchor.width));
  const columns = width >= 620 ? 4 : width >= 440 ? 3 : width >= 300 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(count / columns));
  const wantedHeight = Math.min(320, rows * 66 + Math.max(0, rows - 1) * 6 + 16);
  const safeTop = viewTop + padding, safeBottom = viewTop + viewHeight - padding;
  const anchorTop = Math.max(safeTop, Math.min(anchor.top, safeBottom));
  const anchorBottom = Math.max(anchorTop, Math.min(anchor.bottom, safeBottom));
  const above = Math.max(0, anchorTop - safeTop - gap), below = Math.max(0, safeBottom - anchorBottom - gap);
  const side = below >= wantedHeight || below >= above ? 'bottom' : 'top';
  const maxHeight = Math.max(1, Math.min(wantedHeight, side === 'top' ? above : below));
  const left = Math.max(viewLeft + padding, Math.min(anchor.left, viewLeft + viewWidth - padding - width));
  const top = side === 'top' ? anchorTop - gap - maxHeight : anchorBottom + gap;
  return { left, top: Math.max(safeTop, Math.min(top, safeBottom - maxHeight)), width, maxHeight, columns, side };
}
