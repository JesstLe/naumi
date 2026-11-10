import type {Operation} from "./repository";

type Item={state:string;error:string;ref:string;kind:string};
function operationItems(op:Operation):Item[] {
 const results=new Map<string,any>((op.result.items||[]).map((r:any)=>[r.key,r]));
 return op.plans.map(t=>{
  const text=t.kind==="infer"||t.kind==="chat-plan",result=results.get(t.key);
  return {state:text?(t.state||"queued"):(result?.state||t.state||"queued"),error:text?t.error||"":result?.result?.error?.message||t.preflightError?.message||t.error||"",ref:t.ref||"",kind:t.kind};
 });
}
/** Current root/batch only when requested; legacy global callers retain their
 * global view. Text results belong to plans, image results to result.items. */
export function workbenchStatus(ops:Operation[],scope:{root?:string;operationId?:string}={}) {
 const filtered=ops.filter(o=>(scope.root===undefined||o.body.workbench_root===scope.root)&&(!scope.operationId||o.id===scope.operationId));
 const selected=scope.operationId?filtered:scope.root!==undefined?filtered.slice(0,1):filtered;
 const latest=selected[0],items=selected.flatMap(operationItems),working=items.filter(i=>["queued","waiting","running","submitted","pending","inferring"].includes(i.state));
 const unknown=items.filter(i=>["maybe_submitted","needs_attention"].includes(i.state)),failed=items.filter(i=>["failed","cancelled"].includes(i.state));
 return {running:working.length>0,operationId:latest?.id||"",progress:{current:working.length?"运行中":unknown.length?"待核查":items.length?"已完成":"等待",product:latest?.body.workbench_root||scope.root||"",size:latest?.plans[0]?.settings.resolution||"",ref:working[0]?.ref||latest?.plans[0]?.ref||"",done:items.filter(i=>["done","succeeded","partial"].includes(i.state)).length,failed:failed.length,unknown:unknown.length,total:items.length,last_error:[...failed,...unknown].find(i=>i.error)?.error||""},
  queue:{running:working.filter(i=>["running","submitted","pending","inferring"].includes(i.state)).length,waiting:working.filter(i=>["queued","waiting"].includes(i.state)).length,global_limit:2,user_limit:2}};
}
