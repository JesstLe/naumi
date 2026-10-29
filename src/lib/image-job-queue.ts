/** Bound active jobs across all App replicas. Excess work stays in PostgreSQL,
 * not thousands of image buffers or provider-wait timers in the Web process.
 * Parent orchestration and paid children have separate lanes to avoid deadlock. */
import { runtimePositiveInteger } from "./runtime/positive-integer";

export const IMAGE_JOB_KINDS = ["generate", "suite", "aplus", "imagegen"] as const;
export type QueueKind = typeof IMAGE_JOB_KINDS[number];
const defaults:Record<QueueKind,number>={generate:16,suite:4,aplus:4,imagegen:16};
export function imageJobConcurrency(kind:QueueKind) {
  return runtimePositiveInteger(process.env, `NAUMI_IMAGE_JOB_CONCURRENCY_${kind.toUpperCase()}`, defaults[kind], 256);
}
/** HTTP admission fan-out only; the repository's per-kind leases and provider
 * capacity still own paid execution. Increasing the compatible ceiling of eight
 * requires an explicit per-scan dispatch budget, not a silent clamp. */
function dispatchConcurrency(requested?: number) {
  const budget = runtimePositiveInteger(process.env, "NAUMI_IMAGE_DISPATCH_BUDGET", 8);
  const concurrency = requested ?? runtimePositiveInteger(process.env, "NAUMI_IMAGE_DISPATCH_CONCURRENCY", 4);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("INVALID_IMAGE_DISPATCH_CONCURRENCY");
  if (concurrency > budget) throw new Error("IMAGE_DISPATCH_BUDGET_EXCEEDED");
  return concurrency;
}
/** Every dispatch failure is isolated; one old/unreachable task cannot starve
 * unrelated users behind it. No retries are performed inside this scan. */
export async function dispatchImageQueue<T>(items:T[],send:(item:T)=>Promise<boolean>,onError:(error:unknown)=>void,concurrency?:number,options:{signal?:AbortSignal}={}) {
  const slots = dispatchConcurrency(concurrency);
  let cursor=0,count=0;
  await Promise.all(Array.from({length:Math.min(items.length,slots)},async()=>{
    // Cancellation stops new admissions and awaits the original in-flight
    // sends. It never interprets an aborted HTTP response as paid nonacceptance.
    while(cursor<items.length&&!options.signal?.aborted){const item=items[cursor++];try{if(await send(item))count++;}catch(error){onError(error);}}
  }));
  return count;
}
