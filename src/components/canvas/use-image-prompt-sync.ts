'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePromptClient, type ImagePromptAddress } from '@/lib/canvas/image-prompt-client';
import type { ImagePromptDocument } from '@/lib/canvas/image-prompt-schema';
import { authHeader } from '@/lib/supabase';

type Options = {
  owner: string; ownerRevision?:number; address: ImagePromptAddress | null; document: ImagePromptDocument | null;
  request: (input: string, init?: RequestInit) => Promise<Response>;
  hydrate: (document: ImagePromptDocument) => void | Promise<void>;
};
/** Persistence is independent from editor selection. A pending node has no
 * address until the native canvas creates an actual owned artwork. */
export function useImagePromptSync({ owner, ownerRevision=0, address, document, request, hydrate }: Options) {
  const identity = useRef({ owner, ownerRevision, epoch: 0 });
  if (identity.current.owner !== owner||identity.current.ownerRevision!==ownerRevision) identity.current = { owner,ownerRevision, epoch: identity.current.epoch + 1 };
  const epoch = identity.current.epoch;
  const [, render] = useState(0);
  const client = useMemo(() => {
    const current=()=>identity.current.owner===owner&&identity.current.epoch===epoch;
    return new ImagePromptClient(async(input,init)=>{
      const auth=await authHeader();
      if(!current())throw new Error('账号或工作空间已切换，未继续保存');
      const headers=new Headers(auth);new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));
      if(!init?.method||init.method==='GET')headers.delete('x-naumi-workspace');
      return request(input,{...init,headers});
    },current,()=>render(n=>n+1),650,()=>{try{return window.sessionStorage;}catch{return null;}});
  }, [owner, epoch,request]);
  const key = address ? JSON.stringify([owner, address.projectKey, address.nodeId]) : null;
  const latest = useRef({ key, document, hydrate }); latest.current = { key, document, hydrate };
  const [loaded, setLoaded] = useState<{ key: string; client: ImagePromptClient } | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { client.activate(); return () => client.dispose(); }, [client]);
  useEffect(() => {
    if (!key || !address) return;
    let stopped = false; setLoadError(null);
    void client.open(key, address).then(async receipt => {
      if (stopped || latest.current.key !== key) return;
      if (receipt.document) await latest.current.hydrate(receipt.document);
      if (stopped || latest.current.key !== key) return;
      setLoaded({ key,client });
    }).catch(error => { if (!stopped) setLoadError({ key, message: error instanceof Error ? error.message : '提示词读取失败' }); });
    return () => { stopped = true; };
  // address is fully represented by key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, retry]);
  const ready = !key || loaded?.key === key&&loaded.client===client;
  const serialized = JSON.stringify(document);
  useEffect(() => {
    if (!key || !document || !ready) return;
    client.edit(key, document);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serialized, ready, loaded, client]);
  return {
    ready, persisted:client.persisted(key), workspace:client.workspace(key)||address?.workspace, error: key ? loadError?.key === key ? loadError.message : client.error(key) : null,
    flush: async () => {
      if (key && !ready) throw new Error('提示词正在读取，请稍后重试');
      if (key && latest.current.document) client.edit(key, latest.current.document);
      await client.flush();
    },
    retry: () => { setRetry(n => n + 1); if (key && ready) void client.flushKey(key).catch(() => {}); },
    reloadSaved: async () => {
      if(!key||!address)return;
      const receipt=await client.reloadSaved(key,address);
      if(latest.current.key!==key)return;
      if(receipt.document)await latest.current.hydrate(receipt.document);
      setLoadError(null);setLoaded({key,client});
    },
    appendReference: async (target: ImagePromptAddress, id: string) => {
      const targetKey=JSON.stringify([owner,target.projectKey,target.nodeId]);
      const receipt=await client.open(targetKey,target),base=receipt.document;
      if(!base)throw new Error('请先保存当前提示词，再添加参考图');
      const refKey=`node:${id}`;
      const bindings=base.bindings.some(binding=>binding.key===refKey)?base.bindings:[...base.bindings,{key:refKey,number:Math.max(0,...base.bindings.map(binding=>binding.number))+1,role:'reference' as const}];
      const next={...base,bindings,activeKeys:[...new Set([...base.activeKeys,refKey])],additionalKeys:[...new Set([...(base.additionalKeys||[]),refKey])],hiddenReferenceIds:base.hiddenReferenceIds.filter(hidden=>hidden!==id)};
      client.edit(targetKey,next);await client.flushKey(targetKey);return next;
    },

  };
}
