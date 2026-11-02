import { browserRandomUUID } from '../browser-crypto';

/** Allocate only on an explicit Generate action. Recovery keeps this identity;
 * changing a prompt alone neither allocates a purchase nor replaces a receipt. */
export function newCanvasImageAttempt(nodeId: string) {
  return `node:${nodeId}:attempt:${browserRandomUUID()}`;
}

type PendingImageDraft = {
  id: string; x: number; y: number; parentId: string | null;
  linked: boolean; label: string; inputs: string[];
};

/** A second run owns a new placeholder. Never copy a paid job, failure, lease,
 * cancellation flag or progress from the first run into the new draft. */
export function forkPendingImageDraft(source: PendingImageDraft, id: string, position: { x: number; y: number }) {
  return { id, ...position, parentId: source.parentId, linked: source.linked,
    label: source.label, inputs: [...source.inputs], uploading: false, progress: 0 };
}
