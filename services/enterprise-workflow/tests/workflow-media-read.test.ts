import assert from 'node:assert/strict';
import {once} from 'node:events';
import {open,type FileHandle} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {openWorkflowMedia} from '../src/workflow-media-read';
import type {createWorkflowServer} from '../src/server';

type Gate={started:Promise<void>;closed:Promise<void>;resume:()=>void};
function latch(){let release!:()=>void;const done=new Promise<void>(r=>release=r);return {done,release};}
const within=<T,>(p:Promise<T>)=>Promise.race([p,delay(2500,undefined,{ref:false}).then(()=>{throw Error('MEDIA_FIXTURE_TIMEOUT');})]);

// Pause the real FileHandle hash stream before its first filesystem read. It still must close on abort.
async function stallHashes(path:string,run:(next:()=>Gate)=>Promise<void>){
 const probe=await open(path,'r'),proto=Object.getPrototypeOf(probe) as FileHandle,create=proto.createReadStream;await probe.close();
 const waiting:((stream:ReturnType<FileHandle['createReadStream']>)=>void)[]=[],live:Gate[]=[];
 proto.createReadStream=function(this:FileHandle,...args:Parameters<FileHandle['createReadStream']>){
  const stream=create.apply(this,args);if(args[0]?.autoClose===false)waiting.shift()?.(stream);return stream;
 };
 try{await run(()=>{
  const entered=latch(),closed=latch();let permit=false,read:(()=>void)|undefined;
  const g={started:entered.done,closed:closed.done,resume:()=>{permit=true;read?.();}};live.push(g);
  waiting.push(stream=>{const underlying=stream._read.bind(stream);stream.once('close',closed.release);
   stream._read=size=>{if(permit)underlying(size);else{read=()=>{if(!stream.destroyed)underlying(size);};entered.release();}};
  });return g;
 });}finally{proto.createReadStream=create;live.forEach(g=>g.resume());}
}

export async function assertHttpHashAbort(server:ReturnType<typeof createWorkflowServer>,path:string,blob:string,expected:Buffer,auditCount:()=>Promise<number>){
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();assert(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}${path}`;
 const before=await auditCount();
 try{await stallHashes(blob,async next=>{
  const gate=next(),control=new AbortController(),pending=fetch(url,{signal:control.signal}).then(r=>r,err=>err);
  await within(gate.started);control.abort();assert.equal((await within(pending)).name,'AbortError');
  await within(gate.closed);assert.equal(await auditCount(),before);
  const retry=await within(fetch(url));assert.equal(retry.status,200);assert.deepEqual(Buffer.from(await retry.arrayBuffer()),expected);assert.equal(await auditCount(),before+1);
 });}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

export async function assertMediaReadCapacity(root:string,enterprise:string,sha:string,bytes:number,blob:string){
 await stallHashes(blob,async next=>{
  const gates=Array.from({length:4},next),read=()=>openWorkflowMedia(root,enterprise,sha,bytes,false);
  const active=Array.from({length:4},read);await within(Promise.all(gates.map(g=>g.started)));
  const controllers=Array.from({length:24},()=>new AbortController());
  const queued=controllers.map(c=>openWorkflowMedia(root,enterprise,sha,bytes,false,c.signal).catch(e=>e));
  try{await assert.rejects(read(),{code:'ASSET_READ_BUSY',status:503});}
  finally{for(const c of controllers)c.abort();for(const g of gates)g.resume();}
  assert.equal((await within(Promise.all(queued))).filter(error=>error.name==='AbortError').length,24);
  const handles=await within(Promise.all(active));for(const f of handles){await f.handle.close();f.release();}
  const again=await within(read());await again.handle.close();again.release();
 });
}
