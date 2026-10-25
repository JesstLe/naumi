import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {expireDueBatches} from "./wallet-balance";
import {creditMeteringEnabled} from "./runtime";

/** 原子预扣占位:credits_used += n,门槛 = 活批次余额 - 已占位 >= n。
 *  本金不在此刻扣,真正扣减发生在结算(addLedgerEntry 负数)。余额不足返回 false。 */
export async function reserveCredits(
  emailRaw: string,
  n: number
): Promise<boolean> {
  const {currentSynchronousBilling}=await import("@/lib/billing/synchronous-operation");
  if(currentSynchronousBilling()?.operation)return true;
  // 是否计费:①Supabase 多用户(官方云)②原生多用户 ③站长手动开的「积分计费」开关
  //(单用户也可开来给自己/他人做用量控制)。三者任一为真则扣分,否则放行(不扣)。
  const email = emailRaw.toLowerCase();
  const meterOn = await creditMeteringEnabled();
  if (!meterOn) return true; // 未开计费 → 放行,不扣积分
  await ensureSchema();
  if (n <= 0) return true;
  await expireDueBatches(email);
  const { rowCount } = await getPool().query(
    `UPDATE app_users u
        SET credits_used = credits_used + $2
      WHERE u.email = $1
        AND (SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches b
              WHERE b.email = u.email AND b.expires_at > now() AND b.remaining > 0)
            - u.credits_used >= $2`,
    [email, n]
  );
  return (rowCount ?? 0) > 0;
}

export async function refundCredits(
  emailRaw: string,
  n: number
): Promise<void> {
  const {currentSynchronousBilling}=await import("@/lib/billing/synchronous-operation");
  const context=currentSynchronousBilling();
  if(context?.operation){
    const {createBillingService,withBillingTransaction}=await import("@/lib/billing/service");
    await withBillingTransaction(getPool(),tx=>createBillingService().settleTx(tx,context.operation!,{state:context.upstream==="rejected"||context.upstream==="unobserved"||context.feature==="tool.printfile"?"failed":"unknown",items:[]}));return;
  }
  const meterOn = await creditMeteringEnabled();
  if (!meterOn) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE app_users
        SET credits_used = GREATEST(credits_used - $2, 0)
      WHERE email = $1`,
    [emailRaw.toLowerCase(), n]
  );
}
