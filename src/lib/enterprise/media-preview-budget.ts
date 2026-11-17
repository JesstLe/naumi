import 'server-only';

// Bound retained input buffers and concurrent libvips work in the Web process.
// Authorization is already complete when a renderer joins this queue.
const parallel=4, backlog=24, maxWaitMs=5000;
let active=0;
const waiting:Array<()=>void>=[];

export class MediaPreviewBusy extends Error {}

async function claim(signal:AbortSignal){
 signal.throwIfAborted();
 if(active<parallel){active++;return;}
 if(waiting.length>=backlog)throw new MediaPreviewBusy();
 await new Promise<void>((resolve,reject)=>{
  const detach=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const admit=()=>{detach();resolve();};
  const rejectWaiting=(reason:unknown)=>{
   const index=waiting.indexOf(admit);if(index<0)return;
   waiting.splice(index,1);detach();reject(reason);
  };
  const abort=()=>rejectWaiting(signal.reason);
  const timer=setTimeout(()=>rejectWaiting(new MediaPreviewBusy()),maxWaitMs);timer.unref();
  waiting.push(admit);signal.addEventListener('abort',abort,{once:true});
 });
}

export async function withMediaPreviewSlot<T>(signal:AbortSignal,render:()=>Promise<T>):Promise<T>{
 await claim(signal);
 try{signal.throwIfAborted();return await render();}
 finally{const next=waiting.shift();if(next)next();else active--;}
}
