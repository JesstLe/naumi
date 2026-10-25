import "server-only";
import {getPool} from "@/platform/db/pool";
import {createPublishedModelReader} from "./published-repository";
import {modelTrustedOrigins} from "./environment";
import {ModelConfigError} from "./types";

let reader:ReturnType<typeof createPublishedModelReader>|undefined;
/** Published reads only. Discovery/import belongs to startup or an explicit
 * management operation, never a catalog or frozen execution read. */
export async function readPublishedModelSnapshot(version?:number) {
  const current=reader??(reader=createPublishedModelReader({pool:getPool(),trustedOrigins:modelTrustedOrigins()}));
  try{
    if(version!==undefined)return await current.byVersion(version);
    const snapshot=await current.current();
    if(snapshot)return snapshot;
  }catch(error){
    // Missing tables/versions are unavailable data, not a bootstrap invitation.
    if((error as {code?:string})?.code!=="42P01")throw error;
  }
  throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
}
