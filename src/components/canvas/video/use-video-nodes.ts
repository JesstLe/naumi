"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {CanvasVideoNode,VideoNodeWrite} from "@/lib/canvas/video-node-schema";
import {browserRandomUUID} from "@/lib/browser-crypto";

export type VideoPrivateFetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
export class VideoNodeClientError extends Error{constructor(message:string,public status:number,public code?:string){super(message);}}
/** Serial writes use current revisions; editor writes can pin their opening revision to expose conflicts. */
export function useVideoNodes({email,readOnly,request}:{email?:string;readOnly:boolean;request:VideoPrivateFetch}){
  const [nodes,setNodes]=useState<CanvasVideoNode[]>([]),[ready,setReady]=useState(false),[error,setError]=useState("");
  const nodesRef=useRef(nodes),actorRef=useRef(email),epochRef=useRef(0),queues=useRef(new Map<string,Promise<unknown>>());
  nodesRef.current=nodes;actorRef.current=email;
  const merge=useCallback((incoming:CanvasVideoNode[],actor:string|undefined,epoch:number)=>{
    if(actorRef.current!==actor||epochRef.current!==epoch)return;
    const byId=new Map(nodesRef.current.map(node=>[node.id,node]));for(const node of incoming){const old=byId.get(node.id);if(!old||node.revision>=old.revision)byId.set(node.id,node);}const next=[...byId.values()];nodesRef.current=next;setNodes(next);
  },[]);
  const refresh=useCallback(async()=>{const actor=email,epoch=epochRef.current;if(!actor||readOnly)return;
    const response=await request("/api/canvas/video-nodes?includeDeleted=1",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new VideoNodeClientError(data.error||"视频节点加载失败",response.status,data.code);
    merge(Array.isArray(data.nodes)?data.nodes:[],actor,epoch);if(actorRef.current===actor&&epochRef.current===epoch){setReady(true);setError("");}
  },[email,readOnly,request,merge]);
  useEffect(()=>{epochRef.current++;nodesRef.current=[];setNodes([]);setReady(false);setError("");queues.current.clear();if(!email||readOnly){setReady(true);return;}
    let stopped=false,timer:ReturnType<typeof setTimeout>;const run=async()=>{try{await refresh();}catch(cause){if(!stopped){setReady(true);setError(cause instanceof Error?cause.message:"视频节点加载失败");}}if(!stopped)timer=setTimeout(run,6000);};void run();return()=>{stopped=true;clearTimeout(timer);};
  },[email,readOnly,refresh]);
  const save=useCallback((id:string,patch:Partial<Omit<VideoNodeWrite,"id"|"operationId">>):Promise<CanvasVideoNode>=>{
    if(!email||readOnly)return Promise.reject(new Error("无法修改此画布"));const actor=email,epoch=epochRef.current;
    const execute=async()=>{if(actorRef.current!==actor||epochRef.current!==epoch)throw new Error("账号已切换");const old=nodesRef.current.find(node=>node.id===id),expectedRevision=patch.expectedRevision??old?.revision??0;
      const response=await request(old?`/api/canvas/video-nodes/${encodeURIComponent(id)}`:"/api/canvas/video-nodes",{method:old?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...patch,id,expectedRevision,operationId:browserRandomUUID()})});
      const data=await response.json();if(!response.ok){if(response.status===409)void refresh().catch(()=>{});throw new VideoNodeClientError(data.error||"视频节点保存失败",response.status,data.code);}
      merge([data.node],actor,epoch);return data.node as CanvasVideoNode;
    };
    const before=queues.current.get(id)||Promise.resolve(),promise=before.catch(()=>{}).then(execute);queues.current.set(id,promise);void promise.finally(()=>{if(queues.current.get(id)===promise)queues.current.delete(id);}).catch(()=>{});return promise;
  },[email,readOnly,request,merge,refresh]);
  const copy=useCallback(async(ids:string[],projectKey:string)=>{if(!email||readOnly)throw new Error("无法修改此画布");const actor=email,epoch=epochRef.current;
    const response=await request("/api/canvas/video-nodes/copy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids,projectKey,operationId:browserRandomUUID()})});const data=await response.json();if(!response.ok)throw new VideoNodeClientError(data.error||"视频节点复制失败",response.status,data.code);merge(data.nodes,actor,epoch);return data.nodes as CanvasVideoNode[];
  },[email,readOnly,request,merge]);
  return {nodes:nodes.filter(node=>!node.deletedAt),allNodes:nodes,ready,error,refresh,save,copy};
}
