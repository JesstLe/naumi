import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import type {FeatureId} from "./types";
import {currentCreationContext} from "../saas/creation-scope";
import {BillingError} from "./types";

/** The billing owner exposes an already settled result, never an execution or
 * retry. Callers must additionally validate their exact domain source identity. */
export async function readSynchronousReceipt(actor:string,operationId:string,feature:FeatureId){
  await ensureSchema();
  const scope=currentCreationContext();
  if(!scope||scope.actorEmail!==actor.toLowerCase())throw new BillingError("INVALID_RESULT","原操作工作空间尚未核实",409);
  const id=`tool-${operationId}`;
  const row=(await getPool().query(`SELECT o.result_response,o.state,o.charged_credits FROM app_billing_operations o
    WHERE o.id=$1 AND o.email=$2 AND o.feature=$3 AND EXISTS (
      SELECT 1 FROM app_creation_records c WHERE c.actor_email=$2 AND c.source_kind=$3 AND c.source_id=o.id AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid
      UNION ALL SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id WHERE l.target_type='billing' AND l.target_id=o.id AND l.actor_email=$2 AND c.actor_email=$2 AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid)
    `,[id,actor.toLowerCase(),feature,scope.scopeKind,scope.tenantId])).rows[0];
  if(!row)return null;
  return {state:String(row.state),body:row.result_response as unknown,chargedCredits:Number(row.charged_credits)};
}
