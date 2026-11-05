/** Process-local promise ownership, not a queue or a replacement for DB leases.
 * A scanner tick can finish before a claimed original job's callback does. */
const key=Symbol.for("naumi.worker.inflight.v1");
const host=globalThis as typeof globalThis & {[key]?:Set<Promise<unknown>>};
const pending=host[key]??(host[key]=new Set());

export function trackBackgroundWork<T>(work:Promise<T>):Promise<T>{
 const tracked=work.finally(()=>pending.delete(tracked));pending.add(tracked);return tracked;
}
export const backgroundWorkCount=()=>pending.size;
export async function waitForBackgroundWork(){
 // A running parent can register another original child while being awaited.
 while(pending.size)await Promise.allSettled([...pending]);
}
