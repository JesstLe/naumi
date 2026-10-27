import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';

async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Isolated loopback PG required');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='p0_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-p0-media-')),objects=new Map<string,Buffer>();let gets=0,puts=0,release!:()=>void,arrived!:()=>void;
 const gate=new Promise<void>(r=>release=r),atPut=new Promise<void>(r=>arrived=r);
 const server=createServer(async(req,res)=>{
  if(req.method==='HEAD'){res.writeHead(objects.has(req.url!)?200:404);res.end();return;}
  if(req.method==='PUT'){puts++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);arrived();await gate;objects.set(req.url!,Buffer.concat(chunks));res.writeHead(200);res.end();return;}
  if(req.method==='GET'){gets++;const body=objects.get(req.url!);res.writeHead(body?200:404,{'content-type':'image/png'});res.end(body);return;}
  res.writeHead(405);res.end();
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as {port:number}).port;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${port}`,S3_BUCKET:'fixture',S3_REGION:'garage',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',SETTINGS_SECRET:'fixture-p0-private-account-isolation-secret',NAUMI_MULTI_USER:'1',NAUMI_NAS_DEFER_UPLOAD:'1',NAUMI_RELEASE_RUNTIME:'0'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets'),media=await import('../src/app/media/[...path]/route'),native=await import('../src/lib/native-auth');
 try{
  const owner='owner@p0.test';await db.getOrCreateUser(owner);await db.getOrCreateUser('other@p0.test');
  const bytes=await sharp({create:{width:2048,height:1024,channels:3,background:'orange'}}).png().toBuffer(),key='p0/'+randomUUID()+'.png';
  const start=Date.now(),url=await storage.uploadImage(bytes,'image/png',key,undefined,owner);
  assert.ok(Date.now()-start<5000,'delivery is independent from stalled NAS');assert.equal(puts,0);assert.equal(gets,0);
  const asset=(await assets.getMediaAsset(key))!;assert.equal(asset.remote_ready,false);assert.ok(asset.preview_key&&asset.thumbnail_key);
  const get=(email=owner,range?:string)=>media.GET(new Request('http://fixture'+url,{headers:{cookie:'nv_user='+native.signUserSession(email,Date.now()),...(range?{range}:{})}}),{params:Promise.resolve({path:key.split('/')})});
  assert.equal((await get('other@p0.test')).status,404);assert.equal((await get()).status,200);
  const response=await get(owner,'bytes=0-7');assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(0,8));
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
  console.log('P0_NAS_DELIVERY PASS: actual PG + HTTP; immediate original/variants; owner ACL; range; fenced mirror; no network transaction; verified local read; corruption fallback; cancellation; supplier calls=0');
 }finally{release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
