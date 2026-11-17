import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(read:()=>Promise<T>,matches:(v:T)=>boolean,message:string){
 const end=Date.now()+2600;
 for(;;){const value=await read();if(matches(value))return value;assert.ok(Date.now()<end,message);await delay(15);}
}
async function main(){
 const baseline=process.argv.includes('--baseline');
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-settings-0123456789abcdef0123456789abcdef0123456789',NAUMI_MULTI_USER:'1',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,locked=false,connected=false;
 const requests:Promise<unknown>[]=[],controllers:AbortController[]=[];
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants');
  await tenant.ensureTenantSchema();await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();
  await (await import('../src/lib/billing/schema')).ensureBillingSchema(f.pool);
  await guard.connect();connected=true;
  const owner='overview-owner@example.test',manager='overview-manager@example.test',member='overview-member@example.test',
        sibling='overview-sibling@example.test',siteAdmin='site-admin@example.test',outside='other-owner@example.test';
  for(const email of [owner,manager,member,sibling,siteAdmin,outside]){
   await db.getOrCreateUser(email,email);
   await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[email]);
  }
  await f.pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[siteAdmin]);
  const platform={email:'local-admin',admin:true,consoleAdmin:true};
  const make=async(email:string)=>(await tenant.createTenant(platform,{commandId:randomUUID(),name:'Fixture tenant',ownerEmail:email,
   validUntil:null,seatLimit:null,entitlementName:'Fixture',featurePolicy:{team:true}})).tenantId;
  const a=await make(owner),b=await make(outside),r=randomUUID();
  await f.pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'主管',10,true,true)",[a,r]);
  for(const [email,supervisor,role] of [[manager,owner,r],[member,manager,null],[sibling,owner,null]]){
   await f.pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')",[a,email,supervisor,role]);
  }
  await f.pool.query("UPDATE app_enterprise_members SET membership_expires_at=now()+interval '3 days' WHERE email=$1",[member]);
  await f.pool.query(`INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result)
   VALUES($1,$2,$3,'role',$4,'fixture','{}'),($5,$2,$3,'role',$6,'fixture','{}')`,[randomUUID(),a,owner,member,randomUUID(),sibling]);
  const {signUserSession}=await import('../src/lib/native-auth'),{signSession}=await import('../src/lib/admin-auth');
  const {GET:overview}=await import('../src/app/api/enterprise/saas-overview/route');
  const {GET:enterprise}=await import('../src/app/api/enterprise/tenant-usage/route'),{GET:admin}=await import('../src/app/api/admin/tenant-usage/route');
  const overviewPath='/api/enterprise/saas-overview?tenantId=';
  const route=(kind:string,id=a)=>kind==='overview'?overviewPath+id:
    `/api/${kind==='enterprise'?'enterprise':'admin'}/tenant-usage?tenantId=${id}&from=2026-10-20&to=2026-10-24`;
  const cookie=(email:string)=>'nv_user='+signUserSession(email,Date.now());
  const run=(kind:string,actor=owner,id=a,signal?:AbortSignal)=>{
   const request=new Request('http://localhost'+route(kind,id),{headers:{cookie:kind==='platform'?'nv_admin='+signSession(Date.now()):cookie(actor)},signal});
   return (kind==='overview'?overview:kind==='enterprise'?enterprise:admin)(request);
  };
  const ownResponse=await run('overview');assert.equal(ownResponse.status,200,await ownResponse.clone().text());
  const own=await ownResponse.json();assert.deepEqual(own.members,{visible:4,effective:4,expiring:1});
  const scoped=await (await run('overview',manager)).json();assert.deepEqual(scoped.members,{visible:2,effective:2,expiring:1});
  assert.deepEqual(scoped.activities.map((item:{target:string})=>item.target),[member]);
  assert.equal((await run('overview',owner,b)).status,403);
  assert.equal((await run('enterprise',owner,b)).status,403);
  Object.assign(process.env,{NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'overview-fixture',NAUMI_ENTERPRISE_ALLOWED_IDS:a});
  const dedicated=await (await run('overview',siteAdmin)).json();
  assert.equal(dedicated.members.visible,baseline?6:5);
  assert.equal((await run('overview',siteAdmin,b)).status,404);
  process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='shared';
  const active=new Set<string>(),done=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const id=String(req.headers['x-fixture-id']),kind=String(req.headers['x-fixture-kind']);active.add(id);
   try{
    const response=await run(kind,owner,a,signalFromNodeResponse(res));done.set(id,response.status);
    if(!res.destroyed){res.statusCode=response.status;res.end(await response.text());}
   }finally{active.delete(id);}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const waiting=async()=>{
   await guard.query('SELECT pg_stat_clear_snapshot()');
   return Number((await guard.query(`SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database()
    AND wait_event_type='Lock' AND pid<>pg_backend_pid()
    AND (query LIKE '%WITH RECURSIVE roots%' OR query LIKE '%FROM app_enterprise_audit%')`)).rows[0].n);
  };
  await guard.query('BEGIN; LOCK TABLE app_creation_records,app_enterprise_audit IN ACCESS EXCLUSIVE MODE');locked=true;
  const kinds=['overview','platform','enterprise','platform','enterprise'];
  const ids=Array.from({length:kinds.length},(_,i)=>'mixed-'+i);
  for(const [i,id] of ids.entries()){
   const controller=new AbortController();controllers.push(controller);
   requests.push(fetch(endpoint,{headers:{'x-fixture-id':id,'x-fixture-kind':kinds[i]},signal:controller.signal}).catch(e=>e));
  }
  const max=baseline?5:2;
  await until(waiting,n=>n===max,'unexpected number of blocked report connections');
  await until(async()=>active.size,n=>n===5,'fixture requests did not all enter');
  assert.equal(await waiting(),max);
  if(!baseline){
   const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(350).then(()=>null)]);assert.equal(probe?.rows[0].n,1);
  }
  for(const controller of controllers)controller.abort();await Promise.all(requests);
  if(baseline){assert.equal(await waiting(),max);await guard.query('ROLLBACK');locked=false;}
  else{await until(waiting,n=>n===0,'disconnected requests retained SQL');assert.equal(locked,true);}
  await until(async()=>done.size,n=>n===5,'handlers did not finish');
  if(!baseline)assert.deepEqual([...done.values()],Array(5).fill(499));
  console.log(baseline?'TENANT_ADMIN_READ_BASELINE=PASS MIXED_REPORT_WAITS=5 DISCONNECT_RETAINS_SQL=1 DEDICATED_OWNER_DOUBLE_COUNT=1 REAL_PG=1':
   'TENANT_ADMIN_READ=PASS MIXED_REPORT_WAITS=2 DISCONNECT_RELEASE=1 BUSINESS_POOL_FREE=1 DEDICATED_OWNER_ONCE=1 TENANT_SCOPE=1 REAL_PG=1');
 }finally{
  for(const controller of controllers)controller.abort();
  if(locked)await guard.query('ROLLBACK');
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  if(connected)await guard.end();
  await f.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
