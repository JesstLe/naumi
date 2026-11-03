"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readNodeList, useNodeListRead } from "../use-node-list-read";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type { CanvasAudioNode, AudioNodeWrite } from "@/lib/canvas/audio-node-schema";
import type { VideoPrivateFetch } from "../video/use-video-nodes";

export class AudioClientError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
export function useAudioNodes({ email, readOnly, request }: { email?: string; readOnly: boolean; request: VideoPrivateFetch }) {
  const [allNodes, setNodes] = useState<CanvasAudioNode[]>([]), [error, setError] = useState(""),[pending,setPending]=useState(0);
  const nodesRef = useRef(allNodes), identity = useRef({ email, readOnly, epoch: 0 }), queues = useRef(new Map<string, Promise<unknown>>()), attempts = useRef(new Map<string,string>()); nodesRef.current = allNodes;
  if (identity.current.email !== email || identity.current.readOnly !== readOnly) identity.current = { email, readOnly, epoch: identity.current.epoch + 1 };
  const epoch = identity.current.epoch;
  const merge = useCallback((incoming: CanvasAudioNode[], expected: number) => {
    if (expected !== identity.current.epoch) return;
    const map = new Map(nodesRef.current.map(node => [node.id, node])); let changed = false;
    for (const node of incoming) { const old = map.get(node.id); if (!old || old.revision < node.revision) { map.set(node.id, node); changed = true; } }
    if (changed) { nodesRef.current = [...map.values()]; setNodes(nodesRef.current); }
  }, []);
  const read = useCallback((signal: AbortSignal) => readNodeList<CanvasAudioNode>(request,
    `/api/canvas/audio-nodes?includeDeleted=1&email=${encodeURIComponent(email || "")}`, signal,
    (message, status, code) => new AudioClientError(message, status, code)), [email, epoch, request]);
  const acceptRead = useCallback((incoming: CanvasAudioNode[]) => merge(incoming, epoch), [merge, epoch]);
  const { ready, readError, loading, refresh } = useNodeListRead({
    identityKey: JSON.stringify([email, readOnly, epoch]), enabled: !!email, read, accept: acceptRead,
  });
  useEffect(() => {
    nodesRef.current = []; setNodes([]); setError(""); setPending(0); queues.current.clear(); attempts.current.clear();
  }, [email, epoch]);
  const save = useCallback((id: string, patch: Partial<Omit<AudioNodeWrite, "id" | "operationId">>): Promise<CanvasAudioNode> => {
    if(!email||readOnly)return Promise.reject(new Error("画布账号或编辑状态已改变"));setPending(value=>value+1);
    const execute = async () => {
      if (!email || readOnly || identity.current.epoch !== epoch) throw new Error("画布账号或编辑状态已改变");
      const old = nodesRef.current.find(node => node.id === id), input={...patch,id,expectedRevision:patch.expectedRevision??old?.revision??0},fingerprint=JSON.stringify([email,epoch,input]);
      let operationId=attempts.current.get(fingerprint);if(!operationId){operationId=browserRandomUUID();attempts.current.set(fingerprint,operationId);}
      const response = await request(old ? `/api/canvas/audio-nodes/${encodeURIComponent(id)}` : "/api/canvas/audio-nodes", {
        method: old ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, operationId }),
      }), data = await response.json();
      if (!response.ok) { if (response.status === 409) void refresh().catch(() => {}); throw new AudioClientError(data.error || "音频保存失败", response.status, data.code); }
      attempts.current.delete(fingerprint);if (identity.current.epoch !== epoch) throw new Error("音频已保存，画布账号已切换"); merge([data.node], epoch); return data.node as CanvasAudioNode;
    };
    const previous = queues.current.get(id) || Promise.resolve(), promise = previous.catch(() => {}).then(execute); queues.current.set(id, promise);
    void promise.finally(() => { if (queues.current.get(id) === promise) queues.current.delete(id);if(identity.current.epoch===epoch)setPending(value=>Math.max(0,value-1)); }).catch(() => {}); return promise;
  }, [email, readOnly, epoch, request, refresh, merge]);
  const render = useCallback(async (id:string, expectedRevision:number, operationId:string) => {
    if(!email||readOnly||identity.current.epoch!==epoch)throw new Error("画布账号或编辑状态已改变");
    const response=await request(`/api/canvas/audio-nodes/${encodeURIComponent(id)}/render`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedRevision,operationId})}),data=await response.json();
    if(!response.ok){if(response.status===409)void refresh().catch(()=>{});throw new AudioClientError(data.error||"音频处理尚未核实，请使用同一操作重试",response.status,data.code);}
    if(identity.current.epoch!==epoch)throw new Error("音频处理已受理，画布账号已切换");merge([data.node],epoch);return data;
  },[email,readOnly,epoch,request,refresh,merge]);
  const getNode = useCallback((id: string) => nodesRef.current.find(node => node.id === id), []);
  const flush = useCallback(() => Promise.all([...queues.current.values()]), []);
  return { nodes: useMemo(() => allNodes.filter(node => !node.deletedAt), [allNodes]), allNodes, ready, readError, loading, error:error||readError,saving:pending>0, refresh, save, render, getNode, flush };
}
