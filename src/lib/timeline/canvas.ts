import type {CanvasTimelineNode} from "../canvas/timeline-node-schema";
import type {VideoInputChoice} from "../video/client-settings";
import type {OrderedInput} from "../video/references";
import {timelineInputIdentity,parseTimelineInputIdentity} from "./project";

export function timelineInputChoices(nodes:readonly CanvasTimelineNode[],media:readonly VideoInputChoice[]):VideoInputChoice[]{
  return nodes.filter(node=>!node.deletedAt).map(node=>{const output=media.find(choice=>choice.kind==="video"&&choice.nodeId===node.adopted?.artworkId),nodeId=timelineInputIdentity(node.id);return {id:nodeId,nodeId,kind:"video",title:node.title,value:output?.value||"",available:!!output?.available};});
}
export function previewTimelineInputs(inputs:readonly OrderedInput[],choices:readonly VideoInputChoice[]):OrderedInput[]{
  return inputs.map(input=>{
    if(!input.nodeId.startsWith("timeline-node:"))return {...input};const choice=choices.find(choice=>choice.nodeId===input.nodeId&&choice.kind==="video");
    if(!parseTimelineInputIdentity(input.nodeId)||input.kind!=="video"||input.role!=="source_video"||!choice?.available||!choice.value)throw new Error("多轨节点或已采用成片已不可用");return {...input,value:choice.value};
  });
}
