import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until(check:()=>Promise<boolean>,message:string){
 const end=Date.now()+3000;
 while(!await check()){assert.ok(Date.now()<end,message);await delay(20);}
}

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(new URL(process.env.DATABASE_URL??'http://invalid').hostname,'127.0.0.1');
 Object.assign(process.env,{NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'fixture-settings-0123456789abcdef0123456789abcdef0123456789'});
 const f=await (await import('./billing-fixture')).createBillingFixture();
 let lock:PoolClient|undefined,observer:PoolClient|undefined,server:Server|undefined,completion:Promise<void>|undefined;
 try{
  const {ensureBillingSchema}=await import('../src/lib/billing/schema');
  await ensureBillingSchema(f.pool);
  const {signSession}=await import('../src/lib/admin-auth'),{GET}=await import('../src/app/api/admin/billing/route');
  const cookie='nv_admin='+signSession(Date.now()),request=(signal?:AbortSignal)=>new Request('http://localhost/api/admin/billing',{headers:{cookie},signal});
  const records=async()=>(await f.pool.query("SELECT (SELECT count(*)::int FROM app_billing_config_versions) AS versions,(SELECT count(*)::int FROM app_settings WHERE k='billing_config_version') AS pointers")).rows[0];
  assert.deepEqual(await records(),{versions:0,pointers:0});
  const lockWait=async()=>Boolean((await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
   AND wait_event_type='Lock' AND query LIKE '%JOIN app_billing_config_versions%'`)).rowCount);
  const unlock=async()=>{await lock!.query('ROLLBACK');lock!.release();lock=undefined;};
  assert.equal((await GET(new Request('http://localhost/api/admin/billing'))).status,404);
  lock=await f.pool.connect();await lock.query("BEGIN; SELECT pg_advisory_xact_lock(hashtext('naumi-billing-config'))");
  const cold=await GET(request(AbortSignal.timeout(1500)));assert.equal(cold.status,503);
  assert.deepEqual(await records(),{versions:0,pointers:0});
  await unlock();
  const {getBillingConfiguration}=await import('../src/lib/billing/configuration');
  const snapshot=await getBillingConfiguration().current();
  assert.equal(snapshot.version,1);assert.deepEqual(await records(),{versions:1,pointers:1});

  lock=await f.pool.connect();await lock.query('BEGIN; LOCK TABLE app_billing_config_versions IN ACCESS EXCLUSIVE MODE');
  let finish!:()=>void,routeStatus=0;completion=new Promise(resolve=>{finish=resolve;});
  server=createServer(async(_req,res)=>{
   try{const result=await GET(request(signalFromNodeResponse(res)));routeStatus=result.status;
    if(!res.destroyed){res.statusCode=result.status;res.end(await result.text());}
   }finally{finish();}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const {port}=server.address() as {port:number},abort=new AbortController();
  const pending=fetch('http://127.0.0.1:'+port,{signal:abort.signal}).catch(error=>error);
  await until(lockWait,'billing GET did not reach the held table lock');
  abort.abort();await pending;await completion;
  await until(async()=>!(await lockWait()),'disconnect did not release the PostgreSQL read');
  assert.equal(routeStatus,499);
  await unlock();

  delete process.env.NAUMI_MULTI_USER;
  await f.pool.query("INSERT INTO app_settings(k,v) VALUES('credits_metering','1') ON CONFLICT(k) DO UPDATE SET v='1'");
  observer=await f.pool.connect();
  const queries:string[]=[],tracked=new Map<PoolClient,PoolClient['query']>();let changed=false;
  const acquire=(tx:PoolClient)=>{
   if(tracked.has(tx))return;
   const original=tx.query;tracked.set(tx,original);
   tx.query=function(this:PoolClient,...args:unknown[]){
    const sql=typeof args[0]==='string'?args[0]:'';
    queries.push(sql);
    const result=Reflect.apply(original,this,args);
    if(!changed&&sql.includes('JOIN app_billing_config_versions')){
     changed=true;
     return Promise.resolve(result).then(async value=>{
      // The transaction read the config version before this legacy switch changed.
      await observer!.query("UPDATE app_settings SET v='0' WHERE k='credits_metering'");
      return value;
     });
    }
    return result;
   } as PoolClient['query'];
  };
  f.pool.on('acquire',acquire);
  try{
   const current=await GET(request());assert.equal(current.status,200);
   const json=await current.json();assert.equal(json.snapshot.version,1);assert.equal(json.effective.metering,true);
   assert.equal(queries.filter(sql=>sql.includes('JOIN app_billing_config_versions')).length,1);
   assert.equal(tracked.size,1);
   assert.match(current.headers.get('cache-control')??'',/private.*no-store/);
  }finally{
   f.pool.off('acquire',acquire);for(const [tx,query] of tracked)tx.query=query;
  }
  observer.release();observer=undefined;
  const settled=await (await GET(request())).json();
  assert.equal(settled.effective.metering,false);assert.equal(settled.snapshot.version,1);
  for(const mode of ['on','off'] as const){
   process.env.NAUMI_PUBLIC_COMMERCE=mode==='on'?'1':'0';
   const config=structuredClone(snapshot.config);
   config.switches={...config.switches,metering:mode,commerce:true,recharge:mode==='off'};
   const {rows}=await f.pool.query(`WITH published AS (
    INSERT INTO app_billing_config_versions(operation_id,request_fingerprint,actor,reason,config)
    VALUES($1,'fixture','fixture','test switch modes',$2::jsonb) RETURNING version
   ) UPDATE app_settings SET v=published.version::text FROM published WHERE k='billing_config_version' RETURNING published.version`,['fixture-'+mode,JSON.stringify(config)]);
   const result=await GET(request());assert.equal(result.status,200);
   const json=await result.json();
   assert.equal(json.snapshot.version,Number(rows[0].version));assert.deepEqual(json.snapshot.config.switches,config.switches);
   assert.deepEqual(json.effective,{metering:mode==='on',commerce:mode==='on',recharge:mode==='off',environmentCommerce:mode==='on'});
  }
  console.log('BILLING_CONFIG_ADMIN_READ=PASS COLD_GET_WAITS_ON_PUBLISH_LOCK=0 GET_BOOTSTRAPS=0 ACTIVE_VERSION_READS=1 ONE_READ_CLIENT=1 LEGACY_FLAGS_SNAPSHOT=1 DISCONNECT_RELEASE=1 NO_CACHE=1 REAL_PG=1');
 }finally{
  if(lock){await lock.query('ROLLBACK');lock.release();}
  observer?.release();
  if(server)await completion;
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
