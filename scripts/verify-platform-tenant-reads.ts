import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(read:()=>Promise<T>,match:(v:T)=>boolean,label:string){
 const end=Date.now()+2500;
 for(;;){const v=await read();if(match(v))return;assert.ok(Date.now()<end,label+': '+String(v));await delay(12);}
}
async function main(){
 const baseline=process.argv.includes('--baseline'),qty=800;
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-platform-tenants-0123456789abcdef01234567',NAUMI_MULTI_USER:'1',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,locked=false,connected=false;
 const aborters:AbortController[]=[],calls:Promise<unknown>[]=[];
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants');
  await tenant.ensureTenantSchema();await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();
  const [admin,owner,other]=['admin','owner','other'].map(s=>s+'@tenant-fixture.test');
  for(const email of [admin,owner,other])await db.getOrCreateUser(email,email);
  await db.setUserRole(admin,'admin');
  const make=(email:string,name:string)=>tenant.createTenant({email:admin,admin:true,consoleAdmin:true},{commandId:randomUUID(),
   name,ownerEmail:email,validUntil:null,seatLimit:null,entitlementName:'Fixture',featurePolicy:{team:true}});
  const {tenantId:id}=await make(owner,'Alpha'),{tenantId:otherId}=await make(other,'Beta');
  await f.pool.query(`INSERT INTO app_users(email,name,renews_at)
   SELECT 'member-'||i||'@tenant-fixture.test','Member '||lpad(i::text,5,'0'),now()+interval '1 year' FROM generate_series(1,$1::int) i`,[qty]);
  const role=randomUUID();
  await f.pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level) VALUES($1,$2,'Staff',20)",[id,role]);
  await f.pool.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment,membership_status)
   SELECT $1,'member-'||i||'@tenant-fixture.test',$2,$3,'permanent',CASE WHEN i=1 THEN 'suspended' ELSE 'active' END FROM generate_series(1,$4::int) i`,[id,owner,role,qty]);
  await f.pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id) VALUES('tenant-root',$1,'tenant',$2,$1,'fixture','tenant-root'),('other-root',$3,'tenant',$4,$3,'fixture','other-root')",[owner,id,other,otherId]);
  await f.pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES('fixture-settled',$1,'fixture','{}','fixture','settled',7,'tenant-ledger')",[owner]);
  await f.pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES('tenant-root','billing','fixture-settled',$1)",[owner]);
  const {GET:detail}=await import('../src/app/api/admin/tenants/[id]/route'),{GET:list}=await import('../src/app/api/admin/tenants/route'),
   {signUserSession}=await import('../src/lib/native-auth');
  const get=(kind:'detail'|'list',query='',signal?:AbortSignal,email=admin)=>{
   const r=new Request('http://localhost/api/admin/tenants'+(kind==='detail'?'/'+id:'')+(query?'?'+query:''),{signal,headers:{cookie:'nv_user='+signUserSession(email,Date.now())}});
   return kind==='detail'?detail(r,{params:Promise.resolve({id})}):list(r);
  };
  assert.equal((await get('detail','',undefined,owner)).status,403);
  assert.equal((await get('list','',undefined,owner)).status,403);
  const full=await get('detail'),text=await full.text(),payload=JSON.parse(text);
  assert.equal(full.status,200,text.slice(0,150));assert.equal(payload.tenant.activeMembers,qty);
  assert.equal(payload.members.length,qty);assert.equal(payload.roles.length,1);assert.equal(payload.audit.length,1);
  assert.deepEqual(payload.usage,{confirmedCreations:1,consumedCredits:7});assert.equal(payload.members[0].membership_status,'suspended');
  const index=await(await get('list','q=Alpha&sort=name&size=10')).json();
  assert.equal(index.total,1);assert.equal(index.items[0].tenantId,id);assert.equal(index.items[0].creationCount,1);
  await guard.connect();connected=true;
  const lock=async(names:string)=>{await guard.query('BEGIN; LOCK TABLE '+names+' IN ACCESS EXCLUSIVE MODE');locked=true;};
  const unlock=async()=>{await guard.query('ROLLBACK');locked=false;};
  if(baseline){
   const projected=await(await get('detail','projection=summary')).json();assert.equal(projected.members.length,qty);assert.equal(projected.usage.consumedCredits,7);
  }else{
   await lock('app_creation_records,app_tenant_commands,app_enterprise_audit');
   const summary=await get('detail','projection=summary'),summaryText=await summary.text(),profile=JSON.parse(summaryText);
   assert.equal(summary.status,200);assert.equal(profile.tenant.tenantId,id);assert.equal(profile.tenant.activeMembers,qty);
   assert.equal(profile.members.length,0);assert.equal(profile.audit.length,0);assert.equal(profile.usage.consumedCredits,null);
   const roster=await(await get('detail','projection=members')).json();
   assert.deepEqual(roster.members,payload.members);assert.deepEqual(roster.roles,payload.roles);assert.deepEqual(roster.audit,[]);
   await unlock();await lock('app_creation_records,app_billing_operations');
   const audit=await(await get('detail','projection=audit')).json();
   assert.deepEqual(audit.audit,payload.audit);assert.deepEqual(audit.members,[]);assert.deepEqual(audit.roles,[]);
   await unlock();assert.equal((await get('detail','projection=unexpected')).status,400);
   console.log('PLATFORM_TENANT_BYTES='+JSON.stringify({legacy:Buffer.byteLength(text),summary:Buffer.byteLength(summaryText)}));
  }
  const waiting=async()=>Number((await guard.query(`SELECT count(DISTINCT pid) AS n FROM pg_locks WHERE NOT granted
   AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND relation='app_creation_records'::regclass`)).rows[0].n);
  await lock('app_creation_records');
  const active=new Set<string>(),done=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const i=String(req.headers['x-fixture-id']);active.add(i);
   try{const out=await get(Number(i)%2===0?'detail':'list','',signalFromNodeResponse(res));done.set(i,out.status);
    if(!res.destroyed){res.statusCode=out.status;res.end(await out.text());}}finally{active.delete(i);}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
  for(let i=0;i<5;i++){const ac=new AbortController();aborters.push(ac);calls.push(fetch(endpoint,{headers:{'x-fixture-id':String(i)},signal:ac.signal}).catch(e=>e));}
  await until(waiting,n=>n===(baseline?5:2),'mixed lock wait');await until(async()=>active.size,n=>n===5,'requests active');
  if(!baseline){const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(350).then(()=>null)]);assert.equal(probe?.rows[0].n,1);}
  for(const ac of aborters)ac.abort();await Promise.all(calls);
  if(baseline){assert.equal(await waiting(),5);await unlock();}
  else{await until(waiting,n=>n===0,'cancelled SQL retained');assert.equal(locked,true);}
  await until(async()=>done.size,n=>n===5,'unfinished handlers');if(!baseline)assert.deepEqual([...done.values()],Array(5).fill(499));
  console.log(baseline?'PLATFORM_TENANT_READ_BASELINE=PASS ALL_SECTIONS=1 WAITS=5 DISCONNECT_RETAINS_SQL=1':
   'PLATFORM_TENANT_READ=PASS SCOPED_PROJECTIONS=1 OLD_FIELDS=1 WAITS=2 DISCONNECT_RELEASE=1 REAL_PG=1');
 }finally{
  for(const ac of aborters)ac.abort();
  if(locked)await guard.query('ROLLBACK').catch(()=>{});
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
  if(connected)await guard.end();
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
