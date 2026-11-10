import {mediaJobRequestSchema,type MediaJobRequest} from "../video/media-job-schema";
import {planTimeline,type TimelineProject,type TimelineSource} from "./project";
import {dialogueSrt,dialogueAss} from "./dialogue";

const number=(value:number)=>String(Number(value.toFixed(9)));

/** Fixed virtual-file recipe for the existing media job/Worker. No shell, URLs,
 * customer FFmpeg expressions, queue, pricing or persistence lives here. */
export function timelineMediaRequest(project:TimelineProject,sources:readonly TimelineSource[],operationId:string,projectKey:string){
  const plan=planTimeline(project,sources),{width,height,fps,background}=plan.project,duration=number(plan.duration),args:string[]=[],filters:string[]=[];
  for(const [index,source] of plan.sources.entries()){
    if(source.kind==="image")args.push("-loop","1","-framerate",String(fps));
    args.push("-i",`asset:${index}`);
  }
  filters.push(`color=c=0x${background.slice(1)}:s=${width}x${height}:r=${fps}:d=${duration},format=rgba[background]`);
  let video="background";const audio:string[]=[];
  for(const [index,clip] of plan.clips.entries()){
    const start=number(clip.inPoint),length=number(clip.duration),position=number(clip.position);
    if(clip.trackKind==="video"){
      const chain=[`[${clip.sourceIndex}:v:0]trim=start=${start}:duration=${length}`,"setpts=PTS-STARTPTS",`fps=${fps}`,`scale=${width}:${height}:force_original_aspect_ratio=decrease`,`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x${background.slice(1)}`,"setsar=1","format=rgba"];
      if(clip.transitionIn)chain.push(`fade=t=in:st=0:d=${number(clip.transitionIn)}:alpha=1`);
      chain.push(`setpts=PTS+${position}/TB[v${index}]`);filters.push(chain.join(","));
      const next=`composite${index}`;filters.push(`[${video}][v${index}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${position})*lt(t,${number(clip.position+clip.duration)})'[${next}]`);video=next;
    }
    if(clip.audioGain>0){
      const chain=[`[${clip.sourceIndex}:a:0]atrim=start=${start}:duration=${length}`,"asetpts=PTS-STARTPTS","aresample=48000","aformat=sample_fmts=fltp:channel_layouts=stereo",`volume=${number(clip.audioGain)}`];
      if(clip.audioFadeIn)chain.push(`afade=t=in:st=0:d=${number(clip.audioFadeIn)}`);
      if(clip.audioFadeOut)chain.push(`afade=t=out:st=${number(clip.duration-clip.audioFadeOut)}:d=${number(clip.audioFadeOut)}`);
      chain.push(`adelay=delays=${Math.round(clip.position*48000)}S:all=1[a${index}]`);filters.push(chain.join(","));audio.push(`a${index}`);
    }
  }
  const srt=dialogueSrt(plan.project.dialogue),auxiliaryFiles:MediaJobRequest["auxiliaryFiles"]=[],auxiliaryOutputs:MediaJobRequest["auxiliaryOutputs"]=[];
  if(srt){
    // Subtitle bytes are data, not filter syntax or a virtual path template.
    auxiliaryFiles.push({name:"timeline.srt",encoding:"base64",content:Buffer.from(srt,"utf8").toString("base64")});auxiliaryOutputs.push({index:0,name:"timeline.srt"});
    if(plan.project.dialogue?.burnIn){auxiliaryFiles.push({name:"timeline.ass",encoding:"base64",content:Buffer.from(dialogueAss(plan.project),"utf8").toString("base64")});filters.push(`[${video}]ass=filename='aux:1'[subtitled]`);video="subtitled";}
  }
  filters.push(`[${video}]format=yuv420p[vout]`,`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[silence]`);
  filters.push(`[silence]${audio.map(label=>`[${label}]`).join("")}amix=inputs=${audio.length+1}:duration=first:normalize=0:dropout_transition=0,atrim=duration=${duration},asetpts=PTS-STARTPTS[aout]`);
  args.push("-filter_complex",filters.join(";"),"-map","[vout]","-map","[aout]","-t",duration,"-r",String(fps),"-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-movflags","+faststart","output:0");
  const request:MediaJobRequest=mediaJobRequestSchema.parse({operationId,action:"ffmpeg",inputs:plan.sources.map(source=>source.artworkId),outputs:["timeline.mp4"],args,
    auxiliaryFiles,auxiliaryOutputs,source:"canvas",projectKey});
  return {plan,request};
}
