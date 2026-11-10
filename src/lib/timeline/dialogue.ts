import {z} from "zod";
import type {TimelineProject,TimelineSource} from "./project";

export const dialogueSourceSchema=z.strictObject({nodeId:z.string().min(1).max(160),sha256:z.string().regex(/^[a-f0-9]{64}$/),start:z.number().int().nonnegative(),end:z.number().int().positive(),text:z.string().min(1).max(4000)}).refine(source=>source.end>source.start,"原文范围无效");
export const dialogueLineSchema=z.strictObject({
  id:z.string().min(1).max(140),speaker:z.string().trim().max(100),text:z.string().min(1).max(4000),
  position:z.number().finite().nonnegative(),duration:z.number().finite().min(.01),
  subtitleText:z.string().max(4000),subtitleEnabled:z.boolean(),timing:z.enum(["draft","confirmed"]),
  source:dialogueSourceSchema.optional(),audioClipId:z.string().min(1).max(160).optional(),audioText:z.string().max(4000).optional(),
});
export const dialogueStyleSchema=z.strictObject({fontSizePercent:z.number().finite().min(1).max(10),safeMarginPercent:z.number().finite().min(3).max(20),position:z.enum(["bottom","top"]),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),background:z.boolean()});
export const timelineDialogueSchema=z.strictObject({lines:z.array(dialogueLineSchema).max(1000),burnIn:z.boolean(),style:dialogueStyleSchema});
export type DialogueLine=z.infer<typeof dialogueLineSchema>;
export type TimelineDialogue=z.infer<typeof timelineDialogueSchema>;
export const newTimelineDialogue=():TimelineDialogue=>({lines:[],burnIn:true,style:{fontSizePercent:4.4,safeMarginPercent:8,position:"bottom",color:"#ffffff",background:true}});
export const dialogueSourceKey=(source:NonNullable<DialogueLine["source"]>)=>`${source.nodeId}:${source.sha256}:${source.start}:${source.end}`;

/** A sentence has one source span and one explicit sound binding, not one per shot. */
export function validateTimelineDialogue(project:TimelineProject,duration:number,sources:readonly TimelineSource[]){
  const value=project.dialogue;if(!value)return;
  const ids=new Set<string>(),audioIds=new Set<string>(),originals:NonNullable<DialogueLine["source"]>[]=[];
  for(const line of value.lines){
    if(ids.has(line.id))throw new Error("对白编号重复");ids.add(line.id);
    if(line.position+line.duration>duration+1e-6)throw new Error("对白时间超出工程范围");
    if(line.source){if(originals.some(source=>source.nodeId===line.source!.nodeId&&source.sha256===line.source!.sha256&&source.start<line.source!.end&&source.end>line.source!.start))throw new Error("同一句原文只能分配一次");originals.push(line.source);}
    if(line.audioClipId){
      const track=project.tracks.find(track=>track.clips.some(clip=>clip.id===line.audioClipId)),clip=track?.clips.find(clip=>clip.id===line.audioClipId);
      if(!clip||!clip.audioEnabled||!sources.find(source=>source.artworkId===clip.artworkId)?.hasAudio)throw new Error("对白声音片段已移除或关闭原声");
      if(audioIds.has(line.audioClipId))throw new Error("一段对白声音不能重复分配");audioIds.add(line.audioClipId);
      if(line.position<clip.position-1e-6||line.position+line.duration>clip.position+clip.duration+1e-6)throw new Error("对白时间超出声音片段，请调整该句声音或时间");
    }
    if(line.subtitleEnabled&&line.subtitleText.trim())subtitleLayout(line.subtitleText,project.width,project.height,value.style);
  }
  subtitlePlacements(project);
}

/** Attach an owned imported recording to just this sentence; no other clip moves. */
export function withDialogueAudio(project:TimelineProject,lineId:string,source:TimelineSource,clipId:string,inPoint=0){
  const next=structuredClone(project),line=next.dialogue?.lines.find(line=>line.id===lineId);if(!line)throw new Error("对白已移除");
  if(!source.hasAudio||!source.durationSeconds||inPoint<0||inPoint+line.duration>source.durationSeconds+1e-6)throw new Error("录音裁剪超出实际声音时长");
  const oldId=line.audioClipId,oldTrack=next.tracks.find(track=>track.clips.some(clip=>clip.id===oldId));
  // Never remove a video/original-sound clip or an unowned manual audio clip.
  if(oldTrack?.kind==="audio"&&oldId===`dialogue-audio:${line.id}`)oldTrack.clips=oldTrack.clips.filter(clip=>clip.id!==oldId);
  let track=next.tracks.find(track=>track.id==="dialogue-audio"&&track.kind==="audio");if(!track){let trackId="dialogue-audio",counter=1;while(next.tracks.some(track=>track.id===trackId))trackId=`dialogue-audio:${counter++}`;track={id:trackId,name:"对白",kind:"audio",muted:false,gain:1,clips:[]};next.tracks.push(track);}
  if(next.tracks.some(track=>track.clips.some(clip=>clip.id===clipId)))throw new Error("对白声音编号重复");
  track.clips.push({id:clipId,artworkId:source.artworkId,position:line.position,inPoint,duration:line.duration,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});line.audioClipId=clipId;line.audioText=line.text;return next;
}
export function updateDialogueLine(project:TimelineProject,id:string,fields:Partial<DialogueLine>){
  const next=structuredClone(project),line=next.dialogue?.lines.find(line=>line.id===id);if(!line)return next;
  // Source is a separately verified original snapshot and is never rewritten by text edits.
  Object.assign(line,fields);return next;
}

