import "server-only";
import {associateWorkflowTaskTx} from "./workflow-links";
import {prepareByocRecipe} from "./byoc-recipe";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {createVideoTaskWithReservation} from "@/lib/video/task-transitions";
import {type VideoTaskRow} from "@/lib/video/task-types";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {createCredentialStore} from "../model-config/credentials";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {decryptAtRest} from "../settings";
import {assertComfyEndpointAllowed} from "../comfyui/client";
import type {ApiWorkflow} from "../comfyui/workflow";
import {runLegacyModelExecution} from "../model-config/context";
import {getVideoNode,associateVideoTaskTx,ensureVideoNodeSchema} from "../canvas/video-node-repository";
import {authorizeVideoProject} from "../canvas/video-node-service";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {compileVideoPrompt} from "./prompt";
import {videoReferenceSchema,orderedInputSchema} from "./references";
import {authorizeVideoReferences,materializeVideoReferences} from "./reference-materialization";
import {buildVideoCreate} from "./providers/wire";
import {publicProviderSnapshot,type VideoProviderRuntimeConfig} from "./providers/config";
import {runPrivateVideoProvider} from "./providers/private-context";
import {submitQueuedVideoTask,handleVideoCreationError} from "./service";
import type {VideoGenerationRequest} from "./types";
const num=z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),name=z.string().min(1).max(160);
export const byocVideoInputSchema=z.strictObject({workflowId:name,idempotencyKey:z.string().min(1).max(100),mediaType:z.literal("video").optional(),artworkId:name.optional(),imageUrl:z.string().max(16384).optional(),
  source:z.enum(["canvas","workbench","agent","workflow"]).optional(),orderedInputs:z.array(orderedInputSchema).max(256).optional(),
  nodeId:name.optional(),expectedRevision:z.number().int().nonnegative().optional(),projectKey:z.string().max(166).optional(),
  prompt:z.string().max(16384).optional(),texts:z.record(name,z.string().max(16384)).optional(),seed:num.int().optional(),seeds:z.record(name,num.int()).optional(),
  numericDefaults:z.record(name,num).optional(),numerics:z.record(name,z.record(name,num)).optional(),durationSeconds:z.number().int().positive().max(3600).optional(),
  negativePrompt:z.string().max(8192).optional(),resolution:z.string().max(100).optional(),aspectRatio:z.string().max(20).optional(),generateAudio:z.boolean().optional(),watermark:z.boolean().optional(),
  references:z.array(videoReferenceSchema).max(128).optional(),inputMappings:videoWorkflowManifestSchema.shape.inputs.optional()});
const snapshotSchema=z.strictObject({actor:z.string(),providerId:name,endpointId:name,baseUrl:z.url(),credentialRef:z.uuid().optional(),manifest:videoWorkflowManifestSchema});
export function knownComfyVideoOutput(api:ApiWorkflow){return Object.values(api).some(node=>["SaveVideo","VHS_VideoCombine","VideoCombine"].includes(node.class_type));}
export async function withByocVideoTask<T>(actor:string,task:VideoTaskRow,run:()=>Promise<T>){
  const decrypted=typeof task.parameters.byocSnapshot==="string"?decryptAtRest(task.parameters.byocSnapshot):null;
  if(!decrypted)throw new ModelConfigError("BYOC_SNAPSHOT_UNAVAILABLE","自备视频工作流快照不可用",503);
  const frozen=snapshotSchema.parse(JSON.parse(decrypted));
  if(frozen.actor!==actor||frozen.providerId!==task.providerId)throw new ModelConfigError("BYOC_OWNER_MISMATCH","自备视频任务归属不一致",403);
  await assertComfyEndpointAllowed(frozen.baseUrl);
  const apiKey=frozen.credentialRef?await createCredentialStore(getPool()).read(frozen.credentialRef,frozen.providerId):"";
  const config:VideoProviderRuntimeConfig={id:frozen.providerId,label:"自备 ComfyUI",protocol:"comfyui",videoProfile:"comfyui",baseUrl:frozen.baseUrl,apiKey,
    models:[task.model],defaultModel:task.model,idempotencyStrategy:"none"};
  return runLegacyModelExecution(()=>runPrivateVideoProvider({config,manifest:frozen.manifest},run));
}
export async function submitByocComfyVideo(actorRaw:string,raw:unknown,workflowLink?:{runId:string;nodeId:string}){
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
  const {requireOwnedVideoText}=await import("./submission");
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
  const created=await createVideoTaskWithReservation({id,email:actor,model:input.workflowId,prompt:request.prompt,size:"workflow",seconds:String(request.durationSeconds),cost:0,requestBody:JSON.stringify({workflowId:input.workflowId,referenceIds:references.map(ref=>ref.id)}),
    providerId,source:request.source,sourceId:request.sourceId,idempotencyKey:input.idempotencyKey,providerSnapshot:publicProviderSnapshot(config),videoReferences:request.references,
    capabilitySnapshot:{workflowOnly:true,durationUnknown:input.durationSeconds===undefined},parameters:{version:2,submissionState:"prepared",billingException:"comfyui-byoc-zero",byocSnapshot,request,
      workflowRunId:workflowLink?.runId,workflowNodeId:workflowLink?.nodeId,byocSettings:recipe.settings,creationInputDigest:digest,nodeId:node?.id,nodeRevision:node?.revision,projectKey,originalPrompt:input.prompt||""},
    ...((node||workflowLink)?{onReserved:async(client,task)=>{if(node)await associateVideoTaskTx(client,actor,node.id,node.revision,task.id);if(workflowLink)await associateWorkflowTaskTx(client,actor,workflowLink.runId,workflowLink.nodeId,task.id);}}:{})});
  if(created.created)await withByocVideoTask(actor,created.task,async()=>{try{await submitQueuedVideoTask(actor,created.task,undefined,undefined,false);}catch(error){await handleVideoCreationError(actor,created.task,error);}});
  return {taskId:created.task.id,cost:0};
}

export async function retryByocVideoTask(actor:string,old:VideoTaskRow,idempotencyKey:string){
  const digest=createHash("sha256").update(canonicalConfig({retryOf:old.id,idempotencyKey})).digest("hex"),existing=await getVideoTaskByIdempotencyKey(actor,idempotencyKey);
  if(existing){if(existing.parameters.creationInputDigest!==digest)throw new ModelConfigError("OPERATION_CONFLICT","操作编号已用于另一任务",409);return {taskId:existing.id,cost:0};}
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
    const created=await createVideoTaskWithReservation({id,email:actor,model:old.model,prompt:request.prompt,size:old.parameters.size as string||"workflow",seconds:String(request.durationSeconds),cost:0,
      requestBody:JSON.stringify({retryOf:old.id}),providerId:old.providerId,source:old.source,sourceId:old.sourceId,parameters,videoReferences:request.references,capabilitySnapshot:old.capabilitySnapshot,
      idempotencyKey,providerSnapshot:old.providerSnapshot,...(node?{onReserved:async(client,task)=>associateVideoTaskTx(client,actor,node.id,node.revision,task.id)}:{})});
    if(created.created)try{await submitQueuedVideoTask(actor,created.task,undefined,undefined,false);}catch(error){await handleVideoCreationError(actor,created.task,error);}
    return {taskId:created.task.id,cost:0};
  });
}
