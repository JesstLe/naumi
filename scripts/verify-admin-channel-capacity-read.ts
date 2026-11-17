import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';

async function until<T>(check:()=>Promise<T|undefined>,reason:string){
 const end=Date.now()+2800;
 do { const value=await check();if(value!==undefined)return value;await delay(15); } while(Date.now()<end);
 throw Error(reason);
}

async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline');let upstream=0;
 const f=await createModelFixture((_req,res)=>{upstream++;res.writeHead(500).end();});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,
  NAUMI_ROUTER_MANAGEMENT_URL:baseline?f.origin:'',NAUMI_ROUTER_MANAGEMENT_TOKEN:'local-router-test-token-01234567890',MODEL_CONFIG_ENVELOPE_SECRET:'local-router-test-secret-01234567890'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {supplierChannelKey}=await import('../src/lib/model-config/channel-scheduler');
 const {GET}=await import('../src/app/api/admin/bi/channel-capacity/route');
 const pool=getPool(),lock=await f.sql.connect();
 const admin='admin@capacity.fixture',member='member@capacity.fixture';
 const headers=(email=admin)=>({cookie:'nv_user='+signUserSession(email,Date.now())});
 const calls:string[]=[];
 const patched=new Map<PoolClient,PoolClient['query']>();
 const trace=(tx:PoolClient)=>{if(patched.has(tx))return;const prev=tx.query;patched.set(tx,prev);
  tx.query=((sql:unknown,...args:unknown[])=>{
   if(typeof sql==='string'&&/FROM app_model_(capacity_accounts|provider_leases|provider_budgets|channel_health)\b|JOIN app_model_provider_leases\b/.test(sql))calls.push(sql);
   return Reflect.apply(prev,tx,[sql,...args]);
  }) as typeof tx.query;
 };
 let host='';
 const results=new Map<string,number>();
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,host),response=await GET(new Request(url,{headers:headers(),signal:signalFromNodeResponse(res)}));
   results.set(url.searchParams.get('probe')!,response.status);
   if(!res.destroyed)res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 const work:{controller:AbortController;done:Promise<Response|undefined>}[]=[];
 try{
  const version=await f.repo.current();
  for(const email of [admin,member])await getOrCreateUser(email);
  await f.sql.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const provider=version.config.providers[0],channel=version.config.upstreamModels[0];
  const logical=createHash('sha256').update(`${provider.id}\n${new URL(provider.baseUrl).origin}`).digest('hex');
  await f.sql.query("INSERT INTO app_model_provider_budgets VALUES('fixture-merged',2),('fixture-hidden',256)");
  await f.sql.query("UPDATE app_model_capacity_accounts SET identity='fixture-merged' WHERE alias=$1",[logical]);
  const live=randomUUID(),expired=randomUUID();
  await f.sql.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) VALUES('fixture-merged',$1,now()+interval '5 minutes'),('fixture-merged',$2,now()-interval '1 minute')",[live,expired]);
  await f.sql.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) SELECT 'fixture-hidden',md5('hidden'||i)::uuid,now()+i*interval '1 second' FROM generate_series(1,205)i");
  const health=supplierChannelKey({providerId:provider.id,baseUrl:provider.baseUrl,wireModel:channel.model});
  await f.sql.query("INSERT INTO app_model_channel_health(key,failures,open_until,last_status,last_failure_kind) VALUES($1,3,now()+interval '6 minutes',503,'upstream_5xx')",[health]);
  const read=(email=admin)=>GET(new Request('http://fixture.invalid/api/admin/bi/channel-capacity',{headers:headers(email)}));
  assert.equal((await read(member)).status,404);
  pool.on('acquire',trace);
  const first=await read();assert.equal(first.status,200);assert.match(first.headers.get('cache-control')??'',/private.*no-store/);
  const body=await first.json();
  assert.equal(body.configVersion,version.version);
  assert.deepEqual(body.providers.map((p:any)=>[p.id,p.budgetMaxConcurrent,p.inFlight,p.merged]),[[provider.id,2,1,true]]);
  assert.deepEqual(body.providers[0].leases.map((x:{token:string})=>x.token),baseline?[]:[live]);
  assert.deepEqual(body.channels.map((c:any)=>[c.state,c.failures,c.lastStatus]),[['cooldown',3,503]]);
  const queries=calls.length;
  assert.equal(queries,baseline?5:2);
  pool.off('acquire',trace);for(const [tx,prev] of patched)tx.query=prev;
  if(!baseline){
   await f.sql.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) SELECT 'fixture-merged',md5('visible'||i)::uuid,now()+interval '7 minutes'+i*interval '1 second' FROM generate_series(1,205)i");
   const capped=await (await read()).json();
   assert.equal(capped.providers[0].inFlight,206);assert.equal(capped.providers[0].leases.length,200);
   assert.equal(capped.providers[0].leases[0].token,live);assert.equal(capped.providers[0].leases.some((x:{token:string})=>x.token===expired),false);
  }
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));host=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const locker=(await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await lock.query('BEGIN; LOCK TABLE app_model_capacity_accounts,app_model_provider_leases,app_model_channel_health IN ACCESS EXCLUSIVE MODE');
  const blocked=async()=>Number((await f.sql.query("SELECT count(*) FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))",[locker])).rows[0].count);
  const start=(probe:string)=>{
   const controller=new AbortController(),done=fetch(host+'/api/admin/bi/channel-capacity?probe='+probe,{signal:controller.signal}).catch(error=>{if(!controller.signal.aborted)throw error;return undefined;});
   const item={controller,done};work.push(item);return item;
  };
  const firstRequest=start('first');
  await until(async()=>await blocked()===(baseline?3:1)?true:undefined,'capacity read did not reach the locked tables');
  const second=start('second');if(!baseline)start('waiting');
  const peak=baseline?5:2;
  await until(async()=>await blocked()===peak?true:undefined,'capacity requests did not reach expected pool use');
  firstRequest.controller.abort();
  if(baseline){
   await delay(120);assert.equal(await blocked(),5);assert.equal(results.has('first'),false);
  }else{
   await until(async()=>results.get('first')===499?true:undefined,'client disconnect did not cancel the active query');
   assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok,1);
   await lock.query('ROLLBACK');
   assert.equal((await second.done)?.status,200);
  }
  assert.equal(upstream,0);
  console.log((baseline?'ADMIN_CHANNEL_CAPACITY_BASELINE=PASS':'ADMIN_CHANNEL_CAPACITY_READ=PASS')+' '+JSON.stringify({queries,peak,visibleLeases:body.providers[0].leases.length,upstream}));
 }finally{
  pool.off('acquire',trace);for(const [tx,prev] of patched)tx.query=prev;
  for(const item of work)item.controller.abort();
  await lock.query('ROLLBACK');lock.release();await Promise.allSettled(work.map(item=>item.done));
  if(server.listening){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  await closeDatabasePools();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
