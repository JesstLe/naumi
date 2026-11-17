import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,type PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const dbUrl=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(dbUrl.hostname,'127.0.0.1');assert.match(dbUrl.pathname,/fixture/);
 const schema='media_manifest_'+randomUUID().replaceAll('-','');
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,PGPOOL_MAX:'1',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'isolated-media-manifest-fixture-0123456789',
  STORAGE_DRIVER:'s3',S3_ENDPOINT:'http://127.0.0.1:9',S3_FORCE_PATH_STYLE:'true',S3_BUCKET:'fixture',S3_REGION:'us-east-1',
  S3_ACCESS_KEY_ID:'fixture-key',S3_SECRET_ACCESS_KEY:'fixture-only-secret',MEDIA_PRIVATE:'1'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {ensureEnterpriseSchema,activateEnterprise}=await import('../src/lib/enterprise/server');
 const {ensureMediaSchema}=await import('../src/lib/media-assets-schema');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {POST}=await import('../src/app/api/media/image-cache/route');
 const {GET}=await import('../src/app/api/enterprise/media/route');
 const pool=getPool(), db=new Client({connectionString:dbUrl.toString()});await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await ensureEnterpriseSchema();await ensureMediaSchema();
  const owner='owner@manifest.fixture', member='member@manifest.fixture', foreign='foreign@manifest.fixture';
  const enterpriseId=randomUUID(), otherId=randomUUID();
  for(const email of [owner,member,foreign])await getOrCreateUser(email);
  await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[owner]);
  await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Fixture',$2,now()+interval '3 days'),($3,'Other',$4,now()+interval '3 days')",[enterpriseId,owner,otherId,foreign]);
  await pool.query('INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)',[member,enterpriseId]);
  await activateEnterprise({email:owner,admin:true,consoleAdmin:true},enterpriseId,member,[]);
  await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[otherId]);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,deleted_at)
   SELECT 'asset-'||i,$1,'Fixture','image','','/media/image-'||i||'.png','',CASE WHEN i=16 THEN now() END FROM generate_series(1,16)i`,[member]);
  await pool.query(`INSERT INTO app_media_assets(key,owner,driver,remote_ready,content_type,sha256,bytes)
   SELECT 'image-'||i||'.png',$1,'s3',true,'image/png','version-'||i,42 FROM generate_series(1,16)i`,[member]);
  const largeInline='data:image/png;base64,'+Buffer.alloc(5000,1).toString('base64');
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient)
   VALUES('legacy',$1,'Old','image','',$2,''),('foreign-preview',$3,'Foreign','image','','/media/image-1.png','')`,[member,largeInline,foreign]);
  const pathFor=(id:string,email=member,tenant=enterpriseId)=>'/api/enterprise/media?'+new URLSearchParams({enterpriseId:tenant,email,id});
  const images=Array.from({length:16},(_,i)=>pathFor('asset-'+(i+1)));
  const firstFull=images[0]+'&full=1',legacy=pathFor('legacy'),foreignArt=pathFor('foreign-preview'),foreignTenant=pathFor('foreign-preview',foreign,otherId);
  const request=(sources:string[],signal?:AbortSignal)=>new Request('http://fixture.invalid/api/media/image-cache',{
   method:'POST',headers:{origin:'http://fixture.invalid',cookie:'nv_user='+signUserSession(owner,Date.now()),'content-type':'application/json'},body:JSON.stringify({sources}),signal,
  });
  const calls={scope:0,version:0};
  const clients=new Map<PoolClient,PoolClient['query']>();
  const trace=(client:PoolClient)=>{if(clients.has(client))return;const query=client.query;clients.set(client,query);
   client.query=((sql:string,params:unknown[],...rest:unknown[])=>{
    if(typeof sql==='string'){if(sql.includes('FROM app_enterprise_settings s JOIN app_account_teams'))calls.scope++;
     if(sql.includes('FROM app_media_assets WHERE key='))calls.version++;}
    return Reflect.apply(query,client,[sql,params,...rest]);
   }) as typeof client.query;};
  pool.on('acquire',trace);
  let response:Response;
  try{response=await POST(request([...images,firstFull,legacy,foreignArt,foreignTenant,images[0]]));}
  finally{pool.off('acquire',trace);for(const [client,query] of clients)client.query=query;}
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/);
  const {account,results}=await response.json();assert.equal(account,owner);
  assert.equal(Object.keys(results).length,20);
  for(const [i,source] of images.entries())assert.deepEqual(results[source],{account,source,version:`enterprise-thumb-webp-480-v1:version-${i+1}`,fetchUrl:source+`&cacheVersion=version-${i+1}`,bytes:0,contentType:'image/webp'});
  assert.equal(results[firstFull].version,'enterprise-full-webp-2560-v1:version-1');
  assert.match(results[legacy].version,/enterprise-thumb-webp-480-v1:[a-f0-9]{64}$/);
  assert.equal(results[foreignArt],null);assert.equal(results[foreignTenant],null);
  if(process.argv.includes('--baseline')){assert.ok(calls.scope>=20);assert.equal(calls.version,17);console.log('ENTERPRISE_MEDIA_MANIFEST_BASELINE=PASS '+JSON.stringify(calls));return;}
  assert.ok(calls.scope<=5);assert.equal(calls.version,1);
  const replies=new Map<string,number>();let origin='';
  const server=createServer(async(req,res)=>{
   const url=new URL(req.url!,origin),method=req.method!;
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const headers:Record<string,string>={};for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers[key]=value;
   const native=new Request(url,{method,headers,...(method==='POST'?{body:Buffer.concat(chunks)}:{}),signal:signalFromNodeResponse(res)});
   const response=await (method==='POST'?POST(native):GET(native));replies.set(method,response.status);
   if(!res.destroyed)res.writeHead(response.status).end(await response.text());
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const holder=(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
  const until=async<T>(read:()=>Promise<T|undefined>,reason:string,timeout=1700)=>{
   const end=Date.now()+timeout;do{const value=await read();if(value!==undefined)return value;await delay(10);}while(Date.now()<end);throw Error(reason);
  };
  try{
   for(const method of ['GET','POST']){
    await db.query('BEGIN');
    const controller=new AbortController();let clientWork:Promise<unknown>|undefined;
    try{
     await db.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
     const endpoint=method==='POST'?'/api/media/image-cache':images[0];
     clientWork=fetch(origin+endpoint,{method,signal:controller.signal,headers:{origin,cookie:'nv_user='+signUserSession(owner,Date.now()),'content-type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify({sources:[images[0]]})}:{})}).then(r=>r.arrayBuffer()).catch(e=>{if(!controller.signal.aborted)throw e;});
     const pattern=method==='POST'?'SELECT wanted.index%':'SELECT image_url FROM app_artworks%';
     const pid=await until(async()=>{await db.query('SELECT pg_stat_clear_snapshot()');return (await db.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2',[holder,pattern])).rows[0]?.pid as number|undefined;},`${method}: request did not reach the held artwork lock`,750);
     controller.abort();
     assert.equal(await until(async()=>replies.get(method),`${method}: route did not stop`),499);
     await until(async()=>{await db.query('SELECT pg_stat_clear_snapshot()');return (await db.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[pid])).rowCount===0?true:undefined;},`${method}: delayed DB session still exists`);
     assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
    }finally{controller.abort();await clientWork;await db.query('ROLLBACK');}
   }
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);
  const denied=await POST(request([images[0],firstFull]));assert.equal(denied.status,200);assert(Object.values((await denied.json()).results).every(value=>value===null));
  console.log('ENTERPRISE_MEDIA_MANIFEST=PASS '+JSON.stringify(calls)+' EXACT_DESCRIPTORS=18 SINGLE_POOL=1 REVOKED=1 FOREIGN_DENIED=2 GET_POST_HTTP_ABORT=1');
 }finally{await closeDatabasePools();try{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await db.end();}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
