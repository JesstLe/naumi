import "server-only";
import {getPool} from "@/platform/db/pool";
import type {Invoice} from "@/lib/auth-context";

// Saved payment facts, not pricing decisions. Callers retain schema initialization order.

export async function invoicesFor(email: string): Promise<Invoice[]> {
  const { rows } = await getPool().query(
    `SELECT id, created_at, plan, amount, status
       FROM app_invoices WHERE email = $1 ORDER BY created_at DESC`,
    [email]
  );
  return rows.map((r) => ({
    id: r.id,
    date: new Date(r.created_at).toISOString(),
    plan: r.plan,
    amount: r.amount,
    status: "paid" as const,
  }));
}

// 累计充值(分):已支付订单金额之和。用于「高阶」出图模式解锁(≥999元=99900分)。

export async function totalPaidCents(emailRaw: string): Promise<number> {
  const { rows } = await getPool().query<{ s: string }>(
    `SELECT COALESCE(SUM(amount),0)::bigint AS s
       FROM app_orders WHERE email = $1 AND status = 'paid'`,
    [emailRaw.toLowerCase()]
  );
  return Number(rows[0]?.s ?? 0);
}
