import "server-only";
import {getSetting} from "@/lib/settings/repository";

// Legacy manual-metering compatibility. Keep its semantics distinct from meteringFor.

export const CREDITS_METERING_SETTING = "credits_metering";

// 是否启用「积分计费」:开启后生图按积分扣(单用户也扣),站长后台自行加积分。
// 独立于多用户 —— 单用户也能开来给自己/他人做用量控制。永不抛错。
export async function creditsMeteringOn(): Promise<boolean> {
  if (process.env.DATABASE_URL) {
    const {getBillingRuntime} = await import("@/lib/billing/runtime");
    const mode = (await (await getBillingRuntime()).config.current()).config.switches.metering;
    if (mode !== "legacy-auto") return mode === "on";
  }
  try {
    const flag = (await getSetting(CREDITS_METERING_SETTING))?.trim();
    return flag === "1" || flag === "true";
  } catch {
    return false;
  }
}
