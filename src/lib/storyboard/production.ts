import {newTimelineProject,planTimeline,type TimelineProject} from "../timeline/project";
import type {TimelineMaterial} from "../canvas/timeline-node-schema";
import type {StoryboardDocument} from "./plan";
import type {ContinuityBinding,ContinuityIssue} from "./continuity";

export type PreviewShot={nodeId:string;number:string;title:string;prompt:string;duration:number;plannedDuration:number|null;inPoint:number;media:{url:string;kind:"image"|"video";artworkId:string;durationSeconds:number|null;hasAudio:boolean}|null;dialogueSeconds:number|null};
export type RoughcutLink={timelineId:string;revision:number;title:string;clips:Array<{nodeId:string;clipId:string;artworkId:string}>};
export type ProductionInspection={shots:PreviewShot[];audio:Array<{id:string;url:string;position:number;inPoint:number;duration:number;sourceDuration:number;gain:number}>;catalog:ContinuityBinding[];issues:ContinuityIssue[];warnings:string[];roughcuts:RoughcutLink[];quote:{newShots:number;reusedShots:number;generationCredits:number|null;assemblyCredits:number|null;upperBound:boolean;assemblyUpperBound:boolean;byocShots:number;error?:string}};

export function spokenDuration(text:string){
  const han=(text.match(/[\p{Script=Han}]/gu)||[]).length,words=(text.replace(/[\p{Script=Han}]/gu," ").match(/[\p{L}\p{N}]+/gu)||[]).length;
  return Math.ceil((han/3+words/2.5)*10)/10;
}
export function createRoughcut(document:StoryboardDocument,materials:readonly TimelineMaterial[],clipId:(nodeId:string)=>string,selected?:readonly string[]):{project:TimelineProject;clips:RoughcutLink["clips"]}{
  const project=newTimelineProject(),clips:RoughcutLink["clips"]=[];let position=0;
  for(const shot of document.shots.filter(shot=>!selected||selected.includes(shot.nodeId))){
    const media=materials.find(media=>media.artworkId===shot.adoptedArtworkId);
    if(!media||media.kind!=="video"||!media.durationSeconds)throw new Error(`镜头 ${shot.number} 尚无可用的采用版本`);
    const inPoint=shot.cut?.inPoint||0,duration=shot.cut?.duration??media.durationSeconds-inPoint;
    if(duration<=0||inPoint+duration>media.durationSeconds+1e-6)throw new Error(`镜头 ${shot.number} 的裁剪超出采用素材`);
    const id=clipId(shot.nodeId);project.tracks[0].clips.push({id,artworkId:media.artworkId,canvasSourceId:shot.nodeId,position,inPoint,duration,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});
    clips.push({nodeId:shot.nodeId,clipId:id,artworkId:media.artworkId});position+=duration;
  }
  for(const audio of document.audio||[]){const media=materials.find(media=>media.artworkId===audio.artworkId);if(!media?.hasAudio)throw new Error("配乐素材没有可用音轨");project.tracks[1].clips.push({...audio,canvasSourceId:audio.artworkId,gain:audio.gain,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});}
  planTimeline(project,materials.map(({artworkId,kind,durationSeconds,hasAudio})=>({artworkId,kind,durationSeconds,hasAudio})));return {project,clips};
}
/** Replace only explicit adopted footage. Preserve all editorial timing, sound and transitions. */
export function replaceRoughcutTakes(current:TimelineProject,link:RoughcutLink,document:StoryboardDocument,materials:readonly TimelineMaterial[],selected:readonly string[]){
  const project=structuredClone(current),changes:Array<{nodeId:string;clipId:string;from:string;to:string}>=[],clips=structuredClone(link.clips);
  for(const nodeId of selected){const shot=document.shots.find(shot=>shot.nodeId===nodeId),tracked=clips.find(clip=>clip.nodeId===nodeId),clip=project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===tracked?.clipId),media=materials.find(media=>media.artworkId===shot?.adoptedArtworkId);
    if(!shot||!tracked||!clip)throw new Error("所选镜头已从粗剪移除，请新建方案粗剪或在多轨内编辑");
    if(!media||media.kind!=="video"||!media.durationSeconds)throw new Error(`镜头 ${shot.number} 尚无可用的采用版本`);
    if(clip.artworkId!==tracked.artworkId&&clip.artworkId!==media.artworkId)throw new Error(`镜头 ${shot.number} 的来源已在多轨中修改，请先核对`);
    if(clip.inPoint+clip.duration>media.durationSeconds+1e-6)throw new Error(`镜头 ${shot.number} 新版较短，请先调整该片段裁剪`);
    if(clip.artworkId!==media.artworkId)changes.push({nodeId,clipId:clip.id,from:clip.artworkId,to:media.artworkId});
    clip.artworkId=media.artworkId;tracked.artworkId=media.artworkId;
  }
  // The owning timeline service validates unchanged as well as new media before writing.
  return {project,clips,changes};
}
