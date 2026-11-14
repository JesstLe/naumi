import 'server-only';
import {resolveVideoDraft,parseVideoExecutionDraft} from './input-resolver';
import {videoDiagnostic,type ResolvedVideoDraft,type ResolvedVideoAsset,type VideoExecutionDraft,type VideoResult} from './execution-contract';
import {resolveCanvasNodeInputs} from '../canvas/node-inputs';
import {getVideoNode} from '../canvas/video-node-repository';
import {getOwnedCanvasTextNode} from '../canvas/text-node-repository';
import {canvasTextContent} from '../canvas/text-content';
import {authorizeVideoProject} from '../canvas/project-access';
import {listArtworksByIds} from '../artworks/repository';
import {storageKeyFromManagedUrl} from '../object-storage/runtime';
import {verifiedOwnedMedia} from './media-inspection';
import {getMediaAsset} from '../media-assets-reader';
import {assertCreationProjectInput,assertCreationMediaInput,bindActualCreationProject} from '../saas/creation-access';
import {assertCreationObjectRefs,assertCreationInputsTx,creationTransaction} from '../saas/creation-writer';
import {currentCreationContext,withFrozenCreation} from '../saas/creation-scope';
import {ModelConfigError} from '../model-config/types';
import {frozenWorkflowText} from './workflow-text-context';
import {TeamError} from '../teams/errors';

const failure=(code:string,reason:string,inputId?:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic(code==='DEPENDENCY_PENDING'?'dependency':'input',code,'inputs',reason,'核对当前项目与已完成素材',inputId)]});
async function ownedAssetFacts(actor:string,key:string,input:VideoExecutionDraft['inputs'][number],artworkId?:string):Promise<VideoResult<ResolvedVideoAsset>>{
  await assertCreationMediaInput(actor,`/media/${key}`);
  const registered=await getMediaAsset(key);if(!registered)return failure('VIDEO_INPUT_UNAVAILABLE','引用媒体尚未登记',input.id);
  const owned=await verifiedOwnedMedia(actor,key,artworkId??null,registered.sha256);
  if(owned.bytes!==Number(registered.bytes))return failure('MEDIA_INPUT_CHANGED','引用媒体字节与登记版本不一致',input.id);
  return {ok:true,value:{...(artworkId?{artworkId}:{}),storageKey:owned.key,sha256:owned.sha256,bytes:owned.bytes,mimeType:owned.mimeType,
    ...(owned.probe.width?{width:owned.probe.width}:{}),...(owned.probe.height?{height:owned.probe.height}:{}),...(input.kind!=='image'?{durationSeconds:owned.probe.durationSeconds}:{})}};
}

/** Authenticated application assembly. The actor/project come from ingress,
 * never from draft fields. Reuses actual repositories, ownership rules,
 * composite-node expansion and decoded/hash-bound media facts. No model
 * catalogue, policy inference, signing, task creation or supplier I/O. */
export async function prepareVideoExecutionInputs(actorRaw:string,projectKey:string|null,raw:unknown):Promise<VideoResult<ResolvedVideoDraft>> {
  const result=await prepareVideoInputBatch(actorRaw,projectKey,raw,[]);return result.ok?{ok:true,value:result.value.resolved}:result;
}
/** Trusted Workflow assembly only. Pending IDs are dependency slots, never
 * "resolved" media. Expand/authorize existing inputs using the same owner. */
