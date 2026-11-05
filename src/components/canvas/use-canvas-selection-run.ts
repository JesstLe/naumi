"use client";
import {useLayoutEffect,useRef,useSyncExternalStore} from "react";
import {createCanvasSelectionRun} from "@/lib/canvas/selection-run-controller";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import type {SelectionRunNode} from "@/lib/canvas/selection-run";

export function useCanvasSelectionRun(input:{scope:CanvasDocumentScope;targets:(ids:string[])=>SelectionRunNode[];canRun:(node:SelectionRunNode)=>boolean;run:(node:SelectionRunNode,current:()=>boolean)=>Promise<boolean>}){
  const owner=useRef<ReturnType<typeof createCanvasSelectionRun>|null>(null),latest=useRef(input);if(!owner.current)owner.current=createCanvasSelectionRun();
  useLayoutEffect(()=>{latest.current=input;});const controller=owner.current;
  const snapshot=useSyncExternalStore(controller.subscribe,()=>controller.snapshot(input.scope),()=>controller.snapshot(input.scope));
  return {...snapshot,start:(ids:string[])=>controller.start(input.scope,ids,{targets:input.targets,run:input.run,canRun:node=>latest.current.canRun(node)})};
}
