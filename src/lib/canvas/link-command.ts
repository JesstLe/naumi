import {timelineInputIdentity} from "../timeline/project";
import {appendTimelineClip,removeTimelineClip} from "../timeline/edit";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {TimelineMaterial} from "./timeline-node-schema";
import {audioInputIdentity,newAudioProject,withAudioSource} from "../audio/project";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import {characterInputIdentity} from "../character/project";
import {sceneInputIdentity,sceneStateWithReferences,sceneDirectorSnapshot} from "../scene/project";
import {applySceneDirectorSnapshot} from "../scene/director";
import {parseVisualInputIdentity} from "./visual-input-identity";
import type {CanvasCharacterNode} from "./character-node-schema";
import type {Artwork} from "../mock-data";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasVideoNode} from "./video-node-schema";
import type {CanvasPendingNode} from "./scene-types";
import {browserRandomUUID} from "../browser-crypto";
import {type VideoInputChoice,type VideoCatalogModel} from "../video/client-settings";
import {explicitCanvasParent} from "./input-references";
import {canvasParentCycle} from "./parent-link";
import {textPatchOf,type CanvasTextNode,type CanvasHistoryAction} from "./history-model";

type Snapshot={project:string|null;artworks:Artwork[];texts:CanvasTextNode[];videos:CanvasVideoNode[];directors?:CanvasDirectorNode[];characters?:CanvasCharacterNode[];scenes?:CanvasSceneNode[];audios?:CanvasAudioNode[];timelines?:CanvasTimelineNode[];timelineMaterials?:TimelineMaterial[];pending:CanvasPendingNode[];
  selected:string[];choices:VideoInputChoice[];videoModels?:VideoCatalogModel[];locked:(id:string)=>boolean;
  productTitle:string;referenceLimit:string;cycleMessage:string;productMention:(content:string,title:string)=>string};
export type CanvasLinkIntent={source:string;target:string;add:boolean;edgeId?:string;product?:boolean};
/** Resolve only the canvas identity. Media ownership, duration and hashes must
 * still come from the timeline material inspection before compiling a clip. */
export function canvasLinkMediaSource(s:Snapshot,source:string){
  const audio=s.audios?.find(node=>node.id===source),timeline=s.timelines?.find(node=>node.id===source),video=s.videos.find(node=>node.id===source),scene=s.scenes?.find(node=>node.id===source),character=s.characters?.find(node=>node.id===source),director=s.directors?.find(node=>node.id===source);
  const state=scene?.scene.states.find(state=>state.id===scene.scene.defaultStateId),appearance=character?.character.appearances.find(item=>item.id===character.character.defaultAppearanceId);
  return audio?.audio.adopted?.artworkId||timeline?.adopted?.artworkId||video?.displayResultId||video?.lastResultId||state?.background?.artworkId||state?.referenceArtworkIds[0]||appearance?.referenceArtworkIds[0]||director?.outputs.at(-1)?.artworkId||source;
}
function reaches(s:Snapshot,source:string,target:string){
  const edges=[...s.artworks.flatMap(node=>[...new Set([...(node.parentIds||[]),...(node.parentId&&explicitCanvasParent(node,node.parentId)?[node.parentId]:[])])].map(parent=>({source:parent,target:node.id}))),
    ...s.texts.flatMap(node=>[...[...(node.sourceIds||[]),...(node.productIds||[])].map(id=>({source:id,target:node.id})),...(node.targetIds||[]).map(id=>({source:node.id,target:id}))]),
    ...s.videos.flatMap(node=>node.inputs.map(input=>({source:input.nodeId.replace(/^(?:text|image|video|audio|audio-node|timeline-node):/,""),target:node.id}))),
    ...s.pending.flatMap(node=>node.inputs.map(source=>({source,target:node.id})))];
  const seen=new Set<string>(),todo=[source];
  while(todo.length){const id=todo.pop()!;if(id===target)return true;if(seen.has(id))continue;seen.add(id);todo.push(...edges.filter(edge=>edge.source===id).map(edge=>edge.target));}
  return false;
}
/** Compile exactly one link gesture into the existing atomic history contract.
 * No React, network, independent text saves or optimistic document writes. */
