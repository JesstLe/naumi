import "server-only";
import type {Pool} from "pg";

type Readiness={pending?:Promise<void>|null};
const key=Symbol.for("naumi.db.schema-readiness.v1");
const host=globalThis as typeof globalThis & {[key]?:WeakMap<Pool,Map<string,Readiness>>};
const pools=host[key]??(host[key]=new WeakMap());

/** Next compiles instrumentation and routes into separate module caches. Share
 * only readiness, keyed by the actual pool and domain owner. SQL, transactions
 * and failure/retry semantics remain with that owner. No connection is opened. */
export function databaseSchemaReadiness(pool:Pool,owner:string):Readiness{
 let owners=pools.get(pool);if(!owners){owners=new Map();pools.set(pool,owners);}
 let state=owners.get(owner);if(!state){state={};owners.set(owner,state);}
 return state;
}
