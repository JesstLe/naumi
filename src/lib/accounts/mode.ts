import "server-only";
import {getSetting} from "@/lib/settings/repository";
import {supabaseEnabled} from "@/lib/auth-mode";
import type {PoolClient} from "pg";

// Deployment/account mode facts, independent of session signing and billing assembly.
 // 30 天
export const MULTI_USER_SETTING = "multi_user_enabled";

/** 是否启用「原生多用户」模式:无 Supabase + 已激活 Pro + 站长后台开了开关。永不抛错。 */
export async function multiUserEnabled(tx?: PoolClient): Promise<boolean> {
  if (supabaseEnabled) return false; // Supabase 模式另有多用户实现
  try {
     // 多用户是 Pro 能力
    // env 开关(compose 里设 NAUMI_MULTI_USER=1 即开,适合技术站长)或后台开关。
    if ((process.env.NAUMI_MULTI_USER ?? "").trim() === "1") return true;
    const flag = (await getSetting(MULTI_USER_SETTING, tx))?.trim();
    return flag === "1" || flag === "true";
  } catch {
    return false;
  }
}
