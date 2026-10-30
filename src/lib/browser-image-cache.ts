'use client';
import { authHeader } from './supabase';
import { BrowserCacheStorage } from './browser-cache-storage';
import { MediaLoadQueue, acquireMediaSlot } from './canvas/media-loading';
import { managedImageSource, publicImageSource, type BrowserImageDescriptor } from './browser-image-source';
import { VerifiedImageContentPool, verifiedImageContentKey } from './browser-image-content';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from './saas/workspace-client';

const NAME='naumi-image-bytes-v1', STORE='images', META='metadata';
const MAX_BYTES=128*1024*1024, MAX_IMAGE=MAX_BYTES, MAX_ITEMS=400, MAX_AGE=7*86400000;
type Row={id:string;account:string;source:string;version:string;blob:Blob;at:number;created:number;bytes:number};
type Lease={url:string;release:()=>void;networkComplete?:()=>void;markDecoded?:()=>void;source?:string};
export type BrowserImageReadOptions={networkQueue?:'canvas';/** One authenticated reload after a local decode failure. */bypassCache?:boolean};
const canvasByteQueue=new MediaLoadQueue(6);
export function acquireCanvasImageByteSlot(signal?:AbortSignal){return acquireMediaSlot(canvasByteQueue,signal);}
const byteSlot=(options?:BrowserImageReadOptions,signal?:AbortSignal)=>options?.networkQueue==='canvas'?acquireMediaSlot(canvasByteQueue,signal):Promise.resolve(()=>{});
let account='',epoch=0,installed=false,localOnly=false;
const storage=new BrowserCacheStorage(NAME,2,(db,tx)=>{
  if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
  else tx?.objectStore(STORE).clear();
  if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'id'});
});
const pending=new Map<string,{promise:Promise<Blob>;controller:AbortController;users:number}>();
const verifiedContent=new VerifiedImageContentPool();
const objects=new Set<string>();
type DisplayedImage={url:string;source:string;owner:string;generation:number;workspace:number;decoded:boolean;retain:()=>Lease};
const displayed=new Map<symbol,DisplayedImage>();
const previewAsset=(source:string)=>source.startsWith('/media/')?source.split('?')[0]:source;
function invalidateDisplayedImage(source:string,owner:string){
  const affected=new Set<string>();
  for(const[key,item]of displayed)if(item.owner===owner&&previewAsset(item.source)===previewAsset(source)){
    affected.add(item.source);displayed.delete(key);if(objects.delete(item.url))URL.revokeObjectURL(item.url);
  }
  // Only a live frame causes an event; a denied cold request must not self-retry.
  for(const source of affected)window.dispatchEvent(new CustomEvent('naumi:image-cache-invalidated',{detail:{source}}));
}
// Share only currently displayed, decoded pixels, not an unbounded image history.
// Each viewer holds a lease so unmounting the canvas cannot revoke its preview.
function trackDisplayed(url:string,source:string,owner:string,dispose:()=>void):Lease{
  const key=Symbol();let users=0;
  const item:DisplayedImage={url,source,owner,generation:epoch,workspace:currentWorkspaceRevision(),decoded:false,retain:()=>{
    users++;let released=false;
    return{url,source,markDecoded:()=>{if(!released&&displayed.get(key)===item)item.decoded=true;},release:()=>{
      if(released)return;released=true;if(--users===0){displayed.delete(key);dispose();}
    }};
  }};
  displayed.set(key,item);return item.retain();
}
/** A first-frame handoff only. The receiver still authorizes its requested URL.
 * Team/enterprise resource queries are exact; only /media quality variants share. */
