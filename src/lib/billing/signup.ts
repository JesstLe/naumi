import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import {getSetting} from "../settings/repository";

// 新用户注册赠送积分(后台可配)。默认 30;设为 0 则不赠送。30 天有效。
const SIGNUP_BONUS_KEY = "signup_bonus_credits";
const SIGNUP_BONUS_DEFAULT = 30;

/** 读「新用户注册赠送积分数」(后台设置优先,默认 30)。 */
export async function getSignupBonus(): Promise<number> {
  if (dbEnabled) {
    const {getBillingRuntime} = await import("@/lib/billing/server");
    return (await (await getBillingRuntime()).config.current()).config.credits.signup.amount;
  }
  try {
    const v = await getSetting(SIGNUP_BONUS_KEY);
    if (v != null && v !== "") {
      const n = Math.trunc(Number(v));
      if (Number.isFinite(n) && n >= 0) return Math.min(n, 100000);
    }
  } catch {
    /* 读失败回退默认 */
  }
  return SIGNUP_BONUS_DEFAULT;
}

/** 后台保存「新用户注册赠送积分数」(夹取 0..100000)。 */
export async function setSignupBonus(n: number, actor = "local-admin"): Promise<void> {
  const safe = Math.min(Math.max(0, Math.trunc(n)), 100000);
  const {updateBillingCompatibility} = await import("@/lib/billing/server");
  await updateBillingCompatibility(actor, "更新注册赠送积分", config => {config.credits.signup.amount = safe;});
}
