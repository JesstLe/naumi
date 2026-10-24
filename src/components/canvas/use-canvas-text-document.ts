"use client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
import { createCanvasDocumentContext } from "@/lib/canvas/document-scope";
import { createCanvasTextDocument, EMPTY_TEXT_DOCUMENT } from "@/lib/canvas/text-document";

const subscribeWorkspace=(notify:()=>void)=>{window.addEventListener(WORKSPACE_SELECTION,notify);return()=>window.removeEventListener(WORKSPACE_SELECTION,notify);};
/** The text document owns its nodes, queues and recovery, not CanvasClient. */
export function useCanvasTextDocument(input:{account:string;actor:string;owner:string;project:string|null;enabled:boolean;readOnly:boolean;notice:(message:string)=>void}) {
  const latest=useRef(input);latest.current=input;
  const context=useRef<ReturnType<typeof createCanvasDocumentContext>|null>(null);
  if(!context.current)context.current=createCanvasDocumentContext();
  const store=useRef<ReturnType<typeof createCanvasTextDocument>|null>(null);
  if(!store.current)store.current=createCanvasTextDocument({storage:()=>typeof window==="undefined"?undefined:window.localStorage,notice:(scope,message)=>{if(scope.documentCurrent())latest.current.notice(message);}});
  const revision=useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,()=>0);
  const scope=context.current.render(input.account,input.project),owner=store.current;
  const document=useMemo(()=>owner.bind(scope,input.actor,input.owner,!input.readOnly&&input.enabled&&input.actor.toLowerCase()===input.owner.toLowerCase()),[owner,scope,input.actor,input.owner,input.readOnly,input.enabled]);
  const snapshot=useSyncExternalStore(document.subscribe,document.getSnapshot,()=>EMPTY_TEXT_DOCUMENT);
  useEffect(()=>{context.current!.mount(true);return()=>{context.current!.mount(false);};},[]);
  // Project navigation doesn't reload an account-wide graph. Auth/target/workspace
  // changes do; a balance-only user object refresh doesn't overwrite drafts.
  const loadRef=useRef(document.load);loadRef.current=document.load;
  useEffect(()=>{if(input.enabled)void loadRef.current();},[input.account,input.enabled,revision]);
  return {...document,scope,nodes:snapshot.nodes,ready:snapshot.phase==="ready",error:snapshot.error,unsaved:snapshot.unsaved};
}
