import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {bootstrapModelConfig,readLegacyModelSources} from "./bootstrap";
import {createCredentialStore} from "./credentials";
import {importLegacyRouter} from "./legacy-router";
import {createModelRepository} from "./repository";
import {createRouterControl} from "./router-client";
import {ensureModelSchema} from "@/lib/model-config/storage-schema";

import {modelTrustedOrigins} from "./environment";
import {ModelConfigError} from "./types";

let initialization:Promise<Awaited<ReturnType<typeof initialize>>>|undefined;
async function initialize(requireModels:boolean) {
  if(!dbEnabled)throw new ModelConfigError("CONFIG_UNAVAILABLE","未配置数据库，模型管理暂不可用",503);
  const baseUrl=process.env.NAUMI_ROUTER_MANAGEMENT_URL||"";
  if(!baseUrl)throw new ModelConfigError("ROUTER_UNAVAILABLE","尚未配置 Router 私有管理连接",503);
  const trustedOrigins=modelTrustedOrigins();
  const router=createRouterControl({baseUrl,token:process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN||"",envelopeSecret:process.env.MODEL_CONFIG_ENVELOPE_SECRET||"",trustedOrigins});
  await ensureSchema();
  const pool=getPool();await ensureModelSchema(pool);
  const credentials=createCredentialStore(pool);
  const initialized=(await pool.query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount;
  const discovery=initialized?undefined:await Promise.all([readLegacyModelSources(),router.legacy()]);
  const repo=createModelRepository({pool,trustedOrigins,initialize:async tx=>{
    if(!discovery)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型初始化状态待核对",503);
    const [sources,exported]=discovery;
    const imported=await importLegacyRouter({exported,control:router,credentials,tx});
    const config=await bootstrapModelConfig({credentials,sources:{...sources,router:imported},tx,trustedOrigins});
    if(requireModels&&!config.publicModels.length)throw new ModelConfigError("CONFIG_NOT_READY","尚未配置模型",503);
    return config;
  }});
  await repo.current();
  return {repo,credentials,router,trustedOrigins,pool};
}

/** Startup and explicit management share the retryable import lifecycle.
 * Published request/frozen reads never call it. */
export function initializeModelRegistry(input:{requireModels?:boolean}={}) {
  if(!initialization)initialization=initialize(input.requireModels===true).catch(error=>{initialization=undefined;throw error;});
  return initialization;
}
