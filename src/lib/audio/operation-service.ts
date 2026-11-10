import "server-only";
import {createHash} from "node:crypto";
import {authorizeCanvasProject} from "../canvas/project-access";
import {assertCreationProjectInput} from "../saas/creation-access";
import {getTimelineNode} from "../canvas/timeline-node-service";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {verifiedOwnedMedia,recordMediaProbeTx,ensureMediaInspectionSchema,mediaExtension,inspectedMediaMime} from "../video/media-inspection";
import {probeMedia} from "../video/media";
import {readManagedObject} from "../object-storage/managed-read";
import {writeStoredObject,storageDriver} from "../object-storage/runtime";
import {registerPrivateMediaTx,assertOwnedMediaVersion} from "../media-assets";
import {addArtworksTx} from "../artworks/writer";
import {currentModelExecution,currentModelBillingSnapshot} from "../model-config/context";
import {BillingError} from "../billing/types";
import {TeamError} from "../teams/errors";
import {ZodError} from "zod";
import {ModelConfigError} from "../model-config/types";
import {checkpointSynchronousResult,configuredToolCost,currentSynchronousBilling,markBillingUpstream} from "../billing/synchronous-operation";
import {readSynchronousReceipt,completeAudioCheckpoint} from "../billing/receipt-reader";
import {AudioExecutionError,executeSpeech,executeTranscription} from "./model-execution";
import {recordAudioIntent,readAudioIntent,type AudioIntent} from "./operation-repository";
import {speechOperationSchema,transcriptionOperationSchema,audioCheckpointSchema,audioReceiptSchema,type AudioCheckpoint,type AudioTarget} from "./operation-schema";

const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const unavailable=()=>new ModelConfigError("AUDIO_OPERATION_UNAVAILABLE","声音操作不存在或无权访问",404);
export async function requireAudioTarget(actor:string,target:AudioTarget){
  await authorizeCanvasProject(actor,target.projectKey);await assertCreationProjectInput(actor,target.projectKey,undefined,true);
  const node=await getTimelineNode(actor,target.timelineId),line=node?.timeline.dialogue?.lines.find(line=>line.id===target.lineId);
  if(!node||node.projectKey!==target.projectKey||!line)throw unavailable();
  if(node.revision!==target.revision||sha(line.text)!==target.textSha256)throw new ModelConfigError("AUDIO_LINE_CHANGED","对白或工程已更新，请保存并重新读取该句",409);
  return {node,line};
}
export async function runAudioOperation(actorRaw:string,kind:"speech"|"transcribe",raw:unknown,signal?:AbortSignal){
  const actor=actorRaw.toLowerCase(),request=kind==="speech"?speechOperationSchema.parse(raw):transcriptionOperationSchema.parse(raw),{line}=await requireAudioTarget(actor,request.target);
  const scope=currentModelExecution("audio"),billing=currentSynchronousBilling(),snapshot=currentModelBillingSnapshot();
  if(!scope||scope.frozen.binding!==`audio.${kind}`||scope.frozen.publicModelId!==request.modelId||!billing||billing.email!==actor||billing.id!==`tool-${request.operationId}`)throw new ModelConfigError("AUDIO_CONTEXT_INVALID","声音执行上下文不一致",409);
  if(billing.snapshot?.version!==scope.frozen.billingVersion||snapshot?.version!==scope.frozen.billingVersion)throw new ModelConfigError("AUDIO_CONTEXT_CHANGED","声音计费版本已变化，本次尚未提交，请重新读取报价",409);
  const tariff=snapshot?.config.features[billing.feature];
  if(!tariff?.enabled)throw new ModelConfigError("AUDIO_PRICE_UNAVAILABLE","声音通道尚未配置明确售价",503);
  let source:AudioIntent["source"];
  if(kind==="transcribe"){
    const input=transcriptionOperationSchema.parse(request),[material]=await requireTimelineMaterials(actor,[input.artworkId]);
    if(!material.hasAudio)throw new ModelConfigError("AUDIO_SOURCE_INVALID","所选素材没有有效声音",422);
    source=await verifiedOwnedMedia(actor,material.key,input.artworkId,input.sourceSha256);
  }
  // The original billing owner wins concurrent acceptance before any supplier
  // work. This immutable row only links the exact source/line/version for costs.
  await configuredToolCost();
  if(billing.operation?.quote.modelVersion!==scope.frozen.modelVersion||billing.operation.quote.facts.modelId!==scope.frozen.publicModelId)throw new ModelConfigError("AUDIO_CONTEXT_CHANGED","声音模型与原报价不一致，本次尚未提交",409);
  if(billing.operation?.quote.tariff.pricing.mode==="usage")throw new ModelConfigError("AUDIO_PRICE_UNAVAILABLE","声音通道需要非文本用量的明确售价",503);
  const intent:AudioIntent={createdAt:new Date().toISOString(),actor,operationId:request.operationId,kind,requestHash:billing.hash,request,line:structuredClone(line),execution:structuredClone(scope.frozen),...(source?{source}:{})};
  await recordAudioIntent(intent);
  const options={trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)};
  let bytes:Uint8Array,mimeType:string,extension:string;
  if(kind==="speech"){
    const input=speechOperationSchema.parse(request),result=await executeSpeech(scope,{text:line.text,voice:input.voice,format:input.format,...(input.speed!==undefined?{speed:input.speed}:{}),...(input.instructions!==undefined?{instructions:input.instructions}:{})},options,signal);
    bytes=result.bytes;mimeType=result.mimeType;extension=mediaExtension(mimeType);
  }else{
    const input=transcriptionOperationSchema.parse(request),object=await readManagedObject(`/media/${source!.key}`,104857600);
    if(sha(object.bytes)!==source!.sha256)throw new ModelConfigError("AUDIO_SOURCE_CHANGED","原音频字节已改变",409);
    const result=await executeTranscription(scope,{bytes:Uint8Array.from(object.bytes),mimeType:source!.mimeType as Parameters<typeof executeTranscription>[1]["mimeType"],durationSeconds:source!.probe.durationSeconds,format:input.format,timestamps:input.timestamps,...(input.language!==undefined?{language:input.language}:{}),...(input.prompt!==undefined?{prompt:input.prompt}:{})},options,signal);
    bytes=Buffer.from(JSON.stringify(result));mimeType="application/json";extension="json";
  }
  // Durable private bytes precede decoding, artwork publication and wallet
  // settlement. Recovery consumes this checkpoint only; it never calls a model.
  const key=`audio-results/${sha(actor).slice(0,24)}/${request.operationId}.${extension}`;
  const stored=await writeStoredObject(bytes,mimeType,key);
  const checkpoint:AudioCheckpoint=audioCheckpointSchema.parse({version:1,operationId:request.operationId,kind,target:request.target,key,sha256:sha(bytes),mimeType,remoteReady:stored.remoteReady,bytes:bytes.byteLength});
  await checkpointSynchronousResult({audioCheckpoint:checkpoint});
  const completed=await recoverAudioOperation(actor,request.target.projectKey,request.operationId);
  if(!("receipt" in completed))throw new ModelConfigError("OPERATION_PENDING","原声音结果尚待恢复",409);
  return {audioReceipt:completed.receipt,...(completed.receipt.kind==="speech"?{artworkId:completed.receipt.artworkId}:{})};
}

