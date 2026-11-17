// All SaaS creation previews in this browser tab share four slots. The body
// must finish or abort before a slot is released. Nothing is cached or shared
// across account scopes, and a disposed component cannot start a queued read.
const previewLimit=4;
let active=0;
const queued:Array<()=>void>=[];

function drain(){while(active<previewLimit&&queued.length)queued.shift()!();}

export function queueCreationPreview<T>(signal:AbortSignal,read:()=>Promise<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const cancel=()=>{
   const index=queued.indexOf(start);
   if(index!==-1)queued.splice(index,1);
   reject(signal.reason);
  };
  const start=()=>{
   signal.removeEventListener('abort',cancel);
   if(signal.aborted){reject(signal.reason);return;}
   active++;
   void Promise.resolve().then(read).then(resolve,reject).finally(()=>{active--;drain();});
  };
  queued.push(start);
  signal.addEventListener('abort',cancel,{once:true});
  drain();
 });
}
