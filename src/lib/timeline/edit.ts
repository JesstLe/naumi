import type {TimelineClip,TimelineProject,TimelineSource,TimelineTrack} from "./project";

function transitions(track:TimelineTrack){
  if(track.kind!=="video")return;
  const sorted=[...track.clips].sort((a,b)=>a.position-b.position||(a.id<b.id?-1:1));
  sorted.forEach((clip,index)=>{const previous=sorted[index-1],overlap=previous?previous.position+previous.duration-clip.position:0;clip.transitionIn=overlap>0&&overlap<=Math.min(clip.duration,previous.duration)?overlap:0;});
}
export function updateTimelineClip(project:TimelineProject,id:string,fields:Partial<TimelineClip>){
  const next=structuredClone(project),track=next.tracks.find(track=>track.clips.some(clip=>clip.id===id)),clip=track?.clips.find(clip=>clip.id===id);if(!track||!clip)return next;
  if(fields.transitionIn!==undefined&&track.kind==="video"){
    const previous=[...track.clips].filter(item=>item.id!==id&&item.position<=clip.position).sort((a,b)=>b.position-a.position)[0];
    if(fields.transitionIn&&!previous)throw new Error("请先添加前一个画面片段");if(previous)clip.position=previous.position+previous.duration-fields.transitionIn;
  }
  Object.assign(clip,fields);if(fields.duration!==undefined){clip.fadeIn=Math.min(clip.fadeIn,Math.max(0,clip.duration));clip.fadeOut=Math.min(clip.fadeOut,Math.max(0,clip.duration));}transitions(track);return next;
}
export function appendTimelineClip(project:TimelineProject,source:TimelineSource,options:{clipId:string;trackId:string;newTrackId:string;newTrackName:string}){
  const next=structuredClone(project),compatible=(track:TimelineTrack)=>track.kind==="audio"?source.hasAudio:source.kind!=="audio";
  let track=next.tracks.find(track=>track.id===options.trackId&&compatible(track))??[...next.tracks].reverse().find(compatible);
  if(!track){track={id:options.newTrackId,name:options.newTrackName,kind:source.kind==="audio"?"audio":"video",muted:false,gain:1,clips:[]};next.tracks.push(track);}
  track.clips.push({id:options.clipId,artworkId:source.artworkId,position:Math.max(0,...track.clips.map(clip=>clip.position+clip.duration)),inPoint:0,duration:source.kind==="image"?3:source.durationSeconds||0,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});return {project:next,trackId:track.id};
}
export function moveTimelineClip(project:TimelineProject,id:string,targetId:string){
  const next=structuredClone(project),from=next.tracks.find(track=>track.clips.some(clip=>clip.id===id)),target=next.tracks.find(track=>track.id===targetId);if(!from||!target||from===target)return next;
  const clip=from.clips.find(clip=>clip.id===id)!;from.clips=from.clips.filter(item=>item.id!==id);clip.transitionIn=0;target.clips.push(clip);transitions(from);transitions(target);return next;
}
export function removeTimelineClip(project:TimelineProject,id:string){
  const next=structuredClone(project);for(const track of next.tracks){track.clips=track.clips.filter(clip=>clip.id!==id);transitions(track);}return next;
}
/** A trim changes the source window and sequence window together. It never
 * stretches media or seeks past real source bytes; images can extend in time. */
export function trimTimelineClip(project:TimelineProject,id:string,edge:"start"|"end",delta:number,source:TimelineSource){
  const clip=project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===id);if(!clip||!Number.isFinite(delta))return project;
  const minimum=Math.min(clip.duration,1/project.fps);
  if(edge==="end")return updateTimelineClip(project,id,{duration:Math.min(source.kind==="image"?Infinity:Math.max(0,(source.durationSeconds||0)-clip.inPoint),Math.max(minimum,clip.duration+delta))});
  const shift=Math.max(-Math.min(clip.position,source.kind==="image"?clip.position:clip.inPoint),Math.min(delta,clip.duration-minimum));
  return updateTimelineClip(project,id,{position:clip.position+shift,inPoint:source.kind==="image"?0:clip.inPoint+shift,duration:clip.duration-shift});
}
