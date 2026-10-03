import "server-only";
import { BillingError, type Tx, type ExpiryPolicy } from "./types";
import { expiryFrom } from "./rules/schema";
export type OperationRow = {
    id: string;
    email: string;
    feature: string;
    quote: unknown;
    request_fingerprint: string;
    state: string;
    reserved_credits: number;
    charged_credits: number;
    ledger_id: string;
};
export async function lockOperation(tx: Tx, input: {
    id: string;
    email: string;
    feature: string;
    quote: unknown;
    hash: string;
    ledgerId: string;
}): Promise<{
    row: OperationRow;
    created: boolean;
}> {
    const inserted = await tx.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id) VALUES($1,$2,$3,$4::jsonb,$5,'prepared',$6) ON CONFLICT(id) DO NOTHING", [input.id, input.email, input.feature, JSON.stringify(input.quote), input.hash, input.ledgerId]);
    const row = (await tx.query<OperationRow>("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE", [input.id])).rows[0];
    if (!row || row.email !== input.email || row.feature !== input.feature || row.request_fingerprint !== input.hash || row.ledger_id !== input.ledgerId)
        throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同计费操作", 409);
    return { row, created: !!inserted.rowCount };
}
export async function lockWallet(tx: Tx, email: string): Promise<{
    principal: number;
    reserved: number;
}> {
    const user = (await tx.query<{
        credits_used: number;
    }>("SELECT credits_used FROM app_users WHERE email=$1 FOR UPDATE", [email])).rows[0];
    if (!user)
        throw new BillingError("INSUFFICIENT_CREDITS", "积分账户不存在", 402);
    await tx.query(`WITH expired AS (UPDATE app_credit_batches SET expired=true WHERE email=$1 AND expires_at<=now() AND remaining>0 AND expired=false RETURNING id,remaining)
 INSERT INTO app_ledger(id,email,delta,reason,kind) SELECT 'led-exp-'||id,$1,-remaining,'积分过期','expire' FROM expired ON CONFLICT(id) DO NOTHING`, [email]);
    const principal = Number((await tx.query("SELECT COALESCE(sum(remaining),0) AS amount FROM app_credit_batches WHERE email=$1 AND expires_at>now() AND remaining>0", [email])).rows[0].amount);
    return { principal, reserved: Number(user.credits_used) };
}
export async function syncBalanceTx(tx: Tx, email: string) {
    await tx.query("UPDATE app_users SET credits_total=(SELECT COALESCE(sum(remaining),0) FROM app_credit_batches WHERE email=$1 AND expires_at>now() AND remaining>0) WHERE email=$1", [email]);
}
export async function debitTx(tx: Tx, email: string, n: number, order: "expires-first" | "created-first") {
    const sorting = order === "created-first" ? "created_at,id" : "expires_at,created_at,id";
    const { rows } = await tx.query<{
        id: string;
        remaining: number;
    }>(`SELECT id,remaining FROM app_credit_batches WHERE email=$1 AND expires_at>now() AND remaining>0 ORDER BY ${sorting} FOR UPDATE`, [email]);
    let need = n;
    for (const row of rows) {
        if (need <= 0)
            break;
        const take = Math.min(Number(row.remaining), need);
        await tx.query("UPDATE app_credit_batches SET remaining=remaining-$2 WHERE id=$1", [row.id, take]);
        need -= take;
    }
    if (need > 0)
        throw new BillingError("INSUFFICIENT_CREDITS", "可用积分不足或已到期，请补充积分后恢复任务", 402);
}
export async function reserveTx(tx: Tx, email: string, id: string, n: number) {
    if (n > 0) {
        await tx.query("UPDATE app_users SET credits_used=credits_used+$2 WHERE email=$1", [email, n]);
        await tx.query("INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,$3)", [id, email, n]);
    }
    await tx.query("UPDATE app_billing_operations SET state='reserved',reserved_credits=$2,updated_at=now() WHERE id=$1", [id, n]);
}
export async function finishTx(tx: Tx, row: OperationRow, charge: number, state: string, reason: string) {
    if (charge > 0)
        await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')", [row.ledger_id, row.email, -charge, reason]);
    // Release only the reservation still owned by this operation; an old sweeper may already have removed it.
    const reservation = (await tx.query<{
        cost: number;
    }>("DELETE FROM app_gen_reservations WHERE job_id=$1 AND email=$2 RETURNING cost", [row.id, row.email])).rows[0];
    if (reservation)
        await tx.query("UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1", [row.email, Number(reservation.cost)]);
    await tx.query("UPDATE app_billing_operations SET state=$2,charged_credits=$3,reserved_credits=0,updated_at=now() WHERE id=$1", [row.id, state, charge]);
    await syncBalanceTx(tx, row.email);
}
export async function grantBatchTx(tx: Tx, input: {
    id: string;
    email: string;
    amount: number;
    source: string;
    reason: string;
    expiry: ExpiryPolicy;
    orderId?: string;
    ledgerId: string;
    expiresAt?: string;
}) {
    const expires = input.expiresAt ?? expiryFrom(new Date(), input.expiry).toISOString();
    if (!Number.isFinite(new Date(expires).getTime())) throw new BillingError("INVALID_RESULT", "积分有效期无效", 400);
    await tx.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,reason,order_id,expires_at) VALUES($1,$2,$3,$3,$4,$5,$6,$7)", [`bat-${input.id}`, input.email, input.amount, input.source, input.reason, input.orderId || null, expires]);
    await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind,expires_at) VALUES($1,$2,$3,$4,$5,$6)", [input.ledgerId, input.email, input.amount, input.reason, input.source === "purchase" ? "purchase" : "grant", expires]);
    await syncBalanceTx(tx, input.email);
}
