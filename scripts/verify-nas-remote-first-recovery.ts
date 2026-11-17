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
  const writes=new Map<string,number>();
  let pauseGet:((key:string)=>Promise<void>)|undefined,pausePut:((key:string)=>Promise<void>)|undefined;
  const server=createServer(async(req,res)=>{
    const key=decodeURIComponent(req.url!.slice('/fixture/'.length));
    if(req.method==='PUT'){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      await pausePut?.(key);
      if(!unavailable){objects.set(key,Buffer.concat(chunks));writes.set(key,(writes.get(key)||0)+1);}
      res.writeHead(unavailable?503:200).end();return;
    }
    if(req.method==='GET'){remoteGets++;await pauseGet?.(key);}
    const bytes=objects.get(key);res.writeHead(bytes?200:404);
    res.end(req.method==='GET'?bytes:undefined);
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',
    MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${(server.address() as {port:number}).port}`,
    S3_BUCKET:'fixture',S3_REGION:'garage',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',
    SETTINGS_SECRET:randomUUID()+randomUUID(),PGPOOL_MAX:'1',NAUMI_MULTI_USER:'1',NAUMI_NAS_DEFER_UPLOAD:'0',NAUMI_RELEASE_RUNTIME:'0'});
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
    const request=(key:string,email:string,variant?:'thumbnail'|'preview')=>media.GET(new Request('http://fixture.test/media/'+key+(variant?'?variant='+variant:''),{headers:{cookie:'nv_user='+signUserSession(email,Date.now())}}),{params:Promise.resolve({path:key.split('/')})});
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
    const missing='nas-first/missing-previews.png',input=await sharp({create:{width:1920,height:1080,channels:3,background:'teal'}}).png().toBuffer();
    objects.set(missing,input);await assets.registerMediaAsset(missing,input,'image/png',true,owner,false);
    assert.deepEqual(await keySet(missing),[missing]);assert.equal(db.getPool().options.max,1);
    assert.equal((await request(missing,other,'thumbnail')).status,404);
    const oldSlot=await pool.connect();
    try{
      await oldSlot.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[`media-variants:${missing}`]);
      const beforeLegacy=remoteGets;
      assert.equal((await assets.ensureMediaVariants(missing))?.thumbnail_key,null);
      assert.equal(remoteGets,beforeLegacy);
    }finally{oldSlot.release(true);}
    let unpause!:()=>void,seen!:()=>void;
    const paused=new Promise<void>(resolve=>unpause=resolve),entered=new Promise<void>(resolve=>seen=resolve);
    pauseGet=async key=>{if(key===missing){seen();await paused;}};
    const recovery=assets.ensureMediaVariants(missing);void recovery.catch(()=>{});
    function within<T>(task:Promise<T>,label:string){
      let timer:ReturnType<typeof setTimeout>|undefined;
      return Promise.race([task,new Promise<never>((_,reject)=>timer=setTimeout(()=>reject(Error(label)),1500))]).finally(()=>clearTimeout(timer));
    }
    try{
      await within(entered,'MEDIA_ORIGINAL_GET_NEVER_STARTED');
      await within(db.getPool().query('SELECT 1'),'BUSINESS_POOL_HELD_DURING_NAS_GET');
      const raced=await within(assets.ensureMediaVariants(missing),'SECOND_RECOVERY_WAITED_FOR_WINNER');
      assert.equal(raced?.thumbnail_key,null);
    }finally{pauseGet=undefined;unpause();}
    await recovery;
    const [,thumb,preview]=await keySet(missing);assert.ok(thumb&&preview);
    for(const [key,width] of [[thumb,512],[preview,1600]] as const){
      assert.equal(writes.get(key),1);assert.equal((await sharp(objects.get(key)!).metadata()).width,width);
      const metadata=await assets.getMediaAsset(key);assert.ok(metadata?.remote_ready);assert.equal(metadata.sha256,hash(objects.get(key)!));
      await absent(key);
    }
    assert.deepEqual(objects.get(missing),input);await assets.ensureMediaVariants(missing);
    assert.equal(writes.get(thumb),1);assert.equal(writes.get(preview),1);
    assert.equal((await request(missing,other,'preview')).status,404);
    assert.deepEqual(Buffer.from(await (await request(missing,owner,'preview')).arrayBuffer()),objects.get(preview));

    // Same bytes under another owner and original key must get different ACL rows.
    const foreign='nas-first/other-same-bytes.png';
    objects.set(foreign,input);await assets.registerMediaAsset(foreign,input,'image/png',true,other,false);
    await assets.ensureMediaVariants(foreign);
    const [,foreignThumb,foreignPreview]=await keySet(foreign);assert.ok(foreignThumb&&foreignPreview);
    assert.notEqual(foreignThumb,thumb);assert.notEqual(foreignPreview,preview);
    assert.equal((await assets.getMediaAsset(foreignPreview))?.owner,other);
    assert.equal((await request(foreign,owner,'preview')).status,404);

    // A replacement may land while the prior source's encoded bytes are in flight.
    const changing='nas-first/replaced-source.png',replacement=await image('orange');
    objects.set(changing,input);await assets.registerMediaAsset(changing,input,'image/png',true,owner,false);
    const oldScope=hash(Buffer.from(JSON.stringify([changing,owner,false,hash(input)])));
    let continuePut!:()=>void,putEntered!:()=>void;
    const openPut=new Promise<void>(resolve=>continuePut=resolve),waitingPut=new Promise<void>(resolve=>putEntered=resolve);
    pausePut=async key=>{if(key.startsWith(`media-variants/v2/${oldScope}-`)){putEntered();await openPut;}};
    const stale=assets.ensureMediaVariants(changing);void stale.catch(()=>{});
    try{
      await within(waitingPut,'DERIVED_PUT_NEVER_STARTED');
      await within(db.getPool().query('SELECT 1'),'BUSINESS_POOL_HELD_DURING_NAS_PUT');
      objects.set(changing,replacement);await assets.registerMediaAsset(changing,replacement,'image/png',true,owner,false);
      const successor=randomUUID();
      // Stand in for a separate process claiming the newer source version.
      await db.getPool().query("UPDATE app_media_assets SET variant_claim_id=$2,variant_claim_until=clock_timestamp()+interval '10 minutes' WHERE key=$1",[changing,successor]);
      pausePut=undefined;continuePut();
      assert.equal((await stale)?.sha256,hash(replacement));
      const current=(await db.getPool().query('SELECT variant_claim_id,thumbnail_key,preview_key FROM app_media_assets WHERE key=$1',[changing])).rows[0];
      assert.deepEqual(current,{variant_claim_id:successor,thumbnail_key:null,preview_key:null});
      const beforeClaimRetry=writes.size;
      assert.equal((await assets.ensureMediaVariants(changing))?.preview_key,null);
      assert.equal(writes.size,beforeClaimRetry);
      await db.getPool().query("UPDATE app_media_assets SET variant_claim_until=clock_timestamp()-interval '1 second' WHERE key=$1",[changing]);
      const fresh=await assets.ensureMediaVariants(changing);assert.ok(fresh?.preview_key);
      assert.ok(!fresh.preview_key.includes(oldScope));assert.deepEqual(objects.get(changing),replacement);
    }finally{pausePut=undefined;continuePut();}
    console.log('NAS_MISSING_VARIANTS=PASS POOL_MAX=1 DB_QUERY_WHILE_NAS_GET_PUT_PENDING=1 ORIGINAL_UNCHANGED=1 REPLAY_WRITES=0 SOURCE_CAS=1 EXPIRED_CLAIM_RECOVERED=1 DISTINCT_OWNER=1');
    console.log('NAS_FIRST_RECOVERY=PASS PG=1 HTTP=1 ORIGINAL_AND_PREVIEWS=3 FALLBACK_REPAIRED=3 LOW_DISK_REFUSED=1 ACCESS_ISOLATED=1 EXTERNAL_PAID=0');
  }finally{
    Date.now=realClock;capacity.restore();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    await stopDb?.();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();
    await rm(dir,{recursive:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
