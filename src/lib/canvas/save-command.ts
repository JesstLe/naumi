/** User-initiated save only. Each document owner retains its own draft, nonce,
 * conflict and persistence protocol. A failed owner does not starve the others. */
export function createCanvasSaveCommand(){
  const flights=new WeakMap<object,Promise<void>>();
  return {run(scope:{key:string;viewCurrent:()=>boolean},ports:{flush:()=>Promise<unknown>;retry:readonly (()=>Promise<unknown>)[];history:()=>Promise<unknown>;unsaved:()=>boolean}){
    const existing=flights.get(scope);if(existing)return existing;
    const run=async()=>{
      if(!scope.viewCurrent())return;
      const failures:unknown[]=[];
      try{await ports.flush();}catch(error){failures.push(error);}
      if(!scope.viewCurrent())return;
      for(const result of await Promise.allSettled(ports.retry.map(retry=>Promise.resolve().then(retry))))if(result.status==='rejected')failures.push(result.reason);
      if(!scope.viewCurrent())return;
      try{await ports.history();}catch(error){failures.push(error);}
      if(!scope.viewCurrent())return;
      if(failures.length)throw failures[0];
      if(ports.unsaved())throw new Error('仍有修改未保存，请在保存状态中查看具体节点');
    };
    const promise=run().finally(()=>{if(flights.get(scope)===promise)flights.delete(scope);});flights.set(scope,promise);return promise;
  }};
}
