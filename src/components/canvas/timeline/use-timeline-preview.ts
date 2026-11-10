"use client";
import {useCallback,useEffect,useRef,useState,useMemo} from "react";
import {subtitlePlacements} from "@/lib/timeline/dialogue";
import {sampleTimeline,type TimelinePlan} from "@/lib/timeline/project";
import type {TimelineMaterial} from "@/lib/canvas/timeline-node-schema";

type ClipMedia={visual?:HTMLImageElement|HTMLVideoElement;audio?:HTMLAudioElement;gain?:GainNode};
export function useTimelinePreview(plan:TimelinePlan|null,materials:readonly TimelineMaterial[]){
  const canvas=useRef<HTMLCanvasElement>(null),time=useRef(0),playing=useRef(false),clock=useRef({at:0,time:0}),context=useRef<AudioContext|null>(null),media=useRef(new Map<string,ClipMedia>());
  const [position,setPosition]=useState(0),[running,setRunning]=useState(false),[error,setError]=useState(""),[ready,setReady]=useState(false);
  const placements=useMemo(()=>plan?subtitlePlacements(plan.project):new Map() as ReturnType<typeof subtitlePlacements>,[plan]),placementsRef=useRef(placements);placementsRef.current=placements;
  const planRef=useRef(plan);planRef.current=plan;
  const urls=useRef(new Map(materials.map(source=>[source.artworkId,source.url])));urls.current=new Map(materials.map(source=>[source.artworkId,source.url]));
  const identity=JSON.stringify(plan?.clips.map(clip=>[clip.id,clip.source.kind,clip.artworkId,urls.current.get(clip.artworkId),clip.source.hasAudio])||[]);
  const stop=useCallback(()=>{playing.current=false;setRunning(false);for(const value of media.current.values()){value.audio?.pause();if(value.visual instanceof HTMLVideoElement)value.visual.pause();}},[]);
  const seek=useCallback((value:number)=>{const duration=planRef.current?.duration||0;time.current=Math.max(0,Math.min(Number.isFinite(value)?value:0,duration));clock.current={at:performance.now(),time:time.current};setPosition(time.current);},[]);
  const toggle=useCallback(async()=>{
    if(playing.current){stop();return;}if(!planRef.current)return;
    try{if(context.current?.state==="suspended")await context.current.resume();if(time.current>=planRef.current.duration)seek(0);clock.current={at:performance.now(),time:time.current};playing.current=true;setRunning(true);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"预览尚未开始");}
  },[seek,stop]);
  useEffect(()=>{
    let live=true,frame=0,pending=0,lastUi=0;stop();setReady(false);setError("");const layer=document.createElement("canvas"),layerContext=layer.getContext("2d");
    const resources=new Map<string,ClipMedia>();media.current=resources;
    try{if(planRef.current?.clips.some(clip=>clip.source.hasAudio))context.current=new AudioContext();}catch{setError("浏览器音频预览暂不可用");}
    const loaded=()=>{pending--;if(live&&pending===0)setReady(true);};
    const failed=()=>{if(live)setError("预览素材尚未读取完成");loaded();};
    for(const clip of planRef.current?.clips||[]){
      const url=urls.current.get(clip.artworkId);if(!url)continue;const value:ClipMedia={};
      if(clip.trackKind==="video"){
        pending++;
        if(clip.source.kind==="image"){const image=new Image();image.crossOrigin="anonymous";image.onload=loaded;image.onerror=failed;image.src=url;value.visual=image;}
        else{const video=document.createElement("video");video.crossOrigin="anonymous";video.muted=true;video.playsInline=true;video.preload="auto";video.onloadeddata=loaded;video.onerror=failed;video.src=url;video.load();value.visual=video;}
      }
      if(clip.source.hasAudio&&context.current){
        const audio=document.createElement("audio");audio.crossOrigin="anonymous";audio.preload="auto";audio.src=url;audio.onerror=()=>{if(live)setError("音轨预览尚未读取完成");};
        const source=context.current.createMediaElementSource(audio),gain=context.current.createGain();gain.gain.value=0;source.connect(gain).connect(context.current.destination);value.audio=audio;value.gain=gain;audio.load();
      }
      resources.set(clip.id,value);
    }
    if(pending===0)setReady(true);
    const sync=(element:HTMLMediaElement,target:number,play:boolean)=>{
      if(element.readyState>=1&&Math.abs(element.currentTime-target)>(play ? .12 : .012)&&!element.seeking)element.currentTime=target;
      if(play&&element.paused)void element.play().catch(()=>{if(live)setError("预览播放尚未开始，请再次点击播放");});else if(!play&&!element.paused)element.pause();
    };
    const draw=()=>{
      if(!live)return;const plan=planRef.current,surface=canvas.current,ctx=surface?.getContext("2d");
      if(plan&&surface&&ctx){
        if(playing.current){time.current=clock.current.time+(performance.now()-clock.current.at)/1000;if(time.current>=plan.duration){time.current=plan.duration;stop();}}
        if(time.current>plan.duration)time.current=plan.duration;
        if(surface.width!==plan.project.width)surface.width=plan.project.width;if(surface.height!==plan.project.height)surface.height=plan.project.height;
        ctx.globalAlpha=1;ctx.fillStyle=plan.project.background;ctx.fillRect(0,0,surface.width,surface.height);
        const at=sampleTimeline(plan,time.current),visible=new Map(at.video.map(clip=>[clip.id,clip])),audible=new Map(at.audio.map(clip=>[clip.id,clip]));
        for(const clip of plan.clips){
          const value=resources.get(clip.id);if(!value)continue;const visual=visible.get(clip.id),audio=audible.get(clip.id);
          if(value.audio){sync(value.audio,audio?.sourceTime??clip.inPoint,!!audio&&playing.current);if(value.gain&&context.current)value.gain.gain.setValueAtTime(audio?.gain||0,context.current.currentTime);}
          if(value.visual instanceof HTMLVideoElement)sync(value.visual,visual?.sourceTime??clip.inPoint,!!visual&&playing.current);
          if(!visual||!value.visual)continue;const image=value.visual,width=image instanceof HTMLVideoElement?image.videoWidth:image.naturalWidth,height=image instanceof HTMLVideoElement?image.videoHeight:image.naturalHeight;
          if(!width||!height)continue;const scale=Math.min(surface.width/width,surface.height/height),w=width*scale,h=height*scale;
          // Pad once, then composite the whole layer with one alpha operation.
          if(!layerContext)continue;if(layer.width!==surface.width)layer.width=surface.width;if(layer.height!==surface.height)layer.height=surface.height;
          layerContext.fillStyle=plan.project.background;layerContext.fillRect(0,0,layer.width,layer.height);layerContext.drawImage(image,(surface.width-w)/2,(surface.height-h)/2,w,h);
          ctx.globalAlpha=visual.opacity;ctx.drawImage(layer,0,0);
        }
        ctx.globalAlpha=1;
        const dialogue=plan.project.dialogue;
        const subtitles=dialogue?.lines.filter(line=>line.subtitleEnabled&&line.subtitleText.trim()&&time.current>=line.position&&time.current<line.position+line.duration)||[];
        for(const line of subtitles){if(!dialogue)continue;const layout=placementsRef.current.get(line.id)!;ctx.font=`${layout.fontSize}px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;ctx.textAlign="center";ctx.textBaseline="top";
          layout.lines.forEach((text,index)=>{const y=layout.y+index*layout.lineHeight;if(dialogue.style.background){const width=Math.min(surface.width-2*layout.marginX,ctx.measureText(text).width+layout.fontSize*.5);ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(layout.x-width/2,y,width,layout.lineHeight);}ctx.strokeStyle="rgba(0,0,0,.7)";ctx.lineWidth=2;ctx.strokeText(text,layout.x,y,surface.width-2*layout.marginX);ctx.fillStyle=dialogue.style.color;ctx.fillText(text,layout.x,y,surface.width-2*layout.marginX);});}
        surface.dataset.subtitleCount=String(subtitles.length);
        ctx.globalAlpha=1;surface.dataset.audioCount=String(at.audio.length);surface.dataset.videoCount=String(at.video.length);surface.dataset.time=String(time.current);surface.dataset.playing=String(playing.current);
        surface.dataset.audioGains=JSON.stringify([...resources].filter(([,value])=>value.gain).map(([id,value])=>[id,value.gain!.gain.value]));surface.dataset.audioPlaying=String([...resources.values()].filter(value=>value.audio&&!value.audio.paused).length);
        surface.dataset.videoSeeking=String(at.video.filter(clip=>(resources.get(clip.id)?.visual as HTMLVideoElement)?.seeking).length);
        surface.dataset.videoTimeError=String(Math.max(0,...at.video.flatMap(clip=>{const visual=resources.get(clip.id)?.visual;return visual instanceof HTMLVideoElement?[Math.abs(visual.currentTime-clip.sourceTime)]:[];})));
        if(performance.now()-lastUi>70){lastUi=performance.now();setPosition(time.current);}
      }else if(surface&&ctx){ctx.fillStyle="#f1f5f9";ctx.fillRect(0,0,surface.width,surface.height);}
      frame=requestAnimationFrame(draw);
    };frame=requestAnimationFrame(draw);
    return ()=>{live=false;playing.current=false;cancelAnimationFrame(frame);for(const value of resources.values()){if(value.visual instanceof HTMLVideoElement){value.visual.pause();value.visual.removeAttribute("src");value.visual.load();}else if(value.visual){value.visual.onload=null;value.visual.onerror=null;value.visual.src="";}if(value.audio){value.audio.pause();value.audio.removeAttribute("src");value.audio.load();}value.gain?.disconnect();}void context.current?.close().catch(()=>{});context.current=null;};
  },[identity,stop]);
  return {canvas,position,playing:running,ready,error,toggle,seek,pause:stop};
}
