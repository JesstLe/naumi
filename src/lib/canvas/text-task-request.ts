import type {Artwork} from "../mock-data";
import {browserRandomUUID} from "../browser-crypto";
import {CANVAS_TEXT_DEFAULT_HEIGHT,CANVAS_TEXT_DEFAULT_WIDTH,type CanvasTextNode} from "./text-document-model";

export type CanvasTextPayload={mode?:"general"|"reverse"|"assist";prompt:string;sourceIds:string[];productIds?:string[]};
export type CanvasTextTaskRequest={node:CanvasTextNode;payload:CanvasTextPayload;created:boolean;productTitle?:string;operationId?:string};
export function stripTextMentions(content:string){const lines=content.split("\n");let i=0;while(i<lines.length&&lines[i].trim().startsWith("@"))i++;return lines.slice(i).join("\n").trim();}
export function withTextProduct(content:string,title:string){return `@${title}\n\n${stripTextMentions(content)}`.trim();}
export function generalTextTask(node:CanvasTextNode,prompt:string,title:string):CanvasTextTaskRequest{
  const value=prompt.trim();return {node:{...node,prompt:value,title:value.replace(/\s+/g," ").slice(0,22)||title},payload:{prompt:value,sourceIds:[...(node.sourceIds||[])]},created:false};
}
export function derivedTextTask(input:{source:Artwork|CanvasTextNode;mode:"reverse"|"assist";product?:Artwork;project:string;title:string;productTitle:string;position:{x:number;y:number;width:number};gap:number}):CanvasTextTaskRequest{
  const {source,mode,product,position}=input,now=new Date().toISOString(),text=source as CanvasTextNode;
  const node:CanvasTextNode={id:`text-${browserRandomUUID()}`,projectKey:input.project,title:input.title,prompt:"",content:"",status:"idle",canvasX:Math.round(position.x+position.width+input.gap),canvasY:Math.round(position.y),
    width:CANVAS_TEXT_DEFAULT_WIDTH,height:CANVAS_TEXT_DEFAULT_HEIGHT,sourceIds:mode==="reverse"?[source.id]:[...(text.sourceIds||[])],targetIds:[],productIds:product?[product.id]:[],createdAt:now,updatedAt:now};
  return {node,created:true,productTitle:product?product.title||input.productTitle:undefined,
    payload:mode==="reverse"?{mode,prompt:"",sourceIds:[source.id]}:{mode,prompt:stripTextMentions(text.content||""),sourceIds:node.sourceIds,productIds:node.productIds}};
}
