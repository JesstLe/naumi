import { browserRandomUUID } from '../browser-crypto';

type ImageAttemptTask = {
  id: string; sourceId: string; operationKey: string; replaceNode?: boolean;
  displaySuperseded?: boolean; failure?: {kind:string}; onRetry?: () => unknown;
};

/** Task ownership/recovery and the current node's display are separate. A new
 * explicit replacement supersedes the old display, never its accepted receipt.
 * Retrying an old operation keeps its original superseded display state. */
export function beginCanvasImageAttemptTasks<T extends ImageAttemptTask>(tasks:T[], created:T[]):T[] {
  const replacements=created.filter(task=>task.replaceNode);
  const prior=new Map(tasks.map(task=>[task.operationKey,task]));
  const newSources=new Set(replacements.filter(task=>!prior.has(task.operationKey)).map(task=>task.sourceId));
  const replacingKeys=new Set(created.map(task=>task.operationKey));
  return [
    ...tasks.filter(task=>!(replacingKeys.has(task.operationKey)&&task.failure)).map(task=>
      task.replaceNode&&newSources.has(task.sourceId)?{...task,displaySuperseded:true}:task),
    ...created.map(task=>prior.get(task.operationKey)?.displaySuperseded?{...task,displaySuperseded:true}:task),
  ];
}

export function projectCanvasImageAttempts<T extends ImageAttemptTask>(tasks:T[], sourceId:string) {
  const attempts=tasks.filter(task=>task.replaceNode&&task.sourceId===sourceId);
  return {
    current:attempts.filter(task=>!task.displaySuperseded).at(-1),
    recoverable:attempts.filter(task=>task.failure&&task.failure.kind!=='not-started'&&task.onRetry),
  };
}

export function canvasImageSubmissionKey(account:string,workspace:string,project:string|null,nodeId:string) {
  return JSON.stringify([account,workspace,project,nodeId]);
}

/** Parent-owned single flight covers draft saving before a task exists. ACK
 * releases only this submission; an old finally cannot release a newer one. */
export function beginCanvasImageSubmission(locks:Map<string,symbol>,key:string) {
  if(locks.has(key))return null;
  const token=Symbol('canvas-image-submission');locks.set(key,token);
  return ()=>{if(locks.get(key)!==token)return false;locks.delete(key);return true;};
}

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