export const prepareDeferredVideoInputs=(actor:string,project:string,raw:unknown,pendingIds:string[])=>prepareVideoInputBatch(actor,project,raw,pendingIds);
async function prepareVideoInputBatch(actorRaw:string,projectKey:string|null,raw:unknown,pendingIds:string[]):Promise<VideoResult<{draft:VideoExecutionDraft;resolved:ResolvedVideoDraft}>> {
  const actor=actorRaw.trim().toLowerCase(),context=currentCreationContext();
  if(!actor||context&&context.actorEmail!==actor)return failure('VIDEO_SCOPE_MISMATCH','当前用户与执行作用域不一致');
  // Non-HTTP consumers still get personal workspace enforcement, never a
  // missing-context bypass of tenant media/project checks.
  if(!context)return withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},()=>prepareVideoInputBatch(actor,projectKey,raw,pendingIds));
  const parsed=parseVideoExecutionDraft(raw);if(!parsed.ok)return parsed;
  try{
    if(projectKey){await authorizeVideoProject(actor,projectKey);await bindActualCreationProject(actor,projectKey,{receipt:true});}
    // Native identities (character/scene/audio/timeline) are resolved by the
    // same owners as existing Canvas submission, preserving prompts/ordering.
    const expanded=await resolveCanvasNodeInputs(actor,parsed.value.inputs.map(input=>({...input,value:input.value??''})),parsed.value.prompt);
    const trustedTextIds=new Set(expanded.inputs.filter(input=>/^(character|scene):/.test(input.nodeId)).map(input=>input.id));
    const pending=new Set(pendingIds);
    if(pending.size!==pendingIds.length||pendingIds.some(id=>!expanded.inputs.some(input=>input.id===id&&input.kind!=='text')))return failure('INVALID_WORKFLOW_DEPENDENCY','制作链依赖槽无效');
    const resolved=await resolveVideoDraft({...parsed.value,prompt:expanded.prompt,inputs:expanded.inputs.filter(input=>!pending.has(input.id))},{
      scope:{actorId:actor,projectKey,workspaceId:context?.scopeKind==='tenant'?`tenant:${context.tenantId}`:'personal'},
      text:async input=>{
        if(trustedTextIds.has(input.id))return {ok:true,value:input.value??''};
        const node=await getOwnedCanvasTextNode(actor,input.nodeId.replace(/^text:/,''));
        if(!node)return failure('TEXT_REFERENCE_UNAVAILABLE','引用文字不存在或无权访问',input.id);
        await assertCreationProjectInput(actor,node.projectKey);
        await assertCreationObjectRefs(actor,[node.id]);
        const frozen=frozenWorkflowText(actor,input.nodeId);if(frozen!==undefined)return {ok:true,value:frozen};
        if(['generating','queued','processing'].includes(node.status))return failure('DEPENDENCY_PENDING','前序文字尚未完成',input.id);
        return {ok:true,value:canvasTextContent(node)};
      },
      media:async input=>{
        if(input.nodeId.startsWith('upload:')){
          if(!input.storageKey)return failure('VIDEO_INPUT_UNAVAILABLE','上传素材缺少稳定身份',input.id);
          return ownedAssetFacts(actor,input.storageKey,input);
        }
        const id=input.nodeId.replace(/^(image|video|audio):/,''),direct=(await listArtworksByIds(actor,[id]))[0];
        let artwork=direct;
        if(!artwork){
          const node=await getVideoNode(actor,id);
          if(!node)return failure('VIDEO_INPUT_UNAVAILABLE','引用媒体不存在或无权访问',input.id);
          await assertCreationProjectInput(actor,node.projectKey);
          const resultId=node.displayResultId||node.lastResultId;
          if(!resultId)return failure('DEPENDENCY_PENDING','前序视频尚无已完成结果',input.id);
          artwork=(await listArtworksByIds(actor,[resultId]))[0];
        }
        if(!artwork||artwork.status!=='completed')return failure('DEPENDENCY_PENDING','引用素材尚未完成或已不可用',input.id);
        await creationTransaction(tx=>assertCreationInputsTx(tx,actor,[artwork.id]));
        await assertCreationObjectRefs(actor,[artwork.id]);
        const url=input.kind==='image'?artwork.image:artwork.videoUrl||artwork.image;
        const key=storageKeyFromManagedUrl(url);
        if(!key)return failure('VIDEO_INPUT_UNAVAILABLE','引用媒体尚未进入可验证媒体库',input.id);
        return ownedAssetFacts(actor,key,input,artwork.id);
      },
    });
    return resolved.ok?{ok:true,value:{draft:{...parsed.value,prompt:expanded.prompt,inputs:expanded.inputs},resolved:resolved.value}}:resolved;
  }catch(error){
    if(error instanceof ModelConfigError)return failure(error.code,error.message);
    if(error instanceof TeamError)return failure('VIDEO_SCOPE_MISMATCH',error.message);
    if(error instanceof Error&&error.message==='不能直接引用其他企业的素材')return failure('VIDEO_SCOPE_MISMATCH','引用素材与当前工作空间不一致');
    return failure('VIDEO_INPUT_RESOLUTION_FAILED','视频素材解析未完成');
  }
}
