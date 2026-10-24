"use client";
import {useRef,useSyncExternalStore} from "react";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import {createCanvasTextTasks} from "@/lib/canvas/text-task-controller";
import type {CanvasTextTaskPorts} from "@/lib/canvas/text-task";
import type {CanvasTextTaskRequest} from "@/lib/canvas/text-task-request";

/** React observes task state; retained request/result belong to the task owner.
 * No document copies, operation IDs or provider calls are kept in this hook. */
export function useCanvasTextTasks(scope:CanvasDocumentScope,ports:Omit<CanvasTextTaskPorts,"changed">){
  const owner=useRef<ReturnType<typeof createCanvasTextTasks>|null>(null);if(!owner.current)owner.current=createCanvasTextTasks();const tasks=owner.current;
  useSyncExternalStore(tasks.subscribe,tasks.revision,()=>0);
  return {state:(id?:string|null)=>tasks.state(scope,id),retryable:(id:string)=>tasks.retryable(scope,id),
    run:(request:CanvasTextTaskRequest)=>tasks.execute(scope,request,ports),resume:(id:string)=>tasks.resume(scope,id,ports),
    batch:(mode:"reverse"|"assist",requests:CanvasTextTaskRequest[])=>tasks.batch(scope,mode,requests,ports),busy:(mode:"reverse"|"assist")=>tasks.busy(scope,mode)};
}
