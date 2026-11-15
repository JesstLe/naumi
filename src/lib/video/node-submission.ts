import "server-only";
import {videoByocDraft} from "./byoc-draft";
import {bindActualCreationProject} from "@/lib/saas/creation-access";
import {currentCreationContext,frozenCreationScope} from "@/lib/saas/creation-scope";
import {authorizeNodeInputs} from "../canvas/video-node-service";
import {getVideoTask, getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {getVideoNode} from "../canvas/video-node-repository";
import {ModelConfigError} from "../model-config/types";
import {BillingError} from "../billing/types";
import {createVideoGeneration,withVideoCreationModel} from "./creation";
import {currentModelExecution} from '../model-config/context';
import type {CanvasVideoNode} from '../canvas/video-node-schema';
import {readOwnedVideoWorkflow} from "./workflow-source";
import {requireOwnedVideoText} from "./owned-text";
import type {VideoReference} from "./types";
import type {OrderedInput} from "./references";
import {resolveCanvasNodeInputs} from "../canvas/node-inputs";
export async function submitCanvasVideo(actorRaw:string,input:{nodeId:string;expectedRevision:number;idempotencyKey:string;billingConfirmation?:{version?:number;credits?:number}}){
  const actor=actorRaw.toLowerCase(),existing=await getVideoTaskByIdempotencyKey(actor,input.idempotencyKey);
  if(existing){
    const saved=frozenCreationScope(existing.parameters.creationScope,actor),context=currentCreationContext();
    if(context?.workspaceExplicit&&(!saved||saved.scopeKind!==context.scopeKind||saved.tenantId!==context.tenantId))throw new ModelConfigError("CREATION_SCOPE_CONFLICT","此任务的工作空间已固定",409);
    if(existing.parameters.nodeId!==input.nodeId||existing.parameters.nodeRevision!==input.expectedRevision)throw new BillingError("OPERATION_CONFLICT","操作编号已用于另一视频任务",409);
    return {taskId:existing.id,cost:existing.cost};
  }
  const node=await getVideoNode(actor,input.nodeId);
  if(!node)throw new ModelConfigError("VIDEO_NODE_UNAVAILABLE","视频节点不存在",404);
  if(node.revision!==input.expectedRevision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点已更新，请重新读取后生成",409);
  return node.config.comfyWorkflowId?submitOwnedVideoNode(actor,node,input):withVideoCreationModel(node.config.modelId,()=>submitOwnedVideoNode(actor,node,input));
}
async function submitOwnedVideoNode(actor:string,node:CanvasVideoNode,input:{nodeId:string;expectedRevision:number;idempotencyKey:string;billingConfirmation?:{version?:number;credits?:number}}){
  await bindActualCreationProject(actor,node.projectKey);
  if(currentModelExecution('video')?.frozen.video?.execution&&!node.config.comfyWorkflowId){
    const {batchCount:_batch,comfyWorkflowId:_comfy,comfyInputs:_inputs,comfyOverrides:_overrides,...config}=node.config;
    // New resolver owns expansion/selection. Do not run the legacy expansion,
    // text compiler and reference normalizer before it a second time.
    return createVideoGeneration(actor,{...config,source:'canvas',sourceId:node.id,nodeId:node.id,nodeRevision:node.revision,projectKey:node.projectKey,
      prompt:config.prompt||'',seconds:String(config.durationSeconds??''),size:config.resolution||'',orderedInputs:node.inputs.length?node.inputs:undefined,references:node.inputs.length?undefined:config.references,
      idempotencyKey:input.idempotencyKey,billingConfirmation:input.billingConfirmation});
  }
  if(node.config.comfyWorkflowId){
    const {submitByocComfyVideo}=await import('./byoc');const config=node.config;
    return submitByocComfyVideo(actor,{...videoByocDraft(config,node.inputs),nodeId:node.id,expectedRevision:input.expectedRevision,projectKey:node.projectKey,idempotencyKey:input.idempotencyKey});
  }
  const resolved=await resolveCanvasNodeInputs(actor,node.inputs,node.config.prompt||"");
  await authorizeNodeInputs(actor,{id:node.id,expectedRevision:node.revision,operationId:input.idempotencyKey,config:node.config,inputs:resolved.inputs});
  const {comfyWorkflowId,comfyInputs,comfyOverrides,workflowTaskId,camera,batchCount:_batchCount,...config}={...node.config,prompt:resolved.prompt};
  let workflowManifest=config.workflowManifest;
  if(workflowTaskId&&!workflowManifest){const old=await readOwnedVideoWorkflow(actor,workflowTaskId);
    if(old.publicModelId!==config.modelId)throw new ModelConfigError("VIDEO_WORKFLOW_MODEL_CONFLICT","历史工作流与当前模型不一致，请重新选择模型",409);workflowManifest=old.manifest;
  }
  const references:VideoReference[]=[],orderedInputs:OrderedInput[]=[];
  for(const source of resolved.inputs){
    if(source.kind==="text"){
      orderedInputs.push({...source,value:source.nodeId.startsWith("inline:")?source.value:await requireOwnedVideoText(actor,source.nodeId)});continue;
    }
    const sourceId=source.nodeId.replace(/^(?:image|video|audio):/,""),videoNode=await getVideoNode(actor,sourceId);
    let artworkId=sourceId;
    if(videoNode){
      const task=videoNode.lastTaskId?await getVideoTask(actor,videoNode.lastTaskId):null;
      if(!videoNode.displayResultId&&task&&task.status!=="completed"||!videoNode.displayResultId&&!videoNode.lastResultId)throw new ModelConfigError("VIDEO_DEPENDENCY_PENDING","前序视频尚未完成",409);
      artworkId=videoNode.displayResultId||videoNode.lastResultId!;
    }
    const artwork=(await listArtworksByIds(actor,[artworkId]))[0];
    if(!artwork||artwork.status!=="completed")throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","引用媒体尚未完成或无权访问",404);
    const url=source.kind==="image"?artwork.image:artwork.videoUrl||artwork.image;
    if(["context","author"].includes(source.role))throw new ModelConfigError("INVALID_VIDEO_INPUT_ROLE","媒体引用角色无效",422);
    references.push({id:source.id,kind:source.kind,role:source.role as VideoReference["role"],artworkId,url});
    orderedInputs.push({...source,value:url});
  }
  return createVideoGeneration(actor,{...config,workflowManifest,camera,source:"canvas",sourceId:node.id,nodeId:node.id,nodeRevision:input.expectedRevision,projectKey:node.projectKey,
    prompt:config.prompt||"",seconds:String(config.durationSeconds??""),size:config.resolution||"",references:resolved.inputs.length?references:config.references,
    orderedInputs:resolved.inputs.length?orderedInputs:undefined,idempotencyKey:input.idempotencyKey,billingConfirmation:input.billingConfirmation});
}
