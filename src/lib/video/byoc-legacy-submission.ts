import "server-only";
import {associateWorkflowTaskTx} from "./workflow-links";
import {prepareByocRecipe} from "./byoc-recipe";
import {createHash,randomUUID} from "node:crypto";
import {byocVideoInputSchema} from "./byoc";
import {getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {createVideoTaskWithReservation} from "@/lib/video/task-transitions";
import {type VideoTaskRow} from "@/lib/video/task-types";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import type {ApiWorkflow} from "../comfyui/workflow";
import {getVideoNode,associateVideoTaskTx} from "../canvas/video-node-repository";
import {ensureVideoNodeSchema} from "@/lib/canvas/storage-schema";

import { authorizeVideoProject } from "../canvas/project-access";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {compileVideoPrompt} from "./prompt";
import {videoReferenceSchema,orderedInputSchema} from "./references";
import {authorizeVideoReferences,materializeVideoReferences} from "./reference-materialization";
import {buildVideoCreate} from "./providers/wire";
import {publicProviderSnapshot,type VideoProviderRuntimeConfig} from "./providers/config";
import {submitQueuedVideoTask,handleVideoCreationError} from "./runtime";
import {withByocVideoTask} from "./byoc-context";

import {applicationTasksRunHere} from "../application/task-execution";
import type {VideoGenerationRequest} from "./types";

/** Historical accepted workflow stages only; no new-task ingress selects it. */
export async function submitLegacyByocComfyVideo(actorRaw:string,raw:unknown,workflowLink?:{runId:string;nodeId:string}){
  const actor=actorRaw.toLowerCase(),parsed=byocVideoInputSchema.safeParse(raw);
  if(!parsed.success)throw new ModelConfigError("INVALID_BYOC_VIDEO","自备视频工作流字段无效",422);
  const input=parsed.data,digest=createHash("sha256").update(canonicalConfig(input)).digest("hex"),old=await getVideoTaskByIdempotencyKey(actor,input.idempotencyKey);
  if(old){if(old.parameters.creationInputDigest!==digest)throw new ModelConfigError("OPERATION_CONFLICT","操作编号已用于另一任务",409);return {taskId:old.id,cost:0};}
  const node=input.nodeId?await getVideoNode(actor,input.nodeId):null;
  if(input.nodeId&&(!node||node.revision!==input.expectedRevision))throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点不存在或已更新",409);
  const references=[...(input.references||[])];
  if(input.artworkId){const art=(await listArtworksByIds(actor,[input.artworkId]))[0];if(!art)throw new ModelConfigError("VIDEO_REFERENCE_UNAVAILABLE","素材不存在",404);references.unshift({id:art.id,artworkId:art.id,kind:"image" as const,role:"reference" as const,url:art.image});}
  else if(input.imageUrl)references.unshift({id:"byoc-image",kind:"image",role:"reference",url:input.imageUrl});
  const source=node?"canvas":input.source||"workflow";
  const projectKey=node?.projectKey||input.projectKey|| (source!=="workbench"&&input.artworkId?`tree:${(await listArtworksByIds(actor,[input.artworkId]))[0]?.groupId||input.artworkId}`:undefined);
  if(input.projectKey&&node&&input.projectKey!==node.projectKey)throw new ModelConfigError("VIDEO_NODE_PROJECT_CONFLICT","视频节点项目不一致",409);
  if(projectKey)await authorizeVideoProject(actor,projectKey);
  const orderedInputs=input.orderedInputs||[];
  const {requireOwnedVideoText}=await import("./owned-text");
  for(const item of orderedInputs)if(item.kind==="text"&&!item.nodeId.startsWith("inline:"))item.value=await requireOwnedVideoText(actor,item.nodeId);
  const prompt=compileVideoPrompt(input.prompt||"",orderedInputs).prompt;
  const recipe=await prepareByocRecipe(actor,{...input,prompt,references}),{config,manifest}=recipe,providerId=config.id;
  let request:VideoGenerationRequest={source,sourceId:node?.id||input.workflowId,canvasNodeId:node?.id,nodeRevision:node?.revision,projectKey,
    providerId,modelId:input.workflowId,prompt,negativePrompt:input.negativePrompt,resolution:input.resolution,aspectRatio:input.aspectRatio,generateAudio:input.generateAudio,watermark:input.watermark,orderedInputs:orderedInputs.length?orderedInputs:undefined,durationSeconds:input.durationSeconds??-1,references,idempotencyKey:input.idempotencyKey};
  request=await authorizeVideoReferences(actor,request);
  const prepared=await materializeVideoReferences(actor,request,{multipart:true});
  buildVideoCreate({provider:config,profile:"comfyui",request:{...prepared,workflowManifest:manifest,references:prepared.references.map(ref=>({...ref,submissionName:ref.storageKey}))}});
  const byocSnapshot=recipe.snapshot;
  const id=`vid-${randomUUID()}`;if(node)await ensureVideoNodeSchema();
  const created=await createVideoTaskWithReservation({leaseSeconds:applicationTasksRunHere()?undefined:0,id,email:actor,model:input.workflowId,prompt:request.prompt,size:"workflow",seconds:String(request.durationSeconds),cost:0,requestBody:JSON.stringify({workflowId:input.workflowId,referenceIds:references.map(ref=>ref.id)}),
    providerId,source:request.source,sourceId:request.sourceId,idempotencyKey:input.idempotencyKey,providerSnapshot:publicProviderSnapshot(config),videoReferences:request.references,
    capabilitySnapshot:{workflowOnly:true,durationUnknown:input.durationSeconds===undefined},parameters:{version:2,submissionState:"prepared",billingException:"comfyui-byoc-zero",byocSnapshot,request,
      workflowRunId:workflowLink?.runId,workflowNodeId:workflowLink?.nodeId,byocSettings:recipe.settings,creationInputDigest:digest,nodeId:node?.id,nodeRevision:node?.revision,projectKey,originalPrompt:input.prompt||""},
    ...((node||workflowLink)?{onReserved:async(client,task)=>{if(node)await associateVideoTaskTx(client,actor,node.id,node.revision,task.id);if(workflowLink)await associateWorkflowTaskTx(client,actor,workflowLink.runId,workflowLink.nodeId,task.id);}}:{})});
  if(created.created)await withByocVideoTask(actor,created.task,async()=>{try{await submitQueuedVideoTask(actor,created.task,undefined,undefined,false);}catch(error){await handleVideoCreationError(actor,created.task,error);}});
  return {taskId:created.task.id,cost:0};
}
