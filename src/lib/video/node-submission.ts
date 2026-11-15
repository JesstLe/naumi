import "server-only";
import {videoByocDraft} from "./byoc-draft";
import {bindActualCreationProject} from "@/lib/saas/creation-access";
import {currentCreationContext,frozenCreationScope} from "@/lib/saas/creation-scope";
import {getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {getVideoNode} from "../canvas/video-node-repository";
import {ModelConfigError} from "../model-config/types";
import {BillingError} from "../billing/types";
import {createVideoGeneration,withVideoCreationModel} from "./creation";
import type {CanvasVideoNode} from '../canvas/video-node-schema';
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
  if(node.config.comfyWorkflowId){
    const {submitByocComfyVideo}=await import('./byoc');const config=node.config;
    return submitByocComfyVideo(actor,{...videoByocDraft(config,node.inputs),nodeId:node.id,expectedRevision:input.expectedRevision,projectKey:node.projectKey,idempotencyKey:input.idempotencyKey});
  }
  const {batchCount:_batch,comfyWorkflowId:_comfy,comfyInputs:_inputs,comfyOverrides:_overrides,...config}=node.config;
  // All new managed requests use the application owner, including missing
  // bindings. It resolves or reports mapping errors; this entry never falls
  // back to legacy graph/text/media assembly. Accepted historical workflow
  // stages retain their separate DB-verified compatibility entry.
  return createVideoGeneration(actor,{...config,source:'canvas',sourceId:node.id,nodeId:node.id,nodeRevision:node.revision,projectKey:node.projectKey,
    prompt:config.prompt||'',seconds:String(config.durationSeconds??''),size:config.resolution||'',orderedInputs:node.inputs.length?node.inputs:undefined,references:node.inputs.length?undefined:config.references,
    idempotencyKey:input.idempotencyKey,billingConfirmation:input.billingConfirmation});
}
