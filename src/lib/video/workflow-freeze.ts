import "server-only";
import {runFrozenWorkflowTexts} from "./workflow-text-context";
import {getModelAdministration} from "../model-config/server";
import {getModelExecutor,withFrozenExecutionBundle} from "../model-config/execution";
import {modelConfigurationEnabled} from "../model-config/availability";
import {runFrozenLegacyBilling,type ExecutionBundle} from "../model-config/context";
import {getBillingRuntime} from "../billing/runtime";
import {quoteForActor} from "../billing/quotation";
import {configuredVideoProviders,getVideoProviderConfig,type VideoProviderRuntimeConfig} from "./providers/config";
import {runPrivateVideoProvider} from "./providers/private-context";
import {ModelConfigError} from "../model-config/types";
import {bindByocWorkflowRecipe,byocVideoSubmissionInput} from './byoc-execution-binding';
import {prepareByocRecipe,runFrozenByocRecipe,runLegacyByocStage,type FrozenByocRecipe} from "./byoc-recipe";
import {runLegacyModelExecution} from "../model-config/context";
import {createHash} from "node:crypto";
import type {VideoWorkflowPlan} from "./workflow-schema";
import {freezeWorkflowCompiled,runFrozenWorkflowCompiled,type FrozenWorkflowCompiled} from './workflow-compiled';
export type FrozenWorkflowStage={compiledVersion?:1;compiled?:FrozenWorkflowCompiled;byoc?:FrozenByocRecipe;bundle?:ExecutionBundle;legacy?:VideoProviderRuntimeConfig;billingVersion:number;texts:Record<string,string>;quote:{version:number;credits:number;authorizedCredits:number;authorization?:boolean;modelVersion?:number}};
export function workflowBindingId(runId:string,binding:NonNullable<VideoWorkflowPlan["nodes"][number]["mediaBindings"]>[number]){return binding.inputId||`wf-${createHash("sha256").update(`${runId}:${binding.fromNodeId}:${binding.outputIndex||0}:${binding.role}`).digest("hex").slice(0,40)}`;}
import {runOwnedLegacyWorkflowStage} from './legacy-workflow-creation';
export async function withFrozenWorkflowStage<T>(actor:string,stage:FrozenWorkflowStage,run:()=>Promise<T>,confirmation?:{version:number;credits:number},owned?:{runId:string;nodeId:string}){
  const requiresCompiled=!!stage.bundle?.video?.video?.execution||stage.compiledVersion!==undefined||stage.compiled!==undefined;
  if(requiresCompiled&&(stage.compiledVersion!==1||!stage.compiled))throw new ModelConfigError('WORKFLOW_SNAPSHOT_UNAVAILABLE','制作链编译记录缺失或版本无效',503);
  return !requiresCompiled&&!stage.byoc?runOwnedLegacyWorkflowStage(actor,stage,owned,()=>restoreWorkflowStage(actor,stage,run,confirmation)):restoreWorkflowStage(actor,stage,run,confirmation);
}
async function restoreWorkflowStage<T>(actor:string,stage:FrozenWorkflowStage,run:()=>Promise<T>,confirmation?:{version:number;credits:number}){
  const action=()=>runFrozenWorkflowTexts(actor,stage.texts,()=>stage.compiled?runFrozenWorkflowCompiled(stage.compiled,stage.quote,confirmation,run):run());
  if(stage.byoc)return runLegacyModelExecution(()=>runFrozenByocRecipe(stage.byoc!,()=>stage.compiled?action():runLegacyByocStage(action)));
  if(stage.bundle)return withFrozenExecutionBundle(stage.bundle,action);
  if(!stage.legacy)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","制作链冻结配置不可用",503);
  const billing=await(await getBillingRuntime()).config.byVersion(stage.billingVersion);
  return runFrozenLegacyBilling(billing,()=>runPrivateVideoProvider({config:stage.legacy!,manifest:{version:1,kind:"comfyui",inputs:[]}},action));
}
export async function freezeVideoWorkflow(actor:string,plan:VideoWorkflowPlan){
  const billing=await(await getBillingRuntime()).config.current();
  const result:Record<string,FrozenWorkflowStage>={};
  if(plan.nodes.every(node=>node.existingArtworkId)){
    for(const node of plan.nodes)result[node.id]={billingVersion:billing.version,texts:{},quote:{version:billing.version,credits:0,authorizedCredits:0}};
    return result;
  }
  const managed=await modelConfigurationEnabled(),admin=managed?await getModelAdministration():null,snapshot=admin?await admin.repo.current():null,executor=admin?await getModelExecutor():null;
  for(const node of plan.nodes){
    if(node.existingArtworkId){result[node.id]={billingVersion:billing.version,texts:{},quote:{version:billing.version,credits:0,authorizedCredits:0}};continue;}
    const request=node.request,values:Record<string,string>={};
    const candidateReferences=[...(request.references||[])];
    if(request.comfyWorkflowId){
      const futureInputs=(node.mediaBindings||[]).map(binding=>{const id=workflowBindingId(plan.id,binding);return {id,nodeId:request.orderedInputs?.find(item=>item.id===id)?.nodeId||binding.fromNodeId,kind:binding.kind,role:binding.role};});
      const recipe=await prepareByocRecipe(actor,{workflowId:request.comfyWorkflowId,references:[...candidateReferences,...futureInputs.map(item=>({id:item.id,kind:item.kind,role:item.role}))],inputMappings:request.comfyInputs,...request.comfyOverrides});
      const bound=bindByocWorkflowRecipe(recipe,request.comfyOverrides??{}),byocInput=byocVideoSubmissionInput({...request,workflowId:request.comfyWorkflowId,source:'workflow',projectKey:plan.projectKey,idempotencyKey:plan.id});
      const compiled=await freezeWorkflowCompiled(actor,plan.projectKey,byocInput,futureInputs,bound);
      for(const item of compiled.staticDraft.inputs)if(item.kind==='text')values[item.nodeId.replace(/^text:/,'')]=item.text;
      result[node.id]={byoc:recipe,compiledVersion:1,compiled,billingVersion:billing.version,texts:values,quote:{version:billing.version,credits:0,authorizedCredits:0}};continue;
    }

    let stage:FrozenWorkflowStage;
    if(executor&&snapshot){const video=await executor.resolve({feature:"video.generate",binding:"video.generate",requestedModelId:request.modelId,snapshot,billing});stage={bundle:{modelVersion:snapshot.version,billingVersion:billing.version,primary:"video",video},billingVersion:billing.version,texts:values,quote:{version:billing.version,credits:0,authorizedCredits:0,modelVersion:snapshot.version}};}
    else{const provider=getVideoProviderConfig(request.providerId||configuredVideoProviders()[0]?.id||"openai-videos");if(!provider)throw new ModelConfigError("VIDEO_PROVIDER_UNAVAILABLE","视频供应商尚未配置",422);stage={legacy:structuredClone(provider),billingVersion:billing.version,texts:values,quote:{version:billing.version,credits:0,authorizedCredits:0}};request.modelId=request.modelId||provider.defaultModel;request.providerId=provider.id;}
    await restoreWorkflowStage(actor,stage,async()=>{
      const frozen=stage.bundle?.video?.video;
      if(frozen?.execution){
        const futureInputs=(node.mediaBindings||[]).map(binding=>{const id=workflowBindingId(plan.id,binding);return {id,nodeId:request.orderedInputs?.find(item=>item.id===id)?.nodeId||binding.fromNodeId,kind:binding.kind,role:binding.role};});
        const compiled=await freezeWorkflowCompiled(actor,plan.projectKey,{...request,source:'workflow',prompt:request.prompt,seconds:request.seconds||'',size:request.size||''},futureInputs);
        const quote=await quoteForActor(actor,{feature:'video.generate',quantity:1,modelId:stage.bundle!.video!.publicModelId,providerId:compiled.binding.connectionId,resolution:compiled.projected.billingFacts.resolution,ratio:compiled.projected.billingFacts.aspectRatio});
        stage.compiledVersion=1;stage.compiled=compiled;for(const item of compiled.staticDraft.inputs)if(item.kind==='text')values[item.nodeId.replace(/^text:/,'')]=item.text;stage.quote={version:quote.configVersion,credits:quote.requestedCredits,authorizedCredits:quote.authorizedCredits,authorization:quote.tariff.pricing.mode==='api-cost-plus',modelVersion:stage.bundle!.modelVersion};
        return;
      }
      throw new ModelConfigError('VIDEO_EXECUTION_NOT_CONFIGURED','制作链通道尚未发布视频执行映射',422,['binding']);
    });
    result[node.id]=stage;
  }
  return result;
}