export function compileCanvasLink(s:Snapshot,intent:CanvasLinkIntent):CanvasHistoryAction|null{
  const {target,add}=intent;let source=intent.source;
  if(s.locked(source)||s.locked(target))return null;
  const fromDirector=s.directors?.find(node=>node.id===source);if(fromDirector)source=fromDirector.outputs.at(-1)?.artworkId||"";
  if(!source||!target||source===target||source.startsWith("task-")||target.startsWith("task-")||s.locked(source)||s.locked(target))return null;
  const timeline=s.timelines?.find(node=>node.id===target);
  if(timeline){
    if(!add){let project=timeline.timeline;for(const track of project.tracks)for(const clip of track.clips)if((clip.canvasSourceId||clip.artworkId)===source)project=removeTimelineClip(project,clip.id);return JSON.stringify(project)===JSON.stringify(timeline.timeline)?null:{kind:"timeline-patch",id:timeline.id,from:{timeline:timeline.timeline},to:{timeline:project}};}
    const material=s.timelineMaterials?.find(item=>item.artworkId===canvasLinkMediaSource(s,intent.source));if(!material)throw new Error("请选择已完成且已检验的素材");
    const clipId=browserRandomUUID(),added=appendTimelineClip(timeline.timeline,material,{clipId,trackId:"",newTrackId:browserRandomUUID(),newTrackName:material.kind==="audio"?"音频":"画面"});
    if(intent.source!==material.artworkId)added.project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===clipId)!.canvasSourceId=intent.source;
    return {kind:"timeline-patch",id:timeline.id,from:{timeline:timeline.timeline},to:{timeline:added.project}};
  }
  const fromAudio=s.audios?.find(node=>node.id===source);
  if(fromAudio){if(!s.videos.some(node=>node.id===target))throw new Error("音频请连接到视频节点");if(add)source=audioInputIdentity(fromAudio.id);}
  const audio=s.audios?.find(node=>node.id===target);
  if(audio){if(audio.audio.sourceArtworkId===source&&add||audio.audio.sourceArtworkId!==source&&!add)return null;if(add&&!s.choices.some(choice=>choice.nodeId===source&&choice.kind==="audio"&&choice.available))throw new Error("请选择已完成的音频素材");return {kind:"audio-patch",id:audio.id,from:{audio:audio.audio},to:{audio:add?withAudioSource(source):newAudioProject()}};}
  const fromTimeline=s.timelines?.find(node=>node.id===source);
  if(fromTimeline){if(!s.videos.some(node=>node.id===target))throw new Error("多轨成片请连接到视频节点");if(add)source=timelineInputIdentity(fromTimeline.id);}
  const fromScene=s.scenes?.find(node=>node.id===source);
  if(fromScene){
    const director=s.directors?.find(node=>node.id===target);
    if(director){const project=add?applySceneDirectorSnapshot(director.project,sceneDirectorSnapshot(fromScene.id,fromScene.scene,fromScene.scene.defaultStateId,fromScene.revision)):{...director.project,panoramaArtworkId:null,sceneReference:null};return {kind:"director-patch",id:director.id,from:{project:director.project},to:{project}};}
    if(!s.videos.some(node=>node.id===target))throw new Error("场景请连接到视频或导演台");
    if(add)source=sceneInputIdentity(fromScene.id,fromScene.scene.defaultStateId);
  }
  const scene=s.scenes?.find(node=>node.id===target);
  if(scene){
    if(add&&!s.choices.some(choice=>choice.nodeId===source&&choice.kind==="image"&&choice.available))throw new Error("请选择已完成的场景参考图");
    const id=scene.scene.defaultStateId,state=scene.scene.states.find(item=>item.id===id)!;
    if(state.referenceArtworkIds.includes(source)===add)return null;
    const refs=add?[...state.referenceArtworkIds,source]:state.referenceArtworkIds.filter(value=>value!==source);
    return {kind:"scene-patch",id:scene.id,from:{scene:scene.scene},to:{scene:{...scene.scene,states:scene.scene.states.map(item=>item.id===id?sceneStateWithReferences(item,refs):item)}}};
  }
  const fromCharacter=s.characters?.find(node=>node.id===source);
  if(fromCharacter){
    if(!s.videos.some(node=>node.id===target))throw new Error("角色请连接到视频节点");
    if(add)source=characterInputIdentity(fromCharacter.id,fromCharacter.character.defaultAppearanceId);
  }
  const character=s.characters?.find(node=>node.id===target);
  if(character){
    if(add&&!s.choices.some(choice=>choice.nodeId===source&&choice.kind==="image"&&choice.available))throw new Error("请选择已完成的角色参考图");
    const id=character.character.defaultAppearanceId,appearance=character.character.appearances.find(item=>item.id===id)!;
    if(appearance.referenceArtworkIds.includes(source)===add)return null;
    const referenceArtworkIds=add?[...appearance.referenceArtworkIds,source]:appearance.referenceArtworkIds.filter(value=>value!==source);
    return {kind:"character-patch",id:character.id,from:{character:character.character},to:{character:{...character.character,appearances:character.character.appearances.map(item=>item.id===id?{...item,referenceArtworkIds}:item)}}};
  }
  const director=s.directors?.find(node=>node.id===target);
  if(director){
    if(add&&!s.choices.some(choice=>choice.nodeId===source&&choice.kind==="image"&&choice.available))throw new Error("请选择已完成的背景图片");
    const before=director.project.panoramaArtworkId;if(add?before===source:before!==source)return null;
    return {kind:"director-patch",id:director.id,from:{project:director.project},to:{project:{...director.project,panoramaArtworkId:add?source:null,...(add?{backgroundProjection:"image" as const}:{}),sceneReference:null}}};
  }
  const video=s.videos.find(node=>node.id===target);
  if(video){
    const removed=!add&&intent.edgeId?video.inputs.find(input=>`e-video-${input.id}-${video.id}`===intent.edgeId):undefined;
    const matches=(id:string)=>removed?id===removed.nodeId:!add?(parseVisualInputIdentity(id)?.id||id.replace(/^(?:text|image|video|audio|audio-node|timeline-node):/,""))===source:id===source||id.replace(/^(?:text|image|video|audio|audio-node|timeline-node):/,"")===source;
    const choice=s.choices.find(item=>item.nodeId===source);
    if(add&&(!choice||video.inputs.some(input=>matches(input.nodeId))))return null;
    if(!add&&!video.inputs.some(input=>matches(input.nodeId)))return null;
    const inputs=add?[...video.inputs,{id:`ref-${browserRandomUUID()}`,nodeId:choice!.nodeId,kind:choice!.kind,
      role:choice!.kind==="text"?"context" as const:choice!.kind==="video"?"source_video" as const:choice!.kind==="audio"?"source_audio" as const:"reference" as const,value:choice!.value}]
      :video.inputs.filter(input=>removed?input.id!==removed.id:!matches(input.nodeId));
    // Graph edits preserve roles/order/configuration regardless of model or
    // catalogue availability. Compiler preview interprets the resulting draft.
    return {kind:'video-patch',id:video.id,from:{inputs:video.inputs},to:{inputs}};
  }
  const pending=s.pending.find(node=>node.id===target);
  if(pending){
    if(pending.generating||pending.uploading)return null;
    const inputs=add?[...new Set([...pending.inputs,source])]:pending.inputs.filter(id=>id!==source);
    if(inputs.length===pending.inputs.length)return null;
    const from={inputs:pending.inputs,parentId:pending.parentId,linked:pending.linked};
    return {kind:"pending-link",id:target,from,to:add?{...from,inputs}:{inputs,parentId:pending.parentId===source?inputs[0]??null:pending.parentId,linked:inputs.length>0}};
  }
  if(source.startsWith("pend-"))return null;
  const targetText=s.texts.find(node=>node.id===target),sourceText=s.texts.find(node=>node.id===source);
  if(targetText||sourceText){
    const node=targetText||sourceText!,inbound=!!targetText,from=textPatchOf(node);
    if(s.project&&node.projectKey!==s.project)return null;
    if(add&&!inbound&&!s.artworks.some(art=>art.id===target))return null;
    if(add&&inbound){
      const art=s.artworks.find(art=>art.id===source);
      if(!art&&(!sourceText||sourceText.projectKey!==node.projectKey))return null;
      if(reaches(s,target,source))throw new Error(s.cycleMessage);
      const batch=s.texts.filter(n=>s.selected.includes(n.id)&&(!s.project||n.projectKey===s.project));
      if(art&&(intent.product||from.productIds.length||batch.length>=2&&batch.some(n=>n.id===target))){
        const targets=batch.length>=2&&batch.some(n=>n.id===target)?batch:[node];
        const changes=targets.filter(n=>!s.locked(n.id)).map(n=>{
          if(reaches(s,n.id,source))throw new Error(s.cycleMessage);
          return {id:n.id,from:textPatchOf(n),to:{...textPatchOf(n),productIds:[art.id],content:s.productMention(n.content||"",art.title||s.productTitle)}};
        }).filter(change=>JSON.stringify(change.from)!==JSON.stringify(change.to));
        return changes.length?{kind:"text-patch-many",changes}:null;
      }
      const ids=from.sourceIds;
      if(ids.includes(source))return null;
      if(sourceText?ids.length>=200:ids.filter(id=>!id.startsWith("text-")).length>=5)throw new Error(s.referenceLimit);
      return {kind:"text-patch",id:node.id,from,to:{...from,sourceIds:[...ids,source]}};
    }
    const to=inbound?{...from,sourceIds:from.sourceIds.filter(id=>id!==source),productIds:from.productIds.filter(id=>id!==source)}
      :{...from,targetIds:add?[...new Set([...from.targetIds,target])]:from.targetIds.filter(id=>id!==target)};
    return JSON.stringify(from)===JSON.stringify(to)?null:{kind:"text-patch",id:node.id,from,to};
  }
  const art=s.artworks.find(node=>node.id===target);
  if(!art||!s.artworks.some(node=>node.id===source)||explicitCanvasParent(art,source)===add)return null;
  if(add&&canvasParentCycle(s.artworks,target,source))throw new Error(s.cycleMessage);
  return {kind:"parent",targetId:target,parentId:source,added:add};
}
