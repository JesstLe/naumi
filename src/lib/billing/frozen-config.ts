import "server-only";
import {getPool} from "@/platform/db/pool";
import {BillingError,type ConfigSnapshot} from "./types";
import {validateBillingConfig} from "./rules/schema";
import type {Pool} from 'pg';
type Row={version:string|number;config:unknown};
export function billingSnapshotFromRow(row: Row): ConfigSnapshot {
    const version = Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1)
        throw new BillingError("CONFIG_UNAVAILABLE", "计费配置版本无效", 503);
    return { version, config: validateBillingConfig(row.config) };
}

/** A historical paid contract is read, never initialized or replaced by current. */
export async function readFrozenBillingSnapshot(version:number,sql?:Pick<Pool,'query'>):Promise<ConfigSnapshot>{
  if(!Number.isSafeInteger(version)||version<1)throw new BillingError("INVALID_CONFIG","配置版本无效",400);
  let row;try{row=(await (sql??getPool()).query<Row>("SELECT version,config FROM app_billing_config_versions WHERE version=$1",[version])).rows[0];}
  catch(error){if((error as {code?:string}).code!=="42P01")throw error;}
  if(!row)throw new BillingError("CONFIG_UNAVAILABLE","配置版本不存在",404);
  return billingSnapshotFromRow(row);
}
