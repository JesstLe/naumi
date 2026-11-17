import "server-only";
import {frozenLegacyByocStage} from './byoc-recipe';
import type {VideoGenerationRequest} from './types';
import {createHash,randomUUID} from "node:crypto";
import {getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {createVideoTaskWithReservation} from "@/lib/video/task-transitions";
import {type VideoTaskRow} from "@/lib/video/task-types";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import type {ApiWorkflow} from "../comfyui/workflow";
import {getVideoNode,associateVideoTaskTx} from "../canvas/video-node-repository";
import {ensureVideoNodeSchema} from "@/lib/canvas/storage-schema";

import {authorizeVideoReferences,materializeVideoReferences} from "./reference-materialization";
import {buildVideoCreate} from "./providers/wire";
import {publicProviderSnapshot,type VideoProviderRuntimeConfig} from "./providers/config";
import {submitQueuedVideoTask,handleVideoCreationError} from "./runtime";
import {withByocVideoTask} from "./byoc-context";
export {withByocVideoTask} from "./byoc-context";
import {applicationTasksRunHere} from "../application/task-execution";
import {withNewVideoAdmission} from './admission';
import {byocVideoInputSchema} from './byoc-input-schema';
export {byocVideoInputSchema} from './byoc-input-schema';

export function knownComfyVideoOutput(api:ApiWorkflow){return Object.values(api).some(node=>["SaveVideo","VHS_VideoCombine","VideoCombine"].includes(node.class_type));}

export async function submitByocComfyVideo(actorRaw:string,raw:unknown,workflowLink?:{runId:string;nodeId:string}){
  const actor=actorRaw.toLowerCase(),parsed=byocVideoInputSchema.safeParse(raw);
  if(!parsed.success)throw new ModelConfigError("INVALID_BYOC_VIDEO","自备视频工作流字段无效",422);
  if(frozenLegacyByocStage()){const {submitLegacyByocComfyVideo}=await import('./byoc-legacy-submission');return submitLegacyByocComfyVideo(actor,raw,workflowLink);}
  const {submitCompiledByocVideo}=await import('./byoc-submission');
  return submitCompiledByocVideo(actor,parsed.data,workflowLink);
}

export async function retryByocVideoTask(actor:string,old:VideoTaskRow,idempotencyKey:string){
  if(old.parameters.version===3){const {retryCompiledByocVideo}=await import('./byoc-submission');return retryCompiledByocVideo(actor,old,idempotencyKey);}
  const digest=createHash("sha256").update(canonicalConfig({retryOf:old.id,idempotencyKey})).digest("hex"),existing=await getVideoTaskByIdempotencyKey(actor,idempotencyKey);
  if(existing){if(existing.parameters.creationInputDigest!==digest)throw new ModelConfigError("OPERATION_CONFLICT","操作编号已用于另一任务",409);return {taskId:existing.id,cost:0};}
  return withNewVideoAdmission(actor,async()=>{
  const request=structuredClone(old.parameters.request) as VideoGenerationRequest;request.idempotencyKey=idempotencyKey;
  const node=request.canvasNodeId?await getVideoNode(actor,request.canvasNodeId):null;
  request.canvasNodeId=node?.id;request.nodeRevision=node?.revision;
  const id=`vid-${randomUUID()}`;
  return withByocVideoTask(actor,old,async()=>{
    const {currentPrivateVideoContext}=await import("./providers/private-context"),context=currentPrivateVideoContext()!;
    const material=await materializeVideoReferences(actor,request,{multipart:true});
    buildVideoCreate({provider:context.config,profile:"comfyui",request:{...material,workflowManifest:context.manifest,references:material.references.map(ref=>({...ref,submissionName:ref.storageKey}))}});
    if(node)await ensureVideoNodeSchema();
    const parameters={version:2,submissionState:"prepared",request,byocSnapshot:old.parameters.byocSnapshot,billingException:"comfyui-byoc-zero",retryOf:old.id,creationInputDigest:digest,
      byocSettings:old.parameters.byocSettings,nodeId:node?.id,nodeRevision:node?.revision,projectKey:request.projectKey,originalPrompt:old.parameters.originalPrompt};
    const created=await createVideoTaskWithReservation({leaseSeconds:applicationTasksRunHere()?undefined:0,id,email:actor,model:old.model,prompt:request.prompt,size:old.parameters.size as string||"workflow",seconds:String(request.durationSeconds),cost:0,
      requestBody:JSON.stringify({retryOf:old.id}),providerId:old.providerId,source:old.source,sourceId:old.sourceId,parameters,videoReferences:request.references,capabilitySnapshot:old.capabilitySnapshot,
      idempotencyKey,providerSnapshot:old.providerSnapshot,...(node?{onReserved:async(client,task)=>associateVideoTaskTx(client,actor,node.id,node.revision,task.id)}:{})});
    if(created.created)try{await submitQueuedVideoTask(actor,created.task,undefined,undefined,false);}catch(error){await handleVideoCreationError(actor,created.task,error);}
    return {taskId:created.task.id,cost:0};
  });
  });
}
