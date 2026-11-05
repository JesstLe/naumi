"use client";
import {useEffect,useRef,useSyncExternalStore} from "react";
import {createCanvasAssistant,EMPTY_CANVAS_ASSISTANT} from "@/lib/canvas/assistant-session";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";

/** Per-editor execution lifetime. Its scope includes workspace revision/ABA. */
export function useCanvasAssistant(scope:CanvasDocumentScope){
  const owner=useRef<ReturnType<typeof createCanvasAssistant>|null>(null);if(!owner.current)owner.current=createCanvasAssistant();
  const session=owner.current.bind(scope),state=useSyncExternalStore(session.subscribe,session.getSnapshot,()=>EMPTY_CANVAS_ASSISTANT);
  useEffect(()=>{owner.current!.mount(true);return()=>owner.current?.mount(false);},[]);
  return{...session,state};
}
