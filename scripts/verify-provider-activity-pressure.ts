import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';

async function until<T>(check:()=>Promise<T|undefined>,label:string){
 const deadline=Date.now()+2800;
 do{const result=await check();if(result!==undefined)return result;await delay(15);}while(Date.now()<deadline);
 throw Error(label);
}

async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline');let supplier=0;
 const f=await createModelFixture((_req,res)=>{supplier++;res.writeHead(500).end();});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {ensureExecutionAuditSchema}=await import('../src/lib/model-config/execution-audit-schema');
 const {providerOpsHandler:GET}=await import('../src/lib/model-config/provider-balance-access');
 const pool=getPool(),lock=await f.sql.connect(),admin='admin@activity-pressure.fixture';
 const now=Date.now(),fixed=new Date(now-30*60_000);
 const requests:{controller:AbortController;done:Promise<Response|undefined>}[]=[];
 const status=new Map<string,number>();
 let host='';
 const listener=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,host),id=req.headers['x-fixture-probe'] as string;
   const response=await GET(new Request(url,{headers:{cookie:'nv_user='+signUserSession(admin,Date.now())},signal:signalFromNodeResponse(res)}));
   status.set(id,response.status);
   if(!res.destroyed)res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 let wireRows=0,wireBytes=0,dataQuery='',dataParams:unknown[]=[],credentialReads=0;
 const patched=new Map<PoolClient,PoolClient['query']>();
 const trace=(tx:PoolClient)=>{
  if(patched.has(tx))return;const query=tx.query;patched.set(tx,query);
  tx.query=((sql:unknown,...args:unknown[])=>{
   const value=Reflect.apply(query,tx,[sql,...args]);
   if(typeof sql!=='string'||typeof args.at(-1)==='function')return value;
   if(sql.includes('app_model_credentials'))credentialReads++;
   if(!sql.includes('FROM app_model_execution_stages'))return value;
   dataQuery=sql;dataParams=(args[0] as unknown[])??[];
   return value.then((result:{rows:unknown[]})=>{wireRows+=result.rows.length;wireBytes+=Buffer.byteLength(JSON.stringify(result.rows));return result;});
  }) as typeof tx.query;
 };
 try{
  const secondCredential=await f.credentials.importPlain({providerId:'p2',plain:'fixture-secondary-balance',actor:'fixture'});
  f.config.providers.push({...f.config.providers[0],id:'p2',name:'Secondary fixture',credentialRef:secondCredential.id});
  const config=await f.repo.current(),providerId=config.config.providers[0].id;
  await ensureExecutionAuditSchema(f.sql);await getOrCreateUser(admin);await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const seed=`INSERT INTO app_model_execution_stages(id,operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,phase,state,attempt,created_at)
    SELECT gen_random_uuid(),'test-activity-'||i,'fixture','fixture',1,1,$1,'fixture','text',
    (ARRAY['response-received','stream-completed','rejected-not-charged','failed-response','unknown-tag','submitted'])[1+(i-1)%6],1,$2::timestamptz
    FROM generate_series(1,$3::int)i`;
  await f.sql.query(seed,[providerId,fixed,50000]);await f.sql.query(seed,['other-provider',fixed,100]);
  await f.sql.query(seed,[providerId,new Date(now-48*3600_000),6000]);
  const direct=()=>GET(new Request('http://fixture.invalid/api/admin/bi/provider-ops',{headers:{cookie:'nv_user='+signUserSession(admin,Date.now())}}));
  pool.on('acquire',trace);
  const exact=await direct();assert.equal(exact.status,200);
  const {activity,accounts}=await exact.json(),stats=activity.providers[0].stats;
  assert.equal(accounts.length,2);assert.ok(accounts.every((account:{credentialAvailable:boolean})=>account.credentialAvailable));
  const credentialsAtLimit=credentialReads;assert.equal(credentialsAtLimit,baseline?2:1);
  assert.deepEqual(stats.h24,{total:50000,accepted:16668,rejected:8333,failed:8333,unknown:8333,processing:8333});
  assert.deepEqual(stats.h1,stats.h24);assert.equal(stats.errorCode,null);
  assert.equal(wireRows,baseline?50000:1);assert.ok(dataQuery);
  const exactBytes=wireBytes;
  wireRows=0;wireBytes=0;
  await f.sql.query(seed,[providerId,fixed,1]);
  const over=await direct();assert.equal(over.status,200);
  assert.deepEqual((await over.json()).activity.providers[0].stats,{h1:null,h24:null,errorCode:'ROW_LIMIT'});
  assert.equal(wireRows,baseline?50001:1);
  pool.off('acquire',trace);for(const [tx,query] of patched)tx.query=query;
  await new Promise<void>(r=>listener.listen(0,'127.0.0.1',r));host=`http://127.0.0.1:${(listener.address() as {port:number}).port}`;
  const pid=(await lock.query('SELECT pg_backend_pid() AS n')).rows[0].n;
  const blocked=async()=>Number((await f.sql.query('SELECT count(*) FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].count);
  const start=(key:string)=>{
   const controller=new AbortController();
   const done=fetch(host+'/api/admin/bi/provider-ops',{headers:{'x-fixture-probe':key},signal:controller.signal}).catch(e=>{if(!controller.signal.aborted)throw e;return undefined;});
   const request={controller,done};requests.push(request);return request;
  };
  await lock.query('BEGIN; LOCK TABLE app_model_execution_stages IN ACCESS EXCLUSIVE MODE');
  const jobs=Array.from({length:baseline?5:3},(_,i)=>start('pressure-'+i)),peak=baseline?5:2;
  let historyBlocks:{before:number;indexed:number}|undefined;
  await until(async()=>await blocked()===peak?true:undefined,'provider activity did not reach expected locked pool pressure');
  jobs[0].controller.abort();
  if(baseline){
   await delay(140);assert.equal(await blocked(),5);assert.equal(status.has('pressure-0'),false);
  }else{
   await until(async()=>status.get('pressure-0')===499?true:undefined,'database cancellation was not reflected by route');
   assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
   await lock.query('ROLLBACK');
   for(const job of jobs.slice(1)){const reply=await job.done;assert.equal(reply?.status,200);await reply!.arrayBuffer();}
   for(const table of ['app_model_channel_health','app_model_config_versions','app_model_credentials']){
    await lock.query('BEGIN; LOCK TABLE '+table+' IN ACCESS EXCLUSIVE MODE');
    const read=start(table);
    await until(async()=>await blocked()===1?true:undefined,table+' read did not reach lock');
    read.controller.abort();
    await until(async()=>status.get(table)===499&&(await blocked())===0?true:undefined,table+' read was not released before unlock');
    await lock.query('ROLLBACK');
   }
   await f.sql.query('TRUNCATE app_model_execution_stages');
   await f.sql.query(seed,[providerId,new Date(now-48*3600_000),80000]);
   await f.sql.query(seed,[providerId,fixed,128]);
   await f.sql.query('ANALYZE app_model_execution_stages');
   const explain=async()=>{
    const result=(await f.sql.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+dataQuery,dataParams)).rows[0]['QUERY PLAN'][0].Plan;
    return {text:JSON.stringify(result),blocks:Number(result['Shared Hit Blocks']??0)+Number(result['Shared Read Blocks']??0)};
   };
   const before=await explain();
   const {HOT_PATH_INDEXES}=await import('../src/lib/persistence/hot-path-indexes');
   const index=HOT_PATH_INDEXES.find(row=>row.name==='app_model_execution_stages_provider_created')!;
   await f.sql.query(index.sql);
   const indexed=await explain();
   assert.doesNotMatch(before.text,new RegExp(index.name));assert.match(indexed.text,new RegExp(index.name));
   assert.ok(indexed.blocks<before.blocks/5,`history blocks ${before.blocks} before, ${indexed.blocks} after index`);
   historyBlocks={before:before.blocks,indexed:indexed.blocks};
  }
  assert.equal(supplier,0);
  console.log((baseline?'PROVIDER_ACTIVITY_PRESSURE_BASELINE=PASS':'PROVIDER_ACTIVITY_PRESSURE=PASS')+' '+JSON.stringify({wireRowsAtLimit:baseline?50000:1,exactBytes,peak,credentialsAtLimit,overLimitPreserved:true,historyBlocks,supplier}));
 }finally{
  pool.off('acquire',trace);for(const [tx,query] of patched)tx.query=query;
  for(const req of requests)req.controller.abort();
  await lock.query('ROLLBACK');lock.release();await Promise.allSettled(requests.map(req=>req.done));
  if(listener.listening){listener.closeAllConnections();await new Promise<void>(r=>listener.close(()=>r()));}
  await closeDatabasePools();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
