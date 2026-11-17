import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {fixtureConfig,facts} from './billing-unit-fixture';
import {quote} from '../src/lib/billing/quote';

async function until(check:()=>Promise<boolean>,message:string){const end=Date.now()+2400;while(!await check()){assert.ok(Date.now()<end,message);await delay(20);}}
async function bounded<T>(promise:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('review read blocked behind an operation row lock')),1400);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(new URL(process.env.DATABASE_URL??'http://invalid').hostname,'127.0.0.1');
 Object.assign(process.env,{NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'fixture-settings-0123456789abcdef0123456789abcdef0123456789',OPENAI_API_KEY:'fixture'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 let owner:PoolClient|undefined,waiting:Promise<Response|null>|undefined,server:Server|undefined;
 let guardId:string|undefined,guardSchemaCreated=false,guardTableCreated=false;
 try{
  const {signSession}=await import('../src/lib/admin-auth'),{GET,POST}=await import('../src/app/api/admin/billing/operations/route');
  const {GET:pending}=await import('../src/app/api/admin/billing/pending/route');
  const {exposeAbandonedBillingOperations}=await import('../src/lib/billing/review-state');
  const cookie='nv_admin='+signSession(Date.now());
  const request=(view='operations',suffix='')=>new Request(`http://localhost/api/admin/billing/${view}${suffix}`,{headers:{cookie}});
  assert.equal((await GET(request())).status,200);
  const email=await f.user(100);
  const {withBillingTransaction}=await import('../src/lib/billing/service');
  const create=async(prefix:string,age:number,threshold?:number)=>{
   const id=prefix+randomUUID(),frozen=quote({version:1,config:fixtureConfig()},facts({feature:'tool.cutout'}));
   await withBillingTransaction(f.pool,tx=>f.service.reserveTx(tx,{id,email,quote:{...frozen,...(threshold?{staleReservationMinutes:threshold}:{})},reason:'Fixture billing reservation',ledgerId:'led-'+id,fingerprint:id}));
   await f.pool.query('UPDATE app_billing_operations SET updated_at=now()-make_interval(mins=>$2) WHERE id=$1',[id,age]);return id;
  };
  const id=await create('tool-',45),roll=await create('tool-',50),fresh=await create('tool-',2),extended=await create('tool-',60,120),unrelated=await create('unlinked-',200);
  const linked=await create('task-',0);
  await f.pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,reserved_cost,metered) VALUES($1,$2,'generate','{\"status\":\"needs_attention\"}','{}',1,1,true)",[linked,email]);
  const wallet=async()=> (await f.pool.query('SELECT credits_total,credits_used FROM app_users WHERE email=$1',[email])).rows[0];
  const state=async(id:string)=> (await f.pool.query('SELECT state FROM app_billing_operations WHERE id=$1',[id])).rows[0].state;
  const before=await wallet(),release=async()=>{await owner!.query('ROLLBACK');owner!.release();owner=undefined;};
  const badgeBefore=(await (await pending(request('pending','?view=summary'))).json()).total;
  owner=await f.pool.connect();await owner.query('BEGIN');await owner.query('SELECT id FROM app_billing_operations WHERE id=$1 FOR UPDATE',[id]);
  waiting=GET(request());const list=await bounded(waiting);assert.equal(list?.status,200);
  assert.deepEqual((await list!.json()).map((r:{id:string;state:string})=>[r.id,r.state]).sort(),[[id,'manual'],[roll,'manual'],[linked,'manual']].sort());
  const detail=await bounded(GET(request('operations','?id='+id)));assert.equal(detail.status,200);assert.equal((await detail.json()).state,'manual');
  const view=await bounded(pending(request('pending')));assert.equal(view.status,200);
  const overview=await view.json();assert.equal(overview.summary['billing-operation'].count,3);
  assert.equal(overview.items.find((r:{source:string;id:string})=>r.source==='image-job'&&r.id===linked).operationState,'manual');
  assert.equal((await (await pending(request('pending','?view=summary'))).json()).total,badgeBefore);
  assert.equal(await state(id),'reserved');assert.equal(await state(linked),'reserved');assert.deepEqual(await wallet(),before);
  // If the linked task recovers before an explicit reconciliation obtains its
  // row lock, a subsequent statement must check the now-current task state.
  await f.pool.query("UPDATE app_image_jobs SET snapshot='{\"status\":\"done\"}' WHERE id=$1",[linked]);
  assert.equal(await bounded(exposeAbandonedBillingOperations(f.pool)),1);
  assert.equal(await state(roll),'manual');assert.equal(await state(id),'reserved');assert.equal(await state(linked),'reserved');
  await release();
  const command=(operationId:string,key=randomUUID())=>({id:key,operationId,reason:'Verified fixture outcome',proof:'Fixture evidence of original output',result:{state:'succeeded',items:[{id:operationId,state:'succeeded',executedQuality:'medium'}]}});
  const submit=(body:ReturnType<typeof command>)=>POST(new Request('http://localhost/api/admin/billing/operations',{method:'POST',headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)}));
  await f.pool.query("UPDATE app_image_jobs SET snapshot='{\"status\":\"needs_attention\"}' WHERE id=$1",[linked]);
  owner=await f.pool.connect();await owner.query('BEGIN');await owner.query('SELECT id FROM app_billing_operations WHERE id=$1 FOR UPDATE',[linked]);
  waiting=submit(command(linked));
  await until(async()=>Boolean((await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
   AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FROM app_billing_operations WHERE id=$1 FOR UPDATE%'`)).rowCount),'manual review did not wait for the operation owner');
  await f.pool.query("UPDATE app_image_jobs SET snapshot='{\"status\":\"done\"}' WHERE id=$1",[linked]);
  await release();assert.equal((await waiting)?.status,409);assert.equal(await state(linked),'reserved');assert.deepEqual(await wallet(),before);
  for(const other of [fresh,extended,unrelated,linked]){
   assert.equal((await GET(request('operations','?id='+other))).status,404);
   const rejected=await submit(command(other));assert.equal(rejected.status,409);assert.equal(await state(other),'reserved');
  }
  const accepted=command(id),settled=await submit(accepted);assert.equal(settled.status,200,await settled.clone().text());
  const charged=(await settled.json()).charge;assert.ok(charged>0);assert.equal(await state(id),'settled');
  const replay=await submit(accepted);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal(Number((await wallet()).credits_total),Number(before.credits_total)-charged);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM app_billing_reconciliations WHERE operation_id=$1',[id])).rows[0].n,1);
  const staging='tool-'+randomUUID();
  await f.pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id,updated_at) VALUES($1,$2,'tool.cutout','{}','fixture','reserved','fixture','2000-01-01')`,[staging,email]);
  if(!(await f.pool.query("SELECT to_regnamespace('naumi_staging_guard') AS n")).rows[0].n){await f.pool.query('CREATE SCHEMA naumi_staging_guard');guardSchemaCreated=true;}
  if(!(await f.pool.query("SELECT to_regclass('naumi_staging_guard.origin_rows') AS n")).rows[0].n){await f.pool.query('CREATE TABLE naumi_staging_guard.origin_rows(table_name text,row_key text,PRIMARY KEY(table_name,row_key))');guardTableCreated=true;}
  const guardCols=(await f.pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='naumi_staging_guard' AND table_name='origin_rows'")).rows.map(r=>r.column_name);
  if(guardCols.includes('snapshot_sha256'))await f.pool.query("INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key,snapshot_sha256) VALUES('app_billing_operations','id',$1,repeat('0',64))",[staging]);
  else await f.pool.query("INSERT INTO naumi_staging_guard.origin_rows(table_name,row_key) VALUES('app_billing_operations',$1)",[staging]);
  guardId=staging;
  process.env.NAUMI_STAGING_HISTORY_GUARD='1';process.env.NAUMI_ENVIRONMENT='staging';
  assert.equal((await GET(request('operations','?id='+staging))).status,404);assert.equal(await exposeAbandonedBillingOperations(f.pool),0);assert.equal(await state(staging),'reserved');
  const foreign=await submit(command(staging));assert.equal(foreign.status,503);assert.equal(await state(staging),'reserved');
  const batch='tool-batch-'+randomUUID()+':';
  await f.pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id,updated_at)
    SELECT $1||n,$2,'tool.cutout','{}','fixture','reserved','fixture','2000-01-01' FROM generate_series(1,101) n`,[batch,email]);
  assert.equal(await exposeAbandonedBillingOperations(f.pool),100);assert.equal(await exposeAbandonedBillingOperations(f.pool),1);
  assert.equal(await state(staging),'reserved');
  delete process.env.NAUMI_STAGING_HISTORY_GUARD;delete process.env.NAUMI_ENVIRONMENT;
  let abortedStatus=0;
  server=createServer(async(_req,res)=>{const signal=signalFromNodeResponse(res);
   const result=await GET(new Request('http://localhost/api/admin/billing/operations',{headers:{cookie},signal}));
   abortedStatus=result.status;if(!res.destroyed)res.writeHead(result.status).end(await result.text());});
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
  owner=await f.pool.connect();await owner.query('BEGIN');await owner.query('LOCK app_billing_operations IN ACCESS EXCLUSIVE MODE');
  const disconnected=new AbortController();waiting=fetch(url,{signal:disconnected.signal}).catch(()=>null);
  const blocked=async()=>Boolean((await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%app_billing_operations%' AND query LIKE '%SELECT o.id%'`)).rowCount);
  await until(blocked,'request did not reach the actual database wait');disconnected.abort();
  await until(async()=>abortedStatus===499&&!await blocked(),'disconnect retained the PostgreSQL read');await release();assert.equal(await waiting,null);
  console.log('BILLING_REVIEW_ROUTE=PASS GET_ROW_LOCK_WAIT=0 GET_STATE_WRITES=0 DISCONNECT_RELEASE=1 WORKER_SKIP_LOCKED=1 WORKER_LIMIT=100 RECHECK_AFTER_LOCK=1 ORIGINAL_WALLET_REPLAY=1 IMPORTED_RESERVED=DENIED REAL_PG=1');
 }finally{
  if(owner){await owner.query('ROLLBACK').catch(()=>{});owner.release();}
  await waiting?.catch(()=>{});if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   if(guardId)await f.pool.query("DELETE FROM naumi_staging_guard.origin_rows WHERE table_name='app_billing_operations' AND row_key=$1",[guardId]);
   if(guardTableCreated)await f.pool.query('DROP TABLE naumi_staging_guard.origin_rows');
   if(guardSchemaCreated)await f.pool.query('DROP SCHEMA naumi_staging_guard');
  }finally{await f.close();}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
