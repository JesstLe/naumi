import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';
import {createMediaCapacityFixture} from './fixtures/media-capacity';

async function main(){
  const connectionString=process.env.DATABASE_URL;
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  assert.equal(new URL(connectionString!).hostname,'127.0.0.1');
  assert.equal(new URL(connectionString!).pathname,'/naumi_nas_fixture');
  const pool=new Pool({connectionString}),schema='nas_first_'+randomUUID().replaceAll('-','');
  await pool.query(`CREATE SCHEMA ${schema}`);
  const dir=await mkdtemp(path.join(tmpdir(),'naumi-nas-first-e2e-'));
  const objects=new Map<string,Buffer>();let unavailable=false,remoteGets=0;
  const server=createServer(async(req,res)=>{
    const key=decodeURIComponent(req.url!.slice('/fixture/'.length));
    if(req.method==='PUT'){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      if(!unavailable)objects.set(key,Buffer.concat(chunks));
      res.writeHead(unavailable?503:200).end();return;
    }
    if(req.method==='GET')remoteGets++;
    const bytes=objects.get(key);res.writeHead(bytes?200:404);
    res.end(req.method==='GET'?bytes:undefined);
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',
    MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${(server.address() as {port:number}).port}`,
    S3_BUCKET:'fixture',S3_REGION:'garage',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',
    SETTINGS_SECRET:randomUUID()+randomUUID(),NAUMI_MULTI_USER:'1',NAUMI_NAS_DEFER_UPLOAD:'0',NAUMI_RELEASE_RUNTIME:'0'});
  const capacity=createMediaCapacityFixture(dir,8*1024**3);
  const realClock=Date.now;let jump=0;
  let stopDb:(()=>Promise<void>)|undefined;
  try {
    Date.now=()=>realClock()+jump; // advance only the adapter's captured circuit clock below
    const storage=await import('../src/lib/storage');
    Date.now=realClock;
    const db=await import('../src/lib/db');stopDb=()=>db.getPool().end();
    const assets=await import('../src/lib/media-assets');
    const {evictVerifiedLocalMirrors}=await import('../src/lib/media-assets/mirror-eviction');
    const media=await import('../src/app/media/[...path]/route');
    const {signUserSession}=await import('../src/lib/native-auth');
    const owner='nas-first-owner@fixture.test',other='nas-first-other@fixture.test';
    await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
    const image=(background:string)=>sharp({create:{width:512,height:384,channels:3,background}}).png().toBuffer();
    const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
    const original=await image('blue'),fallback=await image('green');
    const first='nas-first/original.png',second='nas-first/fallback.png';
    const keySet=async(key:string)=>{
      const a=await assets.getMediaAsset(key);assert.ok(a);
      return [key,a.thumbnail_key,a.preview_key].filter((v):v is string=>typeof v==='string'&&!!v);
    };
    const request=(key:string,email:string)=>media.GET(new Request('http://fixture.test/media/'+key,{headers:{cookie:'nv_user='+signUserSession(email,Date.now())}}),{params:Promise.resolve({path:key.split('/')})});
    const absent=(key:string)=>assert.rejects(stat(path.join(dir,key)),{code:'ENOENT'});
    await storage.uploadImage(original,'image/png',first,undefined,owner);
    const firstKeys=await keySet(first);assert.equal(firstKeys.length,3);
    for(const k of firstKeys){const a=await assets.getMediaAsset(k);assert.ok(a?.remote_ready);const bytes=objects.get(k);assert.ok(bytes);assert.equal(hash(bytes),a.sha256);await absent(k);}
    assert.equal((await request(first,other)).status,404);
    assert.deepEqual(Buffer.from(await (await request(first,owner)).arrayBuffer()),original);
    unavailable=true;
    await storage.uploadImage(fallback,'image/png',second,undefined,owner);
    const fallbackKeys=await keySet(second);assert.equal(fallbackKeys.length,3);
    for(const k of fallbackKeys){const a=await assets.getMediaAsset(k);assert.ok(a&&!a.remote_ready);assert.equal(hash(await readFile(path.join(dir,k))),a.sha256);assert.equal(objects.has(k),false);}
    assert.deepEqual(Buffer.from(await (await request(second,owner)).arrayBuffer()),fallback);
    capacity.setAvailableBytes(4*1024**3);
    const rejected='nas-first/rejected.png';
    await assert.rejects(storage.uploadImage(await image('red'),'image/png',rejected,undefined,owner),/本地空间不足/);
    await absent(rejected);assert.equal(await assets.getMediaAsset(rejected),null);
    unavailable=false;jump=31000;
    assert.equal(await assets.recoverMediaMirrors(10),3);
    for(const k of fallbackKeys){const a=await assets.getMediaAsset(k);const bytes=objects.get(k);assert.ok(a?.remote_ready&&bytes);assert.equal(hash(bytes),a.sha256);}
    const evicted=await evictVerifiedLocalMirrors({retentionHours:0,readbacks:10});assert.equal(evicted.evicted,3);
    for(const k of fallbackKeys)await absent(k);
    const before=remoteGets;assert.deepEqual(Buffer.from(await (await request(second,owner)).arrayBuffer()),fallback);assert.ok(remoteGets>before);
    console.log('NAS_FIRST_RECOVERY=PASS PG=1 HTTP=1 ORIGINAL_AND_PREVIEWS=3 FALLBACK_REPAIRED=3 LOW_DISK_REFUSED=1 ACCESS_ISOLATED=1 EXTERNAL_PAID=0');
  }finally{
    Date.now=realClock;capacity.restore();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    await stopDb?.();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();
    await rm(dir,{recursive:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
