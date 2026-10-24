import "server-only";
import {randomUUID} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {getSetting} from "@/lib/settings/repository";
import seed from "./bootstrap.json";
import {createConfigRuntime} from "./catalog";
import {createBillingService} from "./service";
import {BillingError,type BillingConfig,type ConfigSnapshot} from "./types";
import {supabaseEnabled} from "../auth-mode";
import {multiUserEnabled} from "../native-auth";
import type {PoolClient} from "pg";

let runtime: ReturnType<typeof assemble> | undefined;
function assemble() {
    return { service: createBillingService(), config: createConfigRuntime({ pool: getPool(), ensureSchema, initialize: async (tx) => {
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
            } }) };
}
export async function getBillingRuntime() {
    if (!dbEnabled)
        throw new BillingError("CONFIG_UNAVAILABLE", "未配置数据库，计费管理暂不可用", 503);
    return runtime ?? (runtime = assemble());
}
export async function billingSnapshot():Promise<ConfigSnapshot> {
    if(dbEnabled)return (await getBillingRuntime()).config.current();
    const config=structuredClone(seed) as BillingConfig;
    config.switches.metering="off";config.switches.commerce=false;config.switches.recharge=false;
    return {version:0,config};
}
export async function meteringFor(snapshot: ConfigSnapshot, tx?: PoolClient) {
    if(!dbEnabled)return false;
    if (snapshot.config.switches.metering !== "legacy-auto")
        return snapshot.config.switches.metering === "on";
    const manual = (await getSetting("credits_metering", tx))?.trim();
    return supabaseEnabled || await multiUserEnabled(tx) || manual === "1" || manual === "true";
}
export async function updateBillingCompatibility(actor: string, reason: string, change: (config: BillingConfig) => void) {
    const config = (await getBillingRuntime()).config, current = await config.current();
    const next = structuredClone(current.config);
    change(next);
    return config.publish({ id: randomUUID(), actor, reason, expectedVersion: current.version, config: next });
}
export async function billingSwitches() { const snapshot = await billingSnapshot(); return { metering: await meteringFor(snapshot), commerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" && snapshot.config.switches.commerce, recharge: snapshot.config.switches.recharge, environmentCommerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" }; }

export async function creditMeteringEnabled(tx?: PoolClient): Promise<boolean> {
  if (!dbEnabled) return false;
  return meteringFor(await (await getBillingRuntime()).config.current(tx), tx);
}
