"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from "react";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import {createCanvasSelectionController,type CanvasSelectionPorts} from "@/lib/canvas/selection-controller";
import {EMPTY_CANVAS_SELECTION} from "@/lib/canvas/selection";

/** Subscribe to this document view; selection owns no document/task writes. */
export function useCanvasSelection(scope:CanvasDocumentScope,ports:()=>CanvasSelectionPorts){
  const latest=useRef(ports);latest.current=ports;
  const owner=useRef<ReturnType<typeof createCanvasSelectionController>|null>(null);
  if(!owner.current)owner.current=createCanvasSelectionController(()=>latest.current());
  const controller=owner.current,view=useMemo(()=>controller.bind(scope),[controller,scope]);
  const state=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_CANVAS_SELECTION);
  useEffect(()=>{controller.mount(true);return()=>controller.mount(false);},[controller]);
  useEffect(()=>{view.project();return()=>view.dispose();},[view]);
  return {...view,...state};
}
