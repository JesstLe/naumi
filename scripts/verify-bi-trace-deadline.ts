import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';

async function main(){
 const {readRouterTraces}=await import('../src/lib/bi/router-trace');
 const oldFetch=globalThis.fetch;
 process.env.NAUMI_BI_ROUTER_URL='http://127.0.0.1:1';
 process.env.NAUMI_BI_ROUTER_TOKEN='fixture';
 let attempts=0,active=0,peak=0;
 globalThis.fetch=async(input,init)=>{
  assert.match(String(input),/^http:\/\/127\.0\.0\.1:1\/internal\/operations\//);
  assert.equal(init?.method,undefined);
  attempts++;active++;peak=Math.max(peak,active);
  try{
   if(String(input).endsWith('operation-0')){await wait(20,undefined,{signal:init?.signal??undefined});return Response.json({state:'done',attempts:[{state:'returned',route:{id:'safe'},secret:'must-not-leak'}]});}
   await wait(30_000,undefined,{signal:init?.signal??undefined});
   throw new Error('Fixture did not receive an abort');
  }finally{active--;}
 };
 try{
   const ids=Array.from({length:40},(_,i)=>'operation-'+i);
   const started=performance.now(),results=await readRouterTraces([...ids,'operation-0','!']);
   const elapsed=performance.now()-started;
   assert(elapsed>=4500&&elapsed<7500,`unexpected total external lookup time: ${elapsed}`);
   assert.equal(attempts,4);assert.equal(peak,4);assert.equal(active,0);
   assert.equal(results.get('operation-0')?.status,'done');
   assert.doesNotMatch(JSON.stringify(results.get('operation-0')),/must-not-leak/);
   assert.equal(results.get('operation-39')?.status,'unavailable');
   assert.equal(results.get('!')?.status,'invalid-id');
   const cancelled=new AbortController();cancelled.abort();
   assert.equal((await readRouterTraces(['operation-0'],cancelled.signal)).get('operation-0')?.status,'unavailable');
   assert.equal(attempts,4);
   console.log('BI_TRACE_DEADLINE_PASS lookup_budget=5s max_concurrency=4 later_waves_skipped=1 partial_evidence_kept=1 browser_abort=1');
 }finally{globalThis.fetch=oldFetch;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
