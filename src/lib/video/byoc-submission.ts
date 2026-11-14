import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {byocVideoInputSchema} from './byoc';
import {getVideoTaskByIdempotencyKey} from './task-repository';
import {createVideoTaskWithReservation} from './task-transitions';
import {getVideoNode,associateVideoTaskTx} from '../canvas/video-node-repository';
import {ensureVideoNodeSchema} from '../canvas/storage-schema';
import {authorizeVideoProject} from '../canvas/project-access';
import {currentCreationContext,withFrozenCreation,frozenCreationScope} from '../saas/creation-scope';
import {assertCurrentCreationFeature,bindActualCreationProject} from '../saas/creation-access';
import {canonicalConfig} from '../model-config/snapshot-value';
import {ModelConfigError} from '../model-config/types';
import {VideoContractError} from './contract';
import {prepareByocRecipe} from './byoc-recipe';
import {bindByocWorkflowRecipe,byocVideoSubmissionInput} from './byoc-execution-binding';
import {videoSubmissionDraft} from './submission-draft';
import {prepareVideoExecutionInputs} from './prepare-inputs';
import {compileVideoRequest} from './compile';
import {compiledVideoRequest,readTaskCompiledVideoPlan,compiledVideoRetryInput,encryptedVideoPlan} from './compiled-task';
import {withByocVideoTask} from './byoc-context';
import {submitQueuedVideoTask,handleVideoCreationError} from './runtime';
import {applicationTasksRunHere} from '../application/task-execution';
import {publicProviderSnapshot} from './providers/config';
import {associateWorkflowTaskTx} from './workflow-links';
import type {CompiledVideoPlan,VideoResult} from './execution-contract';
import type {VideoTaskRow} from './task-types';
import {prepareFrozenWorkflowCompiled} from './workflow-compiled';
import {withNewVideoAdmission} from './admission';
const requireResult=<T>(result:VideoResult<T>):T=>{if(!result.ok){const d=result.diagnostics[0];throw new VideoContractError(d.code,d.reason,[d.field]);}return result.value;};
type Input=z.infer<typeof byocVideoInputSchema>;
function assertSameWorkspace(actor:string,task:VideoTaskRow){
 const context=currentCreationContext(),old=frozenCreationScope(task.parameters.creationScope,actor);
 if(context?.workspaceExplicit&&(!old||old.scopeKind!==context.scopeKind||old.tenantId!==context.tenantId))throw new ModelConfigError('CREATION_SCOPE_CONFLICT','此任务的工作空间已固定',409);
}
/** BYOC owns the explicit no-charge exception; all inputs/compile/queue/state
 * machinery is the common video lane. No legacy mode/limit/create preflight. */
