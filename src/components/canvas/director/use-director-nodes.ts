"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
import type {CanvasDirectorNode} from "@/lib/canvas/director-node-schema";
export class DirectorClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new DirectorClientError(message,status,code);
export function useDirectorNodes(input:CanvasNativeNodeHookInput){
 const document=useCanvasNativeNodeDocument("director",input,makeError);
 return {...document,attachOutput:async(id:string,artworkId:string,kind:"image"|"video",expectedRevision:number,operationId:string)=>(await document.command<{node:CanvasDirectorNode}>(id,"outputs",{artworkId,kind,expectedRevision,operationId})).node};
}
