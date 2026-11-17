import {attachBillingCreationTx} from "../saas/creation-writer";
import "server-only";
import { BillingError, type BillingService, type OperationInput, type GrantInput, type Tx, type BillingQuote } from "./types";
import { fingerprint } from "./fingerprint";
import { isChargelessQuote, settlementFor } from "./quote";
import * as repository from "./repository";
import { operationApiCost } from "./api-cost-ledger";
import { assertMutableStagingTask, isImportedHistory } from "../staging-history";
import {lockedReservationNeedsReview} from './review-state';
// Compatibility export for existing domain callers; no second transaction implementation.
export {withTransaction as withBillingTransaction} from "@/platform/db/transaction";

function identity(id: string, email: string, ledgerId: string) {
    if (!id || id.length > 200 || !email || email.length > 254 || !ledgerId || ledgerId.length > 300)
        throw new BillingError("INVALID_RESULT", "计费操作参数无效", 400);
}
async function operation(tx: Tx, input: OperationInput) {
    await assertMutableStagingTask(tx, "app_billing_operations", input.id);
    identity(input.id, input.email, input.ledgerId);
    const email = input.email.toLowerCase();
    return repository.lockOperation(tx, { id: input.id, email, feature: input.quote.facts.feature, quote: input.quote, ledgerId: input.ledgerId, hash: fingerprint({ email, quote: input.quote, ledgerId: input.ledgerId, fingerprint: input.fingerprint }) });
}
function amount(n: number) { if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)
    throw new BillingError("INVALID_RESULT", "积分数量无效", 400); }
async function settleLocked(tx:Tx,row:repository.OperationRow,result:import("./types").BillingResult,reason:string){
            const frozen = row.quote as BillingQuote;
            if (frozen.tariff.pricing.mode === "api-cost-plus") result={...result,apiCost:await operationApiCost(tx,row.id,row.email,frozen,result)};
            const settlement = settlementFor(frozen, result);
            if (settlement.state !== "settle") {
                await tx.query("UPDATE app_billing_operations SET state=$2,settlement_result=$3::jsonb,updated_at=now() WHERE id=$1", [row.id, settlement.state, JSON.stringify(result)]);
                return { replayed: false, charge: 0, state: settlement.state };
            }
            const wallet = await repository.lockWallet(tx, row.email);
            const owned = Number((await tx.query("SELECT cost FROM app_gen_reservations WHERE job_id=$1 AND email=$2", [row.id, row.email])).rows[0]?.cost || 0);
            if (settlement.charge>0 && wallet.principal - (wallet.reserved - owned) < settlement.charge)
                throw new BillingError("INSUFFICIENT_CREDITS", "可用积分不足，不能占用其他任务的预留积分", 402);
            if (settlement.charge)
                await repository.debitTx(tx, row.email, settlement.charge, frozen.debitOrder || "expires-first");
            await repository.finishTx(tx, row, settlement.charge, "settled", reason);
            await tx.query("UPDATE app_billing_operations SET settlement_result=$2::jsonb WHERE id=$1",[row.id,JSON.stringify(result)]);
            return { replayed: false, charge: settlement.charge, state: "settled" as const };
}
export function createBillingService(): BillingService {
    const grant = async (tx: Tx, input: GrantInput, adjust: boolean) => {
        identity(input.id, input.email, input.ledgerId);
        amount(Math.abs(input.amount));
        if (!input.amount || !adjust && input.amount < 0)
            throw new BillingError("INVALID_RESULT", "到账积分必须为正数", 400);
        const email = input.email.toLowerCase(), receipt = { ...input, email };
        const { row, created } = await repository.lockOperation(tx, { id: input.id, email, feature: adjust ? "credits.adjust" : `credits.${input.source}`, quote: receipt, hash: fingerprint(receipt), ledgerId: input.ledgerId });
        if (!created && row.state === "settled")
            return { replayed: true };
        const wallet = await repository.lockWallet(tx, email);
        if (input.amount > 0)
            await repository.grantBatchTx(tx, { ...input, email });
        else {
            if (-input.amount > wallet.principal - wallet.reserved)
                throw new BillingError("INSUFFICIENT_CREDITS", "扣减不能占用在途预留积分", 402);
            await repository.debitTx(tx, email, -input.amount, input.debitOrder ?? "expires-first");
            await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')", [input.ledgerId, email, input.amount, input.reason]);
            await repository.syncBalanceTx(tx, email);
        }
        await tx.query("UPDATE app_billing_operations SET state='settled',updated_at=now() WHERE id=$1", [input.id]);
        return { replayed: false };
    };
    return {
        async reconcileTx(tx,input){
            await assertMutableStagingTask(tx, "app_billing_operations", input.operationId);
            const hash=fingerprint(input);
            await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`billing-reconciliation-${input.id}`]);
            const previous=(await tx.query("SELECT request_fingerprint,charge FROM app_billing_reconciliations WHERE id=$1",[input.id])).rows[0];
            if(previous){if(previous.request_fingerprint!==hash)throw new BillingError("OPERATION_CONFLICT","该核对编号已用于不同操作",409);return {replayed:true,charge:Number(previous.charge)};}
            const row=(await tx.query<repository.OperationRow>("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE",[input.operationId])).rows[0];
            if(!row||(!["hold","manual"].includes(row.state)&&!(row.state==='reserved'&&await lockedReservationNeedsReview(tx,row.id))))
                throw new BillingError("OPERATION_CONFLICT","操作不处于人工核对状态，请刷新",409);
            if(input.result.state==="unknown"||input.result.items.some(i=>i.state==="unknown"))throw new BillingError("INVALID_RESULT","结果未知，不能强行结算",400);
            const completed=await settleLocked(tx,row,input.result,input.reason);
            await tx.query("INSERT INTO app_billing_reconciliations(id,operation_id,email,actor,request_fingerprint,reason,proof,result,charge) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)",[input.id,row.id,row.email,input.actor,hash,input.reason,input.proof,JSON.stringify(input.result),completed.charge]);
            return completed;
        },
        async reserveTx(tx, input) {
            amount(input.quote.reserveCredits);
            const { row, created } = await operation(tx, input);
            if (!created && row.state !== "prepared")
                return { replayed: true };
            const wallet = await repository.lockWallet(tx, row.email);
            if (wallet.principal - wallet.reserved < input.quote.reserveCredits)
                throw new BillingError("INSUFFICIENT_CREDITS", "可用积分不足", 402);
            await repository.reserveTx(tx, row.email, row.id, input.quote.reserveCredits);
            await attachBillingCreationTx(tx,row.id,row.email,input.quote.facts.feature,input.quote.reserveCredits);
            return { replayed: false };
        },
        async settleTx(tx, input, result) {
            const { row, created } = await operation(tx, input);
            if (created || row.state === "prepared")
                throw new BillingError("OPERATION_CONFLICT", "计费操作尚未预占", 409);
            if (["settled", "released"].includes(row.state))
                return { replayed: true, charge: Number(row.charged_credits), state: row.state as "settled" | "released" };
            return settleLocked(tx,row,result,input.reason);
        },
        async releaseTx(tx, input) {
            const { row, created } = await operation(tx, input);
            if (created || row.state === "prepared")
                throw new BillingError("OPERATION_CONFLICT", "计费操作尚未预占", 409);
            if (["settled", "released"].includes(row.state))
                return { replayed: true };
            await repository.lockWallet(tx, row.email);
            await repository.finishTx(tx, row, 0, "released", input.reason);
            return { replayed: false };
        },
        grantTx: (tx, input) => grant(tx, input, false), adjustTx: (tx, input) => grant(tx, input, true),
    };
}

