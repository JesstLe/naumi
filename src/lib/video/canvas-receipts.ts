import {browserRandomUUID} from "../browser-crypto";
import type {CanvasVideoNode} from "../canvas/video-node-schema";
export type CanvasVideoReceipt={idempotencyKey:string;nodeId:string;projectKey:string;expectedRevision:number;taskId?:string};
function key(email:string,nodeId:string){return `naumi:canvas-video-operation:${email.toLowerCase()}:${nodeId}`;}
export function readVideoReceipt(storage:Pick<Storage,"getItem">,email:string,nodeId:string):CanvasVideoReceipt|null{
  try{const item=JSON.parse(storage.getItem(key(email,nodeId))||"null");return item&&item.nodeId===nodeId&&typeof item.idempotencyKey==="string"&&Number.isInteger(item.expectedRevision)&&typeof item.projectKey==="string"?item:null;}catch{return null;}
}
export function prepareVideoReceipt(storage:Pick<Storage,"getItem"|"setItem">,email:string,node:CanvasVideoNode){
  const existing=readVideoReceipt(storage,email,node.id);if(existing)return existing;
  const receipt:CanvasVideoReceipt={idempotencyKey:browserRandomUUID(),nodeId:node.id,projectKey:node.projectKey,expectedRevision:node.revision};storage.setItem(key(email,node.id),JSON.stringify(receipt));return receipt;
}
export function saveVideoReceipt(storage:Pick<Storage,"setItem">,email:string,receipt:CanvasVideoReceipt){storage.setItem(key(email,receipt.nodeId),JSON.stringify(receipt));}
export function clearVideoReceipt(storage:Pick<Storage,"getItem"|"removeItem">,email:string,nodeId:string,operation?:string){const saved=readVideoReceipt(storage,email,nodeId);if(saved&&(!operation||saved.idempotencyKey===operation))storage.removeItem(key(email,nodeId));}
