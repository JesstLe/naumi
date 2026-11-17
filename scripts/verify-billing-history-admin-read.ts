import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function waitFor(check:()=>Promise<boolean>){
 const end=Date.now()+2800;
 while(!await check()){assert.ok(Date.now()<end,'SQL lock state did not change');await delay(20);}
}

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(new URL(process.env.DATABASE_URL??'http://invalid').hostname,'127.0.0.1');
 process.env.SETTINGS_SECRET='fixture-settings-0123456789abcdef0123456789abcdef0123456789';
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 let lock:PoolClient|undefined,server:Server|undefined;
 let finished:Promise<void>|undefined;
 try{
  const {getBillingConfiguration}=await import('../src/lib/billing/configuration');
  const config=await getBillingConfiguration().current();
  const {signSession}=await import('../src/lib/admin-auth');
  const {GET,POST}=await import('../src/app/api/admin/billing/versions/route');
  const {BILLING_HISTORY_CURSOR_HEADER}=await import('../src/lib/billing/version-history-contract');
  const headers={cookie:'nv_admin='+signSession(Date.now())};
  const base='http://localhost/api/admin/billing/versions',read=(suffix='')=>GET(new Request(base+suffix,{headers}));
  assert.equal((await GET(new Request(base))).status,404);
  let finish!:()=>void,routeStatus=0;
  server=createServer(async(req,res)=>{
   try{
    const result=await GET(new Request('http://localhost'+req.url,{headers,signal:signalFromNodeResponse(res)}));
    routeStatus=result.status;if(!res.destroyed){res.statusCode=result.status;res.end(await result.text());}
   }finally{finish();}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  for(const tail of ['', '?version='+config.version]){
   lock=await f.pool.connect();await lock.query('BEGIN; LOCK TABLE app_billing_config_versions IN ACCESS EXCLUSIVE MODE');
   const waiting=async()=>Boolean((await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
    AND wait_event_type='Lock' AND query LIKE '%FROM app_billing_config_versions%'`)).rowCount);
   const abort=new AbortController();finished=new Promise(resolve=>{finish=resolve;});
   const response=fetch(origin+'/api/admin/billing/versions'+tail,{signal:abort.signal}).catch(error=>error);
   await waitFor(waiting);abort.abort();await response;
   await finished;await waitFor(async()=>!await waiting());
   assert.equal(routeStatus,499);
   await lock.query('ROLLBACK');lock.release();lock=undefined;
  }
  assert.equal((await read('?version=0')).status,400);
  assert.equal((await read('?version=999999')).status,404);
  for(const suffix of ['?before=','?before=1e2','?before=9007199254740992','?before=1&version=1'])
   assert.equal((await read(suffix)).status,400);
  const historical=structuredClone(config.config);historical.credits.signup.amount+=1;
  const seeded=await f.pool.query(`INSERT INTO app_billing_config_versions(operation_id,request_fingerprint,actor,reason,config)
   SELECT 'history-fixture-'||n,'fixture','fixture','history '||n,$1::jsonb FROM generate_series(1,124) AS n RETURNING version`,[JSON.stringify(historical)]);
  const expected=[config.version,...seeded.rows.map(row=>Number(row.version))].sort((a,b)=>b-a);
  const parsePage=async(suffix='')=>{
   const result=await read(suffix);assert.equal(result.status,200);assert.match(result.headers.get('cache-control')??'',/private.*no-store/);
   const rows=await result.json();assert.ok(Array.isArray(rows));
   for(const row of rows){assert.deepEqual(Object.keys(row).sort(),['actor','createdAt','reason','version']);assert.ok(Number.isFinite(Date.parse(row.createdAt)));}
   return {ids:rows.map(row=>row.version),cursor:result.headers.get(BILLING_HISTORY_CURSOR_HEADER)};
  };
  const first=await parsePage();assert.deepEqual(first.ids,expected.slice(0,50));assert.equal(first.cursor,String(expected[49]));
  await f.pool.query(`INSERT INTO app_billing_config_versions(operation_id,request_fingerprint,actor,reason,config)
   VALUES('publication-while-paging','fixture','fixture','new top',$1::jsonb)`,[JSON.stringify(config.config)]);
  const second=await parsePage('?before='+first.cursor);assert.deepEqual(second.ids,expected.slice(50,100));assert.equal(second.cursor,String(expected[99]));
  const third=await parsePage('?before='+second.cursor);assert.deepEqual(third.ids,expected.slice(100));assert.equal(third.cursor,null);
  assert.deepEqual(await parsePage('?before=1'),{ids:[],cursor:null});
  const target=expected[expected.length-2],selected=await read('?version='+target);
  assert.equal(selected.status,200);assert.deepEqual(await selected.json(),{version:target,config:historical});
  const post=(body:unknown,origin='http://localhost')=>POST(new Request(base,{method:'POST',headers:{...headers,origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  const command={id:randomUUID(),expectedVersion:config.version,targetVersion:target,reason:'verified fixture historical restore'};
  assert.equal((await post(command,'http://different.test')).status,403);
  assert.equal((await post({...command,expectedVersion:target})).status,409);
  const committed=await post(command);assert.equal(committed.status,200,await committed.clone().text());
  const published=await committed.json();assert.ok(published.version>expected[0]);assert.deepEqual(published.config,historical);
  assert.deepEqual(await (await post(command)).json(),published);
  assert.equal((await post({...command,reason:'other reason'})).status,409);
  const receipt=(await f.pool.query('SELECT count(*)::int AS n FROM app_billing_config_versions WHERE operation_id=$1',[command.id])).rows[0];
  assert.equal(receipt.n,1);
  assert.deepEqual(await (await read('?version='+config.version)).json(),config);
  assert.deepEqual(await (await read('?version='+target)).json(),{version:target,config:historical});
  assert.equal((await getBillingConfiguration().current()).version,published.version);
  console.log('BILLING_HISTORY_READ=PASS HTTP_ABORT_RELEASES_SQL=2 LEGACY_ARRAY=1 KEYSET_ROWS=125 INSERT_BETWEEN_PAGES=1 FROZEN_VERSION=1 RESTORE_CAS=1 RESTORE_REPLAY=1 REAL_PG=1');
 }finally{
  if(lock){await lock.query('ROLLBACK');lock.release();}
  if(finished)await finished;
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
