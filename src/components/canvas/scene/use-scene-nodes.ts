"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type { CanvasSceneNode, SceneNodeWrite } from "@/lib/canvas/scene-node-schema";
import type { VideoPrivateFetch } from "../video/use-video-nodes";

export class SceneClientError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
export function useSceneNodes({ email, readOnly, request }: { email?: string; readOnly: boolean; request: VideoPrivateFetch }) {
  const [allNodes, setNodes] = useState<CanvasSceneNode[]>([]), [ready, setReady] = useState(false), [error, setError] = useState(""),[pending,setPending]=useState(0);
  const nodesRef = useRef(allNodes), identity = useRef({ email, readOnly, epoch: 0 }), queues = useRef(new Map<string, Promise<unknown>>()), attempts = useRef(new Map<string,string>()); nodesRef.current = allNodes;
  if (identity.current.email !== email || identity.current.readOnly !== readOnly) identity.current = { email, readOnly, epoch: identity.current.epoch + 1 };
  const epoch = identity.current.epoch;
  const merge = useCallback((incoming: CanvasSceneNode[], expected: number) => {
    if (expected !== identity.current.epoch) return;
    const map = new Map(nodesRef.current.map(node => [node.id, node])); let changed = false;
    for (const node of incoming) { const old = map.get(node.id); if (!old || old.revision < node.revision) { map.set(node.id, node); changed = true; } }
    if (changed) { nodesRef.current = [...map.values()]; setNodes(nodesRef.current); }
  }, []);
  const refresh = useCallback(async () => {
    if (!email) return; const response = await request(`/api/canvas/scene-nodes?includeDeleted=1&email=${encodeURIComponent(email)}`, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new SceneClientError(data.error || "场景加载失败", response.status);
    if (identity.current.epoch === epoch) { merge(data.nodes || [], epoch); setReady(true); setError(""); }
  }, [email, epoch, request, merge]);
  useEffect(() => {
    nodesRef.current = []; setNodes([]); setError("");setPending(0); setReady(!email); queues.current.clear(); attempts.current.clear(); let stopped = false;
    const load = () => { if (!email) return; void refresh().catch(cause => { if (!stopped && identity.current.epoch === epoch) { setReady(true); setError(cause instanceof Error ? cause.message : "场景加载失败"); } }); };
    load(); const resume = () => { if (document.visibilityState === "visible") load(); }; window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [email, epoch, refresh]);
  const save = useCallback((id: string, patch: Partial<Omit<SceneNodeWrite, "id" | "operationId">>): Promise<CanvasSceneNode> => {
    if(!email||readOnly)return Promise.reject(new Error("画布账号或编辑状态已改变"));setPending(value=>value+1);
    const execute = async () => {
      if (!email || readOnly || identity.current.epoch !== epoch) throw new Error("画布账号或编辑状态已改变");
      const old = nodesRef.current.find(node => node.id === id), input={...patch,id,expectedRevision:patch.expectedRevision??old?.revision??0},fingerprint=JSON.stringify([email,epoch,input]);
      let operationId=attempts.current.get(fingerprint);if(!operationId){operationId=browserRandomUUID();attempts.current.set(fingerprint,operationId);}
      const response = await request(old ? `/api/canvas/scene-nodes/${encodeURIComponent(id)}` : "/api/canvas/scene-nodes", {
        method: old ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, operationId }),
      }), data = await response.json();
      if (!response.ok) { if (response.status === 409) void refresh().catch(() => {}); throw new SceneClientError(data.error || "场景保存失败", response.status, data.code); }
      attempts.current.delete(fingerprint);if (identity.current.epoch !== epoch) throw new Error("场景已保存，画布账号已切换"); merge([data.node], epoch); return data.node as CanvasSceneNode;
    };
    const previous = queues.current.get(id) || Promise.resolve(), promise = previous.catch(() => {}).then(execute); queues.current.set(id, promise);
    void promise.finally(() => { if (queues.current.get(id) === promise) queues.current.delete(id);if(identity.current.epoch===epoch)setPending(value=>Math.max(0,value-1)); }).catch(() => {}); return promise;
  }, [email, readOnly, epoch, request, refresh, merge]);
  const getNode = useCallback((id: string) => nodesRef.current.find(node => node.id === id), []);
  const flush = useCallback(() => Promise.all([...queues.current.values()]), []);
  const accept=(incoming:CanvasSceneNode[],current:()=>boolean)=>{if(current())merge(incoming,epoch);};
  return {accept, nodes: useMemo(() => allNodes.filter(node => !node.deletedAt), [allNodes]), allNodes, ready, error,saving:pending>0, refresh, save, getNode, flush };
}
