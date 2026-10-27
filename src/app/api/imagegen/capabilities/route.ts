import {configuredImageCapabilities} from "@/lib/model-config/image-parameter-plan";
import {resolveUserEmail} from "@/lib/admin-auth";
import {getModelAdministration} from "@/lib/model-config/server";
import {featureDefaultModel,assertToolScope} from "@/lib/model-config/tool-scope";
import {routeImageModel} from "@/lib/image-model-routing";
import {simulateModel} from "@/lib/model-config/runtime";
import {publishedImagegenCapabilities} from "@/lib/imagegen/capabilities";
import type {CapabilityKey} from "@/lib/imagegen/types";
export const runtime="nodejs";
export async function GET(request:Request){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 try{const query=new URL(request.url).searchParams,admin=await getModelAdministration(),models=await admin.repo.current(),billing=await admin.billing.current(),feature=query.get("entry")==="canvas"?"canvas.image":"image.generate";
 const id=routeImageModel(query.get("modelId")||featureDefaultModel(models.config,feature,"image.generate")||"",query.get("ratio")||"1:1",models.config.publicModels);assertToolScope(models.config,feature,id);
 const simulation=simulateModel(models,billing,id,{task:"product",quality:query.get("quality")||"medium",resolution:query.get("resolution")||"1K",ratio:query.get("ratio")||"1:1",references:0,needsEdit:false,needsText:false,preserveIdentity:false,nativeResolution:false,quantity:1,inputLength:1},{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)});
 const values:Partial<Record<CapabilityKey,string[]>>={};
 for(const candidate of simulation.eligible){const upstream=models.config.upstreamModels.find(u=>u.id===candidate.upstreamId)!,caps=configuredImageCapabilities(upstream,publishedImagegenCapabilities(upstream.capabilities));for(const key of Object.keys(caps) as CapabilityKey[]){const cap=caps[key];if(cap?.state!=="supported")continue;if(!["edit","mask"].includes(key)&&(!upstream.parameterMap.imagegen?.[key]||upstream.parameterMap.imagegen[key]==="omit"))continue;values[key]=Array.from(new Set([...(values[key]||[]),...(cap.values||[])]));}}
 return Response.json({values},{headers:{"cache-control":"private, no-store"}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"能力读取失败"},{status:400});}
}
