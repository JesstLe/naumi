import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,unlink,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createFixtureObjects} from './video-fusion/objects.mjs';

async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Isolated loopback PostgreSQL required');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='manifest_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const root=await mkdtemp(path.join(tmpdir(),'naumi-manifest-')),calls:any[]=[],accessKeyId='fixture-manifest-key',secretAccessKey='fixture-manifest-independent-secret-only',bucket='fixture-manifests';
 const objects=createFixtureObjects({root:path.join(root,'objects'),accessKeyId,secretAccessKey,bucket,calls});let origin='',outage=false;
 const server=createServer((req,res)=>{if(outage){res.writeHead(503);res.end();return;}void objects(req,res,origin).catch(()=>{res.writeHead(500);res.end();});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:path.join(root,'mirror'),MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'redirect',STORAGE_DRIVER:'s3',S3_ENDPOINT:origin+'/objects',S3_BUCKET:bucket,S3_REGION:'us-east-1',S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey,SETTINGS_SECRET:'fixture-manifest-session-secret-independent-20261017',NAUMI_MULTI_USER:'1'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets'),media=await import('../src/app/media/[...path]/route'),native=await import('../src/lib/native-auth');
 try{
  await db.getOrCreateUser('owner@manifest.test');await db.getOrCreateUser('other@manifest.test');
  const get=(key:string,owner='owner@manifest.test',range?:string)=>media.GET(new Request('http://fixture.test/media/'+key,{headers:{...(owner?{cookie:'nv_user='+native.signUserSession(owner,Date.now())}:{}),...(range?{range}:{})}}),{params:Promise.resolve({path:key.split('/')})});
  for(const [extension,mime,text] of [['m3u8','application/vnd.apple.mpegurl','#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\npart.m4s\n#EXT-X-ENDLIST\n'],['mpd','application/dash+xml','<MPD><Period><AdaptationSet><Representation><BaseURL>part.m4s</BaseURL></Representation></AdaptationSet></Period></MPD>']]){
   const key='bundle/list.'+extension,bytes=Buffer.from(text);await storage.writeStoredObject(bytes,mime,key);await assets.registerMediaAsset(key,bytes,mime,true,'owner@manifest.test');await unlink(path.join(root,'mirror',key)).catch((error:any)=>{if(error.code!=='ENOENT')throw error;});
   const before=calls.length;assert.equal((await get(key,'')).status,401);assert.equal((await get(key,'other@manifest.test')).status,404);assert.equal(calls.length,before,'Authorization precedes remote access');
   const response=await get(key);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('content-type'),mime);assert.equal(response.headers.get('vary'),'Cookie, Authorization');assert.match(response.headers.get('cache-control')||'',/^private/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
   const ranged=await get(key,undefined,'bytes=0-7');assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),bytes.subarray(0,8));
   outage=true;assert.equal((await get(key)).status,503);await mkdir(path.dirname(path.join(root,'mirror',key)),{recursive:true});await writeFile(path.join(root,'mirror',key),bytes);const mirror=await get(key);assert.equal(mirror.status,200);assert.deepEqual(Buffer.from(await mirror.arrayBuffer()),bytes);await unlink(path.join(root,'mirror',key));outage=false;
  }
  const key='bundle/part.m4s',bytes=Buffer.from('manifest delivery fixture segment');await storage.writeStoredObject(bytes,'video/iso.segment',key);await assets.registerMediaAsset(key,bytes,'video/iso.segment',true,'owner@manifest.test');const before=calls.length,segment=await get(key);assert.equal(segment.status,307);assert.equal(new URL(segment.headers.get('location')!).origin,origin);assert.equal(calls.length,before,'Binary segment keeps signed redirect behavior');
  console.log('VIDEO_MANIFEST_ACCESS=PASS REDIRECT_DEFAULT=1 HLS_DASH_REMOTE_NO_MIRROR=1 AUTH_BEFORE_NETWORK=1 RANGE=1 OUTAGE503_AND_MIRROR=1 BINARY_REDIRECT=1 SUPPLIER_CALLS=0');
 }finally{await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
