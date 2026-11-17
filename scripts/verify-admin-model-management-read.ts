import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import presets from '../src/lib/model-config/video-family-presets.json';
import {videoProfileProtocol,type VideoWireProfile,type VideoModelDefinition} from '../src/lib/video/capability-schema';
import {createModelFixture} from './model-config-fixture';

async function until(test:()=>Promise<boolean>,reason:string){
 const end=Date.now()+2800;do{if(await test())return;await delay(15);}while(Date.now()<end);throw Error(reason);
}
async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline');let supplier=0;
 const f=await createModelFixture((_req,res)=>{supplier++;res.writeHead(500).end();});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,
  NAUMI_ROUTER_MANAGEMENT_URL:baseline?f.origin:'',NAUMI_ROUTER_MANAGEMENT_TOKEN:'local-router-test-token-01234567890',MODEL_CONFIG_ENVELOPE_SECRET:'local-router-test-secret-01234567890'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {getBillingRuntime}=await import('../src/lib/billing/runtime');
 const {ensureSupplierModels}=await import('../src/lib/supplier-models/schema');
 const {ensureProviderCatalogSchema}=await import('../src/lib/model-config/catalog-schema');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {GET}=await import('../src/app/api/admin/model-management/route');
 const pool=getPool(),lock=await f.sql.connect(),admin='admin@model-view.fixture',member='member@model-view.fixture';
 const headers=(email=admin)=>({cookie:'nv_user='+signUserSession(email,Date.now())});
 const url='/api/admin/model-management',replies=new Map<string,number>();
 let base='';
 const server=createServer(async(req,res)=>{
  try{
   const target=new URL(req.url!,base),result=await GET(new Request(target,{headers:headers(),signal:signalFromNodeResponse(res)}));
   replies.set(target.searchParams.get('probe')!,result.status);
   if(!res.destroyed)res.writeHead(result.status,Object.fromEntries(result.headers)).end(Buffer.from(await result.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 const jobs:{controller:AbortController;done:Promise<Response|undefined>}[]=[];
 try{
  const item=presets.items[0],profile=item.profile as VideoWireProfile,credential=await f.credentials.importPlain({providerId:item.providerId,plain:'fixture-management-video',actor:'fixture'});
  f.config.providers.push({id:item.providerId,name:'Video fixture',protocol:videoProfileProtocol(profile),baseUrl:f.origin,credentialRef:credential.id,enabled:true,timeoutMs:120000,maxConcurrent:2});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:'fixture-video',providerId:item.providerId,model:item.model,modality:'video',parameterMap:{videoProfile:profile},
   capabilities:{...structuredClone(f.config.upstreamModels[0].capabilities),edit:false,maxReferenceImages:item.definition.limits.images,video:structuredClone(item.definition) as VideoModelDefinition}});
  f.config.publicModels.push({id:item.publicId,label:item.label,modality:'video',enabled:true,visible:true,target:{type:'upstream',id:'fixture-video'}});
  f.config.bindings['video.generate']=item.publicId;
  const snapshot=await f.repo.current();
  for(const email of [admin,member])await getOrCreateUser(email);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const billing=await(await getBillingRuntime()).config.current();
  await ensureSupplierModels(pool);await ensureProviderCatalogSchema(pool);
  const direct=(query='',email=admin)=>GET(new Request('http://fixture.invalid'+url+query,{headers:headers(email)}));
  assert.equal((await direct('',member)).status,404);
  const first=await direct();assert.equal(first.status,200,await first.clone().text());
  assert.match(first.headers.get('cache-control')??'',/no-store/);
  const initial=await first.json();assert.equal(initial.version,snapshot.version);assert.equal(initial.billingVersion,billing.version);
  const video=(data:any)=>data.rows.find((row:any)=>row.modality==='video').videoConfig.routes[0];
  const frozen=(await pool.query("SELECT value FROM app_video_model_defaults WHERE upstream_id='fixture-video'")).rows[0].value;
  assert.deepEqual(video(initial).effective,frozen.definition);
  if(!baseline){
   await pool.query("UPDATE app_video_model_defaults SET model_digest=$1 WHERE upstream_id='fixture-video'",['0'.repeat(64)]);
   const inconsistent=await direct();assert.equal(inconsistent.status,503);assert.equal((await inconsistent.json()).code,'EXECUTION_MISMATCH');
   await pool.query("UPDATE app_video_model_defaults SET model_digest=$1 WHERE upstream_id='fixture-video'",[snapshot.digest]);
  }
  const before=(await pool.query('SELECT count(*)::int AS n FROM app_video_model_defaults')).rows[0].n;
  await pool.query("DELETE FROM app_video_model_defaults WHERE upstream_id='fixture-video'");
  const missing=await direct();assert.equal(missing.status,200);const missingJson=await missing.json();
  const after=(await pool.query('SELECT count(*)::int AS n FROM app_video_model_defaults')).rows[0].n;
  assert.equal(after,baseline?before:before-1);
  if(!baseline){
   assert.equal(video(missingJson).frozenRecorded,false);assert.deepEqual(video(missingJson).effective,{});
   assert.equal((await direct('?view=video-execution-readiness')).status,200);
   const pricing=await direct('?rowId=image-a&feature=image.generate');assert.equal(pricing.status,200);
   assert.equal((await pricing.json()).billingVersion,billing.version);
  }
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const pid=(await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await lock.query('BEGIN; LOCK TABLE app_billing_config_versions,app_supplier_model_metadata,app_model_channel_health,app_model_provider_budgets,app_model_provider_catalog IN ACCESS EXCLUSIVE MODE');
  const count=async()=>Number((await f.sql.query('SELECT count(*) FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].count);
  const start=(id:number)=>{
   const controller=new AbortController(),done=fetch(base+url+'?probe='+id,{signal:controller.signal}).catch(e=>{if(!controller.signal.aborted)throw e;return undefined;});
   jobs.push({controller,done});
  };
  const peak=baseline?5:2;
  for(let i=0;i<(baseline?2:3);i++)start(i);
  await until(async()=>await count()===peak,'model management did not reach expected pool pressure');
  jobs[0].controller.abort();
  if(baseline){await delay(120);assert.equal(await count(),5);assert.equal(replies.has('0'),false);}
  else{
   await until(async()=>replies.get('0')===499,'abandoned overview did not release its read');
   assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
   await lock.query('ROLLBACK');
   for(const job of jobs.slice(1)){const reply=await job.done;assert.equal(reply?.status,200);await reply!.arrayBuffer();}
   await lock.query('BEGIN; LOCK TABLE app_billing_config_versions IN ACCESS EXCLUSIVE MODE');
   start(90);
   await until(async()=>await count()===1,'management snapshot did not reach the locked billing pointer');
   const modelNext=(await lock.query(`INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest)
    SELECT $2,'fixture','switch during read',config,digest FROM app_model_config_versions WHERE version=$1 RETURNING version`,[snapshot.version,randomUUID()])).rows[0].version;
   const billingNext=(await lock.query(`INSERT INTO app_billing_config_versions(operation_id,request_fingerprint,actor,reason,config)
    SELECT $2,'fixture','fixture','switch during read',config FROM app_billing_config_versions WHERE version=$1 RETURNING version`,[billing.version,randomUUID()])).rows[0].version;
   await lock.query('UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true',[modelNext]);
   await lock.query("UPDATE app_settings SET v=$1 WHERE k='billing_config_version'",[String(billingNext)]);
   await lock.query('COMMIT');
   const original=await jobs.at(-1)!.done;assert.equal(original?.status,200);const retained=await original!.json();
   assert.deepEqual([retained.version,retained.billingVersion],[snapshot.version,billing.version]);
   const next=await (await direct()).json();
   assert.deepEqual([next.version,next.billingVersion],[Number(modelNext),Number(billingNext)]);
  }
  assert.equal(supplier,0);
  console.log((baseline?'ADMIN_MODEL_MANAGEMENT_READ_BASELINE=PASS':'ADMIN_MODEL_MANAGEMENT_READ=PASS')+` PEAK=${peak} GET_FROZEN_WRITES=${after-before+1} SNAPSHOT=${baseline?0:1} SUPPLIER=0`);
 }finally{
  for(const job of jobs)job.controller.abort();
  await lock.query('ROLLBACK');lock.release();await Promise.allSettled(jobs.map(job=>job.done));
  if(server.listening){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  await closeDatabasePools();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
