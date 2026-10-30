/** Visual groups project the existing canvasGroupId; they never become saved nodes. */
export type CanvasGroupPoint = { x: number; y: number };
export type CanvasGroupMove = { id: string; from: CanvasGroupPoint; to: CanvasGroupPoint };
export type CanvasGroupMember = {
  id: string;
  type?: string;
  position: CanvasGroupPoint;
  measured?: { width?: number; height?: number };
  style?: { width?: string | number; height?: string | number };
  selected?: boolean;
  draggable?: boolean;
  data: { canvasGroupId?: unknown; width?: unknown; height?: unknown };
};
export type CanvasGroupFrame = {
  id: string;
  members: CanvasGroupMember[];
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  draggable: boolean;
};

// Node layer order is bounded to -100000..100000. Group panels always sit below it.
export const CANVAS_GROUP_LAYER_ORDER = -100001;

export function canvasGroupFrames(nodes: readonly CanvasGroupMember[]): CanvasGroupFrame[] {
  const groups = new Map<string, CanvasGroupMember[]>();
  for (const node of nodes) {
    const id = node.data.canvasGroupId;
    if (node.type !== "art" || typeof id !== "string" || !id || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) continue;
    const members = groups.get(id) ?? [];
    members.push(node);
    groups.set(id, members);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).flatMap(([id, members]) => {
    if (members.length < 2) return [];
    const size = (node: CanvasGroupMember, axis: "width" | "height") => {
      const value = Number(node.measured?.[axis] ?? node.style?.[axis] ?? node.data[axis]);
      return Number.isFinite(value) && value > 0 ? value : axis === "width" ? 320 : 240;
    };
    const left = Math.min(...members.map(node => node.position.x));
    const top = Math.min(...members.map(node => node.position.y));
    const right = Math.max(...members.map(node => node.position.x + size(node, "width")));
    const bottom = Math.max(...members.map(node => node.position.y + size(node, "height")));
    return [{ id, members, x: left - 28, y: top - 76, width: right - left + 56, height: bottom - top + 104,
      selected: members.every(node => node.selected), draggable: members.every(node => node.draggable !== false) }];
  });
}

/** Positions come from one pointer-down snapshot; no cumulative drift or double move. */
export function canvasGroupMoves(starts: readonly { id: string; position: CanvasGroupPoint }[], delta: CanvasGroupPoint, snap = false): CanvasGroupMove[] {
  if (!starts.length || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return [];
  const anchor = starts[0].position;
  const dx = snap ? Math.round((anchor.x + delta.x) / 16) * 16 - anchor.x : delta.x;
  const dy = snap ? Math.round((anchor.y + delta.y) / 16) * 16 - anchor.y : delta.y;
  return starts.map(node => ({ id: node.id, from: { ...node.position }, to: { x: node.position.x + dx, y: node.position.y + dy } }));
}
