"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {VideoNodeClientError} from "@/lib/canvas/video-node-save-queue";
export {VideoNodeClientError} from "@/lib/canvas/video-node-save-queue";
export type VideoPrivateFetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const makeError=(message:string,status:number,code?:string)=>new VideoNodeClientError(message,status,code);
/** Payload/CAS remain in the existing video service. Copy uses the shared
 * Canvas node operation owner; there is no second client copy intent here. */
export function useVideoNodes(input:CanvasNativeNodeHookInput){return useCanvasNativeNodeDocument("video",input,makeError);}
