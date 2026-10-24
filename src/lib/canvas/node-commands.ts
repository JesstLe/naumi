import type {Artwork} from "../mock-data";
import type {CanvasVideoNode} from "./video-node-schema";
import {CANVAS_TEXT_DEFAULT_HEIGHT,CANVAS_TEXT_DEFAULT_WIDTH,type CanvasTextNode} from "./text-document-model";
import type {CanvasHistoryAction} from "./history-model";
import {browserRandomUUID} from "../browser-crypto";

export type CanvasNodeRecords={artworks:Artwork[];textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[]};
export function canvasDeleteRecords(ids:string[],nodes:CanvasNodeRecords):CanvasNodeRecords{
  const selected=new Set(ids.filter(id=>!id.startsWith("pend-")&&!id.startsWith("task-")));
  return {artworks:nodes.artworks.filter(node=>selected.has(node.id)),textNodes:nodes.textNodes.filter(node=>selected.has(node.id)),videoNodes:nodes.videoNodes.filter(node=>selected.has(node.id))};
}
export function canvasDeletionAction(records:CanvasNodeRecords):CanvasHistoryAction|null{
  const {artworks,textNodes,videoNodes}=records;if(!artworks.length&&!textNodes.length&&!videoNodes.length)return null;
  if(videoNodes.length||artworks.length&&textNodes.length)return {kind:"mixed-delete",...records};
  return artworks.length?{kind:"delete",records:artworks}:{kind:"text-delete",records:textNodes};
}
export function newCanvasText(input:{x:number;y:number;viewport:{x:number;y:number;zoom:number};project:string|null;forceNewProject?:boolean;title:string;prompt?:string;sourceIds?:string[]}):CanvasTextNode{
  const id=`text-${browserRandomUUID()}`,now=new Date().toISOString(),z=input.viewport.zoom||1;
  return {id,projectKey:input.forceNewProject?`tree:${id}`:input.project||`tree:${id}`,title:input.title,prompt:input.prompt||"",content:"",status:"idle",
    canvasX:(input.x-input.viewport.x)/z-150,canvasY:(input.y-input.viewport.y)/z-88,createdAt:now,updatedAt:now,width:CANVAS_TEXT_DEFAULT_WIDTH,height:CANVAS_TEXT_DEFAULT_HEIGHT,
    sourceIds:[...new Set(input.sourceIds||[])].slice(0,5),targetIds:[],productIds:[]};
}
