import "server-only";
import type { Pool, PoolClient } from "pg";
import { ModelConfigError } from "./types";
/** Concurrency for model-management mutations: one in-process turn per pool plus a
 * cross-process advisory lock per operation id that never parks a pool connection. */
type ManagementMutationTurn={held:boolean;waiters:Array<{grant():void}>};
const managementMutationKey=Symbol.for("naumi.model-management.mutation-turns.v1");
const managementHost=globalThis as typeof globalThis&{[managementMutationKey]?:WeakMap<Pool,ManagementMutationTurn>};
const managementMutationTurns=managementHost[managementMutationKey]??(managementHost[managementMutationKey]=new WeakMap<Pool,ManagementMutationTurn>());
const managementBusy=()=>new ModelConfigError("PUBLICATION_LOCK_PENDING","模型设置正在发布，请使用同一操作稍后重试",409);
export function acquireManagementMutationTurn(pool:Pool,signal:AbortSignal,deadline:number):Promise<()=>void>{
  if(signal.aborted||Date.now()>=deadline)return Promise.reject(managementBusy());
  const state=managementMutationTurns.get(pool)??{held:false,waiters:[]};managementMutationTurns.set(pool,state);
  return new Promise((resolve,reject)=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const cleanup=()=>{if(timer)clearTimeout(timer);signal.removeEventListener("abort",cancel);};
    const cancel=()=>{const index=state.waiters.indexOf(waiter);if(index<0)return;state.waiters.splice(index,1);cleanup();reject(managementBusy());};
    const advance=()=>{const next=state.waiters.shift();if(next)next.grant();else{state.held=false;managementMutationTurns.delete(pool);}};
    const waiter={grant(){
      cleanup();if(signal.aborted||Date.now()>=deadline){reject(managementBusy());advance();return;}state.held=true;let released=false;
      resolve(()=>{if(released)return;released=true;advance();});
    }};
    if(!state.held){waiter.grant();return;}
    state.waiters.push(waiter);signal.addEventListener("abort",cancel,{once:true});timer=setTimeout(cancel,Math.max(0,deadline-Date.now()));
  });
}
function managementLockClient(pool:Pool,signal:AbortSignal,deadline:number):Promise<PoolClient>{
  return new Promise((resolve,reject)=>{
    let settled=false;const cleanup=()=>{clearTimeout(timer);signal.removeEventListener("abort",cancel);};
    const cancel=()=>{if(settled)return;settled=true;cleanup();reject(managementBusy());};
    const timer=setTimeout(cancel,Math.max(0,deadline-Date.now()));signal.addEventListener("abort",cancel,{once:true});
    pool.connect().then(client=>{if(settled){client.release();return;}settled=true;cleanup();resolve(client);},error=>{if(settled)return;settled=true;cleanup();reject(error);});
  });
}
export async function acquireManagementLock(pool:Pool,key:string,signal:AbortSignal,deadline:number):Promise<PoolClient>{
  // The publication owner needs further repository connections. Waiting on a
  // blocking session lock would let duplicate requests consume the entire
  // business pool before the owner can stage or activate its publication.
  // Keep the cross-process lock, but never retain a connection as a waiter.
  for(;;){
    if(signal.aborted||Date.now()>=deadline)throw managementBusy();
    const client=await managementLockClient(pool,signal,deadline);
    try{
      const result=await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",[key]);
      if(result.rows[0]?.acquired){
        if(!signal.aborted&&Date.now()<deadline)return client;
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[key]);
      }
    }catch(error){client.release(true);throw error;}
    client.release();
    await new Promise(resolve=>setTimeout(resolve,25));
  }
}
