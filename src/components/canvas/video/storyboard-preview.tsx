"use client";
import {useMemo} from "react";
import {useTimelinePreview} from "../timeline/use-timeline-preview";
import {newTimelineProject,planTimeline} from "@/lib/timeline/project";
import type {TimelineMaterial} from "@/lib/canvas/timeline-node-schema";
import type {ProductionInspection} from "@/lib/storyboard/production";

const xml=(text:string)=>text.replace(/[<>&"']/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]!));
export function StoryboardPreview({inspection}:{inspection:ProductionInspection}){
  const prepared=useMemo(()=>{
    const project=newTimelineProject(),materials:TimelineMaterial[]=[];let position=0;
    for(const shot of inspection.shots){
      const title=`镜头 ${shot.number} · ${shot.title}`,lines=Array.from(shot.prompt.replace(/\s+/g," ")).slice(0,80).join("");
      const placeholder=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#edf1f6"/><text x="64" y="200" font-size="36" fill="#24324a">${xml(title)}</text><text x="64" y="300" font-size="22" fill="#58657a">${xml(lines.slice(0,40))}</text><text x="64" y="344" font-size="22" fill="#58657a">${xml(lines.slice(40))}</text><text x="64" y="620" font-size="20" fill="#58657a">文字预演 · 尚未生成画面</text></svg>`)}`;
      const media=shot.media||{artworkId:`preview:${shot.nodeId}`,kind:"image" as const,url:placeholder,durationSeconds:null,hasAudio:false};
      if(!materials.some(value=>value.artworkId===media.artworkId))materials.push({...media,key:"preview",sha256:"preview"});
      project.tracks[0].clips.push({id:shot.nodeId,artworkId:media.artworkId,position,inPoint:media.kind==="video"?shot.inPoint:0,duration:shot.duration,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});position+=shot.duration;
    }
    for(const audio of inspection.audio){const artworkId=`preview-audio:${audio.id}`;materials.push({artworkId,kind:"audio",url:audio.url,durationSeconds:audio.sourceDuration,hasAudio:true,key:"preview",sha256:"preview"});project.tracks[1].clips.push({artworkId,id:artworkId,position:audio.position,inPoint:audio.inPoint,duration:audio.duration,gain:audio.gain,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});}
    try{return {plan:planTimeline(project,materials.map(({artworkId,kind,durationSeconds,hasAudio})=>({artworkId,kind,durationSeconds,hasAudio}))),materials,error:""};}catch(cause){return {plan:null,materials,error:cause instanceof Error?cause.message:"预演素材不可用"};}
  },[inspection]);
  const preview=useTimelinePreview(prepared.plan,prepared.materials),duration=prepared.plan?.duration||0;
  let offset=0;const active=inspection.shots.find(shot=>{const start=offset;offset+=shot.duration;return preview.position>=start&&preview.position<offset;});
  return <section aria-label="分镜预演" className="space-y-2 rounded-xl border border-slate-200 p-3">
    <canvas ref={preview.canvas} width={1280} height={720} className="aspect-video w-full rounded-lg bg-slate-100"/>
    <div className="flex items-center gap-2 text-xs"><button type="button" className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40" disabled={!prepared.plan||!preview.ready} onClick={()=>void preview.toggle()}>{preview.playing?"暂停预演":"播放预演"}</button><input className="min-w-0 flex-1" type="range" aria-label="预演位置" min={0} max={duration||1} step={.1} value={preview.position} onChange={event=>preview.seek(Number(event.target.value))}/><span>{preview.position.toFixed(1)} / {duration.toFixed(1)}s</span></div>
    <p className="text-xs text-slate-500">{active?`镜头 ${active.number} · ${active.media?.kind==="video"?"采用版本":active.media?"参考图预演":"文字预演"}`:"预演结束"} · 不启动生成</p>
    {(prepared.error||preview.error)&&<p role="alert" className="text-xs text-red-600">{prepared.error||preview.error}</p>}
  </section>;
}
