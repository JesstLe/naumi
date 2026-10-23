/** Geometry only: callers supply the eligible selection and own persistence/history. */
export type SelectionLayoutNode = Readonly<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type SelectionLayoutAction =
  | "left" | "centerX" | "right"
  | "top" | "centerY" | "bottom"
  | "distributeX" | "distributeY";

export type SelectionLayoutPoint = { x: number; y: number };
export type SelectionLayoutMove = {
  id: string;
  from: SelectionLayoutPoint;
  to: SelectionLayoutPoint;
};

function validGeometry(node: SelectionLayoutNode): boolean {
  return Number.isFinite(node.x) && Number.isFinite(node.y)
    && Number.isFinite(node.width) && node.width > 0
    && Number.isFinite(node.height) && node.height > 0;
}

function finiteBounds(node: SelectionLayoutNode): boolean {
  return Number.isFinite(node.x + node.width) && Number.isFinite(node.y + node.height);
}

// One billionth of a canvas unit suppresses roundoff without scale-relative drift.
function unchanged(from: number, to: number): boolean {
  return from === to || Math.abs(from - to) <= 1e-9;
}

/**
 * Align to the selection bounds, or equalize edge-to-edge gaps along one axis.
 * Alignment needs two valid nodes; distribution needs three. Distribution fixes
 * the first and last leading-edge-sorted nodes, with input order breaking ties.
 * Negative gaps are intentional when the selection overlaps, including cases that
 * reorder the leading edges. Results retain input order and omit unchanged nodes.
 * Invalid geometry is skipped; duplicate IDs throw
 * even on invalid nodes. An unrepresentable layout returns no partial movement.
 * Input objects, dimensions and the untouched axis are never changed.
 */
export function arrangeCanvasSelection(
  input: readonly SelectionLayoutNode[],
  action: SelectionLayoutAction,
): SelectionLayoutMove[] {
  const ids = new Set<string>();
  const nodes: SelectionLayoutNode[] = [];
  for (const node of input) {
    if (ids.has(node.id)) throw new Error(`Duplicate selection layout id: ${JSON.stringify(node.id)}`);
    ids.add(node.id);
    if (validGeometry(node)) nodes.push(node);
  }

  const distribution = action === "distributeX" || action === "distributeY";
  if (nodes.length < (distribution ? 3 : 2)) return [];
  if (nodes.some(node => !finiteBounds(node))) return [];
  const targets = new Map<string, SelectionLayoutPoint>();

  if (distribution) {
    const axis = action === "distributeX" ? "x" : "y";
    const size = axis === "x" ? "width" : "height";
    const sorted = nodes.map((node, index) => ({ node, index })).sort((a, b) =>
      a.node[axis] - b.node[axis] || a.index - b.index,
    ).map(({ node }) => node);
    const first = sorted[0], last = sorted[sorted.length - 1];
    const occupied = sorted.slice(0, -1).reduce((sum, node) => sum + node[size], 0);
    const gap = (last[axis] - first[axis] - occupied) / (sorted.length - 1);
    if (!Number.isFinite(gap)) return [];
    let offset = first[size];
    for (let index = 1; index < sorted.length - 1; index++) {
      const node = sorted[index];
      targets.set(node.id, { x: node.x, y: node.y, [axis]: first[axis] + offset + gap * index });
      offset += node[size];
    }
  } else {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const node of nodes) {
      left = Math.min(left, node.x);
      right = Math.max(right, node.x + node.width);
      top = Math.min(top, node.y);
      bottom = Math.max(bottom, node.y + node.height);
    }
    for (const node of nodes) {
      let x = node.x, y = node.y;
      switch (action) {
        case "left": x = left; break;
        case "centerX": x = left / 2 + right / 2 - node.width / 2; break;
        case "right": x = right - node.width; break;
        case "top": y = top; break;
        case "centerY": y = top / 2 + bottom / 2 - node.height / 2; break;
        case "bottom": y = bottom - node.height; break;
        default: throw new RangeError(`Unknown selection layout action: ${action}`);
      }
      targets.set(node.id, { x, y });
    }
  }

  const moves: SelectionLayoutMove[] = [];
  for (const node of nodes) {
    const target = targets.get(node.id);
    if (!target) continue;
    const proposed = { ...node, ...target };
    if (!validGeometry(proposed) || !finiteBounds(proposed)) return [];
    const x = unchanged(node.x, target.x) ? node.x : target.x;
    const y = unchanged(node.y, target.y) ? node.y : target.y;
    if (x !== node.x || y !== node.y) {
      moves.push({ id: node.id, from: { x: node.x, y: node.y }, to: { x, y } });
    }
  }
  return moves;
}