export function removeDialogueLine(project:TimelineProject,id:string){
  const next=structuredClone(project),line=next.dialogue?.lines.find(line=>line.id===id);if(!line)return next;
  if(line.audioClipId===`dialogue-audio:${id}`)for(const track of next.tracks)if(track.kind==="audio")track.clips=track.clips.filter(clip=>clip.id!==line.audioClipId);
  next.dialogue!.lines=next.dialogue!.lines.filter(line=>line.id!==id);return next;
}

const normalized=(text:string)=>text.replace(/\r\n?/g,"\n");
export function subtitleLayout(text:string,width:number,height:number,style:TimelineDialogue["style"]){
  const fontSize=height*style.fontSizePercent/100,marginX=width*style.safeMarginPercent/100,marginY=height*style.safeMarginPercent/100,maxWidth=width-2*marginX;
  const lines:string[]=[];for(const paragraph of normalized(text).split("\n")){let current="",size=0;for(const char of paragraph){const advance=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(char)?fontSize:fontSize*.65;if(size+advance>maxWidth&&current){lines.push(current);current="";size=0;}current+=char;size+=advance;}lines.push(current);}
  const lineHeight=fontSize*1.25;if(lines.length*lineHeight>height-2*marginY)throw new Error("字幕超出安全区，请拆分字幕或减小字号");
  return {lines,fontSize,lineHeight,marginX,marginY,x:width/2,y:style.position==="bottom"?height-marginY-lines.length*lineHeight:marginY};
}
const cueLines=(dialogue:TimelineDialogue|undefined)=>dialogue?.lines.filter(line=>line.subtitleEnabled&&line.subtitleText.trim()).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))||[];
/** Shared collision layout for browser and ASS, including overlapping speakers. */
export function subtitlePlacements(project:TimelineProject){
 const result=new Map<string,ReturnType<typeof subtitleLayout>>(),active:Array<{end:number;y:number;height:number}>=[],dialogue=project.dialogue;
 if(!dialogue)return result;
 for(const line of cueLines(dialogue)){
  for(let i=active.length-1;i>=0;i--)if(active[i].end<=line.position)active.splice(i,1);
  const layout=subtitleLayout(line.subtitleText,project.width,project.height,dialogue.style),height=layout.lines.length*layout.lineHeight,gap=layout.fontSize*.25;
  const occupied=[...active].sort((a,b)=>dialogue.style.position==="bottom"?b.y-a.y:a.y-b.y);let y=layout.y;
  for(const prior of occupied)if(y<prior.y+prior.height+gap&&y+height+gap>prior.y)y=dialogue.style.position==="bottom"?prior.y-height-gap:prior.y+prior.height+gap;
  if(y<layout.marginY-1e-6||y+height>project.height-layout.marginY+1e-6)throw new Error("同时出现的字幕超出安全区，请调整时间或字号");
  result.set(line.id,{...layout,y});active.push({end:line.position+line.duration,y,height});
 }
 return result;
}
function stamp(seconds:number,ass=false){const units=Math.round(seconds*(ass?100:1000)),base=ass?100:1000;return `${ass?Math.floor(units/base/3600):String(Math.floor(units/base/3600)).padStart(2,"0")}:${String(Math.floor(units/base/60)%60).padStart(2,"0")}:${String(Math.floor(units/base)%60).padStart(2,"0")}${ass?".":","}${String(units%base).padStart(ass?2:3,"0")}`;}
export function dialogueSrt(dialogue:TimelineDialogue|undefined){return cueLines(dialogue).map((line,index)=>`${index+1}\n${stamp(line.position)} --> ${stamp(line.position+line.duration)}\n${normalized(line.subtitleText)}\n`).join("\n");}
export function dialogueAss(project:TimelineProject){
  const dialogue=project.dialogue;if(!dialogue)return "";const style=dialogue.style,marginX=Math.round(project.width*style.safeMarginPercent/100),marginY=Math.round(project.height*style.safeMarginPercent/100),color=style.color.slice(1).match(/../g)!.reverse().join("");
  // Only generated styles/control records enter ASS. User override/control characters are literal glyphs.
  const literal=(text:string)=>text.replace(/\\/g,"＼").replace(/{/g,"｛").replace(/}/g,"｝").replace(/[\u0000-\u001f]/g,""),placements=subtitlePlacements(project);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${project.width}\nPlayResY: ${project.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans CJK SC,${project.height*style.fontSizePercent/100},&H00${color},&H00${color},&H80000000,&H80000000,0,0,0,0,100,100,0,0,${style.background?3:1},2,0,${style.position==="bottom"?2:8},${marginX},${marginX},${marginY},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cueLines(dialogue).map(line=>`Dialogue: 0,${stamp(line.position,true)},${stamp(line.position+line.duration,true)},Default,,0,0,0,,${`{\\an8\\pos(${placements.get(line.id)!.x},${placements.get(line.id)!.y})}`}${placements.get(line.id)!.lines.map(literal).join("\\N")}`).join("\n")}\n`;
}
