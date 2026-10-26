import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {createVideoTaskWithReservation} from "@/lib/video/task-transitions";
import {type VideoTaskRow} from "@/lib/video/task-types";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {currentModelExecution,currentExecutionBundle} from "../model-config/context";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {quoteForActor} from "../billing/quotation";
import {assertQuotedVersion} from "../billing/request";
import {associateVideoTaskTx,getVideoNode} from "../canvas/video-node-repository";
import {ensureVideoNodeSchema} from "@/lib/canvas/storage-schema";

import {authorizeVideoProject} from "../canvas/video-node-service";
import {normalizeVideoInput,resolveVideoCapability,VideoContractError} from "./contract";
import {compileVideoPrompt} from "./prompt";
import {compileVideoCamera} from "./camera";
import {adapterDefinition} from "./model-definition";
import {videoReferenceSchema} from "./references";
import {authorizeVideoReferences,materializeVideoReferences} from "./reference-materialization";
import {configuredVideoProviders,getVideoProviderConfig,publicProviderSnapshot} from "./providers/config";
import {getVideoProvider} from "./providers/adapter";
import {buildVideoCreate,rejectAdvanced,selectWireOptions} from "./providers/wire";
import {GEMINI_WIRE_OPTIONS} from "./providers/protocols/gemini";
import {encryptAtRest} from "../settings";
import type {VideoGenerationRequest} from "./types";
import type {CreateVideoInput} from "./service";
import {associateWorkflowTaskTx} from "./workflow-links";
import {frozenWorkflowText} from "./workflow-text-context";

