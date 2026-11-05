"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
export class SceneClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new SceneClientError(message,status,code);
export function useSceneNodes(input:CanvasNativeNodeHookInput){return useCanvasNativeNodeDocument("scene",input,makeError);}
