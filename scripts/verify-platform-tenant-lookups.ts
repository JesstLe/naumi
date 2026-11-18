import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

const baseline=process.argv.includes('--baseline');
async function until<T>(get:()=>Promise<T>,ok:(value:T)=>boolean,label:string){
 const end=Date.now()+3_000;
 for(;;){const value=await get();if(ok(value))return value;assert.ok(Date.now()<end,label+': '+String(value));await delay(12);}
}
async function main(){
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-platform-lookups-0123456789abcdef01234567',NAUMI_MULTI_USER:'1',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,connected=false,locked=false;
 const controllers:AbortController[]=[];
 try{
  const db=await import('../src/lib/db'),tenants=await import('../src/lib/saas/tenants');
  const {GET}=await import('../src/app/api/admin/tenants/route'),{signUserSession}=await import('../src/lib/native-auth');
  await tenants.ensureTenantSchema();
  const admin='primary@lookup.test',other='secondary@lookup.test',owner='owner@lookup.test',former='legacy@lookup.test';
  for(const email of [admin,other,owner,former])await db.getOrCreateUser(email,email);
  for(const email of [admin,other])await db.setUserRole(email,'admin');
  const commandId=randomUUID(),unknown=randomUUID(),legacy=randomUUID();
  const saved=await tenants.createTenant({email:admin,admin:true,consoleAdmin:true},
   {commandId,ownerEmail:owner,name:'Lookup tenant',validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{}});
  await f.pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Lookup legacy',$2,now()+interval '1 day')",[legacy,former]);
  const command='commandId='+commandId,own='ownerEmail='+encodeURIComponent(owner.toUpperCase());
  const get=(query:string,email=admin,signal?:AbortSignal)=>GET(new Request('http://localhost/api/admin/tenants?'+query,{signal,headers:{cookie:'nv_user='+signUserSession(email,Date.now())}}));
  const receipt=await get(command+'&'+own);
  assert.equal(receipt.status,200);assert.match(receipt.headers.get('cache-control')??'',/no-store/);
  assert.deepEqual(await receipt.json(),{...saved,replayed:true});
  const denied=await get(command,other),missing=await get('commandId='+unknown);
  assert.equal(denied.status,404);assert.equal(missing.status,404);assert.deepEqual(await denied.json(),await missing.json());
  assert.equal((await get(command,owner)).status,403);assert.equal((await get(own,owner)).status,403);
  assert.equal((await get('commandId=invalid')).status,400);assert.equal((await get('ownerEmail=invalid')).status,400);
  assert.deepEqual(await(await get(own)).json(),{email:owner,team:{id:saved.tenantId,name:'Lookup tenant'},activeTenant:saved.tenantId});
  assert.deepEqual(await(await get('ownerEmail='+encodeURIComponent(former))).json(),{email:former,team:{id:legacy,name:'Lookup legacy'},activeTenant:null});
  assert.deepEqual(await(await get('ownerEmail=no-team%40lookup.test')).json(),{email:'no-team@lookup.test',team:null,activeTenant:null});
  await guard.connect();connected=true;
  const lock=async(tables:string)=>{await guard.query('BEGIN; LOCK TABLE '+tables+' IN ACCESS EXCLUSIVE MODE');locked=true;};
  const unlock=async()=>{await guard.query('ROLLBACK');locked=false;};
  if(!baseline){
   await lock('app_tenant_commands');
   assert.equal((await get(own)).status,200);
   const blocked=await get(command);assert.equal(blocked.status,503);assert.equal((await blocked.json()).uncertain,true);
   await unlock();assert.deepEqual(await(await get(command)).json(),{...saved,replayed:true});
  }
  await lock('app_tenant_commands,app_account_teams');
  const waiting=async()=>Number((await guard.query(`SELECT count(DISTINCT pid) n FROM pg_locks WHERE NOT granted
    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND relation IN('app_tenant_commands'::regclass,'app_account_teams'::regclass)`)).rows[0].n);
  const started=new Set<string>(),finished=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const id=String(req.headers['x-fixture-id']);started.add(id);
   const response=await get(Number(id)<3?command:own,admin,signalFromNodeResponse(res));
   finished.set(id,response.status);
   if(!res.destroyed){res.statusCode=response.status;res.end(await response.text());}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const pending=Array.from({length:5},(_,i)=>{const c=new AbortController();controllers.push(c);return fetch(endpoint,{signal:c.signal,headers:{'x-fixture-id':String(i)}}).catch(e=>e);});
  const seen=await until(waiting,n=>n===(baseline?5:2),'lookups waiting for lock');
  await until(async()=>started.size,n=>n===5,'all requests started');
  if(!baseline){const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(350).then(()=>null)]);assert.equal(probe?.rows[0].n,1);}
  for(const c of controllers)c.abort();await Promise.all(pending);
  if(baseline){assert.equal(await waiting(),5);await unlock();}
  else{
   await until(waiting,n=>n===0,'aborted lookup retained database wait');
   assert.equal(locked,true);
  }
  await until(async()=>finished.size,n=>n===5,'HTTP handlers finished');
  if(!baseline){
   assert.deepEqual([...finished.values()],Array(5).fill(499));
   await unlock();
   assert.deepEqual(await(await get(command)).json(),{...saved,replayed:true});
   assert.equal((await f.pool.query('SELECT count(*)::int n FROM app_tenant_commands')).rows[0].n,1);
  }
  console.log(baseline?`PLATFORM_TENANT_LOOKUP_BASELINE=PASS WAITS=${seen} DISCONNECTED_RETAINED=5`:
    `PLATFORM_TENANT_LOOKUPS=PASS WAITS=${seen} DISCONNECT_RELEASE=1 EXACT_ACTOR=1 LEGACY_AND_ACTIVE_OWNER=1 REAL_PG=1`);
 }finally{
  for(const controller of controllers)controller.abort();
  if(locked)await guard.query('ROLLBACK').catch(()=>{});
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
  if(connected)await guard.end();
  await f.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