export function borrowActiveBrowserImage(raw:string):Lease|null{
  const source=imageCacheSource(raw);if(!source)return null;
  const owner=publicImageSource(source)?'public':account;
  const eligible=[...displayed.values()].filter(item=>item.decoded&&item.owner===owner&&valid(owner,item.generation)&&item.workspace===currentWorkspaceRevision()&&previewAsset(item.source)===previewAsset(source));
  return (eligible.find(item=>item.source===source)||eligible[0])?.retain()||null;
}
let focusCheck:{generation:number;promise:Promise<void>}|undefined;
const batches=new Map<string, {resolve:(value:BrowserImageDescriptor|null)=>void;reject:(error:Error)=>void}[]>();
let batchTimer:ReturnType<typeof setTimeout>|undefined;
let channel:BroadcastChannel|undefined;
export class ImageCacheDenied extends Error {}
class ImageNotCacheable extends Error {constructor(readonly freshUrl:string){super('图片超过本地缓存上限');}}
const valid=(owner:string,generation:number)=>(owner==='public'||owner===account) && generation===epoch && !!owner;
export function imageCacheAccount(){return account;}
export function imageCacheSource(raw:string){
  if(localOnly)return null;
  const source=managedImageSource(raw,typeof location==='undefined'?'http://naumi.invalid':location.origin);
  return source;
}
export function publicCachedImage(raw:string){const source=imageCacheSource(raw);return !!source&&publicImageSource(source);}
// Only an explicit successful /api/config response may opt the DB-less demo out.
export function configureBrowserImageCache(hasDatabase:boolean){if(localOnly===!hasDatabase)return;localOnly=!hasDatabase;reset();}
type ProbeStage={count:number;ms:number;maxMs:number};
const imageProbe:Record<string,ProbeStage>={};
export function browserImagePerformance(){return imageProbe;}
const probeOn=process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE==='1';
async function timedImageStage<T>(name:string,run:()=>Promise<T>):Promise<T>{
 if(!probeOn)return run();const start=performance.now();try{return await run();}finally{const ms=performance.now()-start,s=imageProbe[name]||{count:0,ms:0,maxMs:0};s.count++;s.ms+=ms;s.maxMs=Math.max(s.maxMs,ms);imageProbe[name]=s;}
}
// One bounded readonly transaction per ready batch. Opening one transaction per
// node serializes IndexedDB scheduling even though all blobs are already local.
const readBatch=new Map<string,Array<(row:Row|undefined)=>void>>();
let readTimer:ReturnType<typeof setTimeout>|undefined;
function read(id:string):Promise<Row|undefined>{return new Promise(resolve=>{
 const waiters=readBatch.get(id)||[];waiters.push(resolve);readBatch.set(id,waiters);
 readTimer??=setTimeout(()=>{readTimer=undefined;void flushImageReads();},4);
});}
async function flushImageReads(){
 const queued=[...readBatch.entries()];readBatch.clear();
 for(let offset=0;offset<queued.length;offset+=64){const group=queued.slice(offset,offset+64);
 const rows=await storage.run<Map<string,Row>>([STORE,META],'readonly',new Map(),(tx,result)=>{
 const collected=new Map<string,Row>();result(collected);
 for(const[id]of group){const r=tx.objectStore(STORE).get(id),m=tx.objectStore(META).get(id);
 const collect=()=>{if(r.readyState==='done'&&m.readyState==='done'&&r.result&&m.result)collected.set(id,{...m.result,blob:r.result.blob});};r.onsuccess=collect;m.onsuccess=collect;}
 });
 for(const[id,waiters]of group)for(const done of waiters)done(rows.get(id));
 }
}

type StoreRequest={row:Row;generation:number;done:()=>void};
const storeBatch:StoreRequest[]=[];let storeTimer:ReturnType<typeof setTimeout>|undefined;
function store(row:Row,generation:number):Promise<void>{return new Promise(done=>{
 if(!valid(row.account,generation)){done();return;}storeBatch.push({row,generation,done});
 storeTimer??=setTimeout(()=>{storeTimer=undefined;void flushImageStores();},16);
});}
async function flushImageStores(){
 const queued=storeBatch.splice(0);
 for(let offset=0;offset<queued.length;offset+=64){const group=queued.slice(offset,offset+64);
 await storage.run<void>([STORE,META],'readwrite',undefined,tx=>{
 const images=tx.objectStore(STORE),meta=tx.objectStore(META),all=meta.getAll();
 all.onsuccess=()=>{try{
 const accepted=group.filter(r=>valid(r.row.account,r.generation));
 const rows=new Map((all.result as Row[]).map(r=>[r.id,r]));
 for(const{row}of accepted){for(const old of rows.values())if(old.account===row.account&&old.source===row.source&&old.id!==row.id)rows.delete(old.id);rows.set(row.id,row);}
 const arrivals=new Map(accepted.map((r,i)=>[r.row.id,i+1]));
 const ordered=[...rows.values()].sort((a,b)=>b.at-a.at||(arrivals.get(b.id)||0)-(arrivals.get(a.id)||0));let bytes=0;const retain=new Set<string>();
 ordered.forEach((r,i)=>{bytes+=r.bytes;if(i<MAX_ITEMS&&bytes<=MAX_BYTES&&Date.now()-r.created<=MAX_AGE)retain.add(r.id);});
 for(const r of all.result as Row[])if(!retain.has(r.id)){images.delete(r.id);meta.delete(r.id);}
 for(const{row}of accepted){if(!retain.has(row.id))continue;const{blob,...metadata}=row;images.put({id:row.id,blob});meta.put(metadata);}
 }catch{tx.abort();}};
 });group.forEach(r=>r.done());
 }
}
/** Cache hits only update LRU metadata. Rewriting an unchanged Blob serializes
 * every visible node on the IndexedDB writer and retranscribes image bytes. */
