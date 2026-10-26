"use client";
import {useEffect,useRef,useSyncExternalStore} from "react";
import {createCanvasImageTextEditor,EMPTY_CANVAS_IMAGE_TEXT} from "@/lib/canvas/image-text-editor";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
export function useCanvasImageTextEditor(scope:CanvasDocumentScope){
  const owner=useRef<ReturnType<typeof createCanvasImageTextEditor>|null>(null);if(!owner.current)owner.current=createCanvasImageTextEditor();
  const editor=owner.current.bind(scope),state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,()=>EMPTY_CANVAS_IMAGE_TEXT);
  useEffect(()=>{owner.current!.mount(true);return()=>owner.current?.mount(false);},[]);
  return {...editor,state};
}
