"use client";
import {useEffect,useRef,useSyncExternalStore} from "react";
import {createCanvasWorkflowDocument,EMPTY_WORKFLOW_DOCUMENT} from "@/lib/canvas/workflow-document";
export function useCanvasWorkflowDocument(...args:Parameters<ReturnType<typeof createCanvasWorkflowDocument>["bind"]>){
  const owner=useRef<ReturnType<typeof createCanvasWorkflowDocument>|null>(null);if(!owner.current)owner.current=createCanvasWorkflowDocument();
  const document=owner.current.bind(...args),snapshot=useSyncExternalStore(document.subscribe,document.getSnapshot,()=>EMPTY_WORKFLOW_DOCUMENT);
  const load=useRef(document.load);load.current=document.load;const [scope,email]=args;
  useEffect(()=>{void load.current();},[scope.account,scope.workspace,email]);
  return {...document,...snapshot};
}
