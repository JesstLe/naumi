import "server-only";
import {getPool} from "@/platform/db/pool";
import {createPublishedModelReader} from "./published-repository";
import {modelTrustedOrigins} from "./environment";
import {ModelConfigError} from "./types";

export type ModelRegistryStartup=
 | {state:"legacy"|"unconfigured"}
 | {state:"published"|"initialized";version:number}
 | {state:"unavailable";code:string};

/** Runs after the schema owners. Existing releases need no control service;
 * only a genuinely empty, configured registry discovers/imports legacy data.
 * A model setup failure is reported without taking login/repair tools offline. */
export async function prepareModelRegistry():Promise<ModelRegistryStartup>{
 try{
  const pool=getPool(),reader=createPublishedModelReader({pool,trustedOrigins:modelTrustedOrigins()});
  const published=await reader.current();
  if(published)return {state:"published",version:published.version};
  if((await pool.query("SELECT 1 FROM app_model_config_versions LIMIT 1")).rowCount)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  if(!process.env.NAUMI_ROUTER_MANAGEMENT_URL)return {state:"legacy"};
  const {initializeModelRegistry}=await import("./lifecycle");
  await initializeModelRegistry({requireModels:true});
  const initialized=await reader.current();
  if(!initialized)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  return {state:"initialized",version:initialized.version};
 }catch(error){
  if(error instanceof ModelConfigError&&error.code==="CONFIG_NOT_READY")return {state:"unconfigured"};
  return {state:"unavailable",code:error instanceof ModelConfigError?error.code:"CONFIG_UNAVAILABLE"};
 }
}
