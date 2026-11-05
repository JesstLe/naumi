"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from "react";
import {currentWorkspaceRevision} from "@/lib/saas/workspace-client";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import type {CanvasNativeKind} from "@/lib/canvas/native-node-records";
import {createCanvasNativeNodeDocument,NativeNodeClientError,type NativeNodeFor,type NativeNodeSnapshot} from "@/lib/canvas/native-node-document";

export type CanvasNativeNodeHookInput={email?:string;readOnly:boolean;scope:CanvasDocumentScope};
const EMPTY:NativeNodeSnapshot<never>={nodes:[],phase:"idle",error:"",saving:0,unsavedCount:0};
/** React subscription/scheduling only. The existing document scope owns actor,
 * workspace and view epochs; project navigation never empties the node store. */
export function useCanvasNativeNodeDocument<K extends CanvasNativeKind>(kind:K,input:CanvasNativeNodeHookInput,makeError:(message:string,status:number,code?:string)=>NativeNodeClientError){
  const owner=useRef<ReturnType<typeof createCanvasNativeNodeDocument<K>>|null>(null),mounted=useRef(true);
  if(!owner.current)owner.current=createCanvasNativeNodeDocument(kind,makeError);
  const scoped=useMemo(()=>({...input.scope,documentCurrent:()=>mounted.current&&input.scope.documentCurrent()}),[input.scope]);
  const document=useMemo(()=>owner.current!.bind(scoped,input.email||"",input.readOnly),[scoped,input.email,input.readOnly]);
  const snapshot=useSyncExternalStore(document.subscribe,document.getSnapshot,()=>EMPTY as NativeNodeSnapshot<NativeNodeFor<K>>);
  const latest=useRef(document);latest.current=document;
  const revision=currentWorkspaceRevision();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const deactivate=latest.current.activate();
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
    const warn=(event:BeforeUnloadEvent)=>{if(latest.current.getSnapshot().unsavedCount){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",warn);
    const load=async()=>{try{await latest.current.refresh();}catch{/* The document exposes the actual read error. */}if(kind==="video"&&!stopped)timer=setTimeout(load,6000);};
    void load();const resume=()=>{if(window.document.visibilityState==="visible")void latest.current.refresh().catch(()=>{});};
    window.addEventListener("focus",resume);window.document.addEventListener("visibilitychange",resume);
    return()=>{stopped=true;deactivate();window.removeEventListener("beforeunload",warn);if(timer)clearTimeout(timer);window.removeEventListener("focus",resume);window.document.removeEventListener("visibilitychange",resume);};
  },[kind,input.scope.account,input.scope.workspace,input.email,input.readOnly,revision]);
  return {...document,allNodes:snapshot.nodes,nodes:useMemo(()=>snapshot.nodes.filter(node=>!node.deletedAt),[snapshot.nodes]),ready:snapshot.phase==="ready"||snapshot.phase==="error",error:snapshot.error,unsavedCount:snapshot.unsavedCount,saving:snapshot.saving>0};
}
