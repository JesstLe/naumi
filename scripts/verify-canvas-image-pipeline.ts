import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
async function main(){
 const baseline=process.argv.includes('--baseline');
 const require=createRequire(import.meta.url),{indexedDB,IDBObjectStore}=require(process.env.NAUMI_TEST_IDB||'fake-indexeddb');
 const events=new EventTarget(),storage=new Map<string,string>();let mode='allow',actor='owner@fixture.test',network=0,active=0,maxActive=0,blobWrites=0,manifests=0;const starts:string[]=[],ends:string[]=[];
 const denied=new Set<string>(),digest=createHash('sha256').update(new Uint8Array([1,2,3,4])).digest('hex');
 const origPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:any[]){if(this.name==='images')blobWrites++;return origPut.apply(this,args)};
 const ctx=vm.createContext({Blob,URL,DOMException,AbortController,Event,EventTarget,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Buffer,Date,Map,Set,Promise,JSON,indexedDB,setTimeout,clearTimeout,console,
 location:{origin:'http://fixture.test'},BroadcastChannel:undefined,
 localStorage:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
 window:{addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)},
 fetch:async(raw:string|URL,opts:any)=>{
  const url=String(raw);
  if(url.includes('image-cache')){manifests++;const sources=JSON.parse(opts.body).sources;return{ok:mode!=='outage',status:mode==='outage'?503:200,json:async()=>({account:actor,results:Object.fromEntries(sources.map((s:string)=>[s,mode==='deny'||denied.has(s)?null:{account:actor,source:s,version:mode==='hashed'?digest:'local:v1',fetchUrl:s,bytes:4,contentType:'image/png'}]))})};}
  network++;active++;maxActive=Math.max(active,maxActive);starts.push(url);
  try{await new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,20);opts.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));},{once:true});});return{ok:true,status:200,type:'basic',headers:new Headers({'content-type':'image/png'}),body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3,4]));c.close();}})};}
  finally{active--;ends.push(url);}
 }});
 const js=(await build({stdin:{contents:'import * as m from "./src/lib/browser-image-cache";globalThis.__testCache=m;',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env':'{}'},plugins:[{name:'fixture-auth',setup(b){b.onResolve({filter:/^\.\/supabase$/},()=>({path:'fixture-auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function authHeader(){return {};}',loader:'js'}));}}]})).outputFiles[0].text;
 vm.runInContext(js,ctx);const m=(ctx as any).__testCache;m.activateBrowserImages('owner@fixture.test');
 const leases=await Promise.all(Array.from({length:24},(_,i)=>m.acquireBrowserImage('/media/'+i+'.png',undefined,{networkQueue:'canvas'})));leases.forEach((l:any)=>l.release());assert.equal(network,24);assert.equal(maxActive,6);assert.equal(manifests,1);assert.equal(blobWrites,24);
 const coldWrites=blobWrites,reads=network;const hot=await Promise.all(Array.from({length:24},(_,i)=>m.acquireBrowserImage('/media/'+i+'.png',undefined,{networkQueue:'canvas'})));hot.forEach((l:any)=>l.release());assert.equal(network,reads,'cached hit performs no media request');assert.equal(blobWrites,coldWrites,'cache hit must not rewrite Blob bytes');assert.equal(manifests,2,'new display revalidates real permissions');
 const originalVersionNetwork=network;
 mode='deny';await assert.rejects(m.acquireBrowserImage('/media/1.png',undefined,{networkQueue:'canvas'}));assert.equal(network,reads,'revoked cached image never fetches/falls back');
 mode='outage';const fallback=await m.acquireBrowserImage('/media/1.png',undefined,{networkQueue:'canvas'});fallback.release();assert.equal(network,reads+1,'503 reads fresh authenticated media');
 mode='allow';const controllers=Array.from({length:20},()=>new AbortController());const pending=controllers.map((c,i)=>m.acquireBrowserImage('/media/cancel-'+i+'.png',c.signal,{networkQueue:'canvas'}).then((l:any)=>{l.release();return true;}).catch(()=>false));controllers.forEach(c=>c.abort());await Promise.all(pending);assert.ok(maxActive<=6);
// More than the 400-entry bound, all within the same real batch implementation.
 mode='allow';const many=await Promise.all(Array.from({length:405},(_,i)=>m.acquireBrowserImage('/media/lru-'+i+'.png',undefined,{networkQueue:'canvas'})));many.forEach((l:any)=>l.release());
 const idb=await new Promise<any>(resolve=>{const r=indexedDB.open('naumi-image-bytes-v1',2);r.onsuccess=()=>resolve(r.result);});
 const count=await new Promise<number>(resolve=>{const tx=idb.transaction('metadata'),r=tx.objectStore('metadata').count();tx.oncomplete=()=>resolve(r.result);});assert.ok(count<=400,'LRU item capacity');
 const tx=idb.transaction('metadata'),all=tx.objectStore('metadata').getAll();await new Promise<void>(resolve=>{tx.oncomplete=()=>resolve();});assert.ok(all.result.reduce((s:number,r:any)=>s+r.bytes,0)<=128*1024*1024,'byte capacity');idb.close();
 const switchWork=m.acquireBrowserImage('/media/switch.png',undefined,{networkQueue:'canvas'});m.clearBrowserImages();await assert.rejects(switchWork);assert.equal(m.imageCacheAccount(),'');
 mode='hashed';m.activateBrowserImages(actor);
 const beforeDedupe=network,beforeAuth=manifests;
 const shared=await Promise.all(Array.from({length:24},(_,i)=>m.acquireBrowserImage('/media/shared-'+i+'.png',undefined,{networkQueue:'canvas'})));shared.forEach((l:any)=>l.release());
 assert.equal(network-beforeDedupe,baseline?24:1,'24 separately authorized refs preserve baseline or verified content sharing');assert.equal(manifests-beforeAuth,1);
 denied.add('/media/shared-23.png');const beforeDenied=network;
 await assert.rejects(m.acquireBrowserImage('/media/shared-23.png',undefined,{networkQueue:'canvas'}));assert.equal(network,beforeDenied,'ready shared bytes cannot bypass revoked source authorization');
 const alias=await m.acquireBrowserImage('/media/new-alias.png',undefined,{networkQueue:'canvas'});alias.release();assert.equal(network,beforeDenied+(baseline?1:0),'new alias always authorizes before baseline download or verified reuse');
 actor='other@fixture.test';m.activateBrowserImages(actor);const beforeOther=network;
 const foreign=await m.acquireBrowserImage('/media/new-alias.png',undefined,{networkQueue:'canvas'});foreign.release();assert.equal(network,beforeOther+1,'account switch cannot reuse private content pool');
 events.dispatchEvent(new Event('focus'));const beforeFocusAuth=manifests;
 const afterFocus=await m.acquireBrowserImage('/media/new-alias.png',undefined,{networkQueue:'canvas'});afterFocus.release();assert.equal(manifests,beforeFocusAuth+1,'focus invalidation still freshly authorizes');
 const corruptDB=await new Promise<any>(resolve=>{const r=indexedDB.open('naumi-image-bytes-v1',2);r.onsuccess=()=>resolve(r.result);});
 const corruptId=JSON.stringify([actor,'/media/new-alias.png',digest]);
 await new Promise<void>(resolve=>{const tx=corruptDB.transaction('images','readwrite');tx.objectStore('images').put({id:corruptId,blob:new Blob([new Uint8Array([9,9,9,9])],{type:'image/png'})});tx.oncomplete=()=>resolve();});corruptDB.close();
 // Focus intentionally retains verified in-memory bytes. Reopen a fresh module
 // against the same IDB to exercise a cold read of the corrupted disk row.
 const reopenedContext=vm.createContext({...ctx});vm.runInContext(js,reopenedContext);const reopened=(reopenedContext as any).__testCache;reopened.activateBrowserImages(actor);
 const beforeRepair=network;const repaired=await reopened.acquireBrowserImage('/media/new-alias.png',undefined,{networkQueue:'canvas'});repaired.release();assert.equal(network,beforeRepair+(baseline?0:1),'cold module baseline disk-hit behavior or modified digest repair');
 reopened.clearBrowserImages();m.clearBrowserImages();
 console.log(baseline?'BASELINE_MAIN_CACHE=PASS AUTHORIZED_REFS24_BYTE_DOWNLOADS24 NEW_ALIAS_DOWNLOADS1 ORIGINAL_DISK_HIT_BEHAVIOR=RETAINED FRESH_AUTH_REVOKE_ACCOUNT_GUARDS=PASS':'CACHE_CONTENT_DEDUPE=PASS AUTHORIZED_REFS24_BYTE_DOWNLOADS1 REVOKED_ALIAS_NO_PIXEL_READ NEW_ALIAS_FRESH_AUTH_BEFORE_REUSE ACCOUNT_SWITCH_NO_SHARED_PRIVATE_BYTES FOCUS_REVALIDATED CORRUPT_IDB_DIGEST_REFETCHED');
 console.log('CACHE_PIPELINE=PASS METADATA24_BATCHES=1 MISS_MAX_BYTES_CONCURRENCY=6 HOT_IMAGE_REQUESTS=0 HOT_BLOB_WRITES=0 FRESH_AUTH_EACH_DISPLAY=YES REVOKE=DENIED OUTAGE=FRESH_MEDIA CANCEL_SWITCH=NO_OLD_PIXELS LRU_400_AND_128MIB=PASS PROVIDER_CALLS=0');
}
main().catch(e=>{console.error(e);process.exitCode=1});
