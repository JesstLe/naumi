import "server-only";
import {runFrozenWorkflowTexts} from "./workflow-text-context";
import {getModelAdministration} from "../model-config/server";
import {getModelExecutor,withFrozenExecutionBundle} from "../model-config/execution";
import {modelConfigurationEnabled} from "../model-config/requests";
import {runFrozenLegacyBilling,type ExecutionBundle} from "../model-config/context";
import {getBillingRuntime,quoteForActor} from "../billing/server";
import {configuredVideoProviders,getVideoProviderConfig,type VideoProviderRuntimeConfig} from "./providers/config";
import {runPrivateVideoProvider} from "./providers/private-context";
import {adapterDefinition} from "./model-definition";
import {resolveVideoCapability,normalizeVideoInput} from "./contract";
import {compileVideoPrompt} from "./prompt";
import {compileVideoCamera} from "./camera";
import {requireOwnedVideoText} from "./submission";
import {ModelConfigError} from "../model-config/types";
import {createHash} from "node:crypto";
import type {VideoWorkflowPlan} from "./workflow-schema";
import type {VideoReference} from "./types";
export type FrozenWorkflowStage={bundle?:ExecutionBundle;legacy?:VideoProviderRuntimeConfig;billingVersion:number;texts:Record<string,string>;quote:{version:number;credits:number;authorizedCredits:number;modelVersion?:number}};
export function workflowBindingId(runId:string,binding:NonNullable<VideoWorkflowPlan["nodes"][number]["mediaBindings"]>[number]){return `wf-${createHash("sha256").update(`${runId}:${binding.fromNodeId}:${binding.outputIndex||0}:${binding.role}`).digest("hex").slice(0,40)}`;}
export async function withFrozenWorkflowStage<T>(actor:string,stage:FrozenWorkflowStage,run:()=>Promise<T>){
  const action=()=>runFrozenWorkflowTexts(actor,stage.texts,run);
  if(stage.bundle)return withFrozenExecutionBundle(stage.bundle,action);
  if(!stage.legacy)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","制作链冻结配置不可用",503);
  const billing=await(await getBillingRuntime()).config.byVersion(stage.billingVersion);
  return runFrozenLegacyBilling(billing,()=>runPrivateVideoProvider({config:stage.legacy!,manifest:{version:1,kind:"comfyui",inputs:[]}},action));
}
export async function freezeVideoWorkflow(actor:string,plan:VideoWorkflowPlan){
  const managed=await modelConfigurationEnabled(),admin=managed?await getModelAdministration():null,billing=await(await getBillingRuntime()).config.current(),snapshot=admin?await admin.repo.current():null,executor=admin?await getModelExecutor():null;
  const result:Record<string,FrozenWorkflowStage>={};
  for(const node of plan.nodes){
    const request=node.request,values:Record<string,string>={};
    for(const input of request.orderedInputs||[])if(input.kind==="text"&&!input.nodeId.startsWith("inline:")){const id=input.nodeId.replace(/^text:/,"");values[id]=await requireOwnedVideoText(actor,id);input.value=values[id];}
    for(const shot of request.shots||[])if(shot.textNodeId){const id=shot.textNodeId.replace(/^text:/,"");values[id]=await requireOwnedVideoText(actor,id);shot.prompt=values[id];}
    let stage:FrozenWorkflowStage;
    if(executor&&snapshot){const video=await executor.resolve({feature:"video.generate",binding:"video.generate",requestedModelId:request.modelId,snapshot,billing});stage={bundle:{modelVersion:snapshot.version,billingVersion:billing.version,primary:"video",video},billingVersion:billing.version,texts:values,quote:{version:billing.version,credits:0,authorizedCredits:0,modelVersion:snapshot.version}};}
    else{const provider=getVideoProviderConfig(request.providerId||configuredVideoProviders()[0]?.id||"openai-videos");if(!provider)throw new ModelConfigError("VIDEO_PROVIDER_UNAVAILABLE","视频供应商尚未配置",422);stage={legacy:structuredClone(provider),billingVersion:billing.version,texts:values,quote:{version:billing.version,credits:0,authorizedCredits:0}};request.modelId=request.modelId||provider.defaultModel;request.providerId=provider.id;}
    await withFrozenWorkflowStage(actor,stage,async()=>{
      const definition=stage.bundle?stage.bundle.video?.video?.definition:adapterDefinition(stage.legacy!.protocol,request.modelId!);if(!definition)throw new ModelConfigError("VIDEO_CAPABILITY_UNAVAILABLE","制作链模型能力尚未配置",422);
      const capability=resolveVideoCapability({manual:definition}),references=[...(request.references||[])],ordered=request.orderedInputs?structuredClone(request.orderedInputs):undefined;
      for(const binding of node.mediaBindings||[]){const id=workflowBindingId(plan.id,binding),ref:VideoReference={id,kind:binding.kind,role:binding.role,url:"/media/pending"};references.push(ref);if(ordered)ordered.push({id,nodeId:binding.fromNodeId,kind:binding.kind,role:binding.role,value:ref.url!});}
      if(request.camera&&capability.supportsCamera!==true)throw new ModelConfigError("CAMERA_UNSUPPORTED","制作链模型没有摄影能力",422);
      const normalized=normalizeVideoInput({...request,prompt:compileVideoPrompt(request.prompt,ordered||[],compileVideoCamera(request.camera)).prompt,references,orderedInputs:ordered},capability);
      const {prompt:_compiled,references:_references,orderedInputs:_ordered,omittedProviderOptions:_omitted,...settings}=normalized;node.request={...request,...settings};
      const quote=await quoteForActor(actor,{feature:"video.generate",quantity:1,modelId:node.request.modelId,providerId:node.request.providerId,resolution:node.request.resolution});stage.quote={version:quote.configVersion,credits:quote.requestedCredits,authorizedCredits:quote.authorizedCredits,...(stage.bundle?{modelVersion:stage.bundle.modelVersion}:{})};
    });
    result[node.id]=stage;
  }
  return result;
}
