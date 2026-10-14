import "server-only";
import {modelEndpointFetch} from "../../model-config/transport";
import {readLimitedMediaResponse} from "../result-download";
import {currentPrivateVideoContext} from "./private-context";
import type {VideoProviderRuntimeConfig} from "./config";

export type VideoResultAssetSource={kind:"video"|"image"|"audio";url:string;mimeType?:string};
/** Only downloads accept bounded redirects; each hop revalidates and pins DNS.
 * A cross-origin hop permanently removes provider authentication from the chain. */
export async function downloadVideoResultAsset(config:VideoProviderRuntimeConfig,asset:VideoResultAssetSource){
  let target=new URL(asset.url),authentication=true;const supplierOrigin=new URL(config.baseUrl).origin;
  const trustedOrigins=(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean);
  if(currentPrivateVideoContext()?.config.id===config.id&&(process.env.USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK==="true"||process.env.NODE_ENV!=="production"))trustedOrigins.push(supplierOrigin);
  const signal=AbortSignal.timeout(180000);
  for(let hop=0;hop<=3;hop++){
    if(!["https:","http:"].includes(target.protocol)||target.username||target.password||target.hash)throw new Error("视频结果地址无效");
    const base=new URL(target);base.search="";base.hash="";
    const transport=modelEndpointFetch(base.href,{trustedOrigins},undefined,{redirectResponse:true});
    const headers:Record<string,string>={};
    if(authentication&&target.origin===supplierOrigin&&config.apiKey){
      if(config.videoProfile==="gemini"||(!config.videoProfile&&config.protocol==="gemini"))headers["x-goog-api-key"]=config.apiKey;
      else headers.authorization=config.rawAuthorization||config.videoProfile==="autodl"?config.apiKey:`Bearer ${config.apiKey}`;
    }
    const response=await transport(target.href,{headers,signal,cache:"no-store"});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");await response.body?.cancel().catch(()=>{});
      if(!location||hop===3)throw new Error("视频结果重定向无效或超过限制");
      const next=new URL(location,target);
      if(target.protocol==="https:"&&next.protocol!=="https:")throw new Error("视频结果不能降级为非加密下载");
      if(next.origin!==target.origin)authentication=false;target=next;continue;
    }
    const downloaded=await readLimitedMediaResponse(response,asset.kind==="image"?32*1024*1024:200*1024*1024,asset.kind);
    return {bytes:downloaded.bytes,mimeType:downloaded.mimeType};
  }
  throw new Error("视频结果下载未完成");
}
