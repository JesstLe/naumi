"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
export type VideoPrivateFetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
export class VideoNodeClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new VideoNodeClientError(message,status,code);
/** Payload/CAS remain in the existing video service. Copy uses the shared
 * Canvas node operation owner; there is no second client copy intent here. */
export function useVideoNodes(input:CanvasNativeNodeHookInput){return useCanvasNativeNodeDocument("video",input,makeError);}
