import {materializeNativeVideoPlan} from './profiles/native-materialization';
import {readManagedObject} from '../object-storage/managed-read';
import 'server-only';
import {currentCreationContext,withFrozenCreation,frozenCreationScope} from '../saas/creation-scope';
import {assertCreationMediaInput} from '../saas/creation-access';
import {assertCreationObjectRefs,assertCreationInputsTx,creationTransaction} from '../saas/creation-writer';
import {compiledVideoRequest,readTaskCompiledVideoPlan} from './compiled-task';
import {materializeVideoReferences} from './reference-materialization';
import {materializeJsonVideoPlan} from './profiles/json-materialization';
import {VideoContractError} from './contract';
import type {VideoTaskRow} from './task-types';
import type {MaterializedVideoWireRequest} from './execution-contract';
import {currentModelExecution} from '../model-config/context';
import {materializeWorkflowVideoPlan} from './profiles/workflow-materialization';
import {uploadCompiledWorkflowAsset} from './providers/compiled-workflow-upload';
import {getVideoProviderConfig} from './providers/config';
import {currentPrivateVideoContext} from './providers/private-context';
import {readByocVideoSnapshot} from './byoc-snapshot';
import {TeamError} from '../teams/errors';

/** Signing is execution-only. Revalidate the same immutable assets/ACLs and
 * refresh their addresses; never re-read a node selection or model catalogue. */