const touches=new Map<string,{row:Row;generation:number}>();
let touchTimer:ReturnType<typeof setTimeout>|undefined;
async function touch(row:Row,generation:number){
 if(!valid(row.account,generation))return;touches.set(row.id,{row,generation});
 touchTimer??=setTimeout(()=>{touchTimer=undefined;void flushImageTouches();},16);
}
async function flushImageTouches(){
 const queued=[...touches.values()];touches.clear();
 for(let offset=0;offset<queued.length;offset+=64){const group=queued.slice(offset,offset+64);
 await storage.run<void>(META,'readwrite',undefined,tx=>{const meta=tx.objectStore(META);
 for(const{row,generation}of group){if(!valid(row.account,generation))continue;const r=meta.get(row.id);
 r.onsuccess=()=>{if(valid(row.account,generation)&&r.result)meta.put({...r.result,at:Date.now()});};}
 });
 }
}
async function purge(owner:string){
 await storage.run<void>([STORE,META],'readwrite',undefined,tx=>{const s=tx.objectStore(STORE),meta=tx.objectStore(META),r=meta.getAll();
 r.onsuccess=()=>{for(const row of r.result as Row[])if(row.account===owner){s.delete(row.id);meta.delete(row.id);}};});
}
function discard(id:string){return storage.run<void>([STORE,META],'readwrite',undefined,tx=>{
 tx.objectStore(STORE).delete(id);tx.objectStore(META).delete(id);
});}

