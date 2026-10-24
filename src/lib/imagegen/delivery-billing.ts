import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {imagegenStepId} from "./operation-id";
import type {ImagegenPlan} from "./types";

/** Delivery and payment are independent facts. A successful settle call can
 * leave a cost-based operation in hold/manual; neither zero nor a returned
 * charge proves that the reservation was released. This reader never writes. */
export async function readDeliveryBilling(owner:string,jobIds:string[],operationIds:string[]=[],requiredOperations:string[]=[]){
  if(!dbEnabled)return {chargedCredits:0,confirmed:true};
  const ids=[...new Set(jobIds)],email=owner.toLowerCase(),pool=getPool();
  const jobs=(await pool.query<{id:string;billing_settled:boolean;legacy_charge:string}>(`SELECT j.id,j.billing_settled,
    COALESCE((SELECT -sum(l.delta) FROM app_ledger l WHERE l.id='led-image-'||j.id AND l.email=j.email AND l.kind='consume'),0) AS legacy_charge
    FROM app_image_jobs j WHERE j.id=ANY($1::text[]) AND j.email=$2`,[ids,email])).rows;
  const operations=(await pool.query<{id:string;state:string;charged_credits:number}>(
    "SELECT id,state,charged_credits FROM app_billing_operations WHERE email=$1 AND id=ANY($2::text[])",
    [email,[...new Set([...ids,...operationIds])]])).rows;
  const actual=new Map(operations.map(row=>[row.id,row]));
  return {
    chargedCredits:operations.reduce((n,row)=>n+Number(row.charged_credits),0)+jobs.filter(row=>!actual.has(row.id)).reduce((n,row)=>n+Number(row.legacy_charge),0),
    confirmed:jobs.length===ids.length&&jobs.every(row=>row.billing_settled)&&operations.every(row=>["settled","released"].includes(row.state))&&requiredOperations.every(id=>actual.has(id)),
  };
}

export function readImagegenBilling(owner:string,children:Record<string,{jobId?:string;state?:string}>,plan:ImagegenPlan){
  const synchronous=plan.steps.map(step=>`tool-${imagegenStepId(plan.request.operationId,step.key)}`);
  const required=plan.steps.filter(step=>step.operation==="cutout"&&children[step.key]?.state==="done").map(step=>`tool-${imagegenStepId(plan.request.operationId,step.key)}`);
  return readDeliveryBilling(owner,Object.values(children).flatMap(child=>child.jobId?[child.jobId]:[]),synchronous,required);
}
