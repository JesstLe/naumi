/** Bound active jobs across all App replicas. Excess work stays in PostgreSQL,
 * not thousands of image buffers or provider-wait timers in the Web process.
 * Parent orchestration and paid children have separate lanes to avoid deadlock. */
export const IMAGE_JOB_KINDS = ["generate", "suite", "aplus", "imagegen"] as const;
export type QueueKind = typeof IMAGE_JOB_KINDS[number];
const defaults:Record<QueueKind,number>={generate:16,suite:4,aplus:4,imagegen:16};
export function imageJobConcurrency(kind:QueueKind) {
  const raw=process.env[`NAUMI_IMAGE_JOB_CONCURRENCY_${kind.toUpperCase()}`];
  if(!raw)return defaults[kind];
  const value=Number(raw);
  return Number.isInteger(value)&&value>=1&&value<=256?value:defaults[kind];
}
/** Every dispatch failure is isolated; one old/unreachable task cannot starve
 * unrelated users behind it. No retries are performed inside this scan. */
export async function dispatchImageQueue<T>(items:T[],send:(item:T)=>Promise<boolean>,onError:(error:unknown)=>void,concurrency=4) {
  let cursor=0,count=0;
  await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,Math.min(8,concurrency)))},async()=>{
    while(cursor<items.length){const item=items[cursor++];try{if(await send(item))count++;}catch(error){onError(error);}}
  }));
  return count;
}
