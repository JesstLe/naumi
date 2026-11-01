import "server-only";
import type {Pool,PoolClient} from "pg";
import type {BillingService} from "../billing/types";
import {getPool} from "@/platform/db/pool";
import {withTransaction} from "@/platform/db/transaction";
import {getBillingRuntime} from "../billing/runtime";
import {refreshApiCostOperation} from "../billing/service";
import {pendingApiCostOperations,requestCanvasRecoveryTx,pendingCanvasRecoveries,canvasRecoveryRequestTx,finishCanvasRecoveryTx} from "../billing/task-recovery";
import {lockImageBillingProjectionTx,markImageBillingSettledTx} from "../image-jobs/billing-projection";
import {requeueStoredCanvasImageTaskTx} from "../canvas/image-task-repository";

export async function refreshTaskApiCostOperationTx(tx:PoolClient,id:string){
 const task=await lockImageBillingProjectionTx(tx,id);
 const settled=await refreshApiCostOperation(tx,id);
 if(settled&&task&&task.email===settled.email)await markImageBillingSettledTx(tx,id,settled.email);
}
async function recoverCanvasProjection(pool:Pool,id:string){
 await withTransaction(pool,async tx=>{
  const pending=await canvasRecoveryRequestTx(tx,id);if(!pending)return;
  // Task -> billing, never billing -> task. The clear commits with the projection.
  await requeueStoredCanvasImageTaskTx(tx,pending.id,pending.email);
  await finishCanvasRecoveryTx(tx,pending.id,pending.email);
 });
}
export async function recoverBillingTaskProjections(pool:Pool=getPool()){
 for(const op of await pendingApiCostOperations(pool))await withTransaction(pool,tx=>refreshTaskApiCostOperationTx(tx,op.id));
 for(const pending of await pendingCanvasRecoveries(pool))try{await recoverCanvasProjection(pool,pending.id);}catch{/* Durable marker stays for the next original-task recovery. */}
}
/** Billing commit is authoritative. Recovery debt is committed with it; a later
 * task projection failure is returned as pending, not as a failed debit. */
export async function reconcileTaskBilling(input:Parameters<BillingService["reconcileTx"]>[1]){
 const pool=getPool(),service=(await getBillingRuntime()).service;
 const result=await withTransaction(pool,async tx=>{const result=await service.reconcileTx(tx,input);if(input.result.state==="succeeded")await requestCanvasRecoveryTx(tx,input.operationId);return result;});
 if(input.result.state!=="succeeded")return result;
 try{await recoverCanvasProjection(pool,input.operationId);return {...result,recoveryPending:false};}
 catch{return {...result,recoveryPending:true};}
}
