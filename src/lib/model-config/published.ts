import "server-only";
import {getPool} from "@/platform/db/pool";
import {createPublishedModelReader} from "./published-repository";
import {modelTrustedOrigins} from "./environment";
import {ModelConfigError} from "./types";

let reader:ReturnType<typeof createPublishedModelReader>|undefined;
/** Request reads are independent of administration/runtime assembly. Only an
 * absent registry/table invokes the existing first-use compatibility lifecycle. */
export async function readPublishedModelSnapshot(version?:number) {
  const current=reader??(reader=createPublishedModelReader({pool:getPool(),trustedOrigins:modelTrustedOrigins()}));
  try{
    if(version!==undefined)return await current.byVersion(version);
    const snapshot=await current.current();
    if(snapshot)return snapshot;
  }catch(error){
    // Missing versions, broken pointers, corrupt data and other DB failures
    // never seed or swap accepted work to a different current version.
    if((error as {code?:string})?.code!=="42P01")throw error;
    if(version!==undefined)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
    const state=(await getPool().query("SELECT to_regclass('app_model_config_state') AS relation")).rows[0]?.relation;
    if(state&&(await getPool().query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  }
  if(process.env.FLEET_PORTAL_ONLY==="1"||process.env.NAUMI_AUTH_LOGIN_ONLY==="1")throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  const {initializeModelRegistry}=await import("./lifecycle");
  await initializeModelRegistry();
  if(version!==undefined)return current.byVersion(version);
  const snapshot=await current.current();
  if(!snapshot)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  return snapshot;
}
