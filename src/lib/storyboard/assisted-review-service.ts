import "server-only";
import {createHash} from "node:crypto";
import {authorizeCanvasProject} from "../canvas/project-access";
import {assertCreationProjectInput} from "../saas/creation-access";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {readStoryboardRevision} from "./repository";
import {assertStoryboardTake} from "./service";
import {getVideoTask} from "../video/task-repository";
import {publicVideoTaskSnapshot} from "../video/task-snapshot";
import {readMediaJobEvidence,createMediaJob} from "../video/media-jobs";
import {readSynchronousReceipt} from "../billing/receipt-reader";
import {recordReviewFrameRequest} from "./assisted-review-repository";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/snapshot-value";
import {readManagedObject} from "../object-storage/managed-read";
import {toVisionDataUrl} from "../vision-image";
import {reviewTargetSchema,reviewFramesSchema,reviewFrameRecipe,assistedReviewRequestSchema,assistedReviewReportSchema,type ReviewTarget} from "./assisted-review";

export async function requireReviewTarget(actor:string,input:ReviewTarget){
  await authorizeCanvasProject(actor,input.projectKey);await assertCreationProjectInput(actor,input.projectKey,undefined,true);
  const plan=await readStoryboardRevision(actor,input.planId,input.revision),shot=plan?.document.shots.find(shot=>shot.nodeId===input.nodeId);
  if(!plan||plan.projectKey!==input.projectKey||!shot)throw new ModelConfigError("STORYBOARD_REVIEW_UNAVAILABLE","原方案版本或镜头不存在",404);
  await assertStoryboardTake(actor,input.projectKey,input.nodeId,input);
  const [material]=await requireTimelineMaterials(actor,[input.artworkId]);
  if(material.kind!=="video"||!material.durationSeconds)throw new ModelConfigError("STORYBOARD_REVIEW_UNAVAILABLE","候选没有有效视频流",422);
  const task=await getVideoTask(actor,input.taskId);
  const intent=task?publicVideoTaskSnapshot(task).originalPrompt:"";
  return {plan,shot,material,intent};
}
export async function prepareReviewFrames(actor:string,raw:unknown){
  const input=reviewFramesSchema.parse(raw),{material}=await requireReviewTarget(actor,input);
  if(input.samples.some(time=>time>=material.durationSeconds!))throw new ModelConfigError("STORYBOARD_REVIEW_RANGE_INVALID","抽帧时间超出原片实际时长",422);
  const job=await createMediaJob(actor,reviewFrameRecipe(input),undefined,[{artworkId:input.artworkId,sha256:material.sha256}]);
  await recordReviewFrameRequest(actor,input,job.id);return job;
}
export async function reviewEvidence(actor:string,raw:unknown){
  const input=assistedReviewRequestSchema.parse(raw),target=await requireReviewTarget(actor,input);
  if(input.samples.some(time=>time>=target.material.durationSeconds!))throw new ModelConfigError("STORYBOARD_REVIEW_RANGE_INVALID","抽帧时间超出原片实际时长",422);
  const evidence=await readMediaJobEvidence(actor,input.frameJobId),expected=reviewFrameRecipe({...input,operationId:evidence.operationId});
  const {billingConfirmation:_confirmation,...recipe}=evidence.request;
  if(canonicalConfig(recipe)!==canonicalConfig(expected)||evidence.inputs.length!==1||evidence.inputs[0].artworkId!==input.artworkId||evidence.inputs[0].sha256!==target.material.sha256||evidence.outputs.length!==input.samples.length)
    throw new ModelConfigError("STORYBOARD_REVIEW_EVIDENCE_INVALID","抽帧任务与原候选或时间不一致",422);
  const frames=[],images=[];
  for(let index=0;index<input.samples.length;index++){
    const output=evidence.outputs.find(output=>output.name===`review-${index}.png`);
    if(!output||output.mimeType!=="image/png")throw new ModelConfigError("STORYBOARD_REVIEW_EVIDENCE_INVALID","抽帧输出格式无效",422);
    const [frame]=await requireTimelineMaterials(actor,[output.artworkId]);
    if(frame.sha256!==output.sha256)throw new ModelConfigError("STORYBOARD_REVIEW_EVIDENCE_INVALID","抽帧素材已改变",409);
    const object=await readManagedObject(frame.url,12*1024*1024);
    if(createHash("sha256").update(object.bytes).digest("hex")!==output.sha256)throw new ModelConfigError("STORYBOARD_REVIEW_EVIDENCE_INVALID","抽帧字节校验失败",409);
    images.push(await toVisionDataUrl(object.bytes,"image/png"));frames.push({index,timestamp:input.samples[index],artworkId:output.artworkId,sha256:output.sha256,url:frame.url});
  }
  return {...target,input,frames,images};
}
export async function getAssistedReview(actor:string,target:ReviewTarget,operationId:string){
  reviewTargetSchema.parse(target);const {material}=await requireReviewTarget(actor,target);
  const receipt=await readSynchronousReceipt(actor,operationId,"canvas.text-generate");
  const body=receipt?.body as {review?:unknown}|null;
  const parsed=assistedReviewReportSchema.safeParse(body?.review);
  if(receipt?.state!=="settled"||!parsed.success||parsed.data.operationId!==operationId||canonicalConfig(parsed.data.source)!==canonicalConfig(target)||parsed.data.sourceSha256!==material.sha256)
    throw new ModelConfigError("STORYBOARD_REVIEW_RECEIPT_UNAVAILABLE","此候选没有该辅助检查回执",404);
  return {review:parsed.data,chargedCredits:receipt.chargedCredits};
}
