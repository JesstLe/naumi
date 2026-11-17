import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import sharp from 'sharp';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(read:()=>Promise<T>,match:(value:T)=>boolean,message:string){
 const deadline=Date.now()+2500;
 for(;;){const value=await read();if(match(value))return value;assert.ok(Date.now()<deadline,message+' '+String(value));await delay(12);}
}

async function main(){
 const baseline=process.argv.includes('--baseline');
 const tempRoot=path.resolve(tmpdir()),prefix='naumi-creation-asset-fixture-';
 const rootDir=await mkdtemp(path.join(tempRoot,prefix));
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-creation-assets-0123456789abcdef0123456789abcdef',NAUMI_MULTI_USER:'1',
  PGPOOL_MAX:'5',STORAGE_DRIVER:'local',MEDIA_DIR:rootDir});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,connected=false,locked=false;
 const controllers:AbortController[]=[],pending:Promise<unknown>[]=[];
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants'),storage=await import('../src/lib/storage');
  assert.equal(path.resolve(storage.MEDIA_DIR),path.resolve(rootDir));
  await tenant.ensureTenantSchema();await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();
  await (await import('../src/lib/media-assets-schema')).ensureMediaSchema();await (await import('../src/lib/bi/schema')).ensureBiSchema();
  const [admin,owner,manager,member]=['admin','owner','manager','member'].map(name=>name+'@preview-fixture.test');
  for(const email of [admin,owner,manager,member]){
   await db.getOrCreateUser(email,email);
   await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[email]);
  }
  await f.pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const {tenantId}=await tenant.createTenant({email:admin,admin:true,consoleAdmin:true},{commandId:randomUUID(),name:'Fixture media',
   ownerEmail:owner,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{team:true}});
  const role=randomUUID(),root='cr-'+randomUUID(),asset='ca-'+randomUUID(),job='fixture-old-job';
  await f.pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Manager',10,true,true)",[tenantId,role]);
  await f.pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent'),($1,$5,$2,NULL,'permanent')",[tenantId,manager,owner,role,member]);
  await f.pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id) VALUES($1,$2,'tenant',$3,$2,'fixture',$1)",[root,member,tenantId]);
  await f.pool.query("INSERT INTO app_creation_assets(id,creation_id,direction,role,storage_ref,actor_email,media_type,mime) VALUES($1,$2,'output','result','/media/fixture.mp4',$3,'video','video/mp4')",[asset,root,member]);
  await storage.writeStoredObject(Buffer.from('fixture-video'),'video/mp4','fixture.mp4');
  await storage.writeStoredObject(await sharp({create:{width:3,height:3,channels:3,background:'#0570ba'}}).png().toBuffer(),'image/png','fixture.png');
  await f.pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled) VALUES($1,$2,'generate','{\"status\":\"done\"}',$3,false,true)",
   [job,member,{p:{images:[{buf:{$imageJobBuffer:'/media/fixture.png'}}]}}]);
  const {legacyCreationId}=await import('../src/lib/saas/creation-history-identity');
  const legacy=legacyCreationId({table:'app_image_jobs',id:job,email:member});
  const {signUserSession}=await import('../src/lib/native-auth');
  const {GET:tenantGET}=await import('../src/app/api/enterprise/creations/[id]/assets/[assetId]/route');
  const {GET:platformGET}=await import('../src/app/api/admin/creations/[id]/assets/[assetId]/route');
  const run=(enterprise:boolean,old:boolean,signal?:AbortSignal,selected=tenantId)=>{
   const id=old?legacy:root,assetId=old?'legacy-media-0':asset;
   const request=new Request(`http://localhost/api/${enterprise?'enterprise':'admin'}/creations/${id}/assets/${assetId}?tenantId=${selected}`,
    {signal,headers:{cookie:'nv_user='+signUserSession(enterprise?manager:admin,Date.now()),...(!old?{range:'bytes=0-6'}:{})}});
   return (enterprise?tenantGET:platformGET)(request,{params:Promise.resolve({id,assetId})});
  };
  for(const scoped of [true,false]){
   const video=await run(scoped,false);assert.equal(video.status,206,await video.clone().text());assert.equal(await video.text(),'fixture');
   const image=await run(scoped,true);assert.equal(image.status,200,await image.clone().text());assert.equal(image.headers.get('content-type'),'image/webp');await image.arrayBuffer();
  }
  assert.equal((await run(true,false,undefined,randomUUID())).status,404);
  await guard.connect();connected=true;
  const waiters=async()=>{
   await guard.query('SELECT pg_stat_clear_snapshot()');
   return Number((await guard.query(`SELECT count(DISTINCT pid) AS n FROM pg_locks
     WHERE NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND
     relation IN (to_regclass('app_creation_assets'),to_regclass('app_image_jobs'))`)).rows[0].n);
  };
  const lock=async(sql:string)=>{await guard.query('BEGIN; '+sql);locked=true;};
  const unlock=async(commit=false)=>{await guard.query(commit?'COMMIT':'ROLLBACK');locked=false;};
  await lock('LOCK TABLE app_creation_assets IN ACCESS EXCLUSIVE MODE');
  const beforeRevoke=run(true,false);pending.push(beforeRevoke);
  await until(waiters,n=>n===1,'asset did not reach the lock');
  await guard.query("SET LOCAL lock_timeout='150ms'; SAVEPOINT scope_change");
  const revoke=guard.query('UPDATE app_enterprise_roles SET view_records=false,version=version+1 WHERE id=$1 AND enterprise_id=$2',[role,tenantId]);
  if(baseline){
   await assert.rejects(revoke,{code:'55P03'});await guard.query('ROLLBACK TO SAVEPOINT scope_change');await unlock();
  }else{
   assert.equal((await revoke).rowCount,1);await unlock(true);
  }
  const revoked=await beforeRevoke;assert.equal(revoked.status,baseline?206:403,await revoked.clone().text());await revoked.arrayBuffer();
  if(!baseline)await f.pool.query('UPDATE app_enterprise_roles SET view_records=true,version=version+1 WHERE id=$1',[role]);
  const entered=new Set<string>(),done=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const i=String(req.headers['x-fixture-id']);entered.add(i);
   try{
    const state=await run(i!=='1'&&i!=='3',i==='2'||i==='3',signalFromNodeResponse(res));done.set(i,state.status);
    await state.body?.cancel();
    if(!res.destroyed){res.statusCode=state.status;res.end();}
   }catch(error){done.set(i,500);if(!res.destroyed)res.destroy(error as Error);}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  await lock('LOCK TABLE app_creation_assets,app_image_jobs IN ACCESS EXCLUSIVE MODE');
  const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
  for(let i=0;i<5;i++){
   const abort=new AbortController();controllers.push(abort);
   pending.push(fetch(endpoint,{headers:{'x-fixture-id':String(i)},signal:abort.signal}).catch(error=>error));
  }
  await until(waiters,n=>n===(baseline?5:2),'unexpected number of waiting asset reads');
  await until(async()=>entered.size,n=>n===5,'HTTP requests did not enter');
  if(!baseline){const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(300).then(()=>null)]);assert.equal(probe?.rows[0].n,1);}
  for(const controller of controllers)controller.abort();
  await Promise.allSettled(pending);
  if(baseline){assert.equal(await waiters(),5);await unlock();}
  else{await until(async()=>done.size,n=>n===5,'disconnected handlers did not complete');assert.deepEqual([...done.values()],Array(5).fill(499));await until(waiters,n=>n===0,'cancelled asset SQL remained');assert.equal(locked,true);}
  await until(async()=>done.size,n=>n===5,'handlers did not complete');
  console.log(baseline?'CREATION_ASSET_AUTH_BASELINE=PASS WAITS=5 LOCKED_REVOKE=1 DISCONNECT_RETAINS_SQL=1':
    'CREATION_ASSET_AUTH=PASS WAITS=2 LIVE_REVOKE=403 CANCELED_WITH_LOCK=5 RANGE=206 LEGACY_IMAGE=200 REAL_PG=1');
 }finally{
  for(const controller of controllers)controller.abort();
  if(locked)await guard.query('ROLLBACK').catch(()=>{});
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  if(connected)await guard.end();
  await f.close();
  assert.equal(path.dirname(path.resolve(rootDir)),tempRoot);
  assert.ok(path.basename(rootDir).startsWith(prefix));
  await rm(rootDir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
