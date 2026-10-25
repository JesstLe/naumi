import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {ProductReceipt} from "@/lib/payments";
import {oneMonthFromNowISO} from "@/lib/accounts/session";
import {signupGrantTx} from "@/lib/billing/entitlements";
import {generateLicenses} from "@/lib/licensing/repository";

// --- Orders / payments ----------------------------------------------------

export type OrderRow = {
  id: string;
  email: string;
  kind: string; // 'plan' | 'pack'
  itemId: string;
  title: string;
  credits: number;
  amount: number; // 分 (RMB cents)
  status: string; // pending|paid|failed|expired
  provider: string;
  providerTxn: string | null;
  createdAt: string;
  paidAt: string | null;
  billingQuote?: ProductReceipt;
};

type OrderDbRow = {
  id: string;
  email: string;
  kind: string;
  item_id: string;
  title: string;
  credits: number;
  amount: number;
  status: string;
  provider: string;
  provider_txn: string | null;
  created_at: Date;
  paid_at: Date | null;
  billing_quote?: ProductReceipt|null;
};

function rowToOrder(r: OrderDbRow): OrderRow {
  return {
    id: r.id,
    email: r.email,
    kind: r.kind,
    itemId: r.item_id,
    title: r.title,
    credits: r.credits,
    amount: r.amount,
    status: r.status,
    provider: r.provider,
    providerTxn: r.provider_txn ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    billingQuote:r.billing_quote??undefined,
  };
}

export async function createOrder(o: {
  email: string;
  kind: string;
  itemId: string;
  title: string;
  credits: number;
  amount: number;
  billingQuote?: ProductReceipt;
}): Promise<OrderRow> {
  await ensureSchema();
  const id = `ord-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { rows } = await getPool().query<OrderDbRow>(
    `INSERT INTO app_orders
       (id, email, kind, item_id, title, credits, amount, status,billing_quote)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb) RETURNING *`,
    [id, o.email.toLowerCase(), o.kind, o.itemId, o.title, o.credits, o.amount,o.billingQuote?JSON.stringify(o.billingQuote):null]
  );
  return rowToOrder(rows[0]);
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query<OrderDbRow>(
    `SELECT * FROM app_orders WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToOrder(rows[0]) : null;
}

/** Marks an order paid and grants the entitlement, atomically + idempotently.
 *  Re-calling on an already-paid order is a no-op (no double credit). */
export async function fulfillOrder(
  orderId: string,
  provider: string,
  providerTxn?: string | null,
  amountFen?:number
): Promise<{ ok: boolean; alreadyPaid: boolean; order?: OrderRow; error?: string }> {
  await ensureSchema();
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<OrderDbRow>(
      `SELECT * FROM app_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const o = rows[0];
    if (!o) {
      await client.query("ROLLBACK");
      return { ok: false, alreadyPaid: false, error: "订单不存在" };
    }
    if(amountFen!==undefined&&(!Number.isSafeInteger(amountFen)||amountFen!==o.amount)){
      await client.query("ROLLBACK"); return {ok:false,alreadyPaid:false,error:"金额不匹配"};
    }
    if (o.status === "paid") {
      await client.query("COMMIT");
      return { ok: true, alreadyPaid: true, order: rowToOrder(o) };
    }
    // Pro 授权直售订单:不发积分,标记已付后在事务外幂等生成 License Key
    // (ensureProLicenseForOrder,按 batch=orderId 去重)。积分订单走原批次逻辑。
    if (o.kind !== "pro") {
      // Guest recipients get a wallet atomically with the same signup policy as registration.
      const inserted=await client.query("INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at) VALUES($1,'','starter',0,0,$2) ON CONFLICT(email) DO NOTHING",[o.email,oneMonthFromNowISO()]);
      if(inserted.rowCount)await signupGrantTx(client,o.email,snapshot);
      const expiry=o.billing_quote?.product.expiry??{unit:"years" as const,value:2};
      if(o.credits>0)await runtime.service.grantTx(client,{id:`order-${o.id}`,email:o.email,amount:o.credits,source:"purchase",reason:`购买${o.title||"积分"}`,expiry,orderId:o.id,ledgerId:`led-order-${o.id}`,actor:provider,fingerprint:o.id});
    }
    await client.query(
      `UPDATE app_orders SET status='paid', provider=$2, provider_txn=$3,
          paid_at=now() WHERE id=$1`,
      [orderId, provider, providerTxn ?? null]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const updated = await getOrder(orderId);
  // Pro 直售:付款落定后幂等生成授权(失败不影响订单已付;轮询接口会懒补)。
  if (updated?.kind === "pro") {
    await ensureProLicenseForOrder(updated.id, updated.email).catch(() => null);
  }
  return { ok: true, alreadyPaid: false, order: updated ?? undefined };
}

// Pro 直售订单 → License Key(幂等:batch=orderId 唯一)。付款回调与订单轮询
// 都会调它,先查后建;生成后绑定买家邮箱,可溯源可吊销。有效期 365 天。
export async function ensureProLicenseForOrder(
  orderId: string,
  emailRaw: string
): Promise<string | null> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const { rows } = await getPool().query<{ key: string }>(
    `SELECT key FROM app_licenses WHERE batch = $1 LIMIT 1`,
    [orderId]
  );
  if (rows[0]) return rows[0].key;
  const [lic] = await generateLicenses({
    count: 1,
    tier: "pro",
    expiryDays: 365,
    batch: orderId,
    note: `官网直售 ${email}`,
  });
  if (!lic) return null;
  await getPool().query(
    `UPDATE app_licenses SET bound_email = $2 WHERE key = $1`,
    [lic.key, email]
  );
  return lic.key;
}
