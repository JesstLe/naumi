import {z} from "zod";
import {timelineDialogueSchema,validateTimelineDialogue} from "./dialogue";

const identity=z.string().min(1).max(160);
const seconds=z.number().finite().nonnegative();
const gain=z.number().finite().min(0).max(4);
export const timelineClipSchema=z.strictObject({
  id:identity,artworkId:identity,canvasSourceId:identity.optional(),position:seconds,inPoint:seconds,duration:z.number().finite().positive(),
  gain:gain.default(1),fadeIn:seconds.default(0),fadeOut:seconds.default(0),
  audioEnabled:z.boolean().default(true),transitionIn:seconds.default(0),
}).superRefine((clip,ctx)=>{
  for(const field of ["fadeIn","fadeOut","transitionIn"] as const)if(clip[field]>clip.duration)ctx.addIssue({code:"custom",path:[field],message:"淡变或转场超过片段时长"});
});
export const timelineProjectSchema=z.strictObject({
  version:z.literal(1),width:z.number().int().positive().max(8192).refine(v=>v%2===0,"画面宽度须为偶数"),
  height:z.number().int().positive().max(8192).refine(v=>v%2===0,"画面高度须为偶数"),
  fps:z.union([z.literal(24),z.literal(25),z.literal(30),z.literal(60)]),
  background:z.string().regex(/^#[0-9a-fA-F]{6}$/),masterGain:gain,
  dialogue:timelineDialogueSchema.optional(),
  tracks:z.array(z.strictObject({id:identity,name:z.string().trim().min(1).max(100),kind:z.enum(["video","audio"]),muted:z.boolean(),gain,clips:z.array(timelineClipSchema)})),
}).superRefine((project,ctx)=>{
  const tracks=new Set<string>(),clips=new Set<string>();
  project.tracks.forEach((track,i)=>{
    if(tracks.has(track.id))ctx.addIssue({code:"custom",path:["tracks",i,"id"],message:"轨道身份重复"});tracks.add(track.id);
    track.clips.forEach((clip,j)=>{if(clips.has(clip.id))ctx.addIssue({code:"custom",path:["tracks",i,"clips",j,"id"],message:"片段身份重复"});clips.add(clip.id);});
  });
});
export type TimelineProject=z.infer<typeof timelineProjectSchema>;
export type TimelineClip=z.infer<typeof timelineClipSchema>;
export type TimelineTrack=TimelineProject["tracks"][number];
export const timelineNodeIdSchema=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
export const timelineInputIdentity=(id:string)=>`timeline-node:${timelineNodeIdSchema.parse(id)}`;
export function parseTimelineInputIdentity(value:string){const id=value.startsWith("timeline-node:")?timelineNodeIdSchema.safeParse(value.slice(14)):null;return id?.success?id.data:null;}
export type TimelineSource={artworkId:string;kind:"image"|"video"|"audio";durationSeconds:number|null;hasAudio:boolean};
const sourceSchema=z.strictObject({artworkId:identity,kind:z.enum(["image","video","audio"]),durationSeconds:z.number().finite().positive().nullable(),hasAudio:z.boolean()})
  .superRefine((source,ctx)=>{if(source.kind!=="image"&&source.durationSeconds===null||source.kind==="image"&&source.hasAudio)ctx.addIssue({code:"custom",message:"素材解码信息无效"});});
export type PlannedTimelineClip=TimelineClip&{trackId:string;trackKind:TimelineTrack["kind"];source:TimelineSource;sourceIndex:number;audioGain:number;audioFadeIn:number;audioFadeOut:number};
export type TimelinePlan={project:TimelineProject;duration:number;sources:TimelineSource[];clips:PlannedTimelineClip[]};

export function newTimelineProject():TimelineProject{
  return {version:1,width:1280,height:720,fps:30,background:"#000000",masterGain:1,tracks:[
    {id:"video",name:"画面",kind:"video",muted:false,gain:1,clips:[]},
    {id:"audio",name:"音频",kind:"audio",muted:false,gain:1,clips:[]},
  ]};
}

/** Pure planning only. The application boundary must supply inspected, owned
 * media, never trust browser duration/kind/URL. Track order is bottom to top. */
export function planTimeline(raw:TimelineProject,sources:readonly TimelineSource[]):TimelinePlan{
  const project=timelineProjectSchema.parse(raw),byId=new Map<string,TimelineSource>();
  for(const rawSource of sources){
    const source=sourceSchema.parse(rawSource);
    if(byId.has(source.artworkId))throw new Error("素材身份重复");
    if(source.kind!=="image"&&(!Number.isFinite(source.durationSeconds)||source.durationSeconds!<=0))throw new Error("素材时长不可用");
    byId.set(source.artworkId,{...source});
  }
  let duration=0;const used:TimelineSource[]=[],clips:PlannedTimelineClip[]=[];
  for(const track of project.tracks){
    const sorted=[...track.clips].sort((a,b)=>a.position-b.position||(a.id<b.id?-1:a.id>b.id?1:0));
    for(const [index,clip] of sorted.entries()){
      const source=byId.get(clip.artworkId);if(!source)throw new Error("片段素材已不可用");
      if(track.kind==="video"&&source.kind==="audio"||track.kind==="audio"&&(source.kind==="image"||!source.hasAudio))throw new Error("素材与轨道类型不匹配");
      if(source.kind==="image"?clip.inPoint!==0:clip.inPoint+clip.duration>source.durationSeconds!+1e-6)throw new Error("片段裁剪超出原素材范围");
      const previous=sorted[index-1],next=sorted[index+1];
      if(track.kind==="audio"&&clip.transitionIn)throw new Error("音频轨道请使用淡入淡出");
      if(track.kind==="video"){
        const overlap=previous?previous.position+previous.duration-clip.position:0;
        if(clip.transitionIn?(!previous||Math.abs(overlap-clip.transitionIn)>1e-6||clip.transitionIn>previous.duration):overlap>1e-6)throw new Error("画面重叠须与相邻片段转场时长一致");
        const beforePrevious=sorted[index-2];if(beforePrevious&&beforePrevious.position+beforePrevious.duration>clip.position+1e-6)throw new Error("同一画面轨道只允许相邻两个片段转场");
      }
      duration=Math.max(duration,clip.position+clip.duration);
      if(track.muted)continue;
      let sourceIndex=used.findIndex(item=>item.artworkId===source.artworkId);if(sourceIndex<0){sourceIndex=used.length;used.push(source);}
      clips.push({...clip,trackId:track.id,trackKind:track.kind,source,sourceIndex,
        audioGain:clip.audioEnabled&&source.hasAudio?clip.gain*track.gain*project.masterGain:0,
        audioFadeIn:Math.max(clip.fadeIn,track.kind==="video"?clip.transitionIn:0),
        audioFadeOut:Math.max(clip.fadeOut,track.kind==="video"?next?.transitionIn||0:0)});
    }
  }
  if(!Number.isFinite(duration)||duration<=0)throw new Error("请先添加时间线片段");
  validateTimelineDialogue(project,duration,sources);
  return {project,duration,sources:used,clips};
}

export function timelineClipGain(clip:PlannedTimelineClip,localTime:number){
  if(localTime<0||localTime>=clip.duration)return 0;
  return clip.audioGain*Math.min(1,clip.audioFadeIn?localTime/clip.audioFadeIn:1)*Math.min(1,clip.audioFadeOut?(clip.duration-localTime)/clip.audioFadeOut:1);
}

/** Browser preview and exporter consume the same resolved plan and envelopes.
 * Empty areas are the project's background and silence, never a held last frame. */
export function sampleTimeline(plan:TimelinePlan,time:number){
  if(!Number.isFinite(time)||time<0||time>=plan.duration)return {video:[],audio:[]};
  const active=plan.clips.filter(clip=>time>=clip.position&&time<clip.position+clip.duration);
  return {
    video:active.filter(clip=>clip.trackKind==="video").map(clip=>({id:clip.id,artworkId:clip.artworkId,sourceTime:clip.inPoint+time-clip.position,opacity:clip.transitionIn?Math.min(1,(time-clip.position)/clip.transitionIn):1})),
    audio:active.filter(clip=>clip.audioGain>0).map(clip=>({id:clip.id,artworkId:clip.artworkId,sourceTime:clip.inPoint+time-clip.position,gain:timelineClipGain(clip,time-clip.position)})),
  };
}
