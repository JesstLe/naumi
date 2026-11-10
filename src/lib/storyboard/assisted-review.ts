import {z} from "zod";
import {videoNodeIdSchema} from "../canvas/video-node-id";
import {videoProjectKeySchema} from "../canvas/project-key";
import {mediaJobRequestSchema} from "../video/media-job-schema";

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewTargetSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),nodeId:videoNodeIdSchema,taskId:videoNodeIdSchema,artworkId:videoNodeIdSchema});
export type ReviewTarget=z.infer<typeof reviewTargetSchema>;
export function reviewSource(value:ReviewTarget):ReviewTarget{return {projectKey:value.projectKey,planId:value.planId,revision:value.revision,nodeId:value.nodeId,taskId:value.taskId,artworkId:value.artworkId};}
export const reviewSamplesSchema=z.array(z.number().finite().nonnegative()).min(1).max(5).refine(values=>values.every((value,index)=>index===0||value>values[index-1]),"抽帧时间须递增且不能重复");
export const reviewFramesSchema=reviewTargetSchema.extend({operationId:z.uuid(),samples:reviewSamplesSchema});
export const assistedReviewRequestSchema=reviewTargetSchema.extend({operationId:z.uuid(),frameJobId:z.uuid(),samples:reviewSamplesSchema});
export const assistedReviewRefSchema=z.strictObject({operationId:z.uuid(),source:reviewTargetSchema});
export const assistedFindingSchema=z.strictObject({
  frameIndexes:z.array(z.number().int().min(0).max(4)).min(1).max(5).refine(values=>new Set(values).size===values.length),
  issue:z.enum(["continuity","performance","camera","visual","other"]),
  observation:z.string().trim().min(1).max(1200),uncertainty:z.string().trim().min(1).max(600),suggestion:z.string().trim().min(1).max(1200),
});
export const assistedModelResultSchema=z.strictObject({summary:z.string().trim().min(1).max(1200),findings:z.array(assistedFindingSchema).max(20),limitations:z.array(z.string().trim().min(1).max(600)).min(1).max(10)});
export const assistedReviewReportSchema=z.strictObject({
  operationId:z.uuid(),source:reviewTargetSchema,frameJobId:z.uuid(),sourceSha256:hash,
  frames:z.array(z.strictObject({index:z.number().int().nonnegative(),timestamp:z.number().finite().nonnegative(),artworkId:videoNodeIdSchema,sha256:hash,url:z.string().startsWith("/media/").max(2000)})).min(1).max(5),
  modelId:z.string().min(1).max(200),createdAt:z.iso.datetime(),coverage:z.literal("sampled-frames-only"),speech:z.literal("not-checked"),
  result:assistedModelResultSchema,
});
export type AssistedReviewReport=z.infer<typeof assistedReviewReportSchema>;

/** One normal, auditable media job. Output seeking is scoped to each PNG. */
export function reviewFrameRecipe(input:{operationId:string;projectKey:string;artworkId:string;samples:number[]}){
  reviewSamplesSchema.parse(input.samples);
  return mediaJobRequestSchema.parse({operationId:input.operationId,projectKey:input.projectKey,source:"canvas",action:"ffmpeg",inputs:[input.artworkId],outputs:input.samples.map((_,index)=>`review-${index}.png`),
    args:["-i","asset:0",...input.samples.flatMap((time,index)=>["-ss",String(time),"-map","0:v:0","-frames:v","1","-update","1",`output:${index}`])]});
}
export function parseAssistedResult(raw:string,samples:readonly number[]){
  const result=assistedModelResultSchema.parse(JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"")));
  if(result.findings.some(finding=>finding.frameIndexes.some(index=>index>=samples.length)))throw new Error("辅助检查引用了不存在的抽帧证据");
  return result;
}
/** Times are derived from verified extraction receipts, never invented by a model. */
export function assistedFindingRange(report:AssistedReviewReport,index:number){
  const finding=report.result.findings[index];if(!finding)throw new Error("辅助意见不存在");
  const times=finding.frameIndexes.map(index=>report.frames[index]?.timestamp);if(times.some(time=>time===undefined))throw new Error("抽帧证据缺失");
  const start=Math.min(...times),end=Math.max(...times);return {start,...(end>start?{end}:{})};
}
