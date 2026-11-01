import "server-only";
import type {Tx,OperationInput} from "./types";
import {createBillingService} from "./service";
import {deductPrincipalFIFO} from "./wallet-balance";
import {lockWallet,syncBalanceTx} from "./repository";

/** Legacy rows have no structured quote. The task owner holds its task lock;
 * these APIs use only that same transaction and never prepare a new price. */
export async function reserveLegacyTaskTx(tx:Tx,input:{id:string;email:string;cost:number;metered:boolean;insufficientMessage:string;principalPolicy?:"unexpired-total"}){
 if(input.metered&&input.cost>0){
  const reserved=await tx.query(`UPDATE app_users u SET credits_used=credits_used+$2 WHERE email=$1 AND
   (SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches WHERE email=$1 AND expires_at>now() ${input.principalPolicy==="unexpired-total"?"":"AND remaining>0"})-credits_used >= $2`,[input.email,input.cost]);
  if(!reserved.rowCount)throw new Error(input.insufficientMessage);
 }
 await tx.query("INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,$3)",[input.id,input.email,input.cost]);
}
export async function releaseLegacyCreditsTx(tx:Tx,email:string,credits:number){
 await tx.query("UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1",[email,credits]);
}
export async function clearTaskReservationTx(tx:Tx,id:string){await tx.query("DELETE FROM app_gen_reservations WHERE job_id=$1",[id]);}
export async function settleLegacyTaskTx(tx:Tx,input:{email:string;charge:number;reservedCredits:number;ledgerId:string;reason:string;idempotency:"task-lock"|"ledger"}){
 if(input.idempotency==="ledger"&&(await tx.query("SELECT 1 FROM app_ledger WHERE id=$1",[input.ledgerId])).rowCount)return;
 if(input.charge>0){await deductPrincipalFIFO(tx,input.email,input.charge);}
 if(input.reservedCredits)await releaseLegacyCreditsTx(tx,input.email,input.reservedCredits);
 if(input.charge>0)await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')",[input.ledgerId,input.email,-input.charge,input.reason]);
}
export async function taskBillingExistsTx(tx:Tx,id:string){return !!(await tx.query("SELECT 1 FROM app_billing_operations WHERE id=$1",[id])).rowCount;}
/** The task reports uncertainty; billing alone interprets the frozen policy. */
export async function holdTaskBillingTx(tx:Tx,id:string,reason:"uncertain"|"manual"){
 if(reason==="manual")await tx.query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold')",[id]);
 else await tx.query("UPDATE app_billing_operations SET state=CASE WHEN quote->'tariff'->'settlement'->>'unknown'='manual' THEN 'manual' ELSE 'hold' END,updated_at=now() WHERE id=$1 AND state='reserved'",[id]);
}
/** Caller has proved no local/customer delivery and holds its task/lease lock.
 * Supplier intent and fee evidence remain UNKNOWN, never permission to replay. */
export async function releaseUndeliveredTaskTx(tx:Tx,input:{id:string;email:string;operation:OperationInput;reasonCode:string}):Promise<number|null>{
 const billing=(await tx.query("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE",[input.id])).rows[0];
 if(billing&&["settled","released"].includes(billing.state))return null;
 let released=0;
 if(billing){
  released=Number((await tx.query("SELECT cost FROM app_gen_reservations WHERE job_id=$1 AND email=$2",[input.id,input.email])).rows[0]?.cost||0);
  await createBillingService().releaseTx(tx,input.operation);
 }else{
  await lockWallet(tx,input.email);
  const reservation=(await tx.query("DELETE FROM app_gen_reservations WHERE job_id=$1 AND email=$2 RETURNING cost",[input.id,input.email])).rows[0];released=Number(reservation?.cost||0);
  if(released)await releaseLegacyCreditsTx(tx,input.email,released);
  await syncBalanceTx(tx,input.email);
 }
 const proof={reasonCode:input.reasonCode,customerOutcome:"failed",supplierOutcome:"unknown",supplierCost:"pending",releasedCredits:released};
 await tx.query("INSERT INTO app_billing_reconciliations(id,operation_id,email,actor,request_fingerprint,reason,proof,result,charge) VALUES($1,$2,$3,'system:image-job',$4,'图片未交付，释放预占积分',$5,$6::jsonb,0)",[`image-release-${input.id}`,input.id,input.email,`image-release-${input.id}`,JSON.stringify(proof),JSON.stringify({state:"unknown",...proof})]);
 return released;
}
