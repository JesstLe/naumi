import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {readFrozenBillingSnapshot} from "../billing/frozen-config";
import {createCredentialReader} from "./credential-reader";
import {createExecutionProjectionService} from "./execution-projections";
import {modelTrustedOrigins} from "./environment";
import {readPublishedModelSnapshot} from "./published";
import {createRouterControl,type RouterControl} from "./router-client";
import {ModelConfigError} from "./types";

let services:ReturnType<typeof assemble>|undefined;
function assemble(){
  if(!dbEnabled)throw new ModelConfigError("CONFIG_UNAVAILABLE","未配置数据库，模型执行暂不可用",503);
  const pool=getPool(),credentials=createCredentialReader(pool),trustedOrigins=modelTrustedOrigins();
  let router:RouterControl|undefined;
  const control=()=>{
    if(router)return router;
    const baseUrl=process.env.NAUMI_ROUTER_MANAGEMENT_URL||"";
    if(!baseUrl)throw new ModelConfigError("ROUTER_UNAVAILABLE","尚未配置 Router 私有管理连接",503);
    return router=createRouterControl({baseUrl,token:process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN||"",envelopeSecret:process.env.MODEL_CONFIG_ENVELOPE_SECRET||"",trustedOrigins});
  };
  const projections=createExecutionProjectionService({pool,credentials,trustedOrigins,get router(){return control();}});
  const byVersion=async(version:number)=>{
    if(!Number.isSafeInteger(version)||version<1)throw new ModelConfigError("INVALID_CONFIG","配置版本无效");
    return readPublishedModelSnapshot(version);
  };
  const models={current:()=>readPublishedModelSnapshot(),byVersion};
  const billing={
    current:async()=>{const {getBillingRuntime}=await import("../billing/runtime");return (await getBillingRuntime()).config.current();},
    byVersion:readFrozenBillingSnapshot,
  };
  return {models,billing,credentials,trustedOrigins,runtime:{byVersion:models.byVersion,...projections}};
}
/** Execution components do not assemble administration or discover providers.
 * Only genuinely new external-router preparation obtains its control connection. */
export function getModelExecutionServices(){return services??(services=assemble());}
