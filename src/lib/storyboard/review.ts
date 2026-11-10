import {z} from "zod";
import {videoNodeIdSchema} from "../canvas/video-node-id";
import type {StoryboardShot} from "./plan";

export const REVIEW_ISSUES=["continuity","performance","camera","visual","audio","dialogue","other"] as const;
export const reviewAnnotationSchema=z.strictObject({
  id:z.uuid(),start:z.number().finite().min(0).max(86400),end:z.number().finite().min(0).max(86400).optional(),
  issue:z.enum(REVIEW_ISSUES),note:z.string().trim().min(1).max(4000),
}).superRefine((value,ctx)=>{if(value.end!==undefined&&value.end<=value.start)ctx.addIssue({code:"custom",path:["end"],message:"批注结束须晚于开始"});});
export type ReviewAnnotation=z.infer<typeof reviewAnnotationSchema>;
export const reviewRemakeSchema=z.strictObject({
  nodeId:videoNodeIdSchema,taskId:videoNodeIdSchema,artworkId:videoNodeIdSchema,
  annotationIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,"批注不能重复"),
  instructions:z.string().trim().min(1).max(4000),
});
export type ReviewRemake=z.infer<typeof reviewRemakeSchema>;
export const storyboardContextSchema=z.strictObject({id:z.uuid(),revision:z.number().int().positive(),review:reviewRemakeSchema.optional()});
export type StoryboardContext=z.infer<typeof storyboardContextSchema>;
export const reviewOriginSchema=z.strictObject({
  planId:z.uuid(),revision:z.number().int().positive(),nodeId:videoNodeIdSchema,taskId:videoNodeIdSchema,artworkId:videoNodeIdSchema,
  annotations:z.array(reviewAnnotationSchema).min(1).max(100),instructions:z.string().trim().min(1).max(4000),
});
export type ReviewOrigin=z.infer<typeof reviewOriginSchema>;

/** Selection is explicit, exact and frozen at the saved editorial revision. */
export function freezeReviewOrigin(context:StoryboardContext,shots:readonly StoryboardShot[]):ReviewOrigin|undefined{
  const selection=context.review;if(!selection)return;
  const shot=shots.find(shot=>shot.nodeId===selection.nodeId),take=shot?.takes.find(take=>take.taskId===selection.taskId&&take.artworkId===selection.artworkId);
  const annotations=selection.annotationIds.map(id=>take?.annotations?.find(annotation=>annotation.id===id));
  if(!take||annotations.some(value=>!value))throw new Error("返工批注或原候选已改变，请重新读取方案");
  return reviewOriginSchema.parse({planId:context.id,revision:context.revision,nodeId:selection.nodeId,taskId:selection.taskId,artworkId:selection.artworkId,annotations:structuredClone(annotations),instructions:selection.instructions});
}
export function assertReviewBounds(annotations:readonly ReviewAnnotation[],duration:number|null|undefined){
  if(!annotations.length)return;
  if(!duration||!Number.isFinite(duration)||duration<=0)throw new Error("原片实际时长尚未核实，请刷新候选后再标注");
  if(annotations.some(value=>value.start>=duration||value.end!==undefined&&value.end>duration+1e-6))throw new Error("批注超出原片实际时长");
}
export function reviewRemakePrompt(prompt:string,origin:ReviewOrigin){
  return `${prompt}\n\n[审片返工 / Review remake]\n原片 ${origin.artworkId}（任务 ${origin.taskId}）\n${origin.annotations.map(value=>`${value.start}${value.end===undefined?"":`–${value.end}`}s · ${value.issue}: ${value.note}`).join("\n")}\n修改范围：${origin.instructions}\n仅生成此镜的新候选；保留原稿与其余内容，不自动替换采用版。`;
}
