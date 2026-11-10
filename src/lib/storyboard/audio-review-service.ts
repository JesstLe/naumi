import "server-only";
import {createHash} from "node:crypto";
import {requireReviewTarget} from "./assisted-review-service";
import {audioReviewExtractSchema,audioReviewRequestSchema,audioReviewReportSchema,audioReviewResultSchema,audioReviewRecipe,compareAudioTranscript,reviewSource,audioReferenceSchema,type AudioReviewRequest} from "./audio-review";
import {recordAudioReview,readAudioReviewIntent} from "./audio-review-repository";
import {createMediaJob,readMediaJobEvidence} from "../video/media-jobs";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {getCanvasTextNode} from "../canvas/text-node-repository";
import {canvasTextContent} from "../canvas/text-content";
import {writeStoredObject} from "../object-storage/runtime";
import {readManagedObject} from "../object-storage/managed-read";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {currentModelExecution,currentModelBillingSnapshot} from "../model-config/context";
import {configuredToolCost,currentSynchronousBilling,checkpointSynchronousResult} from "../billing/synchronous-operation";
import {readSynchronousReceipt,completeAudioCheckpoint} from "../billing/receipt-reader";
import {executeTranscription} from "../audio/model-execution";
import type {ReviewTarget} from "./assisted-review";
const sha=(b:Uint8Array|string)=>createHash("sha256").update(b).digest("hex");
const invalid=(message:string)=>new ModelConfigError("AUDIO_REVIEW_EVIDENCE_INVALID",message,422);
export async function prepareAudioReview(actorRaw:string,raw:unknown){const actor=actorRaw.toLowerCase(),input=audioReviewExtractSchema.parse(raw),{material}=await requireReviewTarget(actor,input);if(!material.hasAudio)throw invalid("原候选没有有效声音，仍可人工审片");const job=await createMediaJob(actor,audioReviewRecipe({...input,durationSeconds:material.durationSeconds!}),undefined,[{artworkId:input.artworkId,sha256:material.sha256}]);await recordAudioReview(actor,input.operationId,"extract",reviewSource(input),job.id,{request:input,sourceSha256:material.sha256});return job;}
export async function audioReviewEvidence(actor:string,raw:unknown){
 const input=audioReviewRequestSchema.parse(raw),target=await requireReviewTarget(actor,input);if(!target.material.hasAudio)throw invalid("原候选没有有效声音");
 const evidence=await readMediaJobEvidence(actor,input.audioJobId),expected=audioReviewRecipe({...input,operationId:evidence.operationId,durationSeconds:target.material.durationSeconds!}),{billingConfirmation:_confirmation,...recipe}=evidence.request;
 if(canonicalConfig(recipe)!==canonicalConfig(expected)||evidence.inputs.length!==1||evidence.inputs[0].artworkId!==input.artworkId||evidence.inputs[0].sha256!==target.material.sha256||evidence.outputs.length!==1)throw invalid("声音提取回执与此原片不一致");
 const output=evidence.outputs[0];if(output.name!=="review-audio.wav"||output.mimeType!=="audio/wav")throw invalid("声音提取格式无效");const [audio]=await requireTimelineMaterials(actor,[output.artworkId]);if(audio.sha256!==output.sha256||!audio.hasAudio||!audio.durationSeconds||Math.abs(audio.durationSeconds-target.material.durationSeconds!)>.1)throw invalid("提取音频时长或来源不一致");
 const object=await readManagedObject(audio.url,104857600);if(sha(object.bytes)!==output.sha256)throw invalid("提取音频字节已改变");
 const references=[];for(const source of [...(target.shot.source?[target.shot.source]:[]),...(target.shot.additionalSources||[])])if(source.mapping.dialogue.length){const original=await getCanvasTextNode(actor,source.nodeId,input.projectKey),text=original?canvasTextContent(original):"";if(!original||sha(text)!==source.sha256)throw new ModelConfigError("STORYBOARD_SOURCE_CHANGED","参考台词原稿已改变，请先核对方案原文",409);for(const line of source.mapping.dialogue)references.push(audioReferenceSchema.parse({nodeId:source.nodeId,sha256:source.sha256,start:line.start,end:line.end,speaker:line.speaker,text:text.slice(line.start,line.end)}));}
 return {input,...target,audio,bytes:object.bytes,references};
}
export async function runAudioReview(actorRaw:string,raw:unknown,signal?:AbortSignal){
 const actor=actorRaw.toLowerCase(),e=await audioReviewEvidence(actor,raw),input=e.input,scope=currentModelExecution("audio"),billing=currentSynchronousBilling(),snapshot=currentModelBillingSnapshot();
 if(!scope||scope.frozen.binding!=="audio.transcribe"||scope.frozen.publicModelId!==input.modelId||!billing||billing.email!==actor||billing.id!==`tool-${input.operationId}`||billing.snapshot?.version!==scope.frozen.billingVersion||!snapshot?.config.features["audio.transcribe"].enabled)throw new ModelConfigError("AUDIO_REVIEW_CONTEXT_INVALID","语音检查通道或明确售价尚未核实",409);
 await configuredToolCost();if(billing.operation?.quote.tariff.pricing.mode==="usage"||billing.operation?.quote.modelVersion!==scope.frozen.modelVersion||billing.operation.quote.facts.modelId!==input.modelId)throw invalid("语音检查需要一致且明确的声音报价");
 await recordAudioReview(actor,input.operationId,"transcribe",reviewSource(input),input.audioJobId,{request:input,requestHash:billing.hash,sourceSha256:e.material.sha256});
 const result=await executeTranscription(scope,{bytes:Uint8Array.from(e.bytes),mimeType:"audio/wav",durationSeconds:e.audio.durationSeconds!,format:input.format,timestamps:input.timestamps,...(input.language?{language:input.language}:{})},{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)},signal);
 const report=audioReviewReportSchema.parse({operationId:input.operationId,source:reviewSource(input),sourceSha256:e.material.sha256,audioJobId:input.audioJobId,audio:{artworkId:e.audio.artworkId,sha256:e.audio.sha256,url:e.audio.url,durationSeconds:e.audio.durationSeconds},references:e.references,transcript:result.text,segments:result.segments||[],words:result.words||[],timing:result.timing,comparison:compareAudioTranscript(e.references,result.text),modelId:input.modelId,modelVersion:scope.frozen.modelVersion,billingVersion:scope.frozen.billingVersion,createdAt:new Date().toISOString(),limitations:["转写可能识别错误；文本一致也不是对白质量验收通过。","时间仅采用供应商实际返回的分句；未返回时不推测位置。","未检查发音、音质、声线、说话人身份、口型或画面表现。"]});
 const bytes=Buffer.from(JSON.stringify(report));if(bytes.byteLength>16777216)throw invalid("语音结果超过持久证据大小");const key=`audio-review-results/${sha(actor).slice(0,24)}/${input.operationId}.json`;await writeStoredObject(bytes,"application/json",key);
 const body={audioReviewResult:audioReviewResultSchema.parse({operationId:input.operationId,source:report.source,sourceSha256:report.sourceSha256,key,sha256:sha(bytes),bytes:bytes.byteLength})};await checkpointSynchronousResult(body);await completeAudioCheckpoint(actor,{operationId:input.operationId,feature:"audio.transcribe",requestHash:billing.hash,checkpoint:body,body});return body;
}
export async function getAudioReview(actorRaw:string,target:ReviewTarget,operationId:string,recover=false){
 const actor=actorRaw.toLowerCase(),{material}=await requireReviewTarget(actor,target),intent=await readAudioReviewIntent(actor,operationId),receipt=await readSynchronousReceipt(actor,operationId,"audio.transcribe");
 if(!intent||intent.stage!=="transcribe"||canonicalConfig(intent.source)!==canonicalConfig(target)||intent.intent.sourceSha256!==material.sha256||!receipt)throw new ModelConfigError("AUDIO_REVIEW_UNAVAILABLE","此候选没有该语音检查回执",404);
 const body=receipt.body as {audioReviewResult?:unknown}|null,parsed=audioReviewResultSchema.safeParse(body?.audioReviewResult);
 if(!parsed.success){if(recover)throw new ModelConfigError("OPERATION_PENDING","原语音检查没有完整结果检查点，不会重新调用模型",409);return {operationId,state:receipt.state,status:receipt.outcome==="failed"?"failed":"needs_attention",chargedCredits:receipt.chargedCredits};}
 const checkpoint=parsed.data,object=await readManagedObject(`/media/${checkpoint.key}`,16777216);if(object.bytes.byteLength!==checkpoint.bytes||sha(object.bytes)!==checkpoint.sha256)throw invalid("原语音检查结果字节已改变");const report=audioReviewReportSchema.parse(JSON.parse(Buffer.from(object.bytes).toString("utf8")));if(checkpoint.operationId!==operationId||canonicalConfig(checkpoint.source)!==canonicalConfig(target)||checkpoint.sourceSha256!==material.sha256)throw invalid("原语音检查点不匹配");if(report.operationId!==operationId||canonicalConfig(report.source)!==canonicalConfig(target)||report.sourceSha256!==material.sha256)throw invalid("原语音检查来源不一致");
 const [audio]=await requireTimelineMaterials(actor,[report.audio.artworkId]);if(audio.sha256!==report.audio.sha256||sha((await readManagedObject(audio.url,104857600)).bytes)!==report.audio.sha256)throw invalid("原语音检查音频证据已改变");
 if(recover&&receipt.state!=="settled"){await completeAudioCheckpoint(actor,{operationId,feature:"audio.transcribe",requestHash:intent.intent.requestHash!,checkpoint:body,body:body!});return getAudioReview(actor,target,operationId);}
 return {operationId,state:receipt.state,chargedCredits:receipt.chargedCredits,audioReview:report};
}
export async function requireSettledAudioReview(actor:string,target:ReviewTarget,operationId:string){const result=await getAudioReview(actor,target,operationId);if(result.state!=="settled"||!("audioReview"in result))throw new ModelConfigError("AUDIO_REVIEW_PENDING","语音检查结果或费用尚未核实",409);return audioReviewReportSchema.parse(result.audioReview);}
export type {AudioReviewRequest};
