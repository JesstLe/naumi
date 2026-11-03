"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import type {CanvasVideoNode,VideoNodeWrite} from "@/lib/canvas/video-node-schema";
import {readNodeList,useNodeListRead} from "../use-node-list-read";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {mergeVideoNodeSnapshots} from '@/lib/video/polling-state';
import {VideoNodeClientError,VideoNodeSaveQueue} from '@/lib/canvas/video-node-save-queue';
import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from '@/lib/saas/workspace-client';
export {VideoNodeClientError} from '@/lib/canvas/video-node-save-queue';

export type VideoPrivateFetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const subscribeWorkspace=(changed:()=>void)=>{window.addEventListener(WORKSPACE_SELECTION,changed);return()=>window.removeEventListener(WORKSPACE_SELECTION,changed);};
/** Saves and polling share a lifecycle, not a persistence transaction. The server
 * owns revision/CAS, authorization and operation receipts. */
export function useVideoNodes({email,readOnly,request}:{email?:string;readOnly:boolean;request:VideoPrivateFetch}){
  const workspaceRevision=useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,()=>0),workspace=currentWorkspace();
  const [nodes,setNodes]=useState<CanvasVideoNode[]>([]),[error,setError]=useState(""),[unsavedCount,setUnsavedCount]=useState(0);
  const nodesRef=useRef(nodes),identity=useRef({email,readOnly,workspaceRevision,epoch:0}),mounted=useRef(false),lifecycle=useRef(0);
  if(identity.current.email!==email||identity.current.readOnly!==readOnly||identity.current.workspaceRevision!==workspaceRevision){
    identity.current={email,readOnly,workspaceRevision,epoch:identity.current.epoch+1};
  }
  const epoch=identity.current.epoch;
  const current=useCallback(()=>mounted.current&&identity.current.epoch===epoch&&currentWorkspaceRevision()===workspaceRevision,[epoch,workspaceRevision]);
  const merge=useCallback((incoming:CanvasVideoNode[])=>{
    if(!current())return;const next=mergeVideoNodeSnapshots(nodesRef.current,incoming);if(next===nodesRef.current)return;nodesRef.current=next;setNodes(next);
  },[current]);
  const read=useCallback((signal:AbortSignal)=>readNodeList<CanvasVideoNode>(request,
    `/api/canvas/video-nodes?includeDeleted=1&email=${encodeURIComponent(email||"")}`,signal,
    (message,status,code)=>new VideoNodeClientError(message,status,code),{'x-naumi-workspace':workspace}),[email,epoch,request,workspace]);
  const {ready,readError,loading,refresh}=useNodeListRead({identityKey:JSON.stringify([email,readOnly,workspaceRevision,epoch]),enabled:!!email,read,accept:merge,pollMs:6000});
  const queue=useRef<VideoNodeSaveQueue|null>(null);
  useEffect(()=>{
    mounted.current=true;lifecycle.current++;nodesRef.current=[];setNodes([]);setError("");
    let journal:ConstructorParameters<typeof VideoNodeSaveQueue>[0]['journal'];
    try{if(email&&!readOnly)journal={key:`naumi:video-node-saves:v1:${JSON.stringify([email.toLowerCase(),workspace])}`,storage:sessionStorage};}catch{/* The in-memory queue and unload warning remain available. */}
    const writes=new VideoNodeSaveQueue({request,current,getNode:id=>nodesRef.current.find(node=>node.id===id),accept:node=>merge([node]),changed:cause=>setError(cause?.message||''),conflict:()=>{void refresh().catch(()=>{});},workspace,journal,pendingChanged:count=>{if(current())setUnsavedCount(count);}});
    queue.current=writes;
    const warn=(event:BeforeUnloadEvent)=>{if(writes.pendingCount){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);
    return()=>{mounted.current=false;lifecycle.current++;window.removeEventListener('beforeunload',warn);writes.dispose();if(queue.current===writes)queue.current=null;};
  },[email,refresh,current,request,merge,workspace]);
  const save=useCallback((id:string,patch:Partial<Omit<VideoNodeWrite,"id"|"operationId">>):Promise<CanvasVideoNode>=>{
    if(!email||readOnly||!current()||!queue.current)return Promise.reject(new Error("画布账号或编辑状态已改变"));
    return queue.current.save(id,patch);
  },[email,readOnly,current]);
  const copy=useCallback(async(ids:string[],projectKey:string)=>{if(!email||readOnly||!current())throw new Error("无法修改此画布");
    const generation=lifecycle.current;
    const response=await request("/api/canvas/video-nodes/copy",{method:"POST",headers:{"content-type":"application/json",'x-naumi-workspace':workspace},body:JSON.stringify({ids,projectKey,operationId:browserRandomUUID()})});const data=await response.json();if(!response.ok)throw new VideoNodeClientError(data.error||"视频节点复制失败",response.status,data.code);
    if(!current()||generation!==lifecycle.current)throw new Error("画布账号或编辑状态已改变");merge(data.nodes);return data.nodes as CanvasVideoNode[];
  },[email,readOnly,request,merge,current,workspace]);
  const getNode=useCallback((id:string)=>nodesRef.current.find(node=>node.id===id),[]);
  const flush=useCallback((retryingNodeId?:string)=>queue.current?.flush(retryingNodeId)||Promise.resolve(),[]);
  const retryPending=useCallback(()=>{if(readOnly||!current())return Promise.reject(new Error('画布账号或编辑状态已改变'));return queue.current?.retryPending()||Promise.resolve();},[readOnly,current]);
  return {nodes:nodes.filter(node=>!node.deletedAt),allNodes:nodes,ready,readError,loading,error:error||readError,unsavedCount,retryPending,refresh,save,copy,getNode,flush};
}
