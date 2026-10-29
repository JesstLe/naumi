import { createPlacementSpace } from "./placement-space";

export type CanvasPoint = { x: number; y: number };
type PlacementNode = { id: string; parentId?: string | null; source?: string | null; canvasX?: number | null; canvasY?: number | null; width: number; height: number };
const validPoint = (p: CanvasPoint | undefined): p is CanvasPoint => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Allocate only new nodes. Existing saved/session positions are never arranged. */
export function stableArtworkPositions(nodes: PlacementNode[], cache: Map<string, CanvasPoint>) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    if (typeof node.canvasX === "number" && typeof node.canvasY === "number" && Number.isFinite(node.canvasX) && Number.isFinite(node.canvasY)) cache.set(node.id, { x: node.canvasX, y: node.canvasY });
    else if (!validPoint(cache.get(node.id))) cache.delete(node.id);
  }
  const pending = nodes.filter(node => !cache.has(node.id));
  if (!pending.length) return cache;
  const space = createPlacementSpace(nodes.filter(node => cache.has(node.id)).map(node => ({ ...cache.get(node.id)!, width: node.width, height: node.height })));
  while (pending.length) {
    let index = pending.findIndex(node => !node.parentId || node.source === "canvas-add" || !byId.has(node.parentId) || cache.has(node.parentId));
    if (index < 0) index = 0;
    const [node] = pending.splice(index, 1);
    const parent = node.source !== "canvas-add" && node.parentId ? byId.get(node.parentId) : undefined;
    const anchor = parent && cache.get(parent.id);
    const preferred = parent && anchor ? { x: anchor.x + parent.width + 96, y: anchor.y } : { x: 0, y: 0 };
    const position = space.place(preferred, node);
    cache.set(node.id, position); space.add({ ...position, width: node.width, height: node.height });
  }
  return cache;
}

/** A progress/data refresh cannot override a node currently following the pointer. */
export function canvasNodePosition<T extends { position: CanvasPoint; dragging?: boolean }>(incoming: T, live?: T) {
  return live?.dragging ? { position: live.position, dragging: true } : { position: incoming.position };
}

export function readPlacementCache(raw: string | null): Map<string, CanvasPoint> {
  try {
    const values: unknown = JSON.parse(raw || "null");
    if (!Array.isArray(values)) return new Map();
    return new Map(values.slice(-4000).flatMap(entry => Array.isArray(entry) && typeof entry[0] === "string" && validPoint(entry[1]) ? [[entry[0], { x: entry[1].x, y: entry[1].y }] as [string, CanvasPoint]] : []));
  } catch { return new Map(); }
}
