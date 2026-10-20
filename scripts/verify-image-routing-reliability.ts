import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {Pool} from 'pg';
import {createConnection,type Socket} from 'node:net';
import OpenAI from 'openai';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {createProviderCapacity,registerProviderCapacities,capacityFetch} from '../src/lib/model-config/capacity';
import {createModelExecutor} from '../src/lib/model-config/execution';
import type {ImageJobRow} from '../src/lib/image-job-repository';

async function main(){
 let repository:typeof import('../src/lib/image-job-repository'),posted=0;
 const f=await createModelFixture(async(req,res)=>{
  if(req.url==='/fixture/submit'&&req.method==='POST'){
   let raw='';for await(const b of req)raw+=b;
   try{const b=JSON.parse(raw);await repository.createImageJob(b.id,b.email,'generate',{status:'pending',paidOperationVersion:1},{fixture:true},0,false);res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({id:b.id,status:'queued'}));}catch{res.writeHead(500);res.end('fixture admission failed');}return;
  }
  posted++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE:'8'});
 const db=await import('../src/lib/db');repository=await import('../src/lib/image-job-repository');
 const independent=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${f.schemaName}`,max:5});
 const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 let checks=0;const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++};
 try{
  f.config.providers[0].maxConcurrent=1;await f.repo.current();await db.ensureSchema();
  const publishCapacity=async(config= f.config)=>{const tx=await f.sql.connect();try{await tx.query('BEGIN');await registerProviderCapacities(tx,config);await tx.query('COMMIT');}catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}};
  const cap=createProviderCapacity(f.sql),old={providerId:'p1',baseUrl:f.origin+'/v1',maxConcurrent:1,timeoutMs:1000};
  f.config.providers[0].maxConcurrent=2;await publishCapacity();
  const leases=[];let raised=false;
  try{leases.push(await cap.acquire(old));try{leases.push(await createProviderCapacity(independent).acquire(old));raised=true;}catch{} }finally{await Promise.all(leases.map(l=>l.release()))}
  console.log('PROBE_CAPACITY_RAISE='+raised);

  // The first routing entry has too few references. Its secret
  // must never be loaded before capability filtering selects the healthy one.
  const snapshot=structuredClone(await f.repo.current()),cred=await f.credentials.importPlain({providerId:'p2',plain:'local-second-fixture',actor:'fixture'});
  snapshot.config.providers.push({...snapshot.config.providers[0],id:'p2',credentialRef:cred.id});
  snapshot.config.upstreamModels.push({...structuredClone(snapshot.config.upstreamModels[0]),id:'u2',providerId:'p2'});
  snapshot.config.upstreamModels[0].capabilities.maxReferenceImages=1;
  snapshot.config.publicModels[0].supplierRouting={mode:'priority',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1},{upstreamId:'u2',enabled:true,priority:2,weight:1}]};
  const credentials={...f.credentials,read:async(id:string,p:string)=>{if(p==='p1')throw Error('INELIGIBLE_CREDENTIAL_READ');return f.credentials.read(id,p)}};
  const billing={version:1,config:fixtureConfig()} as any;
  const executor=createModelExecutor({runtime:{byVersion:async()=>snapshot,prepareExecution:async()=>{throw Error('NO_ROUTER')}},credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>({baseUrl:f.origin,apiKey:'local-only'})});
  const frozen=await executor.resolve({snapshot,billing,binding:'image.generate',requestedModelId:'image-a',facts:{task:'draft',quality:'medium',resolution:'1K',needsEdit:true,preserveIdentity:false,needsText:false,nativeResolution:false,references:2}});
  let routed=false;try{routed=(await executor.describe(frozen)).supplierRouting?.targets[0].upstreamId==='u2'}catch{}
  console.log('PROBE_ELIGIBLE_CONNECTION_ONLY='+routed);
  const warm=Array.from({length:20},(_,i)=>'probe-queue-'+i);
  await Promise.all(warm.map(id=>repository.createImageJob(id,id+'@local.test','generate',{status:'pending',paidOperationVersion:1},{},0,false)));
  const claims=await Promise.all(warm.map(id=>repository.claimImageJob(id,'generate'))),live=claims.filter(Boolean) as ImageJobRow[];
  console.log('PROBE_ACTIVE_CLAIMS='+live.length+' EXPECTED=8');
  for(const row of live){await repository.saveImageJob(row.id,{status:'done'},row.lease_token);await repository.releaseImageJob(row.id,row.lease_token!)}
  await f.sql.query("DELETE FROM app_image_jobs WHERE id LIKE 'probe-queue-%'");
  assert.ok(raised&&routed&&live.length===8,'Routing reliability probes: published capacity raise, eligible connection isolation, bounded active leases');checks+=3;

  f.config.providers[0].maxConcurrent=1;await publishCapacity();
  const one=await cap.acquire({...old,maxConcurrent:256});await assert.rejects(cap.acquire({...old,maxConcurrent:256}),(e:any)=>e.code==='PROVIDER_BUSY');await one.release();checks++;
  const alias=await f.credentials.importPlain({providerId:'shared',plain:f.marker,actor:'fixture'});
  f.config.providers.push({...f.config.providers[0],id:'shared',credentialRef:alias.id,maxConcurrent:1});f.config.providers[0].maxConcurrent=8;await publishCapacity();
  const shared=await cap.acquire(old);await assert.rejects(cap.acquire({...old,providerId:'shared',maxConcurrent:8}));await shared.release();checks++;
  f.config.providers[1].enabled=false;await publishCapacity();const more=await Promise.all(Array.from({length:8},()=>cap.acquire(old)));await assert.rejects(cap.acquire(old));await Promise.all(more.map(l=>l.release()));checks++;

  const {dispatchImageQueue}=await import('../src/lib/image-job-queue');let dispatches=0,active=0,max=0,errors=0;
  const n=await dispatchImageQueue(Array.from({length:19},(_,i)=>i),async i=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;dispatches++;if(i===0)throw Error('local worker unavailable');return true},()=>errors++);
  check(n===18&&dispatches===19&&errors===1&&max===4,'dispatch failure does not starve later work; bounded four-way dispatch');

  // 1000 genuinely simultaneous HTTP requests, each with a distinct owner/job.
  // This boundary exercises real SQL admission/leases; no real model execution.
  // Warm 1000 independent TCP connections in bounded handshake batches. The
  // measured phase sends all 1000 POSTs together, not 32 sequential requests.
  // Windows loopback cold SYN bursts are measured separately, not hidden as app failures.
  const sockets:Socket[]=[],port=Number(new URL(f.origin).port);
  for(let i=0;i<1000;i+=25)sockets.push(...await Promise.all(Array.from({length:Math.min(25,1000-i)},()=>new Promise<Socket>((resolve,reject)=>{const s=createConnection({host:'127.0.0.1',port},()=>resolve(s));s.once('error',reject)}))));
  const latencies:number[]=[],start=performance.now(),ids=Array.from({length:1000},()=>`load-${randomUUID()}`);
  const accepted=await Promise.all(ids.map((id,i)=>new Promise<number|string>(resolve=>{
   const t=performance.now(),socket=sockets[i],body=JSON.stringify({id,email:`user-${i}@load.local`});let raw='';
   socket.setTimeout(30000,()=>socket.destroy(Error('fixture request timeout')));
   socket.on('data',b=>raw+=b);socket.on('error',(e:any)=>resolve(e.code||e.message));socket.on('end',()=>{latencies.push(performance.now()-t);resolve(Number(raw.match(/^HTTP\/1.1 (\d+)/)?.[1]))});
   socket.write(`POST /fixture/submit HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  })));
  console.log('HTTP_ADMISSION_COUNTS='+JSON.stringify(accepted.reduce((all:Record<string,number>,s)=>({...all,[s]:(all[s]||0)+1}),{})));
  check(accepted.every(s=>s===202),'1000 concurrent HTTP submissions persisted');
  check(Number((await f.sql.query("SELECT count(*) n FROM app_image_jobs WHERE id LIKE 'load-%'")).rows[0].n)===1000,'1000 tasks and owners retained');
  const beforeClaim=performance.now(),first=await Promise.all(ids.map(id=>repository.claimImageJob(id,'generate'))),held=first.filter(Boolean) as ImageJobRow[];
  check(held.length===8,'1000 simultaneous claim attempts cannot exceed shared lane capacity');
  // Simulate process disappearance: reclaim only expired leases with a new token.
  await independent.query("UPDATE app_image_jobs SET lease_until=now()-interval '1 second' WHERE id=ANY($1)",[held.map(r=>r.id)]);
  const recovered=await Promise.all(held.map(row=>repository.claimImageJob(row.id,'generate')));
  check(recovered.every((row,i)=>row&&row.lease_token!==held[i].lease_token),'expired leases recovered without duplicate ownership');
  await assert.rejects(repository.saveImageJob(held[0].id,{status:'done'},held[0].lease_token));checks++;
  let completed=0;const seen=new Set<string>();
  async function finish(rows:ImageJobRow[]){for(const row of rows){assert(!seen.has(row.id));seen.add(row.id);await repository.saveImageJob(row.id,{status:'done',fixtureOutput:'locally-completed'},row.lease_token);await repository.releaseImageJob(row.id,row.lease_token!);completed++;}}
  await finish(recovered as ImageJobRow[]);
  let scans=0;
  while(completed<1000&&scans++<200){
   const due=await repository.dueImageJobs();const batch=(await Promise.all(due.filter(j=>j.kind==='generate').map(j=>repository.claimImageJob(j.id,'generate')))).filter(Boolean) as ImageJobRow[];
   check(batch.length>0&&batch.length<=8,'recovery scan makes bounded progress');await finish(batch);
  }
  check(completed===1000&&seen.size===1000,'all 1000 queued tasks drained once');
  check(Number((await f.sql.query('SELECT count(*) n FROM app_image_jobs WHERE lease_token IS NOT NULL')).rows[0].n)===0,'no execution lease leaks');
  // Parent lane progresses even when the paid generation lane is full.
  for(let i=0;i<8;i++)await repository.createImageJob('lane-'+i,'lane@local.test','generate',{status:'pending'},{},0,false);
  const full=await Promise.all(Array.from({length:8},(_,i)=>repository.claimImageJob('lane-'+i,'generate')));
  await repository.createImageJob('parent-lane','parent@local.test','imagegen',{status:'pending',result:{status:'queued'}},{},0,false);
  check((await repository.dueImageJobs()).some(j=>j.id==='parent-lane'),'parent lane not starved by full child lane');
  await finish(full as ImageJobRow[]);
  const parent=await repository.claimImageJob('parent-lane','imagegen');check(!!parent,'separate parent lane claims');await finish([parent!]);
  const {DurableImageJobs}=await import('../src/lib/durable-image-jobs'),gateway=await import('../src/lib/image-gateway');
  const tasks=new DurableImageJobs<any>('generate');await tasks.create('capacity-queued','queue@local.test',{status:'pending'},{},0,false);
  let queued:unknown;
  try{await tasks.paidOperation('capacity-queued','direct-model',{id:'capacity-queued',managedGateway:false},async()=>{throw gateway.localImageCapacityQueue()})}catch(e){queued=e}
  check(queued instanceof gateway.ImageOperationQueued&&queued.unsubmitted,'actual durable paid operation retains typed zero-dispatch queue');
  await tasks.handlePending('capacity-queued',queued as any);
  const saved=await tasks.get('capacity-queued',false);check(saved.status==='pending'&&saved.queueState==='capacity'&&saved.paidOperations['capacity-queued'].state==='queued','capacity wait not failed/charged/unknown');
  const result=await tasks.paidOperation('capacity-queued','direct-model',{id:'capacity-queued',managedGateway:false},async()=> 'local-result');check(result==='local-result','same operation resumes after capacity becomes available');
  const heldProvider=await Promise.all(Array.from({length:8},()=>cap.acquire(old)));
  try{
   const client=new OpenAI({apiKey:'local-only',baseURL:f.origin+'/v1',maxRetries:0,fetch:capacityFetch(async()=>{posted++;return Response.json({data:[]})},f.sql,old)});
   await assert.rejects(gateway.withImageOperation('direct',{id:'sdk-capacity',durable:true},()=>client.images.generate({model:'direct',prompt:'local fixture'})),(e:any)=>e instanceof gateway.ImageOperationQueued&&e.unsubmitted);checks++;
   const {channelRoutingFetch}=await import('../src/lib/model-config/channel-fetch');
   const original=await f.repo.current(),u=original.config.upstreamModels[0],p=original.config.providers[0];
   const target:any={upstreamId:'u1',enabled:true,priority:1,weight:1,scope:{frozen:{...frozen,modelVersion:original.version,modelDigest:original.digest,facts:{...frozen.facts,references:0,needsEdit:false}},connection:{...old,apiKey:'local-only',protocol:'openai-images',wireModel:u.model},capabilities:u.capabilities,parameterMap:u.parameterMap}};
   const scope:any={...target.scope,connection:{...target.scope.connection,protocol:'supplier-channels'},supplierRouting:{policy:{mode:'priority',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]},targets:[target]}};
   const routedClient=new OpenAI({apiKey:'local-only',baseURL:f.origin+'/v1',maxRetries:0,fetch:channelRoutingFetch(scope,{trustedOrigins:[f.origin]})});
   await assert.rejects(gateway.withImageOperation('image-a',{id:'sdk-routing-capacity',durable:true},()=>routedClient.images.generate({model:'image-a',prompt:'local fixture'})),(e:any)=>e instanceof gateway.ImageOperationQueued&&e.unsubmitted);checks++;
   check(Number((await f.sql.query('SELECT count(*) n FROM app_model_channel_operations')).rows[0].n)===0,'local queue never pins or accepts a supplier operation');
  }finally{await Promise.all(heldProvider.map(l=>l.release()))}
  await gateway.withImageOperation('model',{id:'siblings',durable:true},async()=>{
   const q=await gateway.withImageIndex('model',0,async()=>gateway.localImageCapacityQueue());
   await gateway.withImageIndex('model',1,async()=>gateway.noteImageSupplierDispatch());
   check(q instanceof gateway.ImageOperationQueued&&!q.unsubmitted&&!gateway.localImageCapacityQueue(),'one sibling dispatch prevents whole root from being resubmitted');
  });
  check(posted===0,'no accidental model HTTP call');
  latencies.sort((a,b)=>a-b);loop.disable();
  console.log('IMAGE_ROUTING_RELIABILITY=PASS CHECKS='+checks+' USERS=1000 HTTP_ACCEPTED=1000 DRAINED=1000 DUPLICATE_COMPLETIONS=0 ACTIVE_LEASE_PEAK=8 STALE_TOKEN_REJECTED=1 SUPPLIER_CALLS=0');
  console.log('LOAD_METRICS='+JSON.stringify({admitP50Ms:Math.round(latencies[499]),admitP95Ms:Math.round(latencies[949]),admitP99Ms:Math.round(latencies[989]),admitTotalMs:Math.round(beforeClaim-start),totalMs:Math.round(performance.now()-start),recoveryScans:scans,eventLoopP99Ms:Math.round(loop.percentile(99)/1e6),rssMiB:Math.round(process.memoryUsage().rss/1048576),boundary:'loopback HTTP -> real createImageJob/claimImageJob/dueImageJobs/saveImageJob; completion fixture, not provider or full production API'}));
 }finally{loop.disable();await independent.end();await db.getPool().end();await f.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
