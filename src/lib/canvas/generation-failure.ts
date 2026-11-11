import { ImagegenHttpError } from '../imagegen/http';

export type GenerationFailure = {
  kind: 'not-started' | 'failed' | 'uncertain' | 'sync';
  message: string;
  jobId?: string;
};
export function generationFailureMessage(failure: GenerationFailure) {
  return failure.message;
}
/** A transport status alone is not proof of non-acceptance. In particular,
 * the billing owner uses409 for an accepted/unknown original operation. */
export function canvasGenerationHttpError(status:number,data:Record<string,any>,fallback:string){
  const unknown=['OPERATION_PENDING','OPERATION_CONFLICT'].includes(data.code);
  const rejected=!unknown&&(data.accepted===false||[400,401,402,403,404,413,415,422,429].includes(status));
  return new ImagegenHttpError(typeof data.error==='string'&&data.error?data.error:fallback,status,rejected?false:undefined,typeof data.code==='string'?data.code:undefined);
}
export function classifyGenerationFailure(error: unknown, context: {
  attempted: boolean; jobId?: string; terminal?: boolean; hasResults?: boolean;
}): GenerationFailure {
  const message = error instanceof Error && error.message ? error.message : '生成未完成，请稍后检查';
  const kind = context.hasResults ? 'sync' : !context.attempted || error instanceof ImagegenHttpError && error.accepted === false ? 'not-started' : context.terminal ? 'failed' : 'uncertain';
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
    ? { 'not-started': 'Generation did not start', failed: 'Generation failed', uncertain: 'Task status unconfirmed', sync: 'Image loading failed' }
    : { 'not-started': '生成未开始', failed: '生成未完成', uncertain: '任务待核查', sync: '图片加载失败' };
  return titles[failure.kind];
}
