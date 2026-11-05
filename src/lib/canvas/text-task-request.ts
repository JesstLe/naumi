import {canvasTextContent} from "./text-content";
import {resolveCanvasTextInstruction} from "./text-generation-input";
import type {Artwork} from "../mock-data";
import {browserRandomUUID} from "../browser-crypto";
import {CANVAS_TEXT_DEFAULT_HEIGHT,CANVAS_TEXT_DEFAULT_WIDTH,type CanvasTextNode} from "./text-document-model";

export type CanvasTextPayload={mode?:"general"|"reverse"|"assist";prompt:string;content?:string;projectKey?:string;sourceIds:string[];productIds?:string[]};
export type CanvasTextTaskRequest={node:CanvasTextNode;payload:CanvasTextPayload;created:boolean;productTitle?:string;operationId?:string};
export function stripTextMentions(content:string){const lines=content.split("\n");let i=0;while(i<lines.length&&lines[i].trim().startsWith("@"))i++;return lines.slice(i).join("\n").trim();}
export function withTextProduct(content:string,title:string){return `@${title}\n\n${stripTextMentions(content)}`.trim();}
export function generalTextTask(node:CanvasTextNode,prompt:string,title:string,intent?:"polish"):CanvasTextTaskRequest{
  const content=canvasTextContent(node),instruction=intent==="polish"?"":prompt.trim();
  // The execution instruction is not the reusable writing draft. A body polish
  // preserves the stored instruction through success, failure and resume.
  return {node:{...node,content,prompt:intent==="polish"?node.prompt:instruction,title:node.title||title},
    payload:{prompt:resolveCanvasTextInstruction(instruction,content),content,projectKey:node.projectKey,sourceIds:[...(node.sourceIds||[])]},created:false};
}
export function derivedTextTask(input:{source:Artwork|CanvasTextNode;mode:"reverse"|"assist";product?:Artwork;project:string;title:string;productTitle:string;position:{x:number;y:number;width:number};gap:number}):CanvasTextTaskRequest{
  const {source,mode,product,position}=input,now=new Date().toISOString(),text=source as CanvasTextNode;
  const node:CanvasTextNode={id:`text-${browserRandomUUID()}`,projectKey:input.project,title:input.title,prompt:"",content:"",status:"idle",canvasX:Math.round(position.x+position.width+input.gap),canvasY:Math.round(position.y),
    width:CANVAS_TEXT_DEFAULT_WIDTH,height:CANVAS_TEXT_DEFAULT_HEIGHT,sourceIds:mode==="reverse"?[source.id]:[...(text.sourceIds||[])],targetIds:[],productIds:product?[product.id]:[],createdAt:now,updatedAt:now};
  return {node,created:true,productTitle:product?product.title||input.productTitle:undefined,
    payload:mode==="reverse"?{mode,prompt:"",sourceIds:[source.id]}:{mode,prompt:stripTextMentions(text.content||""),sourceIds:node.sourceIds,productIds:node.productIds}};
}
