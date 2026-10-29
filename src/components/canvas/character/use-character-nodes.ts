"use client";
import {useCanvasNativeNodeDocument,type CanvasNativeNodeHookInput} from "../use-canvas-native-node-document";
import {NativeNodeClientError} from "@/lib/canvas/native-node-document";
export class CharacterClientError extends NativeNodeClientError {}
const makeError=(message:string,status:number,code?:string)=>new CharacterClientError(message,status,code);
export function useCharacterNodes(input:CanvasNativeNodeHookInput){return useCanvasNativeNodeDocument("character",input,makeError);}
