"use client";
import {useRef,useSyncExternalStore} from "react";
import {createCanvasImageImports,EMPTY_CANVAS_IMAGE_IMPORTS} from "@/lib/canvas/image-imports";

/** One import lifetime for the editor; Canvas renders progress, not a second queue. */
export function useCanvasImageImports(){
  const owner=useRef<ReturnType<typeof createCanvasImageImports>|null>(null);
  if(!owner.current)owner.current=createCanvasImageImports();
  const imports=owner.current,batches=useSyncExternalStore(imports.subscribe,imports.getSnapshot,()=>EMPTY_CANVAS_IMAGE_IMPORTS);
  return {...imports,batches:batches.filter(batch=>!batch.hidden)};
}
