import { ImagegenHttpError } from '../imagegen/http';

export type GenerationFailure = {
  kind: 'not-started' | 'failed' | 'uncertain' | 'sync';
  message: string;
  jobId?: string;
};
export function generationFailureMessage(failure: GenerationFailure) {
  return /核查|核对|待确认|检查原任务|保留.*任务|不要重复|请勿重复/.test(failure.message)
    ? '本次未取得图片，请重试' : failure.message;
}
export function classifyGenerationFailure(error: unknown, context: {
  attempted: boolean; jobId?: string; terminal?: boolean; hasResults?: boolean;
}): GenerationFailure {
  const message = error instanceof Error && error.message ? error.message : '生成未完成，请稍后检查';
  const kind = context.hasResults ? 'sync' : !context.attempted || error instanceof ImagegenHttpError && error.accepted === false ? 'not-started' : 'failed';
  return { kind, message, jobId: context.jobId };
}
/** Never treat a swallowed fetch error / stale artwork list as a displayed result. */
export function assertGenerationResultsPresent(ids: string[], artworks: { id: string; image?: string }[]) {
  if (!ids.length || ids.some(id => !artworks.some(art => art.id === id && !!art.image))) {
    throw new Error('图片加载失败，请重试');
  }
}
export function generationFailureTitle(failure: GenerationFailure, english = false) {
  const titles = english
    ? { 'not-started': 'Generation did not start', failed: 'Generation failed', uncertain: 'Generation failed', sync: 'Image loading failed' }
    : { 'not-started': '生成未开始', failed: '生成未完成', uncertain: '生成未完成', sync: '图片加载失败' };
  return titles[failure.kind];
}
