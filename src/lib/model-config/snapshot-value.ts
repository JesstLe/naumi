import "server-only";
import {createHash} from "node:crypto";
import {validateModelConfig,type ValidationOptions} from "./schema";
import {ModelConfigError,type ModelConfig,type ModelSnapshot} from "./types";

export function canonicalConfig(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalConfig).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalConfig(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function modelConfigDigest(config: ModelConfig): string { return createHash("sha256").update(canonicalConfig(config)).digest("hex"); }

/** One decoder for management and released reads; no DB or control side effects. */
export function decodeModelSnapshot(row:{version:unknown;digest:unknown;config:unknown}|undefined,options:ValidationOptions={}):ModelSnapshot {
  if(!row)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  const config=validateModelConfig(row.config,options),version=Number(row.version);
  if(!Number.isSafeInteger(version)||version<1||row.digest!==modelConfigDigest(config))throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置摘要不一致",503);
  return {version,digest:row.digest as string,config};
}
