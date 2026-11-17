import type {FileHandle} from 'node:fs/promises';
import {WorkflowError} from './contracts';
import {verifiedDeliveryFile} from './delivery-files';
import {rasterPreviewType} from './source-files';

const maxActive=4,maxWaiting=24,maxWaitMs=5000;
let active=0;
const waiting=new Set<()=>void>();
const busy=()=>new WorkflowError(503,'ASSET_READ_BUSY');
function enter(signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 if(active<maxActive){active++;return Promise.resolve();}
 if(waiting.size>=maxWaiting)throw busy();
 return new Promise((resolve,reject)=>{
  const clean=()=>{clearTimeout(timer);waiting.delete(admit);signal?.removeEventListener('abort',abort);};
  const admit=()=>{clean();active++;resolve();};
  const abort=()=>{clean();reject(signal?.reason);};
  const timer=setTimeout(()=>{clean();reject(busy());},maxWaitMs);timer.unref();
  waiting.add(admit);signal?.addEventListener('abort',abort,{once:true});
 });
}
function leave(){active--;waiting.values().next().value?.();}

/** Keep the slot until the caller's final authorization/audit completes and the handle is ready to stream. */
export async function openWorkflowMedia(root:string,enterprise:string,hash:string,bytes:number,preview:boolean,signal?:AbortSignal){
 if(preview&&bytes>8*1024*1024)throw new WorkflowError(413,'ASSET_PREVIEW_UNAVAILABLE');
 await enter(signal);
 let handle:FileHandle|undefined;
 try{
  handle=await verifiedDeliveryFile(root,enterprise,hash,bytes,signal);
  let mime='application/octet-stream';
  if(preview){const head=Buffer.alloc(Math.min(bytes,64*1024));let offset=0;
   while(offset<head.length){signal?.throwIfAborted();const r=await handle.read(head,offset,head.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
   const png=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=head[0]===255&&head[1]===216&&head[2]===255;
   if(!png&&!jpeg)throw new WorkflowError(415,'ASSET_PREVIEW_NOT_SUPPORTED');
   const type=rasterPreviewType(head);if(!type)throw new WorkflowError(413,'ASSET_PREVIEW_UNAVAILABLE');mime=type;
  }
  signal?.throwIfAborted();return {handle,mime,release:leave};
 }catch(e){try{await handle?.close();}finally{leave();}throw e;}
}
