import 'server-only';
import {randomUUID} from 'node:crypto';
import {applicationTasksRunHere} from '../application/task-execution';
import {currentExecutionBundle,type ModelExecutionScope} from '../model-config/context';
import {ModelConfigError} from '../model-config/types';
import {quoteForActor} from '../billing/quotation';
import {assertQuotedVersion} from '../billing/request';
import {currentCreationContext,withFrozenCreation} from '../saas/creation-scope';
import {assertCurrentCreationFeature,bindActualCreationProject} from '../saas/creation-access';
import {getVideoNode,associateVideoTaskTx} from '../canvas/video-node-repository';
import {prepareFrozenWorkflowCompiled,assertFrozenWorkflowQuote} from './workflow-compiled';
import {prepareVideoExecution} from './prepare-execution';
import {videoSubmissionDraft} from './submission-draft';
import {compiledVideoRequest,encryptedVideoPlan} from './compiled-task';
import {VideoContractError} from './contract';
import {getVideoProvider} from './providers/adapter';
import {getVideoProviderConfig,publicProviderSnapshot} from './providers/config';
import {createVideoTaskWithReservation} from './task-transitions';
import {associateWorkflowTaskTx} from './workflow-links';
import type {CreateVideoInput} from './submission-types';
import type {VideoGenerationRequest} from './types';
import type {VideoTaskRow} from './task-types';

type Hooks={submit:(email:string,task:VideoTaskRow,request:VideoGenerationRequest)=>Promise<void>;creationError:(email:string,task:VideoTaskRow,error:unknown)=>Promise<void>};
/** New acceptance lane. The existing reservation transaction remains the sole
 * task/bill/node writer. No old capability normalizer or create codec runs. */
export async function createCompiledVideo(actor:string,input:CreateVideoInput,execution:ModelExecutionScope,hooks:Hooks,inputDigest:string):Promise<{taskId:string;cost:number}>{
  if(!currentCreationContext())return withFrozenCreation({actorEmail:actor.toLowerCase(),scopeKind:'personal',tenantId:null},()=>createCompiledVideo(actor,input,execution,hooks,inputDigest));
  await assertCurrentCreationFeature('/api/video/generate');
  if(input.nodeId){
    const node=await getVideoNode(actor,input.nodeId);
    if(!node)throw new ModelConfigError('VIDEO_NODE_UNAVAILABLE','视频节点不存在',404);
    if(node.revision!==input.nodeRevision)throw new ModelConfigError('VIDEO_NODE_REVISION_CONFLICT','视频节点已更新，请重新读取后生成',409);
    if(node.projectKey!==input.projectKey)throw new ModelConfigError('VIDEO_NODE_PROJECT_CONFLICT','视频节点项目不一致',409);
  }
  const result=await prepareFrozenWorkflowCompiled(actor,input)??await prepareVideoExecution({actor,projectKey:input.projectKey??null,draft:videoSubmissionDraft(input),execution:execution.frozen.video?.execution,
    identity:{publicModelId:execution.frozen.publicModelId,wireModel:execution.connection.wireModel,connectionId:execution.connection.providerId}});
  if(!result.ok){const error=result.diagnostics[0];throw new VideoContractError(error.code,error.reason,[error.field]);}
  const plan=result.value,providerId=plan.identity.connectionId,config=getVideoProviderConfig(providerId);
  if(!config||!getVideoProvider(providerId)?.createCompiled)throw new ModelConfigError('VIDEO_COMPILED_TRANSPORT_UNAVAILABLE','此视频传输尚未接入冻结计划',422);
  const quote=await quoteForActor(actor,{feature:'video.generate',quantity:1,modelId:plan.identity.publicModelId,providerId,resolution:plan.billingFacts.resolution,ratio:plan.billingFacts.aspectRatio});
  assertFrozenWorkflowQuote(quote);
  assertQuotedVersion(input.billingConfirmation||{},quote);
  const idempotencyKey=input.idempotencyKey||randomUUID(),id=`vid-${randomUUID()}`,request={...compiledVideoRequest(plan,input.source,idempotencyKey,input.sourceId),canvasNodeId:input.nodeId,nodeRevision:input.nodeRevision};
  const bundle=currentExecutionBundle()??{modelVersion:execution.frozen.modelVersion,billingVersion:execution.frozen.billingVersion,primary:'video' as const,video:execution.frozen};
  const parameters={version:3,submissionState:'prepared',compiledPlanEnc:encryptedVideoPlan(plan),compiledPlanDigest:plan.digest,creationInputDigest:inputDigest,modelExecutions:structuredClone(bundle),
    publicModelId:plan.identity.publicModelId,projectKey:plan.scope.projectKey,nodeId:input.nodeId,nodeRevision:input.nodeRevision,workflowRunId:input.workflowRunId,workflowNodeId:input.workflowNodeId,
    originalPrompt:plan.originalPrompt,intentPreference:input.intentPreference,legacyMode:input.mode,camera:input.camera,retryOf:input.retryOf,authorNodeIds:plan.inputManifest.filter(i=>i.kind==='text'&&i.role==='author').map(i=>i.nodeId),
    requestedParameters:plan.requestedParameters,effectiveParameters:plan.effectiveParameters,mode:plan.intent,durationSeconds:plan.billingFacts.durationSeconds,resolution:plan.billingFacts.resolution,aspectRatio:plan.billingFacts.aspectRatio,
    seconds:plan.billingFacts.durationSeconds,size:plan.billingFacts.resolution,providerId,modelId:plan.identity.wireModel,providerSnapshot:publicProviderSnapshot(config),idempotencyKey};
  const claimed=await createVideoTaskWithReservation({id,email:actor,model:request.modelId,prompt:plan.originalPrompt,size:plan.billingFacts.resolution,seconds:String(plan.billingFacts.durationSeconds),cost:quote.requestedCredits,billingQuote:quote,
    requestBody:JSON.stringify({version:3,planDigest:plan.digest,modelId:plan.identity.wireModel,intent:plan.intent}),providerId,source:input.source,sourceId:input.sourceId,parameters,videoReferences:request.references,
    capabilitySnapshot:{planVersion:1,bindingRevision:plan.binding.revision,policyRevision:plan.policy.revision},idempotencyKey,channelId:providerId,providerSnapshot:publicProviderSnapshot(config),leaseSeconds:applicationTasksRunHere()?undefined:0,
    onReserved:async(tx,task)=>{if(input.projectKey)await bindActualCreationProject(actor,input.projectKey,{tx});if(input.nodeId)await associateVideoTaskTx(tx,actor,input.nodeId,input.nodeRevision!,task.id);if(input.workflowRunId&&input.workflowNodeId)await associateWorkflowTaskTx(tx,actor,input.workflowRunId,input.workflowNodeId,task.id);}});
  if(!claimed.created)return {taskId:claimed.task.id,cost:claimed.task.cost};
  try{await hooks.submit(actor,claimed.task,request);}catch(error){await hooks.creationError(actor,claimed.task,error);}
  return {taskId:claimed.task.id,cost:claimed.task.cost};
}