export async function requireOwnedVideoText(email:string,id:string){
  const frozen=frozenWorkflowText(email,id);if(frozen!==undefined)return frozen;
  const row=(await getPool().query("SELECT content,prompt,status FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[email,id.replace(/^text:/,"")])).rows[0];
  if(!row)throw new VideoContractError("TEXT_REFERENCE_UNAVAILABLE","引用文字节点不存在或无权访问");
  if(["generating","processing","queued"].includes(String(row.status)))throw new VideoContractError("TEXT_DEPENDENCY_PENDING","前序文字尚未完成");
  return String(row.content||row.prompt||"");
}
export function videoCreationInputDigest(input:CreateVideoInput){const {billingConfirmation:_confirmation,idempotencyKey:_key,...intent}=input;return createHash("sha256").update(canonicalConfig(intent)).digest("hex");}
export async function createValidatedVideo(email:string,input:CreateVideoInput,hooks:{submit:(email:string,task:VideoTaskRow,request:VideoGenerationRequest)=>Promise<void>;creationError:(email:string,task:VideoTaskRow,error:unknown)=>Promise<void>}):Promise<{taskId:string;cost:number}>{
  const execution=currentModelExecution("video");
  const providerId=execution?.connection.providerId||input.providerId||configuredVideoProviders()[0]?.id||"openai-videos";
  const providerConfig=getVideoProviderConfig(providerId);
  if(!providerConfig)throw new ModelConfigError("VIDEO_PROVIDER_UNAVAILABLE","视频供应商尚未配置",422);
  const modelId=execution?.connection.wireModel||input.modelId||providerConfig.defaultModel;
  const frozen=execution?.frozen.video;
  const definition=frozen?.definition||adapterDefinition(providerConfig.protocol,modelId);
  if(!definition)throw new VideoContractError("UNKNOWN_VIDEO_CAPABILITY","视频模型能力尚未配置");
  const capability=frozen?{...frozen.definition,sources:frozen.sources}:resolveVideoCapability({manual:definition});
  if(input.camera&&Object.values(input.camera).some(value=>!!value)&&capability.supportsCamera!==true)throw new VideoContractError("CAMERA_UNSUPPORTED","当前模型未声明摄影设置能力",["camera"]);
  const parsedReferences=z.array(videoReferenceSchema).max(128).safeParse(input.references??[]);
  if(!parsedReferences.success)throw new VideoContractError("INVALID_VIDEO_REFERENCES","视频素材字段无效",["references"]);
  const references=parsedReferences.data;
  if(input.artworkId){
    const art=(await listArtworksByIds(email,[input.artworkId]))[0];
    if(!art)throw new VideoContractError("REFERENCE_UNAVAILABLE","图片不存在或无权访问");
    references.unshift({id:art.id,artworkId:art.id,kind:"image",role:"first_frame",url:art.image});
  }else if(input.imageUrl)references.unshift({id:"legacy-first-frame",kind:"image",role:"first_frame",url:input.imageUrl});
  if(input.projectKey)await authorizeVideoProject(email,input.projectKey);
  if(input.nodeId){
    await ensureVideoNodeSchema();const node=await getVideoNode(email,input.nodeId);
    if(!node)throw new ModelConfigError("VIDEO_NODE_UNAVAILABLE","视频节点不存在",404);
    if(node.revision!==input.nodeRevision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点已更新，请重新读取后生成",409);
    if(node.projectKey!==input.projectKey)throw new ModelConfigError("VIDEO_NODE_PROJECT_CONFLICT","视频节点项目不一致",409);
  }
  const cameraPrompt=compileVideoCamera(input.camera);
  const orderedInputs=input.orderedInputs?await Promise.all(input.orderedInputs.map(async item=>item.kind==="text"&&!item.nodeId.startsWith("inline:")?{...item,value:await requireOwnedVideoText(email,item.nodeId)}:{...item})):references.map(ref=>({id:ref.id,nodeId:ref.artworkId||`inline:${ref.id}`,kind:ref.kind,role:ref.role,value:ref.url||ref.storageKey||ref.artworkId!}));
  const compiled=compileVideoPrompt(input.prompt,orderedInputs||[],cameraPrompt);
  for(const shot of input.shots||[])if(shot.textNodeId)await requireOwnedVideoText(email,shot.textNodeId);
  let normalized=normalizeVideoInput({...input,seconds:input.seconds||undefined,size:input.size||undefined,prompt:compiled.prompt,references,orderedInputs},capability);
  const idempotencyKey=input.idempotencyKey||randomUUID();
  const {omittedProviderOptions:_omitted,...validInput}=normalized;
  let request:VideoGenerationRequest={...validInput,source:input.source,sourceId:input.sourceId,projectKey:input.projectKey,canvasNodeId:input.nodeId,nodeRevision:input.nodeRevision,
    providerId,modelId,idempotencyKey,workflowManifest:input.workflowManifest??execution?.parameterMap.videoWorkflow};
  request=await authorizeVideoReferences(email,request);
  normalized=normalizeVideoInput({...request},capability);const {omittedProviderOptions:_authorizedOmitted,...authorizedInput}=normalized;request={...request,...authorizedInput};
  if(!getVideoProvider(providerId))throw new ModelConfigError("VIDEO_ADAPTER_UNAVAILABLE","视频协议尚未配置",422);
  // Validate the exact protocol before reservation. Native uploads happen after reservation.
  if(providerConfig.videoProfile){
    const multipart=["openai-videos","comfyui","runninghub"].includes(providerConfig.videoProfile);
    const inlineImages=["openai-videos","gemini","cogvideox3","grok2api","agnes","compshare-hailuo"].includes(providerConfig.videoProfile);
    const submission=await materializeVideoReferences(email,request,{multipart,inlineImages});
    const validation=providerConfig.videoProfile==="comfyui"||providerConfig.videoProfile==="runninghub"?{...submission,references:submission.references.map(ref=>({...ref,submissionName:ref.storageKey}))}:submission;
    buildVideoCreate({provider:providerConfig,profile:providerConfig.videoProfile,request:validation});
  }else if(providerConfig.protocol==="gemini"){
    const context={provider:providerConfig,profile:"gemini" as const,request};
    rejectAdvanced(context);selectWireOptions(context,GEMINI_WIRE_OPTIONS);
  }
  // Customer pricing selects the frozen public alias; transport retains wire modelId.
  const billingQuote=await quoteForActor(email,{feature:"video.generate",quantity:1,modelId:execution?.frozen.publicModelId||modelId,providerId,resolution:request.resolution});
  assertQuotedVersion(input.billingConfirmation||{},billingQuote);
  const taskId=`vid-${randomUUID()}`,cost=billingQuote.requestedCredits;
  const {workflowManifest,...stableRequest}=request;
  const workflowManifestEnc=workflowManifest?encryptAtRest(JSON.stringify(workflowManifest)):undefined;
  const workflowManifestDigest=workflowManifest?createHash("sha256").update(canonicalConfig(workflowManifest)).digest("hex"):undefined;
  const parameters={version:2,submissionState:"prepared",request:stableRequest,workflowManifestEnc,workflowManifestDigest,creationInputDigest:videoCreationInputDigest(input),
    ...(currentExecutionBundle()?{modelExecutions:structuredClone(currentExecutionBundle())}:{}),
    publicModelId:execution?.frozen.publicModelId||input.modelId||modelId,projectKey:input.projectKey,nodeId:input.nodeId,nodeRevision:input.nodeRevision,
    workflowRunId:input.workflowRunId,workflowNodeId:input.workflowNodeId,originalPrompt:input.prompt,camera:input.camera,authorNodeIds:compiled.authorNodeIds,retryOf:input.retryOf,...normalized,
    seconds:request.durationSeconds,size:request.resolution,providerId,modelId,providerSnapshot:publicProviderSnapshot(providerConfig),idempotencyKey};
  const claimed=await createVideoTaskWithReservation({billingQuote,id:taskId,email,model:modelId,prompt:request.prompt,size:request.resolution||"",seconds:String(request.durationSeconds),cost,
    requestBody:JSON.stringify({version:2,modelId,mode:request.mode,durationSeconds:request.durationSeconds,resolution:request.resolution,referenceIds:request.references.map(ref=>ref.id)}),
    providerId,source:input.source,sourceId:input.sourceId,parameters,videoReferences:request.references,capabilitySnapshot:capability,idempotencyKey,channelId:providerId,
    providerSnapshot:publicProviderSnapshot(providerConfig),...((input.nodeId||input.workflowRunId)?{onReserved:async(client,task)=>{if(input.nodeId)await associateVideoTaskTx(client,email,input.nodeId,input.nodeRevision!,task.id);if(input.workflowRunId&&input.workflowNodeId)await associateWorkflowTaskTx(client,email,input.workflowRunId,input.workflowNodeId,task.id);}}:{})});
  if(!claimed.created)return {taskId:claimed.task.id,cost:claimed.task.cost};
  try{await hooks.submit(email,claimed.task,request);}catch(error){await hooks.creationError(email,claimed.task,error);}
  return {taskId:claimed.task.id,cost:claimed.task.cost};
}
