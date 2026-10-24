"use client";
import {useRef} from "react";
import {createCanvasNodeOperations} from "@/lib/canvas/node-operations";

/** Per-editor receipt lifetime, render-bound scope/document ports. The owner
 * does not reach into global React state or change navigation on completion. */
export function useCanvasNodeOperations(...args:Parameters<ReturnType<typeof createCanvasNodeOperations>["bind"]>){
  const owner=useRef<ReturnType<typeof createCanvasNodeOperations>|null>(null);
  if(!owner.current)owner.current=createCanvasNodeOperations();
  return owner.current.bind(...args);
}
