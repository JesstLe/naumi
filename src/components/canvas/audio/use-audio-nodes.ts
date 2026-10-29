"use client";
import {useEffect,useRef} from "react";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import type {createCanvasAudioActions} from "@/lib/canvas/audio-actions";
import type {PublicMediaJob} from "@/lib/video/media-job-schema";
import type {CanvasNodeSettings} from "@/lib/canvas/node-settings";
export class AudioClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new AudioClientError(message,status,code);
export function useAudioNodes(input:CanvasNativeNodeHookInput){
 const document=useCanvasNativeNodeDocument("audio",input,makeError);
 return {...document,render:(id:string,expectedRevision:number,operationId:string)=>document.command<{node:CanvasAudioNode;job:PublicMediaJob}>(id,"render",{expectedRevision,operationId})};
}

/** React scheduling only; the scope-bound audio command owns adoption rules. */
export function useAudioResultAdoption(input:{commands:ReturnType<ReturnType<typeof createCanvasAudioActions>["bind"]>;nodes:CanvasAudioNode[];jobs:PublicMediaJob[];context:string;readOnly:boolean;ready:boolean;settings:Record<string,CanvasNodeSettings>}){
  const commands=useRef(input.commands);commands.current=input.commands;
  const {nodes,jobs,context,readOnly,ready,settings}=input;
  useEffect(()=>{if(!readOnly&&ready)commands.current.adoptReady(nodes);},[nodes,jobs,context,readOnly,ready,settings]);
}
