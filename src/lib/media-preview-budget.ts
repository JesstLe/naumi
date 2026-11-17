import 'server-only';

// Bound retained input buffers and concurrent libvips work in the Web process.
// Callers must authenticate before joining the queue. Next route bundles and
// development reloads share the same process budget.
const parallel=4, backlog=24, maxWaitMs=5000;
const budgetKey=Symbol.for('naumi.media.preview.budget.v1');
type Budget={active:number; waiting:Array<()=>void>};
const holder=process as typeof process & {[budgetKey]?:Budget};
const budget=holder[budgetKey]??={active:0,waiting:[]};
const {waiting}=budget;

export class MediaPreviewBusy extends Error {}

async function claim(signal:AbortSignal){
 signal.throwIfAborted();
 if(budget.active<parallel){budget.active++;return;}
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
 finally{const next=waiting.shift();if(next)next();else budget.active--;}
}
