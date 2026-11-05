import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {deductPrincipalFIFO,refreshBalance,expireDueBatches} from "./wallet-balance";

// ===========================================================================
// 积分批次(2 年有效 / 新人 30 天) + 消费 FIFO + 过期处理
// ---------------------------------------------------------------------------
// 模型:批次(app_credit_batches)是「本金」的唯一真源;app_users.credits_used
// 当「在途占位」(预扣未结算)。可用余额 = 活批次 remaining 之和;remaining = 该
// 余额减去 credits_used(占位)。消费在「结算」(addLedgerEntry 负数)时才真正按
// FIFO 扣本金。credits_total 列保留为余额镜像(refreshBalance 同步,后台直读用)。
// ===========================================================================

export function ledId(prefix = "led"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export type LedgerRow = {
  id: string;
  email: string;
  delta: number;
  reason: string;
  kind: string;
  expiresAt: string | null;
  createdAt: string;
};

function mapLedger(r: {
  id: string;
  email: string;
  delta: number;
  reason: string;
  kind?: string | null;
  expires_at?: Date | null;
  created_at: Date;
}): LedgerRow {
  return {
    id: r.id,
    email: r.email,
    delta: r.delta,
    reason: r.reason,
    kind: r.kind ?? "",
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function listLedger(limit = 20): Promise<LedgerRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapLedger);
}

/** 结算/审计流水。delta<0 = 消费结算:FIFO 扣本金 + 释放在途占位
 *  (credits_used += delta)+ 记 consume 流水 + 同步余额(这是三个消费路由成功后
 *  调用的扣费入口,签名不变所以路由无需改)。delta>0 走纯审计兜底(目前无调用方)。 */
export async function addLedgerEntry(
  emailRaw: string,
  delta: number,
  reason: string
): Promise<void> {
  const {currentSynchronousBilling,settleSynchronous}=await import("@/lib/billing/synchronous-operation");
  if(delta<=0&&currentSynchronousBilling()){await settleSynchronous(reason);return;}
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  if (delta < 0) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await deductPrincipalFIFO(client, email, -delta);
      await client.query(
        `UPDATE app_users SET credits_used = GREATEST(credits_used + $2, 0) WHERE email = $1`,
        [email, delta]
      );
      await client.query(
        `INSERT INTO app_ledger (id, email, delta, reason, kind) VALUES ($1,$2,$3,$4,'consume')`,
        [ledId(), email, delta, reason]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    await refreshBalance(email).catch(() => {});
    return;
  }
  await getPool().query(
    `INSERT INTO app_ledger (id, email, delta, reason, kind) VALUES ($1,$2,$3,$4,$5)`,
    [ledId(), email, delta, reason, delta > 0 ? "grant" : "consume"]
  );
}

/** Per-user credit ledger — for the admin member detail view. */
export async function listUserLedger(
  emailRaw: string,
  limit = 100
): Promise<LedgerRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger WHERE email = $1
      ORDER BY created_at DESC LIMIT $2`,
    [emailRaw.toLowerCase(), limit]
  );
  return rows.map(mapLedger);
}

/** 用户端「积分明细」:按类别(all/purchase/consume/grant/refund/expire)筛选,
 *  默认仅 30 天内。先跑过期确保过期流水已生成。 */
export async function listUserLedgerFiltered(
  emailRaw: string,
  opts: { kind?: string; sinceDays?: number; limit?: number } = {}
): Promise<LedgerRow[]> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  await expireDueBatches(email);
  const limit = Math.min(opts.limit ?? 200, 500);
  const days = String(opts.sinceDays ?? 30);
  const params: unknown[] = [email, days, limit];
  let kindClause = "";
  if (opts.kind && opts.kind !== "all") {
    params.push(opts.kind);
    kindClause = ` AND kind = $4`;
  }
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger
      WHERE email = $1
        AND created_at >= now() - ($2 || ' days')::interval
        ${kindClause}
      ORDER BY created_at DESC LIMIT $3`,
    params
  );
  return rows.map(mapLedger);
}
