import { ImagegenHttpError } from '../imagegen/http';

export type GenerationFailure = {
  kind: 'not-started' | 'failed' | 'uncertain' | 'sync';
  message: string;
  jobId?: string;
};
export function generationFailureBlocks(failure?: GenerationFailure) {
  return failure?.kind === 'uncertain' || failure?.kind === 'sync';
}
export function generationFailureMessage(failure: GenerationFailure) {
  // A generic transport error may suggest resubmission. Once acceptance is
  // unknown, the UI must only direct the user to the original task instead.
  return generationFailureBlocks(failure)
    ? failure.message.replace(/请刷新页面后重试|请稍后重试|请稍后再试/g, '请稍后检查原任务')
    : failure.message;
}
export function classifyGenerationFailure(error: unknown, context: {
  attempted: boolean; jobId?: string; terminal?: boolean; hasResults?: boolean;
}): GenerationFailure {
  const message = error instanceof Error && error.message ? error.message : '生成未完成，请稍后检查';
  const kind = context.hasResults ? 'sync' : context.terminal ? 'failed'
    : !context.attempted || error instanceof ImagegenHttpError && error.accepted === false ? 'not-started' : 'uncertain';
  return { kind, message, jobId: context.jobId };
}
/** Never treat a swallowed fetch error / stale artwork list as a displayed result. */
export function assertGenerationResultsPresent(ids: string[], artworks: { id: string; image?: string }[]) {
  if (!ids.length || ids.some(id => !artworks.some(art => art.id === id && !!art.image))) {
    throw new Error('结果尚未加载到画布，请检查原任务，不要重复生成');
  }
}
export function generationFailureTitle(failure: GenerationFailure, english = false) {
  const titles = english
    ? { 'not-started': 'Generation did not start', failed: 'Generation failed', uncertain: 'Checking task status', sync: 'Result not yet on canvas' }
    : { 'not-started': '生成未开始', failed: '生成未完成', uncertain: '任务状态待确认', sync: '结果尚未载入画布' };
  return titles[failure.kind];
}