/** Older code held UNKNOWN outcomes of quotes that can never charge. Close one at
 * zero through the normal settlement path; any other state or quote is refused. */
export async function closeChargelessUnknownTx(tx:Tx,id:string,reason:string) {
    await assertMutableStagingTask(tx, "app_billing_operations", id);
    const row=(await tx.query<repository.OperationRow&{settlement_result:import("./types").BillingResult|null}>("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if(!row || !["hold","manual"].includes(row.state) || !isChargelessQuote(row.quote as BillingQuote))return null;
    // Keep a recorded outcome; an abandoned reservation never recorded one.
    return settleLocked(tx,row,row.settlement_result??{state:"unknown",items:[]},reason);
}

/** Fee compensation never submits generation. Serializes against normal settlement.
 * Late increases are an explicit review, not an extra wallet debit. Reductions
 * refund at most what this operation actually charged and keep original evidence. */
export async function refreshApiCostOperation(tx:Tx,id:string) {
    if (await isImportedHistory(tx, "app_billing_operations", id)) return;
    const row=(await tx.query("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if(!row || !["manual","hold","settled"].includes(row.state) || !row.quote?.imagePreset || !row.settlement_result || row.quote.tariff.pricing.mode!=="api-cost-plus")return;
    const result={...row.settlement_result,apiCost:await operationApiCost(tx,id,row.email,row.quote,row.settlement_result)};
    if(result.apiCost?.status==="pending") { await tx.query("UPDATE app_billing_operations SET updated_at=now() WHERE id=$1",[id]); return; }
    if(["manual","hold"].includes(row.state)) {
      const settled=await settleLocked(tx,row,result,"APIMart费用补查结算");
      if(settled.state==="settled")return {id:row.id as string,email:row.email as string};
      return;
    }
    const reviewId=fingerprint({id,cost:result.apiCost});
    if((await tx.query("SELECT 1 FROM app_billing_api_cost_reviews WHERE id=$1",[reviewId])).rowCount) { await tx.query("UPDATE app_billing_operations SET updated_at=now() WHERE id=$1",[id]); return; }
    const desired=settlementFor(row.quote,result), before=Number(row.charged_credits), confirmed=result.apiCost?.status==="reported";
    let refund=0,status=desired.state!=="settle"?"needs-review":desired.charge>before?"increase-not-charged":"confirmed";
    if(confirmed && desired.state==="settle" && desired.charge<before && row.quote.refundExpiry) {
      refund=before-desired.charge;
      await repository.lockWallet(tx,row.email);
      await repository.grantBatchTx(tx,{id:`api-refund-${reviewId}`,email:row.email,amount:refund,source:"refund",reason:"供应商费用修订返还",expiry:row.quote.refundExpiry,ledgerId:`led-api-refund-${reviewId}`});
      await tx.query("UPDATE app_billing_operations SET charged_credits=$2,updated_at=now() WHERE id=$1",[id,desired.charge]);
      status="refunded";
    }
    await tx.query("INSERT INTO app_billing_api_cost_reviews(id,operation_id,before_result,after_result,status,refund_credits) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6)",[reviewId,id,JSON.stringify(row.settlement_result),JSON.stringify(result),status,refund]);
    if(status==="confirmed"||status==="refunded")await tx.query("UPDATE app_billing_operations SET settlement_result=$2::jsonb WHERE id=$1",[id,JSON.stringify(result)]);
    await tx.query("UPDATE app_billing_operations SET updated_at=now() WHERE id=$1",[id]);
}
