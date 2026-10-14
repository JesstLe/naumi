import type { CanvasVideoNode } from '../canvas/video-node-schema';

/** Compare public JSON snapshots without dropping transient status, URLs,
 * ordered references, locked state or nested settings. Poll intervals and
 * authoritative requests stay unchanged; identical results need no repaint. */
export function sameVideoSnapshot(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameVideoSnapshot(value, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameVideoSnapshot(left[key], right[key]));
}

export function mergeVideoNodeSnapshots(previous: CanvasVideoNode[], incoming: CanvasVideoNode[]) {
  const nodes = new Map(previous.map(node => [node.id, node])); let changed = false;
  for (const node of incoming) {
    const old = nodes.get(node.id);
    if (old && node.revision < old.revision) continue;
    if (!old || !sameVideoSnapshot(old, node)) { nodes.set(node.id, node); changed = true; }
  }
  return changed ? [...nodes.values()] : previous;
}

export function reuseVideoTaskSnapshots<T extends { id: string }>(previous: T[], incoming: T[]) {
  const byId = new Map(previous.map(task => [task.id, task]));
  const next = incoming.map(task => { const old = byId.get(task.id); return old && sameVideoSnapshot(old, task) ? old : task; });
  return previous.length === next.length && next.every((task, i) => task === previous[i]) ? previous : next;
}
