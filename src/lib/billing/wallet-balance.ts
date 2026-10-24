import "server-only";
import {getPool} from "@/platform/db/pool";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";
import {ensureSchema} from "@/lib/persistence/schema";

// Live principal/expiry projection. Reservation and settlement remain in service/repository.
// Keep the user-first lock and read principal only after acquiring it.

/** 过期处理:已过期(expires_at<=now)且未记过期流水的批次,记一条「积分过期」
 *  流水(delta=-remaining)并标记 expired。单条 SQL 原子完成,可重复调用(expired
 *  守护 + led-exp-<id> 主键防重)。remaining 不清零(留作记录),余额靠 expires_at 过滤。 */
export async function expireDueBatches(emailRaw: string): Promise<void> {
  await getPool().query(
    `WITH upd AS (
       UPDATE app_credit_batches
          SET expired = true
        WHERE email = $1 AND expires_at <= now() AND remaining > 0 AND expired = false
        RETURNING id, remaining
     )
     INSERT INTO app_ledger (id, email, delta, reason, kind, created_at)
     SELECT 'led-exp-' || id, $1, -remaining, '积分过期', 'expire', now()
       FROM upd
     ON CONFLICT (id) DO NOTHING`,
    [emailRaw.toLowerCase()]
  );
}

/** 跑过期 → 算余额 → 把 credits_total 同步成该余额(后台列表直读)。返回余额。 */
export async function refreshBalance(emailRaw: string): Promise<number> {
  const email = emailRaw.toLowerCase();
  await expireDueBatches(email);
  return withBillingTransaction(getPool(),async tx=>{
    // Read principal after the wallet lock has been acquired. A value read before
    // waiting can otherwise overwrite a settlement that committed while waiting.
    await tx.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE",[email]);
    const {rows}=await tx.query(`UPDATE app_users SET credits_total=(
      SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches
      WHERE email=$1 AND expires_at>now() AND remaining>0
    ) WHERE email=$1 RETURNING credits_total`,[email]);
    return Number(rows[0]?.credits_total??0);
  });
}

/** 用户端积分概览:余额 + 最近一笔将到期的批次(给账户页头部用)。 */
export async function getCreditOverview(
  emailRaw: string
): Promise<{ balance: number; nextExpiry: { amount: number; at: string } | null }> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const balance = await refreshBalance(email);
  const { rows } = await getPool().query(
    `SELECT remaining, expires_at FROM app_credit_batches
      WHERE email = $1 AND expires_at > now() AND remaining > 0
      ORDER BY expires_at ASC LIMIT 1`,
    [email]
  );
  const next = rows[0]
    ? { amount: rows[0].remaining as number, at: new Date(rows[0].expires_at).toISOString() }
    : null;
  return { balance, nextExpiry: next };
}