function reset(){epoch++;verifiedContent.clear();for(const request of pending.values())request.controller.abort();pending.clear();for(const url of objects)URL.revokeObjectURL(url);objects.clear();displayed.clear();window.dispatchEvent(new Event('naumi:image-cache-session'));}
// Focus is not an identity change. Keep the decoded pixels while the existing
// authenticated manifest checks permission; never download image bytes here.
function revalidateDisplayedImages(){
  if(!account||localOnly)return;
  const owner=account,generation=epoch;
  if(focusCheck?.generation===generation)return;
  const sources=[...new Set([...displayed.values()].filter(item=>item.owner===owner).map(item=>item.source))];
  if(!sources.length)return;
  const promise=(async()=>{
    await Promise.all(sources.map(async source=>{
      try{
        const info=await descriptor(source,owner,generation);
        if(!valid(owner,generation)||info)return;
        // A confirmed per-resource denial removes only that resource. New
        // leases acquired after this check began must still pass the manifest.
        invalidateDisplayedImage(source,owner);
      }catch(error){
        if(valid(owner,generation)&&error instanceof ImageCacheDenied)clearBrowserImages();
        // Offline, timeout, rate limit and 5xx are not proof of lost access.
      }
    }));
  })();
  focusCheck={generation,promise};
  void promise.finally(()=>{if(focusCheck?.promise===promise)focusCheck=undefined;});
}
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
  window.addEventListener('focus',revalidateDisplayedImages);
  window.addEventListener(WORKSPACE_SELECTION,reset);
}
function descriptor(source:string,owner:string,generation:number):Promise<BrowserImageDescriptor|null>{
  return new Promise((resolve,reject)=>{const key=owner+'\n'+generation+'\n'+source;const waiters=batches.get(key)||[];waiters.push({resolve,reject});batches.set(key,waiters);
    batchTimer??=setTimeout(()=>{batchTimer=undefined;void flushDescriptors();},12);
  });
}
async function flushDescriptors(){
  const all=[...batches.entries()];batches.clear();
  const partitions=new Map<string,typeof all>();for(const entry of all){const owner=entry[0].split('\n')[0];const group=partitions.get(owner)||[];group.push(entry);partitions.set(owner,group);}
  for(const [partition,queued]of partitions){
  for(let offset=0;offset<queued.length;){
    const group:typeof queued=[];let bodyBytes=32;
    while(offset<queued.length&&group.length<64){const next=queued[offset];const bytes=new TextEncoder().encode(JSON.stringify(next[0].split('\n')[2])).length+1;if(group.length&&bodyBytes+bytes>12000)break;group.push(next);offset++;bodyBytes+=bytes;}
    const generation=epoch;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const sources=group.map(([key])=>key.split('\n')[2]);
      const publicOnly=partition==='public';
      const response=await fetch(publicOnly?'/api/public-image-cache':'/api/media/image-cache',{method:'POST',cache:'no-store',credentials:publicOnly?'omit':'same-origin',headers:{'content-type':'application/json',...(publicOnly?{}:await authHeader())},body:JSON.stringify({sources}),signal:controller.signal});
      if(response.status===401||response.status===403)throw new ImageCacheDenied('素材尚未授权');
      if(!response.ok)throw new Error('素材缓存暂时不可用');
      const data=await response.json();
      if(!data||typeof data.account!=='string'||!data.results||typeof data.results!=='object'||Array.isArray(data.results)||sources.some(source=>!Object.prototype.hasOwnProperty.call(data.results,source)))throw new Error('素材校验响应不完整');
      if(sources.some(source=>{const value=data.results[source];return value!==null&&(!value||typeof value!=='object'||value.account!==data.account||value.source!==source||typeof value.version!=='string'||!value.version||typeof value.fetchUrl!=='string'||!value.fetchUrl||typeof value.bytes!=='number'||!Number.isFinite(value.bytes)||value.bytes<0||typeof value.contentType!=='string');}))throw new Error('素材校验响应无效');
      if(data.account!==partition||!valid(partition,generation))throw new ImageCacheDenied('登录状态已改变');
      for(const [key,waiters]of group){const [captured,capturedEpoch,source]=key.split('\n');const value=captured===partition&&Number(capturedEpoch)===generation?data.results?.[source]:null;for(const w of waiters)w.resolve(value||null);}
    }catch(error){for(const [,waiters]of group)for(const w of waiters)w.reject(error instanceof Error?error:new Error('缓存校验失败'));}finally{clearTimeout(timer);}
  }
  }
}
async function imageBlob(source:string,signal?:AbortSignal,options?:BrowserImageReadOptions):Promise<{blob:Blob;owner:string;generation:number}>{
  const owner=publicImageSource(source)?'public':account,generation=epoch;if(!owner)throw new ImageCacheDenied('登录状态尚未验证');
  const info=await timedImageStage("authorization",()=>descriptor(source,owner,generation));if(signal?.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
  if(!info){invalidateDisplayedImage(source,owner);throw new ImageCacheDenied('素材尚未授权或不支持缓存');}
  if(info.bytes>MAX_IMAGE)throw new ImageNotCacheable(info.fetchUrl);
  const id=JSON.stringify([owner,info.source,info.version]);
  const contentKey=verifiedImageContentKey(info,owner,generation);
  const pendingKey=options?.bypassCache?'reload:'+id:id;
  let task=pending.get(pendingKey);if(!task||task.controller.signal.aborted){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);const promise=(async()=>{
    if(options?.bypassCache)void discard(id);
    const cached=options?.bypassCache?undefined:await timedImageStage("idbRead",()=>read(id));
    if(cached&&cached.account===owner&&cached.blob instanceof Blob&&cached.bytes===cached.blob.size&&(info.bytes===0||cached.blob.size===info.bytes)&&Date.now()-cached.created<MAX_AGE){
      // A source-keyed disk hit may be shared only after its actual digest and
      // length match this freshly authorized descriptor. Never trust IDB alone.
      let verified=false;
      try{verified=!contentKey||bytesToHex(sha256(new Uint8Array(await cached.blob.arrayBuffer())))===info.version;}catch{/* unreadable local bytes are a cache miss */}
      if(!verified)void discard(id);
      if(verified){void touch(cached,generation);if(contentKey&&valid(owner,generation)&&!controller.signal.aborted)verifiedContent.remember(contentKey,cached.blob);return cached.blob;}
    }
    if(!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    const download=async(downloadSignal:AbortSignal)=>{
    const target=new URL(info.fetchUrl,location.origin);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('素材地址无效');
    const releaseSlot=await timedImageStage("slotWait",()=>byteSlot(options,downloadSignal));
    try {
    if(!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    const response=await fetch(target.href,{credentials:target.origin===location.origin?'same-origin':'omit',headers:target.origin===location.origin?await authHeader():{},cache:'no-store',signal:downloadSignal});
    if([401,403,404].includes(response.status))throw new ImageCacheDenied('素材已不可用');
    if(!response.ok||response.type==='opaque'||!/^image\/(png|jpeg|webp|avif|gif)(;|$)/.test(response.headers.get('content-type')||''))throw new Error('素材响应无效');
    const reader=response.body?.getReader();if(!reader)throw new Error('素材响应为空');const parts:Uint8Array<ArrayBuffer>[]=[];let total=0;
    for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>MAX_IMAGE){await reader.cancel();throw new Error('素材超过缓存上限');}parts.push(new Uint8Array(chunk.value));}
    const blob=new Blob(parts,{type:info.contentType});if(!blob.size||(info.bytes>0&&blob.size!==info.bytes))throw new Error('素材版本已改变');
    if(/^[a-f0-9]{64}$/.test(info.version) && bytesToHex(sha256(new Uint8Array(await blob.arrayBuffer())))!==info.version)throw new Error('素材版本校验失败');
    if(downloadSignal.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    return blob;
    }finally{releaseSlot();}
    };
    const blob=contentKey&&!options?.bypassCache?await verifiedContent.acquire(contentKey,source,download,controller.signal):await download(controller.signal);
    if(controller.signal.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    void timedImageStage("idbStore",()=>store({id,account:owner,source:info.source,version:info.version,blob,bytes:blob.size,at:Date.now(),created:Date.now()},generation));
    return blob;
  })();task={promise,controller,users:0};pending.set(pendingKey,task);const captured=task;void promise.finally(()=>{clearTimeout(timeout);if(pending.get(pendingKey)===captured)pending.delete(pendingKey);}).catch(()=>{});}
  const current=task;current.users++;let released=false;
  const leave=()=>{if(released)return;released=true;current.users--;if(!current.users&&pending.get(pendingKey)===current)current.controller.abort();};
  signal?.addEventListener('abort',leave,{once:true});
  try{const blob=await current.promise;if(signal?.aborted||!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');return{blob,owner,generation};}
  finally{signal?.removeEventListener('abort',leave);leave();}
}
export async function acquireBrowserImage(raw:string,signal?:AbortSignal,options?:BrowserImageReadOptions):Promise<Lease>{
  const source=imageCacheSource(raw);if(!source)return{url:raw,release:()=>{}};
  const owner=publicImageSource(source)?'public':account,generation=epoch;
  let result:{blob:Blob;owner:string;generation:number};
  try{result=await imageBlob(source,signal,options);}catch(error){
    if(error instanceof ImageCacheDenied||signal?.aborted||!valid(owner,generation))throw error;
    if(error instanceof ImageNotCacheable){const releaseSlot=await byteSlot(options,signal),url=error.freshUrl;
      if(signal?.aborted||!valid(owner,generation)){releaseSlot();throw new ImageCacheDenied('素材显示已取消');}
      // Direct, non-Blob URLs can expire; they are never offered as active previews.
      const lease=trackDisplayed(url,source,owner,releaseSlot);
      return{url,source,release:lease.release,networkComplete:releaseSlot};}
    // Descriptor/storage outages fall back to the authenticated media endpoint,
    // explicitly bypassing HTTP cache. Never reuse a previous account's pixels.
    const releaseSlot=await byteSlot(options,signal);
    try{
    if(!valid(owner,generation))throw new ImageCacheDenied('登录状态已改变');
    const response=await fetch(source,{cache:'no-store',headers:await authHeader(),credentials:'same-origin',signal});
    if(!response.ok||response.type==='opaque'||!/^image\/(png|jpeg|webp|avif|gif)(;|$)/.test(response.headers.get('content-type')||''))throw new ImageCacheDenied('素材暂时不可用');
    const reader=response.body?.getReader();if(!reader)throw new Error('素材响应为空');const parts:Uint8Array<ArrayBuffer>[]=[];let size=0;
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>MAX_IMAGE){await reader.cancel();throw new Error('素材超过浏览器缓存上限');}parts.push(new Uint8Array(chunk.value));}
    result={blob:new Blob(parts,{type:response.headers.get('content-type')!}),owner,generation};
    }finally{releaseSlot();}
  }
  if(signal?.aborted||!valid(result.owner,result.generation))throw new ImageCacheDenied('素材显示已取消');
  const url=URL.createObjectURL(result.blob);objects.add(url);
  return trackDisplayed(url,source,result.owner,()=>{if(objects.delete(url))URL.revokeObjectURL(url);});
}
export async function cachedImageBlob(raw:string){const source=imageCacheSource(raw);if(!source)throw new Error('非托管图片');return(await imageBlob(source)).blob;}
/** Editing/import needs original bytes, not a thumbnail or a fresh model call. */
export async function readBrowserImage(raw:string,signal?:AbortSignal):Promise<Blob>{
  if(raw.startsWith('data:')||raw.startsWith('blob:'))return(await fetch(raw,{signal})).blob();
  if(imageCacheSource(raw))try{return(await imageBlob(imageCacheSource(raw)!,signal)).blob;}catch(error){if(error instanceof ImageCacheDenied)throw error;}
  const response=await fetch(`/api/download?u=${encodeURIComponent(raw)}&n=input.png`,{headers:await authHeader(),cache:'no-store',signal});
  if(!response.ok)throw new Error('原图加载失败');return response.blob();
}
