import { normalizeCanvasCount } from "./generation-parameters";
import { placeGenerationPreview } from "./generation-feedback";

export type CanvasFanoutSlot = { x: number; y: number; artworkId?: string };
export type CanvasFanoutPlacement = { version: 1; sourceNodeId: string; slots: CanvasFanoutSlot[] };
type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** One frozen request/quote, many visible destinations. Never a canvasTarget. */
export function canvasGenerationDestination(count: unknown) {
  const total = normalizeCanvasCount(count);
  return { count: total, replaceNode: total === 1, fanout: total > 1 };
}

/** Reserve the row as one rectangle so new children stay together without moving existing nodes. */
export function canvasFanoutSlots(sourceNodeId: string, count: number, preferred: Point, size: Size,
  occupied: Array<Point & Size>, gap = 48): CanvasFanoutPlacement {
  const total = normalizeCanvasCount(count);
  const origin = placeGenerationPreview(preferred, { width: size.width * total + gap * (total - 1), height: size.height }, occupied);
  return { version: 1, sourceNodeId, slots: Array.from({ length: total }, (_, index) => ({ x: origin.x + index * (size.width + gap), y: origin.y })) };
}

/** UI-only receipt metadata, not supplier parameters or a new authorization scope. */
export function readCanvasFanoutPlacement(value: unknown, sourceNodeId?: string, count?: number): CanvasFanoutPlacement | undefined {
  if (!value || typeof value !== "object") return;
  const p = value as CanvasFanoutPlacement;
  if (p.version !== 1 || typeof p.sourceNodeId !== "string" || !p.sourceNodeId || sourceNodeId && sourceNodeId !== p.sourceNodeId ||
    !Array.isArray(p.slots) || p.slots.length < 2 || p.slots.length > 4 || count !== undefined && p.slots.length !== count ||
    p.slots.some(s => !s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || s.artworkId !== undefined && (typeof s.artworkId !== "string" || !s.artworkId || s.artworkId === p.sourceNodeId))) return;
  const bound = p.slots.flatMap(s => s.artworkId ? [s.artworkId] : []);
  if (new Set(bound).size !== bound.length) return;
  return { version: 1, sourceNodeId: p.sourceNodeId, slots: p.slots.map(s => ({ x: s.x, y: s.y, ...(s.artworkId ? { artworkId: s.artworkId } : {}) })) };
}

/** First observation binds each saved artwork once; reordered/partial receipts never swap slots. */
export function bindCanvasFanoutResults(placement: CanvasFanoutPlacement, ids: readonly string[]): CanvasFanoutPlacement {
  const copy = readCanvasFanoutPlacement(placement);
  if (!copy) throw new Error("生成位置记录无效，原任务已保留");
  for (const id of new Set(ids)) {
    if (!id || id === copy.sourceNodeId) throw new Error("生成结果与来源节点不匹配");
    if (copy.slots.some(slot => slot.artworkId === id)) continue;
    const empty = copy.slots.find(slot => !slot.artworkId);
    if (!empty) throw new Error("生成结果数量与原任务不匹配");
    empty.artworkId = id;
  }
  return copy;
}

/** Snapshot a live FileList before clearing its input. */
export function pendingUploadFiles(files: FileList | readonly File[] | null): File[] {
  return Array.from(files ?? []);
}
