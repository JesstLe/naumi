import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,type PoolClient} from 'pg';
import sharp from 'sharp';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const uri=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(uri.hostname,'127.0.0.1');assert.match(uri.pathname,/fixture/);
 const schema='team_preview_'+randomUUID().replaceAll('-',''),png=await sharp({create:{width:1500,height:1000,channels:3,background:'red'}}).png().toBuffer();
 let hold=false,closed=false,storageReads=0,held:ServerResponse|undefined;
 const storage=createServer((_req,res)=>{storageReads++;res.writeHead(200,{'content-type':'image/png','content-length':png.length});
  if(!hold){res.end(png);return;}held=res;res.once('close',()=>{closed=!res.writableFinished;held=undefined;});res.write(png.subarray(0,1));});
 const listen=async(server:ReturnType<typeof createServer>)=>{await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;};
 const stop=async(server:ReturnType<typeof createServer>)=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));};
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,PGPOOL_MAX:'1',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'isolated-team-preview-0123456789abcdef',
  STORAGE_DRIVER:'s3',S3_ENDPOINT:await listen(storage),S3_FORCE_PATH_STYLE:'true',S3_BUCKET:'fixture',S3_REGION:'us-east-1',S3_ACCESS_KEY_ID:'fixture-key',S3_SECRET_ACCESS_KEY:'fixture-secret',MEDIA_PRIVATE:'0'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {ensureEnterpriseSchema}=await import('../src/lib/enterprise/server');
 const {ensureMediaSchema}=await import('../src/lib/media-assets-schema');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {rateLimitUpTo}=await import('../src/lib/rate-limit');
 const {POST}=await import('../src/app/api/media/image-cache/route');
 const {GET}=await import('../src/app/api/team/media/route');
 const pool=getPool(),db=new Client({connectionString:uri.toString()});await db.connect();
 const until=async(test:()=>boolean|Promise<boolean>,label:string)=>{const end=Date.now()+2400;while(!await test()){assert.ok(Date.now()<end,label);await delay(15);}};
 let origin='',lastStatus:number|undefined;
 const app=createServer(async (req,res)=>{const url=new URL(req.url!,origin),post=req.method==='POST',signal=signalFromNodeResponse(res);
  const chunks:Buffer[]=[];if(post)for await(const data of req)chunks.push(data);
  const request=new Request(url,{method:post?'POST':'GET',headers:{cookie:req.headers.cookie??'',origin},body:post?Buffer.concat(chunks):undefined,signal});
  const response=await (post?POST:GET)(request);
  lastStatus=response.status;if(!res.destroyed)res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));});
 let client:Promise<unknown>|undefined;const abort=new AbortController();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await ensureEnterpriseSchema();await ensureMediaSchema();
  const owner='owner@team-preview.fixture',member='member@team-preview.fixture',foreign='outside@team-preview.fixture',teamId=randomUUID(),otherId=randomUUID();
  for(const email of [owner,member,foreign])await getOrCreateUser(email);
  await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[owner]);
  await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Team',$2,now()+interval '3 days'),($3,'Other',$4,now()+interval '3 days')",[teamId,owner,otherId,foreign]);
  await pool.query('INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)',[member,teamId]);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,deleted_at)
   SELECT 'art-'||i,$1,'Fixture','image','','/media/team-'||i||'.png','',CASE WHEN i=12 THEN now() END FROM generate_series(1,12)i`,[member]);
  await pool.query(`INSERT INTO app_media_assets(key,owner,driver,remote_ready,content_type,sha256,bytes)
   SELECT 'team-'||i||'.png',$1,'s3',true,'image/png','version-'||i,$2 FROM generate_series(1,12)i`,[member,png.length]);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES('legacy',$1,'Fixture','image','',$2,'')`,[member,'data:image/png;base64,'+Buffer.alloc(5000,1).toString('base64')]);
  const source=(id:string,account=member,team=teamId)=>'/api/team/media?'+new URLSearchParams({teamId:team,email:account,id});
  const images=Array.from({length:12},(_,i)=>source('art-'+(i+1)));
  const alias=images[0]+'&cacheVersion=old',legacy=source('legacy'),denied=[images[11],source('art-1',foreign),source('art-1',member,otherId),source('missing')];
  const cookie=(email:string)=>'nv_user='+signUserSession(email,Date.now());
  const manifest=(sources:string[])=>POST(new Request('http://fixture.invalid/api/media/image-cache',{method:'POST',headers:{cookie:cookie(owner),origin:'http://fixture.invalid','content-type':'application/json'},body:JSON.stringify({sources})}));
  const calls={scope:0,version:0,auditStatements:0,rate:0};const patched=new Map<PoolClient,PoolClient['query']>();
  const observe=(client:PoolClient)=>{if(patched.has(client))return;const original=client.query;patched.set(client,original);client.query=((sql:string,...args:unknown[])=>{
   if(typeof sql==='string'){if(sql.startsWith('SELECT * FROM app_account_teams WHERE id'))calls.scope++;if(sql.includes('FROM app_media_assets WHERE key='))calls.version++;
    if(sql.startsWith('INSERT INTO app_account_team_audit'))calls.auditStatements++;
    if(sql.includes('INSERT INTO app_rate_limit_buckets'))calls.rate++;}return Reflect.apply(original,client,[sql,...args]);
  }) as typeof client.query;};
  pool.on('acquire',observe);let response:Response;
  try{response=await manifest([...images,alias,legacy,...denied.slice(1),images[0]]);}finally{pool.off('acquire',observe);for(const [client,query] of patched)client.query=query;}
  assert.equal(response.status,200);const {results}=await response.json();
  for(const [i,key] of images.slice(0,11).entries())assert.deepEqual(results[key],{account:owner,source:key,version:`preview-webp-1280-v1:version-${i+1}`,fetchUrl:key+`&cacheVersion=version-${i+1}`,bytes:0,contentType:'image/webp'});
  assert.deepEqual(results[alias],results[images[0]]);assert.match(results[legacy].version,/preview-webp-1280-v1:[a-f0-9]{64}$/);
  for(const key of denied)assert.equal(results[key],null);
  const audits=async()=> (await pool.query("SELECT changes->>'artwork' AS id,target_email FROM app_account_team_audit WHERE action='view-media' ORDER BY id")).rows;
  const entries=await audits();assert.equal(entries.length,13);assert.equal(entries.filter(x=>x.id==='art-1').length,2);assert.ok(entries.every(x=>x.target_email===member));assert.equal(storageReads,0);
  if(process.argv.includes('--baseline')){assert.deepEqual(calls,{scope:17,version:12,auditStatements:13,rate:18});console.log('TEAM_PREVIEW_BASELINE=PASS '+JSON.stringify(calls));return;}
  assert.deepEqual(calls,{scope:5,version:1,auditStatements:2,rate:2});
  const full=await GET(new Request('http://fixture.invalid'+results[images[0]].fetchUrl+'&full=1',{headers:{cookie:cookie(owner)}}));assert.equal(full.status,200);
  const expected=await sharp(png,{limitInputPixels:40000000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  assert.deepEqual(Buffer.from(await full.arrayBuffer()),expected);
  const badVersion=await GET(new Request('http://fixture.invalid'+images[0]+'&cacheVersion=old',{headers:{cookie:cookie(owner)}}));assert.equal(badVersion.status,409);assert.equal(storageReads,1);
  hold=true;origin=await listen(app);client=fetch(origin+images[1],{signal:abort.signal,headers:{cookie:cookie(owner)}}).then(r=>r.arrayBuffer()).catch(e=>{if(!abort.signal.aborted)throw e;});
  await until(()=>!!held,'storage socket not opened');assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
  abort.abort();await until(()=>closed&&lastStatus===499,'disconnect did not stop the team storage response');assert.equal((await audits()).length,16);

  // Observe the SQL actually waiting behind an unrelated lock, then disconnect
  // the real request while the lock is still held.
  const holder=Number((await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  const waitForRead=async(post:boolean)=>{
   await db.query('SELECT pg_stat_clear_snapshot()');
   const marker=post?'%left(a.image_url,4097)%':'SELECT image_url FROM app_artworks%';
   return (await db.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2',[holder,marker])).rows[0]?.pid as number|undefined;
  };
  await db.query(`BEGIN; LOCK TABLE ${schema}.app_artworks IN ACCESS EXCLUSIVE MODE`);
  try{
   for(const post of [false,true]){
    lastStatus=undefined;
    const disconnect=new AbortController();
    const pending=fetch(origin+(post?'/api/media/image-cache':images[2]),{method:post?'POST':'GET',signal:disconnect.signal,headers:{cookie:cookie(owner)},
      body:post?JSON.stringify({sources:[images[2],images[3]]}):undefined}).then(r=>r.arrayBuffer()).catch(e=>{if(!disconnect.signal.aborted)throw e;});
    try{
     let readerPid:number|undefined;
     await until(async()=>!!(readerPid=await waitForRead(post)),`${post?'POST':'GET'} did not reach locked artwork query, status=${lastStatus}`);
     disconnect.abort();
     await until(async()=>{
      await db.query('SELECT pg_stat_clear_snapshot()');
      return lastStatus===499&&(await db.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[readerPid])).rowCount===0;
     },'team route did not release the blocked query');
     assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
    }finally{disconnect.abort();await pending;}
   }
  }finally{await db.query('ROLLBACK');}
  assert.equal((await audits()).length,16);

  // The snapshot cannot see the concurrent detach. The audit transaction
  // must see it and suppress the stale descriptors.
  await db.query(`BEGIN; LOCK TABLE ${schema}.app_artworks IN ACCESS EXCLUSIVE MODE`);
  const detached=manifest(images.slice(0,2));
  try {
   await until(async()=>!!await waitForRead(true),'snapshot did not start before detach');
   await db.query(`DELETE FROM ${schema}.app_account_team_members WHERE email=$1`,[member]);
   await db.query('COMMIT');
  }finally{await db.query('ROLLBACK');}
  assert.ok(Object.values((await (await detached).json()).results).every(value=>value===null));
  assert.equal((await audits()).length,16);
  await pool.query('INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)',[member,teamId]);

  for(let i=0;i<2;i++)await rateLimitUpTo(`team:${owner}:null`,118,60_000,64);
  const partial=(await (await manifest(images.slice(0,3))).json()).results;
  assert.ok(partial[images[0]]&&partial[images[1]]);assert.equal(partial[images[2]],null);
  assert.equal((await GET(new Request(origin+images[2],{headers:{cookie:cookie(owner)}}))).status,429);
  assert.equal((await audits()).length,18);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);
  assert.equal((await (await manifest([images[0]])).json()).results[images[0]],null);
  assert.equal((await GET(new Request(origin+images[0],{headers:{cookie:cookie(owner)}}))).status,403);assert.equal((await audits()).length,18);
  console.log('TEAM_PREVIEW_MANIFEST=PASS '+JSON.stringify(calls)+' ORIGINAL_AUDIT_ROWS=13 BYTE_PARITY=1 VERSION_409=1 STORAGE_ABORT=1 SQL_ABORT=2 RATE_PREFIX=1 MID_READ_DETACH=1 REVOKED=1');
 }finally{abort.abort();await client;if(held&&!held.destroyed)held.end(png.subarray(1));if(app.listening)await stop(app);await stop(storage);await closeDatabasePools();try{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await db.end();}}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
