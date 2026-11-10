import {z} from "zod";
import {videoProjectKeySchema} from "../canvas/project-key";
import {timelineNodeIdSchema,type TimelineProject} from "../timeline/project";
import {dialogueSourceKey,newTimelineDialogue,type DialogueLine} from "../timeline/dialogue";
import type {StoryboardDocument} from "./plan";

export const storyboardDialogueRequestSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),operationId:z.uuid(),timelineId:timelineNodeIdSchema,timelineRevision:z.number().int().positive()});
/** Append only new formal utterances. Existing timing, subtitles, audio and manual edits win. */
export function appendStoryboardDialogue(project:TimelineProject,document:StoryboardDocument,texts:ReadonlyMap<string,string>,identity:(sourceKey:string)=>string){
  const next=structuredClone(project);next.dialogue ||= newTimelineDialogue();
  const seen=new Set(next.dialogue.lines.flatMap(line=>line.source?[dialogueSourceKey(line.source)]:[]));
  for(const shot of document.shots){
    const clip=next.tracks.filter(track=>track.kind==="video").flatMap(track=>track.clips).find(clip=>clip.canvasSourceId===shot.nodeId);if(!clip)continue;
    const sources=[...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])];
    const lines=sources.flatMap(source=>source.mapping.dialogue.map(line=>{const text=texts.get(source.nodeId);if(text===undefined)throw new Error("对白原稿未读取");return {source:{nodeId:source.nodeId,sha256:source.sha256,start:line.start,end:line.end,text:text.slice(line.start,line.end)},speaker:line.speaker};}));
    const total=lines.reduce((sum,line)=>sum+Array.from(line.source.text).length,0);let offset=0;
    for(const item of lines){const key=dialogueSourceKey(item.source),duration=clip.duration*Array.from(item.source.text).length/Math.max(1,total);if(!seen.has(key)){const line:DialogueLine={id:identity(key),speaker:item.speaker,text:item.source.text,position:clip.position+offset,duration,subtitleText:item.source.text,subtitleEnabled:true,timing:"draft",source:item.source};next.dialogue.lines.push(line);seen.add(key);}offset+=duration;}
  }
  return next;
}
