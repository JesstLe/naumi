import "server-only";
import {createHash} from "node:crypto";
import {dbEnabled} from "@/platform/db/pool";
import {activeNativeAccountEmail} from "../native-auth";
import {claimSubmission,saveSubmissionReceipt} from "../billing/intent";
import {multipartSubmissionFields,submissionFingerprint,type SubmissionField} from "../billing/submission-identity";
import {quoteForActor,quoteForImagegenStep} from "../billing/quotation";
import {withModelOperation} from "../model-config/requests";
import {withBiModelContext} from "@/lib/bi/context";
import {withArtworkCreation} from "../artwork-provenance-context";
import {currentCreationContext,withFrozenCreation} from "@/lib/saas/creation-scope";
import {prepareOriginalCreationInput} from "../saas/creation-writer";
import {ensureCreationSchema} from "../saas/creation-schema";
import {TeamError} from "../teams/server";
import {withImagegenStep} from "./context";
import {imagegenStepId} from "./operation-id";
import {submitGeneration,generationBillingError} from "./generation-submission";
import type {GenParams,GenerationResult} from "./generation-types";
import type {ImagegenPlan,ImagegenRequest,Intent} from "./types";

export type GenerationStepCommand={
  plan:ImagegenPlan;key:string;owner:string;request:ImagegenRequest;intent:Intent;
  parameters:GenParams;
  /** Original scalar spelling and file names preserve existing receipt fingerprints. */
  fields:Record<string,string>;
  files:Array<{field:"image"|"mask";name:string;mimeType:string;buffer:Buffer}>;
};

/** Trusted plan execution. Public routes never deserialize this command from a client. */
export async function submitGenerationOperation(command:GenerationStepCommand):Promise<GenerationResult>{
  const {plan,key,request,intent,parameters:p,fields,files}=command;
  const owner=command.owner.toLowerCase(),step=plan.steps.find(s=>s.key===key);
  if(!step)throw new Error("执行步骤不存在");
  const operationId=imagegenStepId(plan.request.operationId,key),path="/api/generate-image";
  const existingScope=currentCreationContext();
  if(existingScope&&existingScope.actorEmail!==owner)throw new Error("创作操作者不一致");
  try {
    if(dbEnabled&&!await activeNativeAccountEmail(owner))return {status:401,body:{error:"请先登录"}};
    const entries:SubmissionField[]=Object.entries(fields);
    for(const f of files)entries.push([f.field,{name:f.name,type:f.mimeType,size:f.buffer.length,sha256:createHash("sha256").update(f.buffer).digest("hex")}]);
    const hash=submissionFingerprint(path,null,null,step.modelId||"",multipartSubmissionFields(entries));
    // Preserve original input evidence before receipt lookup, as the prior multipart identity path did.
    if(dbEnabled&&existingScope){
      existingScope.requestText=(fields.userPrompt||fields.prompt||"").slice(0,50000);
      existingScope.parameters={...existingScope.parameters,...Object.fromEntries(["ratio","resolution","quality","count","size","mode"].filter(k=>Object.hasOwn(fields,k)).map(k=>[k,fields[k]]))};
      let position=0;
      for(const f of files.slice().sort((a,b)=>a.field.localeCompare(b.field)))await prepareOriginalCreationInput(f.buffer,f.mimeType||"application/octet-stream",f.field==="mask"?"mask":"reference",f.field==="mask"?0:position++);
    }
    if(dbEnabled){const previous=await claimSubmission({operationId,email:owner,path,hash});if(previous)return previous;}
    if(dbEnabled&&!existingScope)await ensureCreationSchema();
    const scope=existingScope||{actorEmail:owner,scopeKind:"personal" as const,tenantId:null,sourcePath:path,workspaceExplicit:false};
    let result:GenerationResult;
    try{result=await withFrozenCreation(scope,()=>withImagegenStep(request,intent,()=>
      withBiModelContext(owner,path,operationId,()=>withArtworkCreation({path,entry:"toolbox"},()=>
        withModelOperation({path,body:{...fields,needsMask:files.some(f=>f.field==="mask")},references:Math.min(32,files.filter(f=>f.field==="image").length),featureModel:step.modelId||"",quality:fields.quality,preparedImage:step.preparedImage,
          versions:plan.modelVersion?{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}:null},()=>
          submitGeneration(p,{actor:async()=>owner,ip:null,featureModel:step.modelId||"",quote:async facts=>
            quoteForImagegenStep(owner,operationId,plan.billingVersion,facts)??await quoteForActor(owner,facts)})))),
      plan.ratioContractVersion,plan.requestedParameters,plan.channelContractVersion===1?step.eligibleUpstreamIds:undefined,
      step.billingQuote?{owner,operationId,quote:step.billingQuote}:undefined));
    }catch(error){result=error instanceof TeamError?{status:error.status,body:{error:error.message}}:generationBillingError(error);}
    if(dbEnabled)await saveSubmissionReceipt(operationId,result.status,result.body);
    return result;
  }catch(error){return generationBillingError(error);}
}
