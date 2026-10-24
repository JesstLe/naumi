import type {Artwork} from "../mock-data";
import type {CanvasVideoNode} from "./video-node-schema";
import type {CanvasPendingNode} from "./scene-types";
import {browserRandomUUID} from "../browser-crypto";
import {videoModeRoles,type VideoInputChoice} from "../video/client-settings";
import {explicitCanvasParent} from "./input-references";
import {canvasParentCycle} from "./parent-link";
import {textPatchOf,type CanvasTextNode,type CanvasHistoryAction} from "./history-model";

type Snapshot={project:string|null;artworks:Artwork[];texts:CanvasTextNode[];videos:CanvasVideoNode[];pending:CanvasPendingNode[];
  selected:string[];choices:VideoInputChoice[];locked:(id:string)=>boolean;
  productTitle:string;referenceLimit:string;cycleMessage:string;productMention:(content:string,title:string)=>string};
export type CanvasLinkIntent={source:string;target:string;add:boolean;product?:boolean};
function reaches(s:Snapshot,source:string,target:string){
  const edges=[...s.artworks.flatMap(node=>[...new Set([...(node.parentIds||[]),...(node.parentId&&explicitCanvasParent(node,node.parentId)?[node.parentId]:[])])].map(parent=>({source:parent,target:node.id}))),
    ...s.texts.flatMap(node=>[...[...(node.sourceIds||[]),...(node.productIds||[])].map(id=>({source:id,target:node.id})),...(node.targetIds||[]).map(id=>({source:node.id,target:id}))]),
    ...s.videos.flatMap(node=>node.inputs.map(input=>({source:input.nodeId.replace(/^(?:text|image|video|audio):/,""),target:node.id}))),
    ...s.pending.flatMap(node=>node.inputs.map(source=>({source,target:node.id})))];
  const seen=new Set<string>(),todo=[source];
  while(todo.length){const id=todo.pop()!;if(id===target)return true;if(seen.has(id))continue;seen.add(id);todo.push(...edges.filter(edge=>edge.source===id).map(edge=>edge.target));}
  return false;
}
/** Compile exactly one link gesture into the existing atomic history contract.
 * No React, network, independent text saves or optimistic document writes. */
export function compileCanvasLink(s:Snapshot,intent:CanvasLinkIntent):CanvasHistoryAction|null{
  const {source,target,add}=intent;
  if(!source||!target||source===target||source.startsWith("task-")||target.startsWith("task-")||s.locked(source)||s.locked(target))return null;
  const video=s.videos.find(node=>node.id===target);
  if(video){
    const matches=(id:string)=>id.replace(/^(?:text|image|video|audio):/,"")===source;
    const choice=s.choices.find(item=>item.nodeId===source);
    if(add&&(!choice||video.inputs.some(input=>matches(input.nodeId))))return null;
    if(!add&&!video.inputs.some(input=>matches(input.nodeId)))return null;
    const inputs=add?[...video.inputs,{id:`ref-${browserRandomUUID()}`,nodeId:choice!.nodeId,kind:choice!.kind,
      role:choice!.kind==="text"?"context" as const:choice!.kind==="video"?"source_video" as const:choice!.kind==="audio"?"source_audio" as const:"reference" as const,value:choice!.value}]
      :video.inputs.filter(input=>!matches(input.nodeId));
    return {kind:"video-patch",id:video.id,from:{inputs:video.inputs},to:{inputs:videoModeRoles(inputs,video.config.mode)}};
  }
  const pending=s.pending.find(node=>node.id===target);
  if(pending){
    if(pending.generating||pending.uploading)return null;
    const inputs=add?[...new Set([...pending.inputs,source])]:pending.inputs.filter(id=>id!==source);
    if(inputs.length===pending.inputs.length)return null;
    const from={inputs:pending.inputs,parentId:pending.parentId,linked:pending.linked};
    return {kind:"pending-link",id:target,from,to:add?{...from,inputs}:{inputs,parentId:pending.parentId===source?inputs[0]??null:pending.parentId,linked:inputs.length>0}};
  }
  if(source.startsWith("pend-"))return null;
  const targetText=s.texts.find(node=>node.id===target),sourceText=s.texts.find(node=>node.id===source);
  if(targetText||sourceText){
    const node=targetText||sourceText!,inbound=!!targetText,from=textPatchOf(node);
    if(s.project&&node.projectKey!==s.project)return null;
    if(add&&!inbound&&!s.artworks.some(art=>art.id===target))return null;
    if(add&&inbound){
      const art=s.artworks.find(art=>art.id===source);
      if(!art&&(!sourceText||sourceText.projectKey!==node.projectKey))return null;
      if(reaches(s,target,source))throw new Error(s.cycleMessage);
      const batch=s.texts.filter(n=>s.selected.includes(n.id)&&(!s.project||n.projectKey===s.project));
      if(art&&(intent.product||from.productIds.length||batch.length>=2&&batch.some(n=>n.id===target))){
        const targets=batch.length>=2&&batch.some(n=>n.id===target)?batch:[node];
        const changes=targets.filter(n=>!s.locked(n.id)).map(n=>{
          if(reaches(s,n.id,source))throw new Error(s.cycleMessage);
          return {id:n.id,from:textPatchOf(n),to:{...textPatchOf(n),productIds:[art.id],content:s.productMention(n.content||"",art.title||s.productTitle)}};
        }).filter(change=>JSON.stringify(change.from)!==JSON.stringify(change.to));
        return changes.length?{kind:"text-patch-many",changes}:null;
      }
      const ids=from.sourceIds;
      if(ids.includes(source))return null;
      if(sourceText?ids.length>=200:ids.filter(id=>!id.startsWith("text-")).length>=5)throw new Error(s.referenceLimit);
      return {kind:"text-patch",id:node.id,from,to:{...from,sourceIds:[...ids,source]}};
    }
    const to=inbound?{...from,sourceIds:from.sourceIds.filter(id=>id!==source),productIds:from.productIds.filter(id=>id!==source)}
      :{...from,targetIds:add?[...new Set([...from.targetIds,target])]:from.targetIds.filter(id=>id!==target)};
    return JSON.stringify(from)===JSON.stringify(to)?null:{kind:"text-patch",id:node.id,from,to};
  }
  const art=s.artworks.find(node=>node.id===target);
  if(!art||!s.artworks.some(node=>node.id===source)||explicitCanvasParent(art,source)===add)return null;
  if(add&&canvasParentCycle(s.artworks,target,source))throw new Error(s.cycleMessage);
  return {kind:"parent",targetId:target,parentId:source,added:add};
}
