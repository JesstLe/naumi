"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
const error=(message:string,status:number,code?:string)=>new NativeNodeClientError(message,status,code);
export function useComfyNodes(input:CanvasNativeNodeHookInput){return useCanvasNativeNodeDocument("comfy",input,error);}
