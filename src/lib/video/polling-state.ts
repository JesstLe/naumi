import type { CanvasVideoNode } from '../canvas/video-node-schema';

import {sameCanvasNativeSnapshot as sameVideoSnapshot,mergeCanvasNativeSnapshots} from "../canvas/native-node-records";
export {sameVideoSnapshot};
/** Preserve the existing video API while native records own snapshot equality. */
export function mergeVideoNodeSnapshots(previous:CanvasVideoNode[],incoming:CanvasVideoNode[]){return mergeCanvasNativeSnapshots(previous,incoming);}

export function reuseVideoTaskSnapshots<T extends { id: string }>(previous: T[], incoming: T[]) {
  const byId = new Map(previous.map(task => [task.id, task]));
  const next = incoming.map(task => { const old = byId.get(task.id); return old && sameVideoSnapshot(old, task) ? old : task; });
  return previous.length === next.length && next.every((task, i) => task === previous[i]) ? previous : next;
}
