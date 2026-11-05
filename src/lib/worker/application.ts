import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {initializeApplicationPersistence} from "../application/persistence";
import {releaseIdentity,releaseRuntimeEnabled} from "../release-runtime/identity";
import {ensureReleaseSchema,releasePool,releaseStatus} from "../release-runtime/store";
import {createWorkerTickReceiptStore,runReceiptedWorkerTick,type TickIdentity,type TickWebIdentity} from "../release-runtime/worker-tick-receipts";
import {closeImageCoordinationPool} from "../imagegen/coordination-pool";
import {closeVideoCoordinationPool} from "../video/coordination-pool";
import {scanApplicationWorkerOnce} from "./scan";
import {backgroundWorkCount,waitForBackgroundWork} from "./inflight";
import {listenForApplicationWork} from "./wakeup";

type LocalTick={id:string;workerInstanceId:string;workerBootId:string;workerCommit:string;targetWebInstanceId:string};
/** Same durable receipt schema/protocol. Its legacy `web` field names the actual
 * execution host: in this mode that is this Worker, never an impersonated Web. */
export async function createDirectWorkerApplication(){
 if(!dbEnabled||!releaseRuntimeEnabled())throw Error("DIRECT_WORKER_DATABASE_AND_RELEASE_RUNTIME_REQUIRED");
 const identity:TickWebIdentity={...releaseIdentity()};
 const receiptStore=createWorkerTickReceiptStore(getPool());let closed=false,closing:Promise<void>|undefined;
 let listener:Awaited<ReturnType<typeof listenForApplicationWork>>|undefined;
 let listening:Promise<void>|undefined;
 let wakeVersion=0,signalWake:(()=>void)|undefined,canClaim=()=>true,scanIntervalMs=15000;
 const close=()=>closing??(closing=(async()=>{
  closed=true;await listening;await listener?.close();await waitForBackgroundWork();
  const results=await Promise.allSettled([closeImageCoordinationPool(),closeVideoCoordinationPool(),getPool().end(),releasePool().end()]);
  if(results.some(r=>r.status==="rejected"))throw Error("DIRECT_WORKER_POOL_CLOSE_FAILED");
 })());
 try{
  // Only persistence, not Web's management/discovery setup or any scanner.
  await initializeApplicationPersistence();await ensureReleaseSchema();await releaseStatus();
 }catch(error){await close().catch(()=>{});throw error;}
 const input=(tick:LocalTick):TickIdentity=>({tickId:tick.id,workerInstanceId:tick.workerInstanceId,workerBootId:tick.workerBootId,workerCommit:tick.workerCommit,targetWebInstanceId:tick.targetWebInstanceId});
 const response=(receipt:Awaited<ReturnType<typeof receiptStore.read>>,duplicate?:boolean)=>{
  const complete=receipt.phase==="completed";
  return {ok:complete,status:complete?200:202,json:async()=>({ok:complete,receipt,server:{...identity,role:"worker"},...(duplicate===undefined?{}:{duplicate})})};
 };
 return {
  mode:"direct" as const,identity,
  snapshot:()=>({executorRole:"worker",backgroundTasks:backgroundWorkCount(),wakeupConnected:listener?.connected()===true}),
  listen(onWake:()=>void,allowed:()=>boolean,intervalMs:number){return listening??(listening=(async()=>{
   if(closed)return;canClaim=allowed;scanIntervalMs=intervalMs;
   listener=await listenForApplicationWork(()=>{wakeVersion++;signalWake?.();onWake();});if(closed)await listener.close();
  })());},
  async dispatch(tick:LocalTick){
   if(closed)throw Error("DIRECT_WORKER_CLOSED");
   const result=await runReceiptedWorkerTick(receiptStore,input(tick),identity,async()=>{
    let seen=wakeVersion;const summary=await scanApplicationWorkerOnce();
    // A slow paid callback must not stall later users until the whole tick
    // finishes. Hints extend this SAME receipted tick, through original DB lanes.
    // Drain/parent gating stops extra scans, never the already-claimed callbacks.
    while(backgroundWorkCount()||canClaim()&&seen!==wakeVersion){
     if(canClaim()&&seen!==wakeVersion){
      seen=wakeVersion;const next=await scanApplicationWorkerOnce();
      for(const key of ["processed","mediaProcessed","generationProcessed","supplierCostsProcessed","mediaSaved","videoProcessed","imageProcessed"] as const)summary[key]+=next[key];
      for(const [name,elapsed] of Object.entries(next.phasesMs))summary.phasesMs[name]=(summary.phasesMs[name]||0)+elapsed;
      summary.durationMs+=next.durationMs;summary.mediaRecovery=next.mediaRecovery;
      summary.at=next.at;continue;
     }
     if(!backgroundWorkCount())break;
     let timer:ReturnType<typeof setTimeout>|undefined;
     const wake=new Promise<void>(resolve=>{signalWake=resolve;timer=setTimeout(()=>{wakeVersion++;resolve();},scanIntervalMs);});
     try{await Promise.race([waitForBackgroundWork(),wake]);}finally{signalWake=undefined;clearTimeout(timer);}
    }
    // A completed receipt means the claimed local callbacks actually settled,
    // not merely that an HTTP kick or the scan's outer promise returned.
    await waitForBackgroundWork();const status=await releaseStatus();
    if(status.observations.unknownLeases||status.observations.trackedAcceptedWork)throw Error("DIRECT_WORKER_BACKGROUND_OUTCOME_UNKNOWN");
    return summary;
   });return response(result.receipt,result.duplicate);
  },
  async read(tick:LocalTick){if(closed)throw Error("DIRECT_WORKER_CLOSED");return response(await receiptStore.read(input(tick),identity));},
  async drain(){await waitForBackgroundWork();const status=await releaseStatus();return status.observations.trackedAcceptedWork===0&&status.observations.unknownLeases===0;},
  close,
 };
}
