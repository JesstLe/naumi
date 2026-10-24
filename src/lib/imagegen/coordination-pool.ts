import "server-only";
import {Pool} from "pg";
import {getPool} from "@/platform/db/pool";

// A coordinator holds a cancellation/batch lock while domain code uses the
// normal query pool. Sharing that pool lets N coordinators occupy all N
// connections and then wait forever for their own nested reads/writes.
// This small, process-shared pool is for those locking transactions ONLY.
const key=Symbol.for("naumi.imagegen.coordination-pools.v1");
const registry=globalThis as typeof globalThis & {[key]?:WeakMap<Pool,Pool>};
const pools=registry[key] ||= new WeakMap<Pool,Pool>();
export function imageCoordinationPool(){
  const queries=getPool();let locks=pools.get(queries);
  if(!locks){
    locks=new Pool({...queries.options,max:4,allowExitOnIdle:true,application_name:"naumi-imagegen-coordination"});
    locks.on("error",()=>console.error("[imagegen-coordination] idle database connection lost"));
    pools.set(queries,locks);
  }
  return locks;
}
/** Graceful test/process teardown; never invoked during a live request. */
export async function closeImageCoordinationPool(){const queries=getPool(),locks=pools.get(queries);if(locks){pools.delete(queries);await locks.end();}}
