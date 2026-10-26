import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import seed from "./bootstrap.json";
import {createConfigRuntime} from "./catalog";
import {BillingError,type BillingConfig} from "./types";

let configuration:ReturnType<typeof createConfigRuntime>|undefined;
/** Configuration lifecycle only; startup does not construct wallet/task services. */
export function getBillingConfiguration(){
 if(!dbEnabled)throw new BillingError("CONFIG_UNAVAILABLE","未配置数据库，计费管理暂不可用",503);
 return configuration??(configuration=createConfigRuntime({ pool: getPool(), ensureSchema, initialize: async (tx) => {
                const config = structuredClone(seed) as BillingConfig;
                const settings = (await tx.query<{
                    k: string;
                    v: string;
                }>("SELECT k,v FROM app_settings WHERE k=ANY($1)", [["signup_bonus_credits", "credits_metering", "pay_enabled"]])).rows;
                const old = Object.fromEntries(settings.map(x => [x.k, x.v]));
                const bonus = Number(old.signup_bonus_credits);
                if (old.signup_bonus_credits !== undefined && Number.isSafeInteger(bonus) && bonus >= 0)
                    config.credits.signup.amount = Math.min(bonus, 100000);
                // legacy-auto preserves Supabase/multi-user plus the original manual switch.
                const recharge = old.pay_enabled === undefined ? process.env.NEXT_PUBLIC_RECHARGE_ENABLED === "true" : old.pay_enabled === "1";
                config.switches.commerce = process.env.NAUMI_PUBLIC_COMMERCE === "1";
                config.switches.recharge = recharge;
                const video = Number(process.env.VIDEO_TASK_COST);
                if (Number.isSafeInteger(video) && video > 0 && video <= 2147483647)
                    config.features["video.generate"].pricing = { mode: "fixed", credits: video };
                return config;
            } }));
}
