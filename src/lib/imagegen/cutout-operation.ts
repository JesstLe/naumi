import "server-only";
import {createHash} from "node:crypto";
import {dbEnabled} from "@/platform/db/pool";
import {activeNativeAccountEmail} from "../native-auth";
import {withSynchronousOperation} from "../billing/synchronous-operation";
import {billingFailure} from "../billing/failure";
import {quoteForActor,quoteForImagegenStep} from "../billing/quotation";
import {getBillingRuntime} from "../billing/runtime";
import {multipartFieldText,multipartSubmissionFields,submissionFingerprint,type SubmissionField} from "../billing/submission-identity";
import {withBiModelContext} from "@/lib/bi/context";
import {withModelOperation} from "../model-config/requests";
import {getModelAdministration} from "../model-config/server";
import {ModelConfigError} from "../model-config/types";
import {currentCreationContext,withFrozenCreation} from "@/lib/saas/creation-scope";
import {ensureCreationSchema} from "../saas/creation-schema";
import {prepareOriginalCreationInput} from "../saas/creation-writer";
import {TeamError} from "../teams/server";
import {readImagegenInputs} from "./inputs";
import {imagegenStepIntent} from "./step-intent";
import {imagegenStepId} from "./operation-id";
import {compileImagegenPrompt} from "./prompt";
import {withImagegenStep} from "./context";
import {executeCutout,type CutoutResult} from "./cutout";
import type {ImagegenPlan} from "./types";

/** Server-owned plan execution. No HTTP request, session signing or route import. */
export async function submitCutoutOperation(plan:ImagegenPlan,key:string,actor:string):Promise<CutoutResult>{
  const owner=actor.toLowerCase(),step=plan.steps.find(s=>s.key===key);
  if(!step||step.operation!=="cutout")throw new Error("执行步骤不存在");
  const inputs=await readImagegenInputs(plan.request,owner),target=inputs.find(i=>i.role==="edit-target");
  if(!target)throw new Error("请选择抠图目标");
  const request={...plan.request,parameters:{...plan.request.parameters,resolution:(step.parameters.resolution||plan.request.parameters.resolution||"1K") as "1K"|"2K"|"4K"}};
  const intent=imagegenStepIntent(plan,key),operationId=imagegenStepId(plan.request.operationId,key),path="/api/cutout";
  // Retain the old multipart field spelling, CRLF and target.png identity for historical receipts.
  const fields:Record<string,string>={prompt:compileImagegenPrompt(request,intent,plan.skillInstructions),parentId:target.artworkId,quality:plan.request.parameters.quality||"medium",resolution:request.parameters.resolution,ratio:plan.request.parameters.ratio||"1:1"};
  if(target.artworkId.startsWith("asset-"))delete fields.parentId;
  for(const name of Object.keys(fields))fields[name]=multipartFieldText(fields[name]);
  const entries:SubmissionField[]=[...Object.entries(fields),["image",{name:"target.png",type:target.mimeType,size:target.buffer.length,sha256:createHash("sha256").update(target.buffer).digest("hex")}]];
  const hash=submissionFingerprint(path,null,null,step.modelId||"",multipartSubmissionFields(entries));
  try{
    if(dbEnabled&&!await activeNativeAccountEmail(owner))return {status:401,body:{error:"请先登录"}};
    const existing=currentCreationContext();
    if(existing&&existing.actorEmail!==owner)throw new TeamError("创作操作者不一致",409);
    if(dbEnabled&&!existing)await ensureCreationSchema();
    const scope=existing||{actorEmail:owner,scopeKind:"personal" as const,tenantId:null,sourcePath:path,workspaceExplicit:false};
    return await withFrozenCreation(scope,async()=>{
      scope.requestText=fields.prompt.slice(0,50000);
      scope.parameters={...scope.parameters,ratio:fields.ratio,resolution:fields.resolution,quality:fields.quality};
      const result=await withImagegenStep(request,intent,()=>withSynchronousOperation({email:owner,operationId,path,feature:"tool.cutout",
        identity:async()=>{await prepareOriginalCreationInput(target.buffer,target.mimeType||"application/octet-stream","reference",0);return {hash};},
        snapshot:async()=>plan.modelVersion?(await getModelAdministration()).billing.byVersion(plan.billingVersion):(await getBillingRuntime()).config.current(),
        quote:async(facts,snapshot)=>quoteForImagegenStep(owner,operationId,plan.billingVersion,facts)??await quoteForActor(owner,facts,undefined,snapshot)},async()=>{
        try{return await withBiModelContext(owner,path,`tool-${operationId}`,()=>withModelOperation({path,body:fields,references:1,featureModel:step.modelId||"",preparedImage:step.preparedImage,
          versions:plan.modelVersion?{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}:null},()=>executeCutout({bytes:target.buffer,type:target.mimeType||"image/png",email:owner,parentId:fields.parentId?.trim()||"",title:"抠图",category:"main",ratio:fields.ratio,resolution:fields.resolution,quality:fields.quality==="fine"?"fine":fields.quality==="fast"?"fast":""},{actor:async()=>owner,ip:null})));}
        catch(error){
          if(error instanceof TeamError)return {status:error.status,body:{error:error.message}};
          if(error instanceof ModelConfigError){const {status,...body}=billingFailure(error);return {status,body};}
          throw error;
        }
      }),plan.ratioContractVersion,plan.requestedParameters,plan.channelContractVersion===1?step.eligibleUpstreamIds:undefined,step.billingQuote?{owner,operationId,quote:step.billingQuote}:undefined);
      return {status:result.status,body:result.body||{}};
    });
  }catch(error){
    if(error instanceof TeamError)return {status:error.status,body:{error:error.message}};
    const {status,...body}=billingFailure(error);return {status,body};
  }
}
