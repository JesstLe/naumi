import "server-only";
import {randomUUID} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {getSetting} from "@/lib/settings/repository";
import seed from "./bootstrap.json";
import {getBillingConfiguration} from "./configuration";
import {createBillingService} from "./service";
import {BillingError,type BillingConfig,type ConfigSnapshot} from "./types";
import {supabaseEnabled} from "../auth-mode";
import {multiUserEnabled} from "@/lib/accounts/mode";
import type {Pool,PoolClient} from "pg";

const runtimes=new WeakMap<Pool,ReturnType<typeof assemble>>();
function assemble(){return {service:createBillingService(),config:getBillingConfiguration()};}
export async function getBillingRuntime() {
    if (!dbEnabled)
        throw new BillingError("CONFIG_UNAVAILABLE", "未配置数据库，计费管理暂不可用", 503);
    const pool=getPool();let runtime=runtimes.get(pool);
    if(!runtime){runtime=assemble();runtimes.set(pool,runtime);}
    return runtime;
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
export async function billingSwitchesFor(snapshot:ConfigSnapshot, tx?:PoolClient) {
    const environmentCommerce = process.env.NAUMI_PUBLIC_COMMERCE === "1";
    return { metering: await meteringFor(snapshot, tx), commerce: environmentCommerce && snapshot.config.switches.commerce, recharge: snapshot.config.switches.recharge, environmentCommerce };
}

export async function billingSwitches() { return billingSwitchesFor(await billingSnapshot()); }

export async function creditMeteringEnabled(tx?: PoolClient): Promise<boolean> {
  if (!dbEnabled) return false;
  return meteringFor(await (await getBillingRuntime()).config.current(tx), tx);
}