export async function submitCompiledByocVideo(actor:string,input:Input,workflowLink?:{runId:string;nodeId:string}):Promise<{taskId:string;cost:number}>{
 if(!currentCreationContext())return withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},()=>submitCompiledByocVideo(actor,input,workflowLink));
 if(currentCreationContext()!.actorEmail!==actor)throw new ModelConfigError('VIDEO_SCOPE_MISMATCH','当前用户与执行作用域不一致',403);
 const digest=createHash('sha256').update(canonicalConfig(input)).digest('hex'),old=await getVideoTaskByIdempotencyKey(actor,input.idempotencyKey);
 if(old){assertSameWorkspace(actor,old);if(old.parameters.creationInputDigest!==digest)throw new ModelConfigError('OPERATION_CONFLICT','操作编号已用于另一任务',409);return {taskId:old.id,cost:old.cost};}
 return withNewVideoAdmission(actor,async()=>{
 await assertCurrentCreationFeature('/api/comfyui/run');
 const node=input.nodeId?await getVideoNode(actor,input.nodeId):null;
 if(input.nodeId&&(!node||node.revision!==input.expectedRevision))throw new ModelConfigError('VIDEO_NODE_REVISION_CONFLICT','视频节点不存在或已更新',409);
 const project=node?.projectKey??input.projectKey;
 if(node&&input.projectKey&&input.projectKey!==node.projectKey)throw new ModelConfigError('VIDEO_NODE_PROJECT_CONFLICT','视频节点项目不一致',409);
 if(project)await authorizeVideoProject(actor,project);
 const request=byocVideoSubmissionInput({...input,projectKey:project});
 // Actual owned/native media and text are read once. Endpoint introspection
 // below resolves UI-format widgets only for execution, never for draft save.
 const draft=videoSubmissionDraft(request),prepared=await prepareByocRecipe(actor,{...input,prompt:undefined,references:draft.inputs.filter(i=>i.kind!=='text').map(i=>({id:i.id,kind:i.kind as 'image'|'video'|'audio',role:i.role as 'reference'}))});
 const bound=bindByocWorkflowRecipe(prepared,input);
 const frozen=await prepareFrozenWorkflowCompiled(actor,{...request,workflowRunId:workflowLink?.runId,workflowNodeId:workflowLink?.nodeId},bound);
 const plan=frozen?requireResult(frozen):requireResult(compileVideoRequest({...bound,draft:requireResult(await prepareVideoExecutionInputs(actor,project??null,draft))}));
 if(node)await ensureVideoNodeSchema();
 return accept(actor,{plan,idempotencyKey:input.idempotencyKey,digest,byocSnapshot:bound.snapshot,settings:prepared.settings,providerSnapshot:publicProviderSnapshot(prepared.config),source:request.source,sourceId:request.sourceId,node,project,workflowLink,originalPrompt:input.prompt??''});
 });
}
async function accept(actor:string,input:{plan:CompiledVideoPlan;idempotencyKey:string;digest:string;byocSnapshot:unknown;settings:unknown;providerSnapshot:unknown;source:import('./types').VideoTaskSource;sourceId?:string;node:Awaited<ReturnType<typeof getVideoNode>>;project?:string;workflowLink?:{runId:string;nodeId:string};retryOf?:string;originalPrompt:string}){
 const {plan,node}=input,request=compiledVideoRequest(plan,input.source,input.idempotencyKey,input.sourceId),id=`vid-${randomUUID()}`;
 const created=await createVideoTaskWithReservation({leaseSeconds:applicationTasksRunHere()?undefined:0,id,email:actor,model:plan.identity.wireModel,prompt:plan.originalPrompt,size:plan.billingFacts.resolution,seconds:String(plan.billingFacts.durationSeconds),cost:0,
 requestBody:JSON.stringify({version:3,planDigest:plan.digest,workflowId:plan.identity.publicModelId}),providerId:plan.identity.connectionId,source:input.source,sourceId:input.sourceId,idempotencyKey:input.idempotencyKey,providerSnapshot:input.providerSnapshot,videoReferences:request.references,
 capabilitySnapshot:{workflowOnly:true,planVersion:plan.schemaVersion,durationUnknown:plan.billingFacts.durationSeconds===-1},parameters:{version:3,submissionState:'prepared',publicModelId:plan.identity.publicModelId,compiledPlanEnc:encryptedVideoPlan(plan),compiledPlanDigest:plan.digest,billingException:'comfyui-byoc-zero',byocSnapshot:input.byocSnapshot,
 workflowRunId:input.workflowLink?.runId,workflowNodeId:input.workflowLink?.nodeId,byocSettings:input.settings,creationInputDigest:input.digest,nodeId:node?.id,nodeRevision:node?.revision,projectKey:plan.scope.projectKey,originalPrompt:input.originalPrompt,requestedParameters:plan.requestedParameters,effectiveParameters:plan.effectiveParameters,retryOf:input.retryOf},
 onReserved:async(tx,task)=>{if(input.project)await bindActualCreationProject(actor,input.project,{tx});if(node)await associateVideoTaskTx(tx,actor,node.id,node.revision,task.id);if(input.workflowLink)await associateWorkflowTaskTx(tx,actor,input.workflowLink.runId,input.workflowLink.nodeId,task.id);}});
 if(created.created)await withByocVideoTask(actor,created.task,async()=>{try{await submitQueuedVideoTask(actor,created.task,undefined,undefined,false);}catch(error){await handleVideoCreationError(actor,created.task,error);}});
 return {taskId:created.task.id,cost:0};
}
export async function retryCompiledByocVideo(actor:string,old:VideoTaskRow,idempotencyKey:string):Promise<{taskId:string;cost:number}>{
 if(!currentCreationContext())return withFrozenCreation(frozenCreationScope(old.parameters.creationScope,actor)??{actorEmail:actor,scopeKind:'personal',tenantId:null},()=>retryCompiledByocVideo(actor,old,idempotencyKey));
 assertSameWorkspace(actor,old);
 if(!['failed','cancelled'].includes(old.status))throw new ModelConfigError('VIDEO_RETRY_NOT_ALLOWED','原任务仍需核对或尚未结束',409);
 const digest=createHash('sha256').update(canonicalConfig({retryOf:old.id,idempotencyKey})).digest('hex'),existing=await getVideoTaskByIdempotencyKey(actor,idempotencyKey);
 if(existing){assertSameWorkspace(actor,existing);if(existing.parameters.creationInputDigest!==digest)throw new ModelConfigError('OPERATION_CONFLICT','操作编号已用于另一任务',409);return {taskId:existing.id,cost:existing.cost};}
 return withNewVideoAdmission(actor,async()=>{
 await assertCurrentCreationFeature('/api/comfyui/run');
 const plan=readTaskCompiledVideoPlan(actor,old),raw=compiledVideoRetryInput(actor,old),resolved=requireResult(await prepareVideoExecutionInputs(actor,plan.scope.projectKey,videoSubmissionDraft(raw)));
 if(canonicalConfig(resolved.scope)!==canonicalConfig(plan.scope)||canonicalConfig(resolved.inputs.map(i=>i.kind==='text'?{id:i.id,text:i.text}:{id:i.id,kind:i.kind,role:i.role,asset:i.asset}))!==canonicalConfig(plan.inputManifest.map(i=>i.kind==='text'?{id:i.id,text:i.text}:{id:i.id,kind:i.kind,role:i.role,asset:i.asset})))throw new VideoContractError('FROZEN_MEDIA_CHANGED','原工作流素材或文字版本已变化');
 const node=typeof old.parameters.nodeId==='string'?await getVideoNode(actor,old.parameters.nodeId):null;
 return accept(actor,{plan,idempotencyKey,digest,byocSnapshot:old.parameters.byocSnapshot,settings:old.parameters.byocSettings,providerSnapshot:old.providerSnapshot,source:old.source as never,sourceId:old.sourceId,node,project:plan.scope.projectKey??undefined,retryOf:old.id,originalPrompt:String(old.parameters.originalPrompt??plan.originalPrompt)});
 });
}
