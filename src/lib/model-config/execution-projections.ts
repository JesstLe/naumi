import "server-only";
import {createHash,randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {ConfigSnapshot} from "../billing/types";
import type {CredentialReader} from "./credential-reader";
import type {RouterControl} from "./router-client";
import {compileRouterProjection,type RouterProjection} from "./projection";
import {ensureModelRuntimeSchema} from "./runtime-schema";
import {canonicalConfig} from "./snapshot-value";
import type {ValidationOptions} from "./schema";
import {ModelConfigError,type ModelSnapshot} from "./types";

type Dependencies=ValidationOptions&{pool:Pool;credentials:CredentialReader;router:RouterControl};
/** Shared projection preparation; accepted projection validation is SELECT-only. */
export function createExecutionProjectionService(deps:Dependencies){
  const ready=async()=>ensureModelRuntimeSchema(deps.pool);

  const prepareExecution = async (input: { snapshot: ModelSnapshot; billing: ConfigSnapshot }): Promise<RouterProjection> => {
    await ready();
    const key = [input.snapshot.version, input.billing.version];
    const read = async () => (await deps.pool.query("SELECT * FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2", key)).rows[0];
    const cached = await read();
    const projection = compileRouterProjection(input.snapshot, input.billing, deps);
    if (cached?.phase === "prepared") {
      const { digest, ...payload } = cached.payload || {};
      if (digest !== cached.digest || digest !== projection.digest || createHash("sha256").update(canonicalConfig(payload)).digest("hex") !== digest) throw new ModelConfigError("CONFIG_UNAVAILABLE", "已准备的执行配置摘要不一致", 503);
      return projection;
    }
    await deps.pool.query("INSERT INTO app_model_router_projections(model_version,billing_version,digest,phase,payload) VALUES($1,$2,$3,'staged',$4::jsonb) ON CONFLICT(model_version,billing_version) DO NOTHING", [...key,projection.digest,JSON.stringify(projection.payload)]);
    const lease = randomUUID();
    const deadline = Date.now() + 11000;
    while (true) {
      const row = await read();
      if (!row || row.digest !== projection.digest) throw new ModelConfigError("CONFIG_CONFLICT", "同一模型与计费版本的执行摘要不一致", 409);
      if (row.phase === "prepared") return projection;
      const claimed = await deps.pool.query("UPDATE app_model_router_projections SET phase='preparing',lease_id=$3,lease_until=now()+interval '30 seconds' WHERE model_version=$1 AND billing_version=$2 AND phase<>'prepared' AND (lease_until IS NULL OR lease_until<now()) RETURNING digest", [...key,lease]);
      if (claimed.rowCount) break;
      if (Date.now() >= deadline) throw new ModelConfigError("CONFIG_PREPARING", "执行配置正在准备，请稍后重试", 503);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    try {
      const credentials = await Promise.all(projection.payload.config.providers.map(async p => deps.router.seal(p.credentialRef, p.id, await deps.credentials.read(p.credentialRef, p.id))));
      await deps.router.prepare(projection.payload, credentials);
      const changed = await deps.pool.query("UPDATE app_model_router_projections SET phase='prepared',lease_id=NULL,lease_until=NULL WHERE model_version=$1 AND billing_version=$2 AND lease_id=$3", [...key,lease]);
      if (!changed.rowCount) throw new ModelConfigError("CONFIG_UNAVAILABLE", "执行配置准备结果待核对", 503);
      return projection;
    } catch (error) {
      await deps.pool.query("UPDATE app_model_router_projections SET phase='unknown',lease_id=NULL,lease_until=NULL WHERE model_version=$1 AND billing_version=$2 AND lease_id=$3", [...key,lease]);
      throw error;
    }
  };
  return {prepareExecution,async validateExecutionProjection(input: {modelVersion:number;billingVersion:number;digest:string}) {
      let row;
      try { row=(await deps.pool.query("SELECT digest,phase,payload FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2",[input.modelVersion,input.billingVersion])).rows[0]; }
      catch(error) { if((error as {code?:string}).code!=="42P01")throw error; }
      const {digest,...payload}=row?.payload||{};
      if(row?.phase!=="prepared"||row.digest!==input.digest||digest!==input.digest||createHash("sha256").update(canonicalConfig(payload)).digest("hex")!==digest)throw new ModelConfigError("EXECUTION_MISMATCH","任务路由组合与原版本不一致",503);
    }};
}