export async function requireAudioIntent(actor:string,projectKey:string,operationId:string){
  await authorizeCanvasProject(actor,projectKey);await assertCreationProjectInput(actor,projectKey,undefined,true);
  const intent=await readAudioIntent(actor,operationId);
  if(!intent||intent.actor!==actor||intent.request.target.projectKey!==projectKey)throw unavailable();
  const billing=await readSynchronousReceipt(actor,operationId,`audio.${intent.kind}`);
  if(!billing)throw unavailable();return {intent,billing};
}
export async function getAudioOperation(actorRaw:string,projectKey:string,operationId:string){
  const actor=actorRaw.toLowerCase(),{intent,billing}=await requireAudioIntent(actor,projectKey,operationId),body=billing.body as {audioReceipt?:unknown;audioCheckpoint?:unknown}|null,parsed=audioReceiptSchema.safeParse(body?.audioReceipt);
  if(!parsed.success)return {operationId,kind:intent.kind,target:intent.request.target,state:billing.state,chargedCredits:billing.chargedCredits,status:billing.outcome==="failed"?"failed":"needs_attention",checkpointAvailable:audioCheckpointSchema.safeParse(body?.audioCheckpoint).success};
  const receipt=parsed.data;
  if(receipt.operationId!==operationId||receipt.target.projectKey!==projectKey)throw unavailable();
  const object=await readManagedObject(`/media/${receipt.key}`,104857600);if(sha(object.bytes)!==receipt.sha256)throw new ModelConfigError("AUDIO_RESULT_CHANGED","原声音结果字节已改变，请核查原操作",409);
  return {operationId,kind:intent.kind,target:intent.request.target,state:billing.state,chargedCredits:billing.chargedCredits,receipt,
    ...(receipt.kind==="speech"?{url:`/media/${receipt.key}`}:{transcription:JSON.parse(Buffer.from(object.bytes).toString("utf8"))})};
}
export async function recoverAudioOperation(actorRaw:string,projectKey:string,operationId:string){
  const actor=actorRaw.toLowerCase(),{intent,billing}=await requireAudioIntent(actor,projectKey,operationId),body=billing.body as {audioReceipt?:unknown;audioCheckpoint?:unknown}|null;
  const final=audioReceiptSchema.safeParse(body?.audioReceipt);
  if(final.success){
    if(billing.state!=="settled")await completeAudioCheckpoint(actor,{operationId,feature:`audio.${intent.kind}`,requestHash:intent.requestHash,checkpoint:body,body:body as Record<string,unknown>});
    return getAudioOperation(actor,projectKey,operationId);
  }
  const parsed=audioCheckpointSchema.safeParse(body?.audioCheckpoint);
  if(!parsed.success)throw new ModelConfigError("OPERATION_PENDING","原声音受理结果待核对，不会重新调用供应商",409);
  const checkpoint=parsed.data;
  if(checkpoint.operationId!==operationId||checkpoint.kind!==intent.kind||checkpoint.target.projectKey!==projectKey)throw unavailable();
  const object=await readManagedObject(`/media/${checkpoint.key}`,104857600),bytes=object.bytes;
  if(sha(bytes)!==checkpoint.sha256||bytes.byteLength!==checkpoint.bytes)throw new ModelConfigError("AUDIO_RESULT_CHANGED","原声音检查点字节已改变",409);
  const common={version:1 as const,operationId,target:intent.request.target,modelId:intent.execution.publicModelId,modelVersion:intent.execution.modelVersion,billingVersion:intent.execution.billingVersion,createdAt:intent.createdAt};
  if(intent.kind==="transcribe"){
    const report=JSON.parse(Buffer.from(bytes).toString("utf8"));
    if(!intent.source||report.inputSha256!==intent.source.sha256||typeof report.text!=="string"||!["untimed","supplier-timestamps"].includes(report.timing))throw new ModelConfigError("AUDIO_RESULT_INVALID","原转写检查点无效",409);
    const receipt=audioReceiptSchema.parse({...common,kind:"transcribe",key:checkpoint.key,sha256:checkpoint.sha256,sourceArtworkId:intent.source.artworkId,sourceSha256:intent.source.sha256,timing:report.timing});
    await completeAudioCheckpoint(actor,{operationId,feature:"audio.transcribe",requestHash:intent.requestHash,checkpoint:body,body:{audioReceipt:receipt}});
  }else{
    const probe=await probeMedia(bytes,mediaExtension(checkpoint.mimeType));
    if(!probe.audioCodecs.length||probe.videoCodec||probe.durationSeconds<=0||inspectedMediaMime(probe,"audio",checkpoint.mimeType)!==checkpoint.mimeType)throw new ModelConfigError("AUDIO_RESULT_INVALID","原配音未通过完整音频解码",409);
    await assertOwnedMediaVersion(checkpoint.key,actor,checkpoint.sha256);
    await ensureMediaInspectionSchema();
    const artworkId=`speech-${sha(`${actor}:${operationId}`).slice(0,40)}`,input=speechOperationSchema.parse(intent.request);
    const receipt=audioReceiptSchema.parse({...common,kind:"speech",key:checkpoint.key,sha256:checkpoint.sha256,artworkId,mimeType:checkpoint.mimeType,durationSeconds:probe.durationSeconds,textSha256:sha(intent.line.text),voice:input.voice});
    await completeAudioCheckpoint(actor,{operationId,feature:"audio.speech",requestHash:intent.requestHash,checkpoint:body,body:{audioReceipt:receipt,artworkId}},async tx=>{
      await assertCreationProjectInput(actor,projectKey,tx,true);
      await registerPrivateMediaTx(tx,{key:checkpoint.key,owner:actor,driver:storageDriver,remoteReady:checkpoint.remoteReady,contentType:checkpoint.mimeType,sha256:checkpoint.sha256,bytes:checkpoint.bytes});
      await addArtworksTx(tx,actor,[{id:artworkId,title:intent.line.speaker?`${intent.line.speaker} · 配音`:"对白配音",category:"audio",prompt:intent.line.text,status:"completed",image:"",videoUrl:`/media/${checkpoint.key}`,gradient:"from-slate-100 to-zinc-100",groupId:projectKey.startsWith("tree:")?projectKey.slice(5):artworkId,batchId:projectKey.startsWith("batch:")?projectKey.slice(6):undefined,source:"canvas",origin:"canvas"}],undefined,"preserve");
      await recordMediaProbeTx(tx,checkpoint.key,checkpoint.sha256,probe);
    });
  }
  return getAudioOperation(actor,projectKey,operationId);
}
export function audioOperationFailure(error:unknown){
  if(error instanceof BillingError)return {error:error.message,code:error.code,status:error.status};
  if(error instanceof TeamError)return {error:error.message,code:"AUDIO_SCOPE_DENIED",status:error.status};
  if(error instanceof ZodError)return {error:"声音参数无效",code:"AUDIO_REQUEST_INVALID",status:422};
  if(error instanceof AudioExecutionError){if(error.acceptance!=="unknown")markBillingUpstream("rejected");return {error:error.message,code:error.code,status:error.status};}
  return {error:error instanceof ModelConfigError?error.message:"声音结果尚待恢复，请保留原操作编号",code:error instanceof ModelConfigError?error.code:"AUDIO_OPERATION_PENDING",status:error instanceof ModelConfigError?error.status:502};
}
