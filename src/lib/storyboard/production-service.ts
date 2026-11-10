import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {getVideoNode} from "../canvas/video-node-service";
import {getCanvasTextNode} from "../canvas/text-node-repository";
import {canvasTextContent} from "../canvas/text-content";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {getTimelineNode,saveTimelineNode} from "../canvas/timeline-node-service";
import type {TimelineMaterial} from "../canvas/timeline-node-schema";
import {prepareCanvasVideoWorkflow} from "../video/canvas-workflow";
import {mediaBillingQuote} from "../video/media-billing";
import {requireStoryboardPlan,assertStoryboardTake} from "./service";
import {continuityCatalog} from "./continuity-service";
import {inspectContinuity} from "./continuity";
import {createRoughcut,replaceRoughcutTakes,spokenDuration,type ProductionInspection} from "./production";
import {readRoughcutIntent,reserveRoughcutIntent,recordRoughcut,roughcutLinks} from "./production-repository";
import {authorizeCanvasProject} from "../canvas/project-access";
import {assertCreationProjectInput,bindActualCreationProject} from "../saas/creation-access";
import {ModelConfigError} from "../model-config/types";

export {productionSelectionSchema,roughcutRequestSchema} from "./production-schema";
import {productionSelectionSchema,roughcutRequestSchema} from "./production-schema";

export async function inspectStoryboardProduction(actor:string,raw:unknown):Promise<ProductionInspection>{
  const input=productionSelectionSchema.parse(raw),plan=await requireStoryboardPlan(actor,{id:input.planId,revision:input.revision},input.projectKey),catalog=await continuityCatalog(actor,input.projectKey);
  if(input.nodes.some(node=>!plan.document.shots.some(shot=>shot.nodeId===node.id)))throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","所选镜头不属于此方案",422);
  const warnings:string[]=[],materials=new Map<string,TimelineMaterial>(),dependencies:Record<string,string[]>={};
  const material=async(id:string|undefined|null)=>{if(!id)return null;if(materials.has(id))return materials.get(id)!;try{const result=(await requireTimelineMaterials(actor,[id]))[0];materials.set(id,result);return result;}catch{warnings.push("部分参考或采用素材不可用，请在对应镜头核对");return null;}};
  const nodes=await Promise.all(plan.document.shots.map(shot=>getVideoNode(actor,shot.nodeId)));
  const shots:ProductionInspection["shots"]=[];
  for(const [index,shot] of plan.document.shots.entries()){
    const node=nodes[index];if(!node||node.projectKey!==input.projectKey)throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","方案镜头已移除",409);
    dependencies[node.id]=node.inputs.filter(value=>value.kind==="video").map(value=>value.nodeId.replace(/^video:/,""));
    const adopted=shot.adoptedArtworkId?await material(shot.adoptedArtworkId):null,referenceId=shot.continuity?.bindings.flatMap(binding=>binding.artworkIds)[0]||node.inputs.find(value=>value.kind==="image")?.nodeId.replace(/^image:/,"");
    const preview=adopted||await material(referenceId),inPoint=shot.cut?.inPoint||0,plannedDuration=node.config.durationSeconds&&node.config.durationSeconds>0?node.config.durationSeconds:null,duration=shot.cut?.duration??(adopted?.durationSeconds?adopted.durationSeconds-inPoint:plannedDuration??4);
    if(adopted?.durationSeconds&&inPoint+duration>adopted.durationSeconds+1e-6)warnings.push(`镜头 ${shot.number} 的剪辑长度超过采用素材`);
    let dialogueSeconds:number|null=0;
    for(const source of [...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])])if(source.mapping.dialogue.length){const original=await getCanvasTextNode(actor,source.nodeId,input.projectKey),text=original?canvasTextContent(original):"";if(!original||createHash("sha256").update(text).digest("hex")!==source.sha256){dialogueSeconds=null;break;}dialogueSeconds+=spokenDuration(source.mapping.dialogue.map(line=>text.slice(line.start,line.end)).join(" "));}
    if(dialogueSeconds&&dialogueSeconds>duration)warnings.push(`镜头 ${shot.number} 台词约需 ${dialogueSeconds} 秒，长于计划画面`);
    if(!plannedDuration&&!adopted&&!shot.cut?.duration)warnings.push(`镜头 ${shot.number} 时长未知，预演暂按4秒显示`);
    shots.push({nodeId:node.id,number:shot.number,title:node.title,prompt:node.config.prompt||"",duration:Math.max(.1,duration),plannedDuration,inPoint,media:preview&&preview.kind!=="audio"?{url:preview.url,kind:preview.kind,artworkId:preview.artworkId,durationSeconds:preview.durationSeconds,hasAudio:preview.hasAudio}:null,dialogueSeconds});
  }
  const audio:ProductionInspection["audio"]=[];
  for(const track of plan.document.audio||[]){const media=await material(track.artworkId);if(!media?.hasAudio||!media.durationSeconds||track.inPoint+track.duration>media.durationSeconds){warnings.push("配乐来源或裁剪不可用");continue;}audio.push({...track,url:media.url,sourceDuration:media.durationSeconds});}
  const quote:ProductionInspection["quote"]={newShots:input.nodes.filter(node=>!node.reuseCompleted).length,reusedShots:input.nodes.filter(node=>node.reuseCompleted).length,generationCredits:null,assemblyCredits:null,upperBound:false,assemblyUpperBound:false,byocShots:0};
  try{
    const prepared=await prepareCanvasVideoWorkflow(actor,{id:randomUUID(),projectKey:input.projectKey,storyboard:{id:plan.id,revision:plan.revision},nodes:input.nodes.map(selected=>{const node=nodes.find(node=>node?.id===selected.id)!;return {...selected,revision:node.revision};})});
    quote.generationCredits=Object.values(prepared.frozen).reduce((sum,stage)=>sum+(stage.quote.authorization?stage.quote.authorizedCredits:stage.quote.credits),0);quote.upperBound=Object.values(prepared.frozen).some(stage=>!!stage.quote.authorization);quote.byocShots=Object.values(prepared.frozen).filter(stage=>!!stage.byoc).length;
  }catch(error){quote.error=error instanceof ModelConfigError?error.message:"本轮生成报价暂不可用";}
  if(input.nodes.length>1)try{const value=await mediaBillingQuote(actor,"concat");quote.assemblyCredits=value.tariff.pricing.mode==="api-cost-plus"?value.authorizedCredits:value.requestedCredits;quote.assemblyUpperBound=value.tariff.pricing.mode==="api-cost-plus";}catch{warnings.push("后续合成报价暂不可用");}
  const roughcuts=[];for(const link of await roughcutLinks(actor,plan.id)){const node=await getTimelineNode(actor,link.timelineId);if(node&&node.projectKey===input.projectKey&&!node.deletedAt)roughcuts.push({...link,revision:node.revision,title:node.title});}
  return {shots,audio,catalog,issues:inspectContinuity(plan.document,catalog,dependencies),warnings:[...new Set(warnings)],roughcuts,quote};
}

