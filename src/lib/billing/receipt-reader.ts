import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import type {FeatureId} from "./types";
import {currentCreationContext} from "../saas/creation-scope";
import {BillingError} from "./types";
import type {PoolClient} from "pg";
import {withTransaction} from "@/platform/db/transaction";
import {createBillingService} from "./service";
import {canonicalConfig} from "../model-config/snapshot-value";
import {withFrozenCreation} from "../saas/creation-scope";
import {finishCreation} from "../saas/creation-writer";

/** The billing owner exposes an already settled result, never an execution or
 * retry. Callers must additionally validate their exact domain source identity. */
export async function readSynchronousReceipt(actor:string,operationId:string,feature:FeatureId){
  await ensureSchema();
  const scope=currentCreationContext();
  if(!scope||scope.actorEmail!==actor.toLowerCase())throw new BillingError("INVALID_RESULT","原操作工作空间尚未核实",409);
  const id=`tool-${operationId}`;
  const row=(await getPool().query(`SELECT o.result_response,o.state,o.charged_credits,o.settlement_result->>'state' AS outcome FROM app_billing_operations o
    WHERE o.id=$1 AND o.email=$2 AND o.feature=$3 AND EXISTS (
      SELECT 1 FROM app_creation_records c WHERE c.actor_email=$2 AND c.source_kind=$3 AND c.source_id=o.id AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid
      UNION ALL SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id WHERE l.target_type='billing' AND l.target_id=o.id AND l.actor_email=$2 AND c.actor_email=$2 AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid)
    `,[id,actor.toLowerCase(),feature,scope.scopeKind,scope.tenantId])).rows[0];
  if(!row)return null;
  return {state:String(row.state),outcome:row.outcome as string|null,body:row.result_response as unknown,chargedCredits:Number(row.charged_credits)};
}

/** Finish only a proved, durable audio result. No reservation, model resolution,
 * supplier call, price refresh or admin reconciliation. The domain decodes its
 * checkpoint before entering; its output writer participates in this transaction. */
export async function completeAudioCheckpoint(actorRaw:string,input:{operationId:string;feature:"audio.speech"|"audio.transcribe";requestHash:string;checkpoint:unknown;body:Record<string,unknown>},writeOutput?:(tx:PoolClient)=>Promise<void>){
  const actor=actorRaw.toLowerCase(),receipt=await readSynchronousReceipt(actor,input.operationId,input.feature),scope=currentCreationContext()!;
  if(!receipt)throw new BillingError("OPERATION_CONFLICT","原声音操作不存在或无权访问",404);
  const id=`tool-${input.operationId}`;
  let creationId:string|undefined;
  const result=await withTransaction(getPool(),async tx=>{
    const row=(await tx.query("SELECT * FROM app_billing_operations WHERE id=$1 AND email=$2 AND feature=$3 FOR UPDATE",[id,actor,input.feature])).rows[0];
    if(!row)throw new BillingError("OPERATION_CONFLICT","原声音操作不存在",404);
    if(row.state==="settled"&&canonicalConfig(row.result_response)===canonicalConfig(input.body))return {state:"settled",chargedCredits:Number(row.charged_credits),body:row.result_response};
    if(!["reserved","hold","manual"].includes(row.state)||canonicalConfig(row.result_response)!==canonicalConfig(input.checkpoint))throw new BillingError("OPERATION_CONFLICT","原声音检查点已变化，请重新查询原操作",409);
    creationId=(await tx.query("SELECT id FROM app_creation_records WHERE actor_email=$1 AND source_kind=$2 AND source_id=$3 AND scope_kind=$4 AND tenant_id IS NOT DISTINCT FROM $5::uuid",[actor,input.feature,id,scope.scopeKind,scope.tenantId])).rows[0]?.id;
    if(!creationId)throw new BillingError("OPERATION_CONFLICT","原声音操作归属证据缺失",409);
    await withFrozenCreation({...scope,creationId},async()=>{await writeOutput?.(tx);});
    const settled=await createBillingService().settleTx(tx,{id,email:actor,quote:row.quote,ledgerId:row.ledger_id,fingerprint:input.requestHash,reason:"原声音结果恢复完成"},{state:"succeeded",items:[{id,state:"succeeded",executedQuality:row.quote.facts.quality}]});
    await tx.query("UPDATE app_billing_operations SET result_response=$2::jsonb,updated_at=now() WHERE id=$1",[id,JSON.stringify(input.body)]);
    return {state:settled.state,chargedCredits:settled.charge,body:input.body};
  });
  await finishCreation(creationId,actor,result.state==="settled"?"succeeded":"needs_review",{artworkIds:typeof result.body.artworkId==="string"?[result.body.artworkId]:[],summary:result.state==="settled"?"声音结果已保存":"声音结果已保存，费用待核对"});
  return result;
}
