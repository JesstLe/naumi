"use client";
import {useRef} from "react";
import {createCanvasTemplateImports} from "@/lib/canvas/template-imports";
export function useCanvasTemplateImports(...args:Parameters<ReturnType<typeof createCanvasTemplateImports>["bind"]>){
  const owner=useRef<ReturnType<typeof createCanvasTemplateImports>|null>(null);
  if(!owner.current)owner.current=createCanvasTemplateImports();
  return owner.current.bind(...args);
}
