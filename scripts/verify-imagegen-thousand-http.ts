/** 1000 concurrent authenticated actual imagegen POSTs, actual planning,
 * billing versions, persistent parents/children, then concurrent GET receipts.
 * Provider capacity is held: this is admission/backpressure, not supplier throughput. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {createModelFixture} from './model-config-fixture';
import {createProviderCapacity} from '../src/lib/model-config/capacity';

async function main(){
 let supplierPosts=0;
 const f=await createModelFixture(async(req,res)=>{for await(const _ of req){};supplierPosts++;res.statusCode=500;res.end('UNEXPECTED_SUPPLIER_CALL')});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'local-http-load-router-token-long',MODEL_CONFIG_ENVELOPE_SECRET:'local-http-load-envelope-key-long',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:f.origin+'/v1',STORAGE_DRIVER:'local',VIDEO_WORKER_SECRET:'local-http-load-worker-secret-long',NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE:'8',NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN:'8'});
 f.config.providers[0].maxConcurrent=1;f.config.upstreamModels[0].model='gpt-image-2';f.config.upstreamModels[0].parameterMap.resolution={};f.config.upstreamModels[0].capabilities.nativeResolutions=[];await f.repo.current();
 const db=await import('../src/lib/db');await db.ensureSchema();await db.setSetting('multi_user_enabled','1');
 const api=await import('../src/app/api/imagegen/route'),plans=await import('../src/app/api/imagegen/plan/route');
 const {USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
 let origin='';const errors:string[]=[];
 const app=createServer(async(req,res)=>{
  try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
   const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   const r=new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const answer=req.url?.startsWith('/api/imagegen/plan')?await plans.POST(r):req.method==='POST'?await api.POST(r):await api.GET(r);
   res.statusCode=answer.status;answer.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await answer.arrayBuffer()));
  }catch(e){errors.push(e instanceof Error?e.message:'unknown');res.statusCode=500;res.end('{}');}
 });await new Promise<void>(r=>app.listen({host:'127.0.0.1',port:0,backlog:2048},r));origin=`http://127.0.0.1:${(app.address()as{port:number}).port}`;
 const owners=Array.from({length:1000},(_,i)=>`load-${i}-${randomUUID()}@local.test`),ids=owners.map(()=>randomUUID());
 const request=(i:number)=>({version:1,operationId:ids[i],entry:'canvas',mode:'generate',prompt:'本地并发任务',inputs:[],modelId:'image-a',variants:1,parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},output:{format:'png'}});
 const headers=(i:number)=>({'content-type':'application/json',origin,cookie:`${USER_COOKIE}=${signUserSession(owners[i],Date.now())}`});
 let hold:Awaited<ReturnType<ReturnType<typeof createProviderCapacity>['acquire']>>|undefined;
 try{
  for(let n=0;n<1000;n+=25)await Promise.all(owners.slice(n,n+25).map(async owner=>{await db.getOrCreateUser(owner);await db.addCreditBatch(owner,100,{source:'admin',reason:'local load fixture'})}));
  hold=await createProviderCapacity(f.sql).acquire({providerId:'p1',baseUrl:f.origin+'/v1',maxConcurrent:1,timeoutMs:900000});
  const p=await plans.POST(new Request(origin+'/api/imagegen/plan',{method:'POST',headers:headers(0),body:JSON.stringify(request(0))}));assert.equal(p.status,200,await p.clone().text());const plan=await p.json();
  const times:number[]=[],start=performance.now();
  const responses=await Promise.all(owners.map(async(_,i)=>{const t=performance.now();try{const r=await fetch(origin+'/api/imagegen',{method:'POST',headers:headers(i),body:JSON.stringify({...request(i),confirmation:{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true}}),signal:AbortSignal.timeout(120000)}),body=await r.json();times.push(performance.now()-t);return {status:r.status,body}}catch(e:any){return{status:0,body:{error:e.cause?.code||e.message}}}}));
  console.log('ACTUAL_POST_COUNTS='+JSON.stringify(responses.reduce((v:Record<string,number>,r)=>({...v,[r.status]:(v[r.status]||0)+1}),{})));
  assert(responses.every((r,i)=>r.status===200&&r.body.operationId===ids[i]),JSON.stringify(responses.filter(r=>r.status!==200).slice(0,5)));
  const postedMs=performance.now()-start;times.sort((a,b)=>a-b);
  const receipt=await Promise.all(ids.map(async(id,i)=>{const r=await fetch(origin+'/api/imagegen?operationId='+id,{headers:headers(i),signal:AbortSignal.timeout(120000)});return {status:r.status,body:await r.json()}}));
  assert(receipt.every((r,i)=>r.status===200&&r.body.operationId===ids[i]&&['queued','running','pending'].includes(r.body.status)));
  const foreign=await fetch(origin+'/api/imagegen?operationId='+ids[1],{headers:headers(0)});assert.equal(foreign.status,404);await foreign.arrayBuffer();
  // Repeating the original IDs returns their receipts, not new tasks.
  const repeats=await Promise.all(ids.slice(0,25).map(async(_,i)=>{const r=await fetch(origin+'/api/imagegen',{method:'POST',headers:headers(i),body:JSON.stringify(request(i))});return r.status}));assert(repeats.every(s=>s===200));
  const rows=(await f.sql.query("SELECT kind,count(*)::int n,count(*) FILTER(WHERE lease_token IS NOT NULL)::int active FROM app_image_jobs GROUP BY kind")).rows;
  assert.equal(rows.find(r=>r.kind==='imagegen')?.n,1000);assert(rows.every(r=>r.active<=8));assert.equal(supplierPosts,0);assert.equal(errors.length,0);
  // Stop our accepted local parents before releasing the synthetic held capacity.
  for(let i=0;i<300;i++){if(Number((await f.sql.query('SELECT count(*)::int n FROM app_image_jobs WHERE lease_token IS NOT NULL')).rows[0].n)===0)break;await new Promise(r=>setTimeout(r,50))}
  assert.equal(Number((await f.sql.query('SELECT count(*)::int n FROM app_image_jobs WHERE lease_token IS NOT NULL')).rows[0].n),0);
  assert.equal(Number((await f.sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n),0);
  console.log('IMAGEGEN_THOUSAND_HTTP=PASS PLATFORM='+process.platform+' USERS=1000 COLD_POSTS=1000 POST_OK=1000 GET_OK=1000 DUPLICATE_IDS=25 FOREIGN=404 SUPPLIER_POSTS=0 CONSUMPTIONS=0 INTERNAL_500=0');
  console.log('ACTUAL_HTTP_METRICS='+JSON.stringify({postP50Ms:Math.round(times[499]),postP95Ms:Math.round(times[949]),postP99Ms:Math.round(times[989]),postTotalMs:Math.round(postedMs),totalWithPollMs:Math.round(performance.now()-start),rssMiB:Math.round(process.memoryUsage().rss/1048576),rows,boundary:'actual Next route handlers and DB, local HTTP bridge; no Next middleware/NGINX/production or supplier execution'}));
 }finally{await hold?.release();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));const {closeImageCoordinationPool}=await import('../src/lib/imagegen/coordination-pool');await closeImageCoordinationPool();await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
