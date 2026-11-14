import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {byocVideoInputSchema} from './byoc';
import {prepareByocRecipe} from './byoc-recipe';
import {bindByocWorkflowRecipe,byocVideoSubmissionInput} from './byoc-execution-binding';
import {prepareVideoExecutionInputs} from './prepare-inputs';
import {videoSubmissionDraft} from './submission-draft';
import {compileVideoRequest} from './compile';
import {videoDiagnostic,type VideoResult,type CompiledVideoPlan} from './execution-contract';
import {ModelConfigError} from '../model-config/types';
import {canonicalConfig} from '../model-config/snapshot-value';
import {currentCreationContext,withFrozenCreation} from '../saas/creation-scope';
export const byocPreviewInputSchema=byocVideoInputSchema.omit({idempotencyKey:true}).extend({draftRevision:z.number().int().nonnegative()});
/** Read-only preview of owned saved DAG/overrides and real inputs. No credential
 * import, random seed sampling, endpoint introspection, upload or task writes.
 * Implicit random seeds are sampled/frozen only on acceptance; preview's digest
 * describes its inspected template, not a future random seed authorization. */
export async function prepareByocVideoPreview(actor:string,raw:unknown):Promise<VideoResult<{plan:CompiledVideoPlan;draftRevision:number;modelDigest:string}>>{
 if(!currentCreationContext())return withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},()=>prepareByocVideoPreview(actor,raw));
 const parsed=byocPreviewInputSchema.safeParse(raw);
 if(!parsed.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_VIDEO_PREVIEW','draft','工作流预览字段无效','核对工作流草稿')]};
 if(currentCreationContext()!.actorEmail!==actor)return {ok:false,diagnostics:[videoDiagnostic('input','VIDEO_SCOPE_MISMATCH','scope','当前用户与作用域不一致','重新登录')]};
 const input=parsed.data,request=byocVideoSubmissionInput({...input,idempotencyKey:'preview'});
 try{
  const draft=videoSubmissionDraft(request),recipe=await prepareByocRecipe(actor,{...input,prompt:undefined,references:draft.inputs.filter(i=>i.kind!=='text').map(i=>({id:i.id,kind:i.kind as 'image'|'video'|'audio',role:'reference'}))},{readOnly:true});
  const bound=bindByocWorkflowRecipe(recipe,input),resolved=await prepareVideoExecutionInputs(actor,input.projectKey??null,draft);if(!resolved.ok)return resolved;
  const compiled=compileVideoRequest({...bound,draft:resolved.value});if(!compiled.ok)return compiled;
  return {ok:true,value:{plan:compiled.value,draftRevision:input.draftRevision,modelDigest:createHash('sha256').update(canonicalConfig(bound.binding)).digest('hex')}};
 }catch(error){if(error instanceof ModelConfigError)return {ok:false,diagnostics:[videoDiagnostic('mapping',error.code,'workflow',error.message,'核对工作流或执行端点')]};throw error;}
}
export async function previewByocVideo(actor:string,raw:unknown){
 const result=await prepareByocVideoPreview(actor,raw);if(!result.ok)return result;
 const {plan,draftRevision,modelDigest}=result.value;
 return {ok:true as const,value:{draftRevision,planDigest:plan.digest,modelVersion:Math.max(1,plan.binding.revision),modelDigest,publicModelId:plan.binding.publicModelId,intent:plan.intent,requestedParameters:plan.requestedParameters,effectiveParameters:plan.effectiveParameters,billingFacts:plan.billingFacts}};
}
