import "server-only";
import type { Pool } from "pg";
import { BillingError, type BillingService, type OperationInput, type GrantInput, type Tx, type BillingQuote } from "./types";
import { fingerprint } from "./fingerprint";
import { settlementFor } from "./quote";
import * as repository from "./repository";
export async function withBillingTransaction<T>(pool: Pool, action: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = await pool.connect();
    try {
        await tx.query("BEGIN");
        const result = await action(tx);
        await tx.query("COMMIT");
        return result;
    }
    catch (error) {
        await tx.query("ROLLBACK");
        throw error;
    }
    finally {
        tx.release();
    }
}
function identity(id: string, email: string, ledgerId: string) {
    if (!id || id.length > 200 || !email || email.length > 254 || !ledgerId || ledgerId.length > 300)
        throw new BillingError("INVALID_RESULT", "计费操作参数无效", 400);
}
async function operation(tx: Tx, input: OperationInput) {
    identity(input.id, input.email, input.ledgerId);
    const email = input.email.toLowerCase();
    return repository.lockOperation(tx, { id: input.id, email, feature: input.quote.facts.feature, quote: input.quote, ledgerId: input.ledgerId, hash: fingerprint({ email, quote: input.quote, ledgerId: input.ledgerId, fingerprint: input.fingerprint }) });
}
function amount(n: number) { if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)
    throw new BillingError("INVALID_RESULT", "积分数量无效", 400); }
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
            await repository.debitTx(tx, email, -input.amount, "expires-first");
            await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')", [input.ledgerId, email, input.amount, input.reason]);
            await repository.syncBalanceTx(tx, email);
        }
        await tx.query("UPDATE app_billing_operations SET state='settled',updated_at=now() WHERE id=$1", [input.id]);
        return { replayed: false };
    };
    return {
        async reserveTx(tx, input) {
            amount(input.quote.reserveCredits);
            const { row, created } = await operation(tx, input);
            if (!created && row.state !== "prepared")
                return { replayed: true };
            const wallet = await repository.lockWallet(tx, row.email);
            if (wallet.principal - wallet.reserved < input.quote.reserveCredits)
                throw new BillingError("INSUFFICIENT_CREDITS", "可用积分不足", 402);
            await repository.reserveTx(tx, row.email, row.id, input.quote.reserveCredits);
            return { replayed: false };
        },
        async settleTx(tx, input, result) {
            const { row, created } = await operation(tx, input);
            if (created || row.state === "prepared")
                throw new BillingError("OPERATION_CONFLICT", "计费操作尚未预占", 409);
            if (["settled", "released"].includes(row.state))
                return { replayed: true, charge: Number(row.charged_credits) };
            const frozen = row.quote as BillingQuote, settlement = settlementFor(frozen, result);
            if (settlement.state !== "settle") {
                await tx.query("UPDATE app_billing_operations SET state=$2,updated_at=now() WHERE id=$1", [row.id, settlement.state]);
                return { replayed: false, charge: 0 };
            }
            const wallet = await repository.lockWallet(tx, row.email);
            const owned = Number((await tx.query("SELECT cost FROM app_gen_reservations WHERE job_id=$1 AND email=$2", [row.id, row.email])).rows[0]?.cost || 0);
            if (settlement.charge>0 && wallet.principal - (wallet.reserved - owned) < settlement.charge)
                throw new BillingError("INSUFFICIENT_CREDITS", "可用积分不足，不能占用其他任务的预留积分", 402);
            if (settlement.charge)
                await repository.debitTx(tx, row.email, settlement.charge, frozen.debitOrder || "expires-first");
            await repository.finishTx(tx, row, settlement.charge, "settled", input.reason);
            return { replayed: false, charge: settlement.charge };
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
