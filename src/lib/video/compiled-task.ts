import 'server-only';
import {readByocVideoSnapshot} from './byoc-snapshot';
import {compiledVideoStructure} from './compiled-structure';
import {encryptAtRest,decryptAtRest} from '../settings';
import {readCompiledVideoPlan} from './compile';
import {VideoContractError} from './contract';
import type {CompiledVideoPlan} from './execution-contract';
import type {VideoGenerationRequest,VideoReference} from './types';
import type {VideoTaskRow} from './task-types';
import type {CreateVideoInput} from './submission-types';
import {createHash} from 'node:crypto';
import {bindPublishedVideoExecution,frozenVideoExecutionSchema} from './published-execution';
import {canonicalConfig} from '../model-config/snapshot-value';

export function encryptedVideoPlan(plan:CompiledVideoPlan){return encryptAtRest(JSON.stringify(plan));}
export function compiledVideoRequest(plan:CompiledVideoPlan,source:VideoGenerationRequest['source'],idempotencyKey:string,sourceId?:string):VideoGenerationRequest {
  const references:VideoReference[]=plan.inputManifest.flatMap(input=>input.kind==='text'?[]:[{id:input.id,kind:input.kind,role:input.role,
    ...input.asset,url:`/media/${input.asset.storageKey}`}]);
  const grouped=compiledVideoStructure(plan,references);
  // Transport never uses these projections to recompile the v3 create body.
  // They retain existing UI/receipt/poll/lineage/retry consumers.
  return {source,sourceId,projectKey:plan.scope.projectKey??undefined,providerId:plan.identity.connectionId,modelId:plan.identity.wireModel,prompt:plan.originalPrompt,
    ...(plan.intent==='workflow'?{}:{mode:plan.intent}),durationSeconds:plan.billingFacts.durationSeconds,resolution:plan.billingFacts.resolution,aspectRatio:plan.billingFacts.aspectRatio,
    references:grouped.references,...(grouped.shots?{shots:grouped.shots}:{}),...(grouped.elements?{elements:grouped.elements}:{}),idempotencyKey,orderedInputs:grouped.inputs.map(input=>({id:input.id,nodeId:input.nodeId,kind:input.kind,role:input.role,value:input.kind==='text'?input.text:`/media/${input.asset.storageKey}`})),
    ...Object.fromEntries(['negativePrompt','width','height','generateAudio','watermark','providerOptions'].filter(key=>Object.hasOwn(plan.effectiveParameters,key)).map(key=>[key,plan.effectiveParameters[key]]))};
}
/** Only trusted persisted rows reach this reader. Digest is integrity, not
 * authorization. Never fall through to legacy recovery on a bad v3 plan. */
export function readTaskCompiledVideoPlan(actor:string,task:VideoTaskRow):CompiledVideoPlan {
  const invalid=():never=>{throw new VideoContractError('INVALID_COMPILED_TASK','冻结视频计划与原任务不一致',['plan']);};
  if(task.parameters.version!==3||typeof task.parameters.compiledPlanEnc!=='string')return invalid();
  let raw:unknown;try{const text=decryptAtRest(task.parameters.compiledPlanEnc);if(!text)return invalid();raw=JSON.parse(text);}catch{return invalid();}
  const read=readCompiledVideoPlan(raw);if(!read.ok)return invalid();
  const p=read.value;
  if(p.scope.actorId!==actor.toLowerCase()||p.digest!==task.parameters.compiledPlanDigest||p.identity.connectionId!==task.providerId||p.identity.wireModel!==task.model
    ||p.identity.publicModelId!==task.parameters.publicModelId||p.scope.projectKey!==(task.parameters.projectKey??null)||String(p.billingFacts.durationSeconds)!==task.seconds)return invalid();
  if(task.parameters.byocSnapshot){
    const byoc=readByocVideoSnapshot(actor,task);
    if(p.binding.profileId!=='workflow-video'||!byoc.executionBinding||canonicalConfig(byoc.executionBinding)!==canonicalConfig(p.binding)||canonicalConfig(p.policy)!==canonicalConfig({kind:'video.execution-policy',revision:0,restrictions:{}})||p.identity.policyRevision!==0)return invalid();
    return p;
  }
  const frozen=(task.parameters.modelExecutions as import('../model-config/context').ExecutionBundle|undefined)?.video;
  if(!frozen||frozen.publicModelId!==p.identity.publicModelId||frozen.modelVersion!==p.binding.revision||frozen.video?.execution?.modelVersion!==p.binding.revision||frozen.video.execution.modelDigest!==frozen.modelDigest)return invalid();
  const mapped=frozenVideoExecutionSchema.safeParse(frozen.video.execution);if(!mapped.success)return invalid();
  const binding=bindPublishedVideoExecution(mapped.data,{publicModelId:p.identity.publicModelId,wireModel:p.identity.wireModel,connectionId:p.identity.connectionId});
  if(canonicalConfig(binding.binding)!==canonicalConfig(p.binding)||canonicalConfig(binding.policy)!==canonicalConfig(p.policy))return invalid();
  return p;
}

/** Explicit retry creates a new operation from requested semantic values, not
 * the previous wire/effective parameters. Original task and plan stay immutable. */
export function compiledVideoRetryInput(actor:string,task:VideoTaskRow):CreateVideoInput {
  const plan=readTaskCompiledVideoPlan(actor,task),request=compiledVideoRequest(plan,task.source as VideoGenerationRequest['source'],'new-operation',task.sourceId);
  return {source:request.source,sourceId:request.sourceId,projectKey:request.projectKey,modelId:plan.identity.publicModelId,prompt:plan.originalPrompt,seconds:'',size:'',
    parameters:structuredClone(plan.requestedParameters),intentPreference:task.parameters.intentPreference as CreateVideoInput['intentPreference'],mode:task.parameters.legacyMode as CreateVideoInput['mode'],
    references:request.references,shots:request.shots,elements:request.elements,orderedInputs:request.orderedInputs?.map(input=>input.kind==='text'?{...input,nodeId:`inline:retry-${createHash('sha256').update(`${task.id}:${input.id}`).digest('hex')}`}:input),retryOf:task.id};
}
