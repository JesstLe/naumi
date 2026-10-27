import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';

async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Isolated loopback PG required');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='p0_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-p0-media-')),objects=new Map<string,Buffer>();let gets=0,puts=0,release!:()=>void,arrived!:()=>void;
 let gate:Promise<void>,atPut:Promise<void>;const hold=()=>{gate=new Promise<void>(r=>release=r);atPut=new Promise<void>(r=>arrived=r);};hold();
 const server=createServer(async(req,res)=>{
  if(req.method==='HEAD'){res.writeHead(objects.has(req.url!)?200:404);res.end();return;}
  if(req.method==='PUT'){puts++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);arrived();await gate;objects.set(req.url!,Buffer.concat(chunks));res.writeHead(200);res.end();return;}
  if(req.method==='GET'){gets++;const body=objects.get(req.url!);res.writeHead(body?200:404,{'content-type':'image/png'});res.end(body);return;}
  res.writeHead(405);res.end();
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as {port:number}).port;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${port}`,S3_BUCKET:'fixture',S3_REGION:'garage',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',SETTINGS_SECRET:'fixture-p0-private-account-isolation-secret',NAUMI_MULTI_USER:'1',NAUMI_NAS_DEFER_UPLOAD:'1',NAUMI_RELEASE_RUNTIME:'0'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets'),media=await import('../src/app/media/[...path]/route'),download=await import('../src/app/api/download/route'),native=await import('../src/lib/native-auth');
 try{
  const owner='owner@p0.test';await db.getOrCreateUser(owner);await db.getOrCreateUser('other@p0.test');
  const bytes=await sharp({create:{width:2048,height:1024,channels:3,background:'orange'}}).png().toBuffer(),key='p0/'+randomUUID()+'.png';
  const start=Date.now(),url=await storage.uploadImage(bytes,'image/png',key,undefined,owner);
  assert.ok(Date.now()-start<5000,'delivery is independent from stalled NAS');assert.equal(puts,0);assert.equal(gets,0);
  const asset=(await assets.getMediaAsset(key))!;assert.equal(asset.remote_ready,false);assert.ok(asset.preview_key&&asset.thumbnail_key);
  const get=(email=owner,range?:string)=>media.GET(new Request('http://fixture'+url,{headers:{cookie:'nv_user='+native.signUserSession(email,Date.now()),...(range?{range}:{})}}),{params:Promise.resolve({path:key.split('/')})});
  assert.equal((await get('other@p0.test')).status,404);assert.equal((await get()).status,200);
  const response=await get(owner,'bytes=0-7');assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(0,8));
  const downloaded=await download.GET(new Request('http://fixture/api/download?u='+encodeURIComponent(url)+'&n=result.png',{headers:{cookie:'nv_user='+native.signUserSession(owner,Date.now())}}));
  assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);assert.ok(downloaded.headers.get('content-disposition')!.includes('result.png'));
  const deniedDownload=await download.GET(new Request('http://fixture/api/download?u='+encodeURIComponent(url),{headers:{cookie:'nv_user='+native.signUserSession('other@p0.test',Date.now())}}));assert.equal(deniedDownload.status,404);
  const recovery=assets.recoverMediaMirrors(3);await atPut;
  const transactions=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'");assert.equal(transactions.rows[0].n,0,'NAS I/O holds no SQL transaction');
  assert.equal(await assets.recoverMediaMirrors(3),0,'in-flight claims are not reuploaded by another scan');
  assert.deepEqual((await storage.readManagedObject(url,bytes.length)).bytes,bytes,'reference read does not wait behind upload');
  release();assert.equal(await recovery,3);assert.equal(puts,3);assert.equal((await assets.getMediaAsset(key))!.remote_ready,true);
  const before=gets;assert.deepEqual((await storage.readManagedObject(url,bytes.length)).bytes,bytes);assert.deepEqual(Buffer.from(await(await get()).arrayBuffer()),bytes);assert.equal(gets,before,'acknowledged originals still use digest-verified local bytes');
  await assert.rejects(()=>storage.readManagedObject(url,1));
  await writeFile(path.join(dir,key),Buffer.alloc(bytes.length,7));
  assert.deepEqual((await storage.readManagedObject(url,bytes.length)).bytes,bytes,'corrupt same-size local copy is not authoritative');assert.equal(gets,before+1);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>storage.fetchStoredObject(key,'',controller.signal));
  // A completed old upload must not mark newer local bytes remote-ready.
  const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  const changed=await sharp({create:{width:2048,height:1024,channels:3,background:'blue'}}).png().toBuffer();
  const casKey='p0/'+randomUUID()+'-content-cas.png';
  await storage.writeStoredObject(bytes,'image/png',casKey);await assets.registerMediaAsset(casKey,bytes,'image/png',false,owner,false);
  hold();const staleUpload=assets.recoverMediaMirrors(1);await atPut!;
  await storage.writeStoredObject(changed,'image/png',casKey);await assets.registerMediaAsset(casKey,changed,'image/png',false,owner,false);
  release();assert.equal(await staleUpload,1);assert.equal((await assets.getMediaAsset(casKey))!.sha256,hash(changed));assert.equal((await assets.getMediaAsset(casKey))!.remote_ready,false);
  // Keep the same digest but replace the claim. The older completion cannot
  // acknowledge the newer claimant, even when both uploaded identical bytes.
  await db.getPool().query('UPDATE app_media_assets SET retry_after=now() WHERE key=$1',[casKey]);
  hold();const firstClaim=assets.recoverMediaMirrors(1);await atPut!;const releaseFirst=release;
  await db.getPool().query('UPDATE app_media_assets SET retry_after=now() WHERE key=$1',[casKey]);
  hold();const secondClaim=assets.recoverMediaMirrors(1);await atPut!;
  releaseFirst();await firstClaim;assert.equal((await assets.getMediaAsset(casKey))!.remote_ready,false);
  release();await secondClaim;assert.equal((await assets.getMediaAsset(casKey))!.remote_ready,true);
  // A busy cross-process variant lock serves the original, rather than making
  // image GETs wait for another process's remote I/O.
  const variantKey='p0/'+randomUUID()+'-variant.png';await storage.writeStoredObject(bytes,'image/png',variantKey);await assets.registerMediaAsset(variantKey,bytes,'image/png',false,owner,false);
  const lock=await db.getPool().connect();
  try{await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['media-variants:'+variantKey]);
   const pending=await Promise.race([assets.ensureMediaVariants(variantKey),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('contender waited for variant lock')),2000);t.unref();})]);assert.equal(pending!.thumbnail_key,null);
  }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['media-variants:'+variantKey]);lock.release();}
  // Freeze the original row while actual sharp/variant I/O runs; then change
  // its content before attachment. Stale variants must not bind the new source.
  const rowLock=await db.getPool().connect();let variantWork:ReturnType<typeof assets.ensureMediaVariants>|undefined;
  try{await rowLock.query('BEGIN');await rowLock.query('SELECT key FROM app_media_assets WHERE key=$1 FOR UPDATE',[variantKey]);
   variantWork=assets.ensureMediaVariants(variantKey,bytes);
   const deadline=Date.now()+5000;let waiting=false;
   while(Date.now()<deadline){const q=await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE app_media_assets SET thumbnail_key%'");if(q.rows[0].n){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}
   assert.equal(waiting,true,'actual variant attachment reached original row CAS');
   await storage.writeStoredObject(changed,'image/png',variantKey);
   await rowLock.query('UPDATE app_media_assets SET sha256=$2,bytes=$3 WHERE key=$1',[variantKey,hash(changed),changed.length]);await rowLock.query('COMMIT');
   const result=await variantWork;assert.equal(result!.sha256,hash(changed));assert.equal(result!.thumbnail_key,null);assert.equal(result!.preview_key,null);
  }finally{await rowLock.query('ROLLBACK').catch(()=>{});rowLock.release();await variantWork?.catch(()=>{});}
  console.log('P0_NAS_DELIVERY PASS: actual PG + HTTP; immediate original/variants; owner ACL/media/download; range; fenced mirror/content/claim CAS; nonblocking variant lock; stale variant CAS; no network transaction; verified local read; corruption fallback; cancellation; supplier calls=0');
 }finally{release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(dir).startsWith('naumi-p0-media-'));await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
