import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {ensureBillingSchema} from "./schema";

export type TaskCostEvidence={id:string;state:string|null;outcome?:string|null;reservedCredits:number;chargedCredits:number|null;debitedCredits:number;refundedCredits:number;releasedCredits:number;quotedCredits:number|null;authorizedCredits:number|null;upperBound:boolean;billingVersion:number|null;ledgerId:string|null;consistent:boolean;basis:"operation"|"legacy-ledger"|"missing"|"byoc-policy"};
const amount=(value:unknown)=>typeof value==="number"?value:typeof value==="string"&&/^\d+$/.test(value)?Number(value):NaN;
const valid=(value:number)=>Number.isSafeInteger(value)&&value>=0;

/** Public credit evidence only. No tariff, supplier procurement, wallet mutation or settlement. */
export async function readTaskCostEvidence(actor:string,refs:readonly {id:string;ledgerId:string}[],client?:Pick<PoolClient,"query">):Promise<TaskCostEvidence[]>{
 await ensureBillingSchema(getPool());if(!refs.length)return [];
 const db=client??getPool(),rows=(await db.query(`SELECT o.id,o.state,o.settlement_result->>'state' AS outcome,o.quote,o.reserved_credits,o.charged_credits,o.ledger_id,
   COALESCE(r.cost,0) AS held,COALESCE(-l.delta,0) AS debited,COALESCE(f.refunded,0) AS refunded
   FROM app_billing_operations o
   LEFT JOIN app_gen_reservations r ON r.job_id=o.id AND r.email=o.email
   LEFT JOIN app_ledger l ON l.id=o.ledger_id AND l.email=o.email AND l.kind='consume'
   LEFT JOIN LATERAL(SELECT sum(lr.delta) AS refunded FROM app_billing_api_cost_reviews cr JOIN app_ledger lr ON lr.id='led-api-refund-'||cr.id AND lr.email=o.email AND lr.kind IN ('grant','refund') AND lr.delta=cr.refund_credits WHERE cr.operation_id=o.id AND cr.status='refunded') f ON true
   WHERE o.email=$1 AND o.id=ANY($2::text[])`,[actor.toLowerCase(),refs.map(ref=>ref.id)])).rows;
 const byId=new Map(rows.map(row=>[String(row.id),row])),missing=refs.filter(ref=>!byId.has(ref.id));
 const legacy=missing.length?(await db.query(`SELECT l.id,-l.delta AS debited FROM app_ledger l WHERE l.email=$1 AND l.id=ANY($2::text[]) AND l.kind='consume' AND l.delta<=0`,[actor.toLowerCase(),missing.map(ref=>ref.ledgerId)])).rows:[];
 const legacyById=new Map(legacy.map(row=>[String(row.id),amount(row.debited)]));
 const holds=missing.length?(await db.query("SELECT job_id,cost FROM app_gen_reservations WHERE email=$1 AND job_id=ANY($2::text[])",[actor.toLowerCase(),missing.map(ref=>ref.id)])).rows:[];
 const heldById=new Map(holds.map(row=>[String(row.job_id),amount(row.cost)]));
 return refs.map(ref=>{
  const row=byId.get(ref.id);if(!row){const debited=legacyById.get(ref.ledgerId),held=heldById.get(ref.id)??0;return {id:ref.id,state:debited!==undefined?"legacy":null,reservedCredits:valid(held)?held:0,chargedCredits:debited!==undefined&&valid(debited)&&valid(held)&&held===0?debited:null,debitedCredits:debited??0,refundedCredits:0,releasedCredits:0,quotedCredits:null,authorizedCredits:null,upperBound:false,billingVersion:null,ledgerId:debited!==undefined?ref.ledgerId:null,consistent:debited!==undefined&&valid(debited)&&valid(held),basis:debited!==undefined?"legacy-ledger":"missing"};}
  const charged=amount(row.charged_credits),debited=amount(row.debited),refunded=amount(row.refunded),held=amount(row.held),terminal=["settled","released"].includes(row.state),quote=row.quote;
  const consistent=[charged,debited,refunded,held].every(valid)&&row.ledger_id===ref.ledgerId&&(!terminal||debited-refunded===charged&&held===0);
  const reserve=amount(quote?.reserveCredits),authorized=amount(quote?.authorizedCredits),requested=amount(quote?.requestedCredits);
  return {id:ref.id,state:String(row.state),outcome:row.outcome,reservedCredits:valid(held)?held:0,chargedCredits:consistent&&terminal?charged:null,debitedCredits:valid(debited)?debited:0,refundedCredits:valid(refunded)?refunded:0,releasedCredits:consistent&&terminal&&valid(reserve)?Math.max(0,reserve-debited):0,quotedCredits:valid(requested)?requested:null,authorizedCredits:valid(authorized)?authorized:null,upperBound:quote?.tariff?.pricing?.mode==="api-cost-plus",billingVersion:Number.isSafeInteger(quote?.configVersion)?quote.configVersion:null,ledgerId:String(row.ledger_id),consistent,basis:"operation"};
 });
}
