import {explicitCanvasParent} from "./input-references";
import type {Artwork} from "../mock-data";
/** Explicit attachments take precedence over inherited ancestors; keep the anchor first. */
export const MAX_ASSISTANT_IMAGES = 5;
export function assistantReferences<T extends { id: string }>(
  inherited: T[], attached: T[], excluded: string[] = [],
): T[] {
  const hidden = new Set(excluded), seen = new Set<string>();
  return [...inherited.slice(0, 1), ...attached, ...inherited.slice(1)]
    .filter(image => !hidden.has(image.id) && !seen.has(image.id) && !!seen.add(image.id))
    .slice(0, MAX_ASSISTANT_IMAGES);
}

export function assistantAttachmentCapacity(referenceIds: string[]) {
  return Math.max(0, MAX_ASSISTANT_IMAGES - new Set(referenceIds).size);
}

export function assistantContext(members: Artwork[], anchorId: string): Artwork[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const anchor = byId.get(anchorId);
  if (!anchor) return [];
  const parentsOf = (m: Artwork): string[] => {
    const ps = new Set<string>();
    if (m.parentId && byId.has(m.parentId) && explicitCanvasParent(m, m.parentId)) ps.add(m.parentId);
    for (const pid of m.parentIds ?? [])
      if (pid && byId.has(pid)) ps.add(pid);
    return [...ps];
  };
  const out: Artwork[] = [anchor];
  const seen = new Set([anchorId]);
  const queue: string[] = [anchorId];
  let guard = 0;
  while (queue.length && out.length < 5 && guard++ < 2000) {
    const id = queue.shift() as string;
    const m = byId.get(id);
    if (!m) continue;
    for (const p of parentsOf(m)) {
      if (seen.has(p)) continue;
      seen.add(p);
      const art = byId.get(p);
      if (art) out.push(art);
      queue.push(p);
      if (out.length >= 5) break;
    }
  }
  return out.slice(0, 5);
}
