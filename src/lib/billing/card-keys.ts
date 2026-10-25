import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {randCardCode} from "@/lib/access-codes";
import {BillingError} from "./types";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";

// ===========================================================================
// 兑换码(app_card_keys):站长批量发码 → 用户兑换 → addCreditBatch grant 加积分
// ===========================================================================

export type CardKeyRow = {
  code: string;
  credits: number;
  status: "unused" | "used" | "disabled";
  batch: string;
  note: string;
  expires_at: Date | null;
  created_at: Date;
  used_by: string | null;
  used_at: Date | null;
  billing_grant?: {configVersion:number;expiry:import("@/lib/billing/types").ExpiryPolicy;actor:string};
};

/** 批量生成兑换码(站长后台)。expiryDays=null → 永久。 */
export async function generateCardKeys(opts: {
  credits: number;
  count: number;
  expiryDays: number | null;
  batch: string;
  note: string;
  actor?: string;
}): Promise<CardKeyRow[]> {
  await ensureSchema();
  const expires =
    opts.expiryDays && opts.expiryDays > 0
      ? new Date(Date.now() + opts.expiryDays * 86400000).toISOString()
      : null;
  if(!Number.isSafeInteger(opts.credits)||opts.credits<=0||opts.credits>2147483647||!Number.isSafeInteger(opts.count)||opts.count<1||opts.count>500||opts.expiryDays!==null&&(!Number.isSafeInteger(opts.expiryDays)||opts.expiryDays<1||opts.expiryDays>36500))throw new BillingError("INVALID_RESULT","兑换码参数无效",400);
  const {getBillingRuntime}=await import("@/lib/billing/runtime"), snapshot=await(await getBillingRuntime()).config.current();
  const receipt={configVersion:snapshot.version,expiry:snapshot.config.credits.redeem,actor:opts.actor??"local-admin"};
  const out: CardKeyRow[] = [];
  for (let i = 0; i < opts.count; i++) {
    // 重试避免 PK 撞码(概率极低)。
    let inserted: CardKeyRow | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = randCardCode();
      const { rows } = await getPool().query<CardKeyRow>(
        `INSERT INTO app_card_keys (code, credits, batch, note, expires_at,billing_grant)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (code) DO NOTHING
         RETURNING code, credits, status, batch, note, expires_at, created_at, used_by, used_at,billing_grant`,
        [code, opts.credits, opts.batch, opts.note, expires,JSON.stringify(receipt)]
      );
      if (rows[0]) inserted = rows[0];
    }
    if (inserted) out.push(inserted);
  }
  return out;
}

/** 列出兑换码(最近 500 条,站长后台)。 */
export async function listCardKeys(): Promise<CardKeyRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<CardKeyRow>(
    `SELECT code, credits, status, batch, note, expires_at, created_at, used_by, used_at,billing_grant
       FROM app_card_keys ORDER BY created_at DESC LIMIT 500`
  );
  return rows;
}

/** 停用 / 恢复(已使用的不可改)。 */
export async function setCardKeyStatus(
  code: string,
  status: "unused" | "disabled"
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_card_keys SET status = $2 WHERE code = $1 AND status <> 'used'`,
    [code, status]
  );
}

/** 兑换:原子领取(unused→used)后用 grant 批次加积分。失败抛中文原因。 */
export async function redeemCardKey(codeRaw:string,emailRaw:string):Promise<{credits:number}>{
  await ensureSchema(); const code=codeRaw.trim().toUpperCase(),email=emailRaw.toLowerCase();
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime();
  return withBillingTransaction(getPool(),async tx=>{
    const card=(await tx.query<CardKeyRow>("SELECT * FROM app_card_keys WHERE code=$1 FOR UPDATE",[code])).rows[0];
    if(!card)throw new Error("兑换码不存在");
    if(card.status==="used"){
      if(card.used_by===email&&(await tx.query("SELECT state FROM app_billing_operations WHERE id=$1 AND email=$2",[`redeem-${code}`,email])).rows[0]?.state==="settled")return {credits:card.credits};
      throw new Error("兑换码已被使用");
    }
    if(card.status==="disabled")throw new Error("兑换码已停用");
    if(card.expires_at&&card.expires_at<=new Date())throw new Error("兑换码已过期");
    // Legacy issued cards keep their original two-year credit validity.
    const expiry=card.billing_grant?.expiry??{unit:"years" as const,value:2};
    const id=`redeem-${code}`;
    await runtime.service.grantTx(tx,{id,email,amount:card.credits,source:"grant",reason:"兑换码",expiry,ledgerId:`led-${id}`,actor:email,fingerprint:code});
    await tx.query("UPDATE app_card_keys SET status='used',used_by=$2,used_at=now() WHERE code=$1",[code,email]);
    return {credits:card.credits};
  });
}

/** 兑换码统计(站长后台卡片)。 */
export async function cardKeyStats(): Promise<{
  issued: number;
  used: number;
  creditsRedeemed: number;
}> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    issued: string;
    used: string;
    credits_redeemed: string;
  }>(
    `SELECT COUNT(*) AS issued,
            COUNT(*) FILTER (WHERE status = 'used') AS used,
            COALESCE(SUM(credits) FILTER (WHERE status = 'used'), 0) AS credits_redeemed
       FROM app_card_keys`
  );
  const r = rows[0];
  return {
    issued: Number(r?.issued ?? 0),
    used: Number(r?.used ?? 0),
    creditsRedeemed: Number(r?.credits_redeemed ?? 0),
  };
}
