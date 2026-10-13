'use client';
import { authHeader } from './supabase';
import { managedImageSource, type BrowserImageDescriptor } from './browser-image-source';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const NAME='naumi-image-bytes-v1', STORE='images', META='metadata';
const MAX_BYTES=128*1024*1024, MAX_IMAGE=32*1024*1024, MAX_ITEMS=400, MAX_AGE=7*86400000;
type Row={id:string;account:string;source:string;version:string;blob:Blob;at:number;created:number;bytes:number};
type Lease={url:string;release:()=>void};
let account='',epoch=0,installed=false,localOnly=false;
let database:Promise<IDBDatabase|null>|undefined;
const pending=new Map<string,{promise:Promise<Blob>;controller:AbortController;users:number}>();
const objects=new Set<string>();
const batches=new Map<string, {resolve:(value:BrowserImageDescriptor|null)=>void;reject:(error:Error)=>void}[]>();
let batchTimer:ReturnType<typeof setTimeout>|undefined;
let channel:BroadcastChannel|undefined;
export class ImageCacheDenied extends Error {}
class ImageNotCacheable extends Error {constructor(readonly freshUrl:string){super('图片超过本地缓存上限');}}
const valid=(owner:string,generation:number)=>owner===account && generation===epoch && !!owner;
export function imageCacheAccount(){return account;}
export function imageCacheSource(raw:string){
  if(localOnly)return null;
  const source=managedImageSource(raw,typeof location==='undefined'?'http://naumi.invalid':location.origin);
  // Published branding/templates remain public and use their native immutable cache.
  return source&& !/^\/media\/(brand|library|templates|template-cache)\//.test(source)?source:null;
}
// Only an explicit successful /api/config response may opt the DB-less demo out.
export function configureBrowserImageCache(hasDatabase:boolean){if(localOnly===!hasDatabase)return;localOnly=!hasDatabase;reset();}
function openDB():Promise<IDBDatabase|null>{
  if(!database)database=new Promise(resolve=>{
    try{
      let finished=false;const request=indexedDB.open(NAME,2);
      const timer=setTimeout(()=>{finished=true;resolve(null);},1500);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});else request.transaction?.objectStore(STORE).clear();if(!request.result.objectStoreNames.contains(META))request.result.createObjectStore(META,{keyPath:'id'});};
      request.onerror=request.onblocked=()=>{clearTimeout(timer);finished=true;resolve(null);};
      request.onsuccess=()=>{clearTimeout(timer);if(finished){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
    }catch{resolve(null);}
  });return database;
}
async function read(id:string):Promise<Row|undefined>{const db=await openDB();if(!db)return;
  return new Promise(resolve=>{try{const tx=db.transaction([STORE,META]),r=tx.objectStore(STORE).get(id),m=tx.objectStore(META).get(id);tx.oncomplete=()=>resolve(r.result&&m.result?{...m.result,blob:r.result.blob}:undefined);tx.onerror=tx.onabort=()=>resolve(undefined);}catch{resolve(undefined);}});
}
async function store(row:Row,generation:number){
  const db=await openDB();if(!db||!valid(row.account,generation))return;
  await new Promise<void>(resolve=>{try{
    const tx=db.transaction([STORE,META],'readwrite'),s=tx.objectStore(STORE),meta=tx.objectStore(META),all=meta.getAll();
    all.onsuccess=()=>{
      try {
      if(!valid(row.account,generation)){tx.abort();return;}
      const rows=(all.result as Row[]).filter(r=>r.id!==row.id&&!(r.account===row.account&&r.source===row.source));
      for(const r of all.result as Row[]) if(r.account===row.account&&r.source===row.source&&r.id!==row.id){s.delete(r.id);meta.delete(r.id);}
      rows.push(row);rows.sort((a,b)=>b.at-a.at||Number(b.id===row.id)-Number(a.id===row.id));let bytes=0;
      rows.forEach((r,i)=>{bytes+=r.bytes;if(i>=MAX_ITEMS||bytes>MAX_BYTES||Date.now()-r.created>MAX_AGE){s.delete(r.id);meta.delete(r.id);}});
      const {blob,...metadata}=row;s.put({id:row.id,blob});meta.put(metadata);
      }catch{tx.abort();}
    };
    tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
  }catch{resolve();}});
}
async function purge(owner:string){const db=await openDB();if(!db)return;
  await new Promise<void>(resolve=>{try{const tx=db.transaction([STORE,META],'readwrite'),s=tx.objectStore(STORE),meta=tx.objectStore(META),r=meta.getAll();r.onsuccess=()=>{for(const row of r.result as Row[])if(row.account===owner){s.delete(row.id);meta.delete(row.id);}};tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();}catch{resolve();}});
}
function reset(){epoch++;for(const request of pending.values())request.controller.abort();pending.clear();for(const url of objects)URL.revokeObjectURL(url);objects.clear();window.dispatchEvent(new Event('naumi:image-cache-session'));}
export function activateBrowserImages(email:string|null){
  installImageObserver();const next=(email||'').trim().toLowerCase();if(next===account&&next)return;
  const previous=account;account=next;reset();
  if(previous&&previous!==next){void purge(previous);channel?.postMessage({logout:previous});}
  try{const saved=localStorage.getItem(NAME+':account');if(saved&&saved!==next)void purge(saved);if(next)localStorage.setItem(NAME+':account',next);else localStorage.removeItem(NAME+':account');}catch{}
}
export function clearBrowserImages(){const owner=account;account='';reset();if(owner){void purge(owner);channel?.postMessage({logout:owner});}try{localStorage.setItem(NAME+':logout',`${owner}:${Date.now()}`);localStorage.removeItem(NAME+':account');}catch{}}
function installImageObserver(){if(installed||typeof window==='undefined')return;installed=true;
  try{channel=new BroadcastChannel(NAME);channel.onmessage=e=>{if(e.data?.logout===account)clearBrowserImages();};}catch{}
  window.addEventListener('storage',e=>{if(e.key===NAME+':logout'&&e.newValue?.startsWith(account+':')&&account)clearBrowserImages();});
  window.addEventListener('focus',()=>{if(account)reset();});
}
function descriptor(source:string,owner:string,generation:number):Promise<BrowserImageDescriptor|null>{
  return new Promise((resolve,reject)=>{const key=owner+'\n'+generation+'\n'+source;const waiters=batches.get(key)||[];waiters.push({resolve,reject});batches.set(key,waiters);
    batchTimer??=setTimeout(()=>{batchTimer=undefined;void flushDescriptors();},12);
  });
}
async function flushDescriptors(){
  const queued=[...batches.entries()];batches.clear();
  for(let offset=0;offset<queued.length;offset+=64){const group=queued.slice(offset,offset+64),owner=account,generation=epoch;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const sources=group.map(([key])=>key.split('\n')[2]);
      const response=await fetch('/api/media/image-cache',{method:'POST',cache:'no-store',headers:{'content-type':'application/json',...await authHeader()},body:JSON.stringify({sources}),signal:controller.signal});
      if(response.status===401||response.status===403)throw new ImageCacheDenied('素材尚未授权');
      if(!response.ok)throw new Error('素材缓存暂时不可用');
      const data=await response.json();if(data.account!==owner||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
      for(const [key,waiters]of group){const [captured,capturedEpoch,source]=key.split('\n');const value=captured===owner&&Number(capturedEpoch)===generation?data.results?.[source]:null;for(const w of waiters)w.resolve(value||null);}
    }catch(error){for(const [,waiters]of group)for(const w of waiters)w.reject(error instanceof Error?error:new Error('缓存校验失败'));}finally{clearTimeout(timer);}
  }
}
async function imageBlob(source:string,signal?:AbortSignal):Promise<{blob:Blob;owner:string;generation:number}>{
  const owner=account,generation=epoch;if(!owner)throw new ImageCacheDenied('登录状态尚未验证');
  const info=await descriptor(source,owner,generation);if(signal?.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
  if(!info)throw new ImageCacheDenied('素材尚未授权或不支持缓存');
  if(info.bytes>MAX_IMAGE)throw new ImageNotCacheable(info.fetchUrl);
  const id=JSON.stringify([owner,info.source,info.version]);
  let task=pending.get(id);if(!task){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);const promise=(async()=>{
    const cached=await read(id);
    if(cached&&cached.account===owner&&cached.blob instanceof Blob&&cached.bytes===cached.blob.size&&Date.now()-cached.created<MAX_AGE){void store({...cached,at:Date.now()},generation);return cached.blob;}
    if(!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    const target=new URL(info.fetchUrl,location.origin);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('素材地址无效');
    const response=await fetch(target.href,{credentials:target.origin===location.origin?'same-origin':'omit',headers:target.origin===location.origin?await authHeader():{},cache:'no-store',signal:controller.signal});
    if([401,403,404].includes(response.status))throw new ImageCacheDenied('素材已不可用');
    if(!response.ok||response.type==='opaque'||!/^image\/(png|jpeg|webp|avif|gif)(;|$)/.test(response.headers.get('content-type')||''))throw new Error('素材响应无效');
    const reader=response.body?.getReader();if(!reader)throw new Error('素材响应为空');const parts:Uint8Array[]=[];let total=0;
    for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>MAX_IMAGE){await reader.cancel();throw new Error('素材超过缓存上限');}parts.push(new Uint8Array(chunk.value));}
    const blob=new Blob(parts,{type:info.contentType});if(!blob.size||blob.size!==info.bytes)throw new Error('素材版本已改变');
    if(/^[a-f0-9]{64}$/.test(info.version) && bytesToHex(sha256(new Uint8Array(await blob.arrayBuffer())))!==info.version)throw new Error('素材版本校验失败');
    if(controller.signal.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    await store({id,account:owner,source:info.source,version:info.version,blob,bytes:blob.size,at:Date.now(),created:Date.now()},generation);
    return blob;
  })();task={promise,controller,users:0};pending.set(id,task);const captured=task;void promise.finally(()=>{clearTimeout(timeout);if(pending.get(id)===captured)pending.delete(id);}).catch(()=>{});}
  const current=task;current.users++;let released=false;
  const leave=()=>{if(released)return;released=true;current.users--;if(!current.users&&pending.get(id)===current)current.controller.abort();};
  signal?.addEventListener('abort',leave,{once:true});
  try{const blob=await current.promise;if(signal?.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');return{blob,owner,generation};}
  finally{signal?.removeEventListener('abort',leave);leave();}
}
export async function acquireBrowserImage(raw:string,signal?:AbortSignal):Promise<Lease>{
  const source=imageCacheSource(raw);if(!source)return{url:raw,release:()=>{}};
  const owner=account,generation=epoch;
  let result:{blob:Blob;owner:string;generation:number};
  try{result=await imageBlob(source,signal);}catch(error){
    if(error instanceof ImageCacheDenied||signal?.aborted||!valid(owner,generation))throw error;
    if(error instanceof ImageNotCacheable)return{url:error.freshUrl,release:()=>{}};
    // Descriptor/storage outages fall back to the authenticated media endpoint,
    // explicitly bypassing HTTP cache. Never reuse a previous account's pixels.
    const response=await fetch(source,{cache:'no-store',headers:await authHeader(),credentials:'same-origin',signal});
    if(!response.ok||response.type==='opaque'||!/^image\/(png|jpeg|webp|avif|gif)(;|$)/.test(response.headers.get('content-type')||''))throw new ImageCacheDenied('素材暂时不可用');
    const reader=response.body?.getReader();if(!reader)throw new Error('素材响应为空');const parts:Uint8Array[]=[];let size=0;
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>MAX_IMAGE){await reader.cancel();throw new Error('素材超过浏览器缓存上限');}parts.push(new Uint8Array(chunk.value));}
    result={blob:new Blob(parts,{type:response.headers.get('content-type')!}),owner,generation};
  }
  if(signal?.aborted||!valid(result.owner,result.generation))throw new ImageCacheDenied('素材显示已取消');
  const url=URL.createObjectURL(result.blob);objects.add(url);let released=false;
  return{url,release:()=>{if(!released){released=true;objects.delete(url);URL.revokeObjectURL(url);}}};
}
export async function cachedImageBlob(raw:string){const source=imageCacheSource(raw);if(!source)throw new Error('非托管图片');return(await imageBlob(source)).blob;}
/** Editing/import needs original bytes, not a thumbnail or a fresh model call. */
export async function readBrowserImage(raw:string,signal?:AbortSignal):Promise<Blob>{
  if(raw.startsWith('data:')||raw.startsWith('blob:'))return(await fetch(raw,{signal})).blob();
  if(imageCacheSource(raw))try{return(await imageBlob(imageCacheSource(raw)!,signal)).blob;}catch(error){if(error instanceof ImageCacheDenied)throw error;}
  const response=await fetch(`/api/download?u=${encodeURIComponent(raw)}&n=input.png`,{headers:await authHeader(),cache:'no-store',signal});
  if(!response.ok)throw new Error('原图加载失败');return response.blob();
}
