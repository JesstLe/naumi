import "server-only";
import {createHash} from "node:crypto";
import {storyboardDialogueRequestSchema,appendStoryboardDialogue} from "./dialogue";
import {requireStoryboardPlan} from "./service";
import {readRoughcutIntent,reserveRoughcutIntent,recordRoughcut,roughcutLinks} from "./production-repository";
import {getTimelineNode,saveTimelineNode} from "../canvas/timeline-node-service";
import {getCanvasTextNode} from "../canvas/text-node-repository";
import {canvasTextContent} from "../canvas/text-content";
import {authorizeCanvasProject} from "../canvas/project-access";
import {bindActualCreationProject,assertCreationProjectInput} from "../saas/creation-access";
import {ModelConfigError} from "../model-config/types";

export async function applyStoryboardDialogue(actorRaw:string,raw:unknown){
 const actor=actorRaw.toLowerCase(),input=storyboardDialogueRequestSchema.parse(raw),request={kind:"dialogue",...input};
 await authorizeCanvasProject(actor,input.projectKey);await bindActualCreationProject(actor,input.projectKey);await assertCreationProjectInput(actor,input.projectKey,undefined,true);
 let intent=await readRoughcutIntent(actor,input.operationId,request);
 if(!intent){
  const plan=await requireStoryboardPlan(actor,{id:input.planId,revision:input.revision},input.projectKey),node=await getTimelineNode(actor,input.timelineId),link=(await roughcutLinks(actor,plan.id)).find(link=>link.timelineId===input.timelineId);
  if(!node||node.projectKey!==input.projectKey||node.revision!==input.timelineRevision||!link)throw new ModelConfigError("STORYBOARD_CUT_CHANGED","粗剪已改变或不属于此方案",409);
  const texts=new Map<string,string>();
  for(const shot of plan.document.shots)for(const source of [...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])])if(source.mapping.dialogue.length){
   const textNode=await getCanvasTextNode(actor,source.nodeId,input.projectKey),text=textNode?canvasTextContent(textNode):"";
   if(!textNode||createHash("sha256").update(text).digest("hex")!==source.sha256)throw new ModelConfigError("STORYBOARD_SOURCE_CHANGED","对白原稿已修改，先核对方案原文后再导入",409);texts.set(source.nodeId,text);
  }
  const project=appendStoryboardDialogue(node.timeline,plan.document,texts,key=>`line-${createHash("sha256").update(`${plan.id}:${key}`).digest("hex").slice(0,32)}`);
  intent=await reserveRoughcutIntent(actor,input.operationId,request,{projectKey:input.projectKey,planId:plan.id,write:{id:node.id,projectKey:node.projectKey,expectedRevision:node.revision,operationId:input.operationId,timeline:project},clips:link.clips,changes:[]});
 }
 const node=await saveTimelineNode(actor,intent.write),link=await recordRoughcut(actor,intent,node);return {node,link};
}