export async function materializeCompiledVideoTask(actor:string,task:VideoTaskRow):Promise<MaterializedVideoWireRequest> {
  if(!currentCreationContext())return withFrozenCreation(frozenCreationScope(task.parameters.creationScope,actor)??{actorEmail:actor.toLowerCase(),scopeKind:'personal',tenantId:null},()=>materializeCompiledVideoTask(actor,task));
  try{return await materializeOwnedCompiledTask(actor,task);}catch(error){
    if(error instanceof TeamError||error instanceof Error&&['不能直接引用其他企业的素材','素材不存在或无权访问'].includes(error.message))
      throw new VideoContractError('VIDEO_SCOPE_MISMATCH','冻结素材访问已撤销或与当前工作空间不一致',['inputs']);
    throw error;
  }
}
async function materializeOwnedCompiledTask(actor:string,task:VideoTaskRow):Promise<MaterializedVideoWireRequest>{
  const plan=readTaskCompiledVideoPlan(actor,task),context=currentCreationContext()!;
  const execution=currentModelExecution('video');
  if(task.parameters.byocSnapshot){
    const snapshot=readByocVideoSnapshot(actor,task),privateContext=currentPrivateVideoContext();
    if(!privateContext||privateContext.config.id!==snapshot.providerId||privateContext.config.baseUrl!==snapshot.baseUrl)throw new VideoContractError('COMPILED_EXECUTION_CONTEXT_MISMATCH','未恢复原工作流执行上下文');
  }else if(!execution||execution.frozen.modelVersion!==plan.binding.revision||execution.connection.providerId!==plan.identity.connectionId||execution.connection.wireModel!==plan.identity.wireModel)
    throw new VideoContractError('COMPILED_EXECUTION_CONTEXT_MISMATCH','执行器没有恢复原视频通道快照');
  if(plan.scope.workspaceId!==(context.scopeKind==='tenant'?`tenant:${context.tenantId}`:'personal'))throw new VideoContractError('VIDEO_SCOPE_MISMATCH','任务执行作用域与冻结计划不一致');
  const request=compiledVideoRequest(plan,task.source as 'canvas'|'workbench'|'agent'|'workflow',task.idempotencyKey||task.id,task.sourceId);
  const allReferences=[...request.references,...(request.elements??[]).flatMap(element=>element.references)];
  const artIds=allReferences.flatMap(ref=>ref.artworkId?[ref.artworkId]:[]);
  await creationTransaction(tx=>assertCreationInputsTx(tx,actor,artIds));
  await assertCreationObjectRefs(actor,artIds);
  for(const ref of allReferences)await assertCreationMediaInput(actor,`/media/${ref.storageKey}`);
  if(plan.binding.profileId==='native-video'){
    // Revalidate current access/facts without signing, uploading or fetching an
    // external URL. The frozen materializer checks the actual original bytes.
    const owned=await materializeVideoReferences(actor,request,{multipart:true});
    const result=await materializeNativeVideoPlan(plan,{bytes:async(_scope,asset)=>{
      const ref=owned.references.find(r=>r.storageKey===asset.storageKey&&r.sha256===asset.sha256);
      if(!ref)return {ok:false,diagnostics:[{category:'input',code:'FROZEN_MEDIA_CHANGED',field:'inputs',reason:'原生图片身份不一致',actionable:'核对原始图片'}]};
      const object=await readManagedObject(`/media/${asset.storageKey}`,12*1024*1024);
      return {ok:true,value:{asset:{storageKey:ref.storageKey!,sha256:ref.sha256!,bytes:ref.bytes!,mimeType:ref.mimeType!,...(ref.artworkId?{artworkId:ref.artworkId}:{}),...(ref.width?{width:ref.width}:{}),...(ref.height?{height:ref.height}:{})},bytes:object.bytes}};
    }});
    if(!result.ok)throw new VideoContractError(result.diagnostics[0].code,result.diagnostics[0].reason,['inputs']);return result.value;
  }
  if(plan.wireTemplate.encoding==='workflow'){
    const config=getVideoProviderConfig(task.providerId);if(!config)throw new VideoContractError('VIDEO_COMPILED_TRANSPORT_UNAVAILABLE','工作流传输缺失');
    // Authorize/verify owned bytes without creating signed URLs or uploads first.
    const owned=await materializeVideoReferences(actor,request,{multipart:true});
    const result=await materializeWorkflowVideoPlan(plan,{context:name=>({ok:true,value:name==='operationId'?task.idempotencyKey||task.id:config.apiKey}),asset:async(_scope,asset,delivery)=>{
      const ref=owned.references.find(ref=>ref.storageKey===asset.storageKey&&ref.sha256===asset.sha256);
      if(!ref)return {ok:false,diagnostics:[{category:'input',code:'FROZEN_MEDIA_CHANGED',field:'inputs',reason:'工作流素材身份不一致',actionable:'核对原素材'}]};
      let value:string;
      if(delivery.delivery==='upload')value=await uploadCompiledWorkflowAsset(config,asset,delivery);
      else{const signed=await materializeVideoReferences(actor,{...request,references:[ref]});value=signed.references[0].url!;}
      return {ok:true,value:{asset:{storageKey:ref.storageKey!,sha256:ref.sha256!,bytes:ref.bytes!,mimeType:ref.mimeType!,...(ref.artworkId?{artworkId:ref.artworkId}:{}),...(ref.width?{width:ref.width}:{}),...(ref.height?{height:ref.height}:{}),...(ref.durationSeconds?{durationSeconds:ref.durationSeconds}:{})},value}};
    }});
    if(!result.ok)throw new VideoContractError(result.diagnostics[0].code,result.diagnostics[0].reason,['inputs']);return {...result.value,encoding:'json'};
  }
  const materialized=await materializeVideoReferences(actor,request);
  const result=await materializeJsonVideoPlan(plan,{url:async(_scope,asset)=>{
    const ref=[...materialized.references,...(materialized.elements??[]).flatMap(element=>element.references)].find(ref=>ref.storageKey===asset.storageKey&&ref.sha256===asset.sha256);
    if(!ref?.url)return {ok:false,diagnostics:[{category:'input',code:'FROZEN_MEDIA_CHANGED',field:'inputs',reason:'冻结媒体身份不一致',actionable:'核对原任务素材'}]};
    return {ok:true,value:{url:ref.url,asset:{storageKey:ref.storageKey!,sha256:ref.sha256!,bytes:ref.bytes!,mimeType:ref.mimeType!,
      ...(ref.artworkId?{artworkId:ref.artworkId}:{}),...(ref.width?{width:ref.width}:{}),...(ref.height?{height:ref.height}:{}),...(ref.durationSeconds?{durationSeconds:ref.durationSeconds}:{})}}};
  }});
  if(!result.ok)throw new VideoContractError(result.diagnostics[0].code,result.diagnostics[0].reason,['inputs']);
  return {...result.value,encoding:'json'};
}
