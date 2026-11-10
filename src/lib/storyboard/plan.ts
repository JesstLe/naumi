import {z} from "zod";
import type {CanvasVideoNode} from "../canvas/video-node-schema";
import {videoNodeIdSchema} from "../canvas/video-node-schema";
import {videoProjectKeySchema} from "../canvas/project-key";
import {storyboardSourceSchema} from "./script-mapping";
import {continuitySchema,shotCutSchema,storyboardAudioSchema} from "./continuity";

export const storyboardTakeSchema=z.strictObject({
  artworkId:videoNodeIdSchema,taskId:videoNodeIdSchema,
  status:z.enum(["pending","changes","approved"]),note:z.string().max(4000),
});
export const storyboardShotSchema=z.strictObject({
  nodeId:videoNodeIdSchema,number:z.string().trim().min(1).max(40),
  scene:z.string().max(200).default(""),purpose:z.string().max(2000).default(""),
  source:storyboardSourceSchema.optional(),
  additionalSources:z.array(storyboardSourceSchema).max(100).optional(),
  continuity:continuitySchema.optional(),cut:shotCutSchema.optional(),
  takes:z.array(storyboardTakeSchema).max(200).default([]),
  adoptedArtworkId:videoNodeIdSchema.nullable().default(null),
}).superRefine((shot,ctx)=>{
  if(new Set(shot.takes.map(take=>take.artworkId)).size!==shot.takes.length)ctx.addIssue({code:"custom",message:"候选结果不能重复"});
  if(shot.adoptedArtworkId&&!shot.takes.some(take=>take.artworkId===shot.adoptedArtworkId))ctx.addIssue({code:"custom",message:"采用结果必须来自本镜候选"});
});
export const storyboardDocumentSchema=z.strictObject({
  title:z.string().trim().min(1).max(200),shots:z.array(storyboardShotSchema).max(100),
  assemble:z.boolean().default(true),
  audio:z.array(storyboardAudioSchema).max(100).optional(),
}).superRefine((plan,ctx)=>{
  if(new Set(plan.shots.map(shot=>shot.nodeId)).size!==plan.shots.length)ctx.addIssue({code:"custom",message:"方案镜头不能重复"});
  if(new Set(plan.shots.map(shot=>shot.number)).size!==plan.shots.length)ctx.addIssue({code:"custom",message:"镜号不能重复"});
});
export const storyboardWriteSchema=z.strictObject({
  id:z.uuid(),projectKey:videoProjectKeySchema,expectedRevision:z.number().int().nonnegative(),operationId:z.uuid(),document:storyboardDocumentSchema,
});
export type StoryboardDocument=z.infer<typeof storyboardDocumentSchema>;
export type StoryboardShot=z.infer<typeof storyboardShotSchema>;
export type StoryboardTake=z.infer<typeof storyboardTakeSchema>;
export type StoryboardWrite=z.infer<typeof storyboardWriteSchema>;
export type StoryboardLineage={sourcePlanId:string;sourceRevision:number;operationId:string;sourceNodes?:Array<{id:string;revision:number}>};
export type StoryboardPlan={id:string;projectKey:string;revision:number;document:StoryboardDocument;lineage?:StoryboardLineage;createdAt:string;updatedAt:string};

/** Schema-normalized key order prevents equivalent HTTP receipts from resaving forever. */
export function storyboardDocumentSignature(document:StoryboardDocument){
  const parsed=storyboardDocumentSchema.safeParse(document);return JSON.stringify(parsed.success?parsed.data:document);
}

/** Physical canvas position never defines editorial order. Existing selection order wins. */
export function newStoryboardDocument(nodes:readonly CanvasVideoNode[],ids:readonly string[]):StoryboardDocument{
  const selected=ids.length?ids:[...nodes].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).map(node=>node.id);
  return {title:"镜头方案",assemble:selected.length>1,shots:[...new Set(selected)].filter(id=>nodes.some(node=>node.id===id)).map((nodeId,index)=>({nodeId,number:String(index+1).padStart(2,"0"),scene:"",purpose:"",takes:[],adoptedArtworkId:null}))};
}
export function nextShotNumber(shots:readonly StoryboardShot[]){let number=1;const used=new Set(shots.map(shot=>shot.number));while(used.has(String(number).padStart(2,"0")))number++;return String(number).padStart(2,"0");}
export function reviewStoryboardTake(shot:StoryboardShot,take:StoryboardTake,adopt=false):StoryboardShot{
  const adoptedArtworkId=adopt?take.artworkId:shot.adoptedArtworkId;
  return {...shot,adoptedArtworkId,takes:[...shot.takes.filter(item=>item.artworkId!==take.artworkId),take]};
}

export function restructureStoryboardShots(document:StoryboardDocument,replacedIds:readonly string[],createdIds:readonly string[]):StoryboardDocument{
  const removed=document.shots.filter(shot=>replacedIds.includes(shot.nodeId)),index=document.shots.findIndex(shot=>shot.nodeId===replacedIds[0]);
  if(!removed.length||removed.length!==replacedIds.length||!createdIds.length)throw new Error("待修改镜头已改变");
  const remaining=document.shots.filter(shot=>!replacedIds.includes(shot.nodeId)),base=removed[0];
  const sources=new Map<string,NonNullable<StoryboardShot["source"]>>();
  for(const shot of removed)for(const source of [...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])]){
    const key=`${source.nodeId}:${source.sha256}`,prior=sources.get(key);
    const unique=<T,>(values:T[])=>[...new Map(values.map(value=>[JSON.stringify(value),value])).values()];
    sources.set(key,prior?{...prior,mapping:{ranges:unique([...prior.mapping.ranges,...source.mapping.ranges]),dialogue:unique([...prior.mapping.dialogue,...source.mapping.dialogue]),...((prior.mapping.supplement||source.mapping.supplement)?{supplement:[prior.mapping.supplement,source.mapping.supplement].filter(Boolean).join("\n")}:{})}}:structuredClone(source));
  }
  const replacements:StoryboardShot[]=createdIds.map((nodeId,i)=>{
    const all=[...sources.values()].map(source=>i?{...source,mapping:{...source.mapping,dialogue:[]}}:source);
    return {...base,nodeId,number:i?nextShotNumber([...remaining,base]):base.number,takes:[],adoptedArtworkId:null,source:all[0],additionalSources:all.length>1?all.slice(1):undefined};
  });
  return {...document,shots:[...remaining.slice(0,index),...replacements,...remaining.slice(index)]};
}
