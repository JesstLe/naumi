import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server,type ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import sharp from 'sharp';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

const origin=async(server:Server)=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;};
const stop=async(server:Server)=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};
async function until(check:()=>boolean,message:string){const end=Date.now()+3000;while(!check()){assert.ok(Date.now()<end,message);await delay(15);}}

async function main(){
 const dbUrl=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(dbUrl.hostname,'127.0.0.1');assert.match(dbUrl.pathname,/fixture/);
 const baseline=process.argv.includes('--baseline'),asset=randomUUID(),schema='bi_preview_'+randomUUID().replaceAll('-','');
 const png=await sharp({create:{width:800,height:600,channels:3,background:'#638891'}}).png().toBuffer();
 let hold=false,peak=0;
 const pending=new Map<string,ServerResponse>(), counts=new Map<string,number>(),closed=new Set<string>();
 const storage=createServer((req,res)=>{
  const key=req.url!.split('/').at(-1)!;counts.set(key,(counts.get(key)??0)+1);
  if(!hold){res.writeHead(200,{'content-type':'image/png','content-length':png.length}).end(png);return;}
  pending.set(key,res);peak=Math.max(peak,pending.size);
  res.once('close',()=>{if(!res.writableFinished)closed.add(key);pending.delete(key);});
  res.writeHead(200,{'content-type':'image/png','content-length':png.length}).write(png.subarray(0,1));
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,PGPOOL_MAX:'1',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'fixture-platform-preview-0123456789abcdef',
  STORAGE_DRIVER:'s3',S3_ENDPOINT:await origin(storage),S3_FORCE_PATH_STYLE:'true',S3_REGION:'us-east-1',S3_BUCKET:'fixture',
  S3_ACCESS_KEY_ID:'fixture-key',S3_SECRET_ACCESS_KEY:'fixture-only-secret',MEDIA_PRIVATE:'0',NAUMI_NAS_DEFER_UPLOAD:'0'});
 const db=new Client({connectionString:dbUrl.toString()});await db.connect();
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {ensureBiSchema}=await import('../src/lib/bi/schema');
 const {ensureMediaSchema}=await import('../src/lib/media-assets-schema');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {GET}=await import('../src/app/api/admin/bi/media/route');
 const {enterpriseMediaResponse}=await import('../src/lib/enterprise/media-response');
 const pool=getPool(),admin='admin@preview.fixture',owner='owner@preview.fixture';
 const cookie=(email:string)=>({cookie:'nv_user='+signUserSession(email,Date.now())});
 const call=(params:string,actor=admin)=>GET(new Request('http://fixture.invalid/api/admin/bi/media?'+params,{headers:cookie(actor)}));
 const tasks:{abort:AbortController;done:Promise<void>;key:string}[]=[],responses=new Map<string,number>(),arrived=new Set<string>();
 let appOrigin='';const app=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,appOrigin),key=url.pathname.split('/').at(-1)!;arrived.add(key);
   if(key.startsWith('platform-'))url.searchParams.set('id',key);
   const request=new Request(url,{headers:cookie(admin),signal:signalFromNodeResponse(res)});
   const result=key.startsWith('platform-')?await GET(request):await enterpriseMediaResponse(request,`/media/${key}`);
   responses.set(key,result.status);
   if(!res.destroyed)res.writeHead(result.status,Object.fromEntries(result.headers)).end(Buffer.from(await result.arrayBuffer()));
  }catch(error){if(!res.destroyed)res.writeHead(500).end(String(error));}
 });
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await ensureBiSchema();await ensureMediaSchema();
  await getOrCreateUser(admin);await getOrCreateUser(owner);await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const key=`imagegen-inputs/${asset}.png`;
  await pool.query("INSERT INTO app_media_assets(key,owner,driver,remote_ready,content_type,sha256,bytes) VALUES($1,$2,'s3',true,'image/png','fixture',$3)",[key,owner,png.length]);
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,payload,snapshot,metered) VALUES('preview-job',$1,'generate',$2,'{}',false)`,[owner,JSON.stringify({plan:{request:{mode:'edit',inputs:[{artworkId:`asset-${asset}`,role:'reference'}]}}})]);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,creation_provenance)
    VALUES('asset-result',$1,'Fixture','image','','/media/result.png','','{"version":1,"operation":"generate","ref":"preview-job"}')`,[owner]);
  const params='id=asset-result&slot=input';
  assert.equal((await call(params,owner)).status,404);assert.equal(counts.size,0);
  const original=await call(params+'&full=1');assert.equal(original.status,200);
  assert.match(original.headers.get('cache-control')??'',/no-store/);
  assert.equal((await sharp(Buffer.from(await original.arrayBuffer())).metadata()).width,800);
  assert.equal(counts.get(`${asset}.png`),baseline?2:1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_bi_access_log WHERE action='view-input-image' AND target_email=$1",[owner])).rows[0].n,1);
  await pool.query('UPDATE app_media_assets SET owner=$1 WHERE key=$2',[admin,key]);
  assert.equal((await call(params)).status,422);assert.equal(counts.get(`${asset}.png`),baseline?2:1);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient)
   SELECT 'platform-'||i,$1,'Fixture','image','','/media/platform-'||i,'' FROM generate_series(0,7)i`,[owner]);
  appOrigin=await origin(app);hold=true;
  const start=(key:string)=>{const abort=new AbortController();const done=fetch(`${appOrigin}/${key}`,{signal:abort.signal}).then(async r=>{await r.arrayBuffer();}).catch(e=>{if(!abort.signal.aborted)throw e;});const task={key,abort,done};tasks.push(task);return task;};
  const first=start('platform-0');await until(()=>pending.has(first.key),'platform did not begin storage body');
  for(let i=1;i<8;i++)start(`platform-${i}`);for(let i=0;i<4;i++)start(`enterprise-${i}`);
  await until(()=>arrived.size===12,'requests did not reach HTTP');
  await until(()=>pending.size>=(baseline?8:4),'expected storage work was not admitted');
  assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
  first.abort.abort();
  if(baseline){await delay(90);assert.equal(closed.has(first.key),false);assert.ok(peak>=8);}
  else{await until(()=>closed.has(first.key),'abandoned BI preview did not close the storage socket');assert.equal(peak,4);}
  hold=false;for(const res of pending.values())if(!res.destroyed)res.end(png.subarray(1));
  await Promise.all(tasks.map(t=>t.done));
  for(const t of tasks.slice(1))assert.equal(responses.get(t.key),200,t.key);
  if(!baseline){
   const holdPid=(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
   const bodyReads=counts.get('platform-7');responses.delete('platform-7');
   await db.query('BEGIN');
   try{
    await db.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
    const inMetadata=start('platform-7');
    const deadline=Date.now()+750;let lockedPid:number|undefined;
    do{
     await db.query('SELECT pg_stat_clear_snapshot()');
     const activity=await db.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2',[holdPid,'SELECT email,image_url FROM app_artworks%']);
     lockedPid=activity.rows[0]?.pid;
     if(lockedPid===undefined)await delay(15);
    }while(lockedPid===undefined&&Date.now()<deadline);
    assert.ok(lockedPid,'artwork query was not observed waiting');inMetadata.abort.abort();
    await until(()=>responses.has(inMetadata.key),'cancelled metadata did not exit the route');
    assert.equal(responses.get(inMetadata.key),499);assert.equal(counts.get(inMetadata.key),bodyReads);
    assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
   }finally{await db.query('ROLLBACK');}
  }
  console.log(`PLATFORM_BI_PREVIEW_${baseline?'BASELINE':'PRESSURE'}=PASS ASSET_GETS=${counts.get(`${asset}.png`)} SHARED_PEAK=${peak} STORAGE_ABORT=${Number(closed.has(first.key))} NORMAL_SQL=1 AUDIT=1 OWNER=1 METADATA_ABORT=${Number(!baseline)}`);
 }finally{
  hold=false;for(const res of pending.values())if(!res.destroyed)res.end(png.subarray(1));
  tasks.forEach(t=>t.abort.abort());await Promise.allSettled(tasks.map(t=>t.done));
  if(app.listening)await stop(app);await stop(storage);await closeDatabasePools();
  try{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await db.end();}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