export async function applyStoryboardRoughcut(actor:string,raw:unknown){
  const input=roughcutRequestSchema.parse(raw);
  await authorizeCanvasProject(actor,input.projectKey);await bindActualCreationProject(actor,input.projectKey);await assertCreationProjectInput(actor,input.projectKey,undefined,true);
  let intent=await readRoughcutIntent(actor,input.operationId,input);
  if(!intent){
    const plan=await requireStoryboardPlan(actor,{id:input.planId,revision:input.revision},input.projectKey),selected=plan.document.shots.filter(shot=>input.nodeIds.includes(shot.nodeId));
    if(selected.length!==input.nodeIds.length)throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","所选镜头不属于此方案",422);
    for(const shot of selected){const take=shot.takes.find(take=>take.artworkId===shot.adoptedArtworkId);if(!take)throw new ModelConfigError("STORYBOARD_TAKE_REQUIRED","请先采用所选镜头的候选版本",422);await assertStoryboardTake(actor,input.projectKey,shot.nodeId,take);}
    const materials=await requireTimelineMaterials(actor,[...selected.map(shot=>shot.adoptedArtworkId!),...(input.mode==="create"?plan.document.audio?.map(audio=>audio.artworkId)||[]:[])]);
    try{
      if(input.mode==="create"){
        const built=createRoughcut(plan.document,materials,nodeId=>`shot-${createHash("sha256").update(`${plan.id}:${nodeId}`).digest("hex").slice(0,32)}`,input.nodeIds);
        const nodes=await Promise.all(selected.map(shot=>getVideoNode(actor,shot.nodeId))),x=Math.max(0,...nodes.map(node=>node?node.x+node.width:0))+96,y=Math.min(0,...nodes.map(node=>node?.y||0));
        intent={projectKey:input.projectKey,planId:plan.id,write:{id:`roughcut-${input.operationId}`,projectKey:input.projectKey,expectedRevision:0,operationId:input.operationId,title:`${plan.document.title.slice(0,190)} · 粗剪`,x,y,width:640,height:300,timeline:built.project},clips:built.clips,changes:[]};
      }else{
        const node=await getTimelineNode(actor,input.timelineId!),link=(await roughcutLinks(actor,plan.id)).find(link=>link.timelineId===input.timelineId);
        if(!node||node.projectKey!==input.projectKey||!link||node.revision!==input.timelineRevision)throw new ModelConfigError("STORYBOARD_CUT_CHANGED","粗剪已改变，请重新读取后更新",409);
        const built=replaceRoughcutTakes(node.timeline,link,plan.document,materials,input.nodeIds);
        intent={projectKey:input.projectKey,planId:plan.id,write:{id:node.id,projectKey:node.projectKey,expectedRevision:node.revision,operationId:input.operationId,timeline:built.project},clips:built.clips,changes:built.changes,unchanged:built.changes.length===0};
      }
    }catch(error){if(error instanceof ModelConfigError)throw error;throw new ModelConfigError("STORYBOARD_CUT_INVALID",error instanceof Error?error.message:"粗剪参数无效",422);}
    intent=await reserveRoughcutIntent(actor,input.operationId,input,intent);
  }
  if(intent.unchanged){
    const node=await getTimelineNode(actor,intent.write.id),link=(await roughcutLinks(actor,intent.planId)).find(link=>link.timelineId===intent!.write.id);
    if(!node||node.projectKey!==intent.projectKey||!link)throw new ModelConfigError("STORYBOARD_CUT_CHANGED","原粗剪已不可用",409);
    return {node,link,changes:[]};
  }
  const node=await saveTimelineNode(actor,intent.write),link=await recordRoughcut(actor,intent,node);
  return {node,link,changes:intent.changes};
}
