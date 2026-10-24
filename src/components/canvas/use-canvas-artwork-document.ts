"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from "react";
import {currentWorkspaceRevision,WORKSPACE_SELECTION} from "@/lib/saas/workspace-client";
import {createCanvasDocumentContext} from "@/lib/canvas/document-scope";
import {createCanvasArtworkDocument,EMPTY_ARTWORK_DOCUMENT} from "@/lib/canvas/artwork-document";

const subscribeWorkspace=(fn:()=>void)=>{window.addEventListener(WORKSPACE_SELECTION,fn);return()=>window.removeEventListener(WORKSPACE_SELECTION,fn);};
/** UI subscribes to the real artwork graph; it doesn't hold a second copy. */
export function useCanvasArtworkDocument(input:{account:string;actor:string;owner:string;project:string|null;enabled:boolean;readOnly:boolean}){
  const context=useRef<ReturnType<typeof createCanvasDocumentContext>|null>(null),store=useRef<ReturnType<typeof createCanvasArtworkDocument>|null>(null);
  if(!context.current)context.current=createCanvasDocumentContext();if(!store.current)store.current=createCanvasArtworkDocument();
  const revision=useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,()=>0),scope=context.current.render(input.account,input.project),owner=store.current;
  const document=useMemo(()=>owner.bind(scope,input.owner,input.enabled&&!input.readOnly&&input.actor.toLowerCase()===input.owner.toLowerCase()),[owner,scope,input.owner,input.enabled,input.readOnly,input.actor]);
  const snapshot=useSyncExternalStore(document.subscribe,document.getSnapshot,()=>EMPTY_ARTWORK_DOCUMENT);
  useEffect(()=>{context.current!.mount(true);return()=>{context.current!.mount(false);};},[]);
  const load=useRef(document.load);load.current=document.load;
  useEffect(()=>{if(input.enabled)void load.current().catch(()=>{});},[input.account,input.enabled,revision]);
  return {...document,scope,...snapshot};
}
