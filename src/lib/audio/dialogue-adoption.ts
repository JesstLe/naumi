import {z} from "zod";
import {withDialogueAudio,type DialogueLine} from "../timeline/dialogue";
import type {TimelineProject,TimelineSource} from "../timeline/project";
import type {AudioReceipt} from "./operation-schema";
import {videoProjectKeySchema} from "../canvas/project-key";
import {timelineNodeIdSchema} from "../timeline/project";

export const audioAdoptionSchema=z.strictObject({projectKey:videoProjectKeySchema,timelineId:timelineNodeIdSchema,lineId:z.string().min(1).max(140),expectedRevision:z.number().int().positive(),operationId:z.uuid(),audioOperationId:z.uuid(),timing:z.enum(["keep","fit-audio","source-segment"]),segmentIndex:z.number().int().min(0).max(9999).optional()});
export type AudioAdoption=z.infer<typeof audioAdoptionSchema>;
const lineIdentity=(line:DialogueLine)=>JSON.stringify({id:line.id,text:line.text,speaker:line.speaker,source:line.source?{nodeId:line.source.nodeId,sha256:line.source.sha256,start:line.source.start,end:line.source.end,text:line.source.text}:null});
export function applyDialogueAudioResult(project:TimelineProject,input:AudioAdoption,original:DialogueLine,receipt:AudioReceipt,material?:TimelineSource,transcription?:{text:string;segments?:{start:number;end:number;text:string}[]}){
  const line=project.dialogue?.lines.find(line=>line.id===input.lineId);
  if(!line||receipt.target.lineId!==line.id||receipt.target.timelineId!==input.timelineId||receipt.target.projectKey!==input.projectKey||lineIdentity(line)!==lineIdentity(original))throw new Error("该句原文、说话人或来源已改变，请重新选择结果");
  let next=structuredClone(project),target=next.dialogue!.lines.find(line=>line.id===input.lineId)!;
  if(receipt.kind==="speech"){
    if(input.timing==="source-segment"||input.segmentIndex!==undefined||!material||material.artworkId!==receipt.artworkId||!material.durationSeconds||Math.abs(material.durationSeconds-receipt.durationSeconds)>1e-6)throw new Error("配音采用参数或来源无效");
    if(input.timing==="fit-audio"){target.duration=receipt.durationSeconds;target.timing="draft";}
    next=withDialogueAudio(next,line.id,material,`dialogue-audio:${line.id}`);
  }else{
    if(input.timing==="fit-audio"||!transcription)throw new Error("转写采用参数无效");
    const segment=input.segmentIndex===undefined?undefined:transcription.segments?.[input.segmentIndex];
    if(input.segmentIndex!==undefined&&!segment)throw new Error("转写分句不存在");
    target.subtitleText=segment?.text??transcription.text;
    if(target.subtitleText.length>4000)throw new Error("所选转写超出单句字幕长度，请选择一个分句");
    if(input.timing==="source-segment"){
      const clip=next.tracks.flatMap(track=>track.clips).find(clip=>clip.id===line.audioClipId);
      if(!segment||!clip||!clip.audioEnabled||clip.artworkId!==receipt.sourceArtworkId||segment.start<clip.inPoint||segment.end>clip.inPoint+clip.duration||segment.end<=segment.start)throw new Error("转写时间戳未对应此句实际声音片段");
      target.position=clip.position+segment.start-clip.inPoint;target.duration=segment.end-segment.start;target.timing="draft";
    }
    // Text/source/audioText and every video/audio clip remain unchanged.
  }
  return next;
}
