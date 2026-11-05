"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
import type {CanvasTimelineNode,TimelineMaterial} from "@/lib/canvas/timeline-node-schema";
import type {PublicMediaJob} from "@/lib/video/media-job-schema";
export class TimelineClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new TimelineClientError(message,status,code);
export function useTimelineNodes(input:CanvasNativeNodeHookInput){
 const document=useCanvasNativeNodeDocument("timeline",input,makeError);
 return {...document,
  render:(id:string,expectedRevision:number,operationId:string)=>document.command<{node:CanvasTimelineNode;job:PublicMediaJob}>(id,"render",{expectedRevision,operationId}),
  adopt:async(id:string,expectedRevision:number,operationId:string,jobId:string)=>(await document.command<{node:CanvasTimelineNode}>(id,"adopt",{expectedRevision,operationId,jobId})).node,
  inspect:async(id:string,ids:string[])=>(await document.read(`/api/canvas/timeline-nodes/${encodeURIComponent(id)}/materials?email=${encodeURIComponent(input.email||"")}&ids=${encodeURIComponent(JSON.stringify(ids))}`)).materials as TimelineMaterial[],
 };
}
