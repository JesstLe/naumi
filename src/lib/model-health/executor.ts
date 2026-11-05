import "server-only";
import type { Pool } from "pg";
import type { ModelSnapshot } from "../model-config/types";
import type { ModelExecutionScope } from "../model-config/context";
import { runModelExecution } from "../model-config/context";
import { executionFetch } from "../model-config/execution-fetch";
import { completedChannelImage } from "../model-config/channel-image-response";
import { createProviderCapacity } from "../model-config/capacity";
import { withImageOperation } from "../image-gateway";
import type { HealthTarget } from "./targets";
import type { HealthResult } from "./contracts";
import { classifyHealthFailure } from "./outcomes";

export function healthExecutionScope(snapshot: ModelSnapshot, target: HealthTarget, apiKey: string,billingVersion=1): ModelExecutionScope {
  const p=target.provider,u=target.upstream;
  const quality=["low","medium","high","xhigh","max","auto"].find(q=>(u.capabilities.qualities as string[]).includes(q))||"medium";
  const resolution=(["1K","2K","4K"] as const).find(r=>u.capabilities.nativeResolutions.includes(r))||"1K";
  return {audited:true,capacityReserved:true,connection:{...p,providerId:p.id,apiKey,wireModel:u.model},capabilities:u.capabilities,parameterMap:u.parameterMap,procurement:u.procurement,imagePreset:target.imagePreset,
    frozen:{feature:"system.model-health",modelVersion:snapshot.version,billingVersion,modelDigest:snapshot.digest,publicModelId:u.id,binding:"image.generate",modality:"image",target:{type:"upstream",id:u.id},credentialRef:p.credentialRef,
      facts:{task:"draft",quality,resolution,ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0,quantity:1}}};
}
export async function executeHealthProbe(input: {pool:Pool;snapshot:ModelSnapshot;target:HealthTarget;id:string;billingVersion?:number;readCredential:(ref:string,providerId:string)=>Promise<string>;trustedOrigins:readonly string[]}, overrides?:{fetcher?:typeof fetch;reserve?:()=>Promise<{release:()=>Promise<void>}>}): Promise<HealthResult> {
  const started=Date.now();let status:number|null=null,lease:{release:()=>Promise<void>}|undefined,submitted=false;
  try {
    const scope=healthExecutionScope(input.snapshot,input.target,await input.readCredential(input.target.provider.credentialRef!,input.target.provider.id),input.billingVersion);
    lease=overrides?.reserve?await overrides.reserve():await createProviderCapacity(input.pool).acquire({...scope.connection,maxConcurrent:scope.connection.maxConcurrent||1});
    const signal=AbortSignal.timeout(input.target.provider.timeoutMs);
    // No public model lookup, routing, supplierRouting, user wallet, or retry SDK.
    return await runModelExecution(scope,()=>withImageOperation(input.target.upstream.model,{id:`health:${input.id}`,quality:scope.frozen.facts!.quality,resolution:scope.frozen.facts!.resolution as "1K"|"2K"|"4K",ratio:"1:1",task:"draft",managedGateway:false},async()=>{
      const fetcher=overrides?.fetcher||executionFetch(scope,{trustedOrigins:input.trustedOrigins});submitted=true;
      const response=await fetcher(`${scope.connection.baseUrl.replace(/\/$/,"")}/images/generations`,{
        method:"POST",headers:{Authorization:`Bearer ${scope.connection.apiKey}`,"Content-Type":"application/json","Idempotency-Key":`health-${input.id}`},
        body:JSON.stringify({model:scope.connection.wireModel,prompt:"A single blue ceramic cup on a plain white background, no text.",n:1,quality:scope.frozen.facts!.quality,size:"1024x1024"}),signal});
      status=response.status;
      if (!response.ok) { await response.body?.cancel();return classifyHealthFailure(null,status,Date.now()-started); }
      const complete=await completedChannelImage(response,signal,{trustedOrigins:input.trustedOrigins});
      // Exactly one output; decode/download already accepted, do not publish media.
      const body=await complete.json();
      if (body.data.length!==1) return {success:false,reason:"invalid-output",status,latencyMs:Date.now()-started};
      return {success:true,reason:null,status,latencyMs:Date.now()-started};
    }));
  } catch(error) {
    if(!submitted&&(error as {code?:string})?.code==="PROVIDER_BUSY")return {success:false,reason:"local-busy",status:null,latencyMs:Date.now()-started,skipped:true};
    return classifyHealthFailure(error,status,Date.now()-started);
  }
  finally {await lease?.release().catch(()=>{});}
}
