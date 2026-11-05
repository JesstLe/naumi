import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Pool} from 'pg';
import sharp from 'sharp';
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw new Error('Requires isolated loopback PostgreSQL');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='media_test_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_PRIVATE:'1',STORAGE_DRIVER:'r2',R2_ACCOUNT_ID:'fixture',R2_BUCKET:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'media-isolated-secret-20261013-long-fixture-only',MEDIA_DIR:await mkdtemp(path.join(tmpdir(),'media-db-'))});
 const originalFetch=globalThis.fetch,objects=new Map<string,Buffer>();let requests=0;
 globalThis.fetch=async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
  if(url.hostname!=='fixture.r2.cloudflarestorage.com')throw new Error('Unexpected network request');
  requests++;const key=decodeURIComponent(url.pathname.slice('/fixture/'.length));
  if(request.method==='PUT'){objects.set(key,Buffer.from(await request.arrayBuffer()));return new Response(null,{status:200});}
  const bytes=objects.get(key);return bytes?new Response(Uint8Array.from(bytes),{headers:{'content-length':String(bytes.length),'content-type':'image/png'}}):new Response(null,{status:404});
 };
 const db=await import('../src/lib/db'),assets=await import('../src/lib/media-assets'),uploads=await import('../src/app/api/media/uploads/route'),media=await import('../src/app/media/[...path]/route'),zip=await import('../src/app/api/suite/download/route');
 const {signUserSession}=await import('../src/lib/native-auth');
 const owner='fixture-owner@test.example',other='fixture-other@test.example';
 const request=(body:unknown,email=owner)=>new Request('http://site.test/api/media/uploads',{method:'POST',headers:{cookie:'nv_user='+signUserSession(email,Date.now()),'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  await db.getOrCreateUser(owner,'Owner');await db.getOrCreateUser(other,'Other');
  const bytes=await sharp({create:{width:2048,height:1024,channels:3,background:'orange'}}).png().toBuffer();
  const prepared=await uploads.POST(request({action:'prepare',bytes:bytes.length,contentType:'image/png'}));assert.equal(prepared.status,200);
  const intent=await prepared.json();assert.equal(intent.enabled,true);
  await fetch(intent.putUrl,{method:'PUT',headers:{'content-type':'image/png'},body:bytes});
  assert.equal((await uploads.POST(request({action:'complete',id:intent.id},other))).status,404);
  const response=await uploads.POST(request({action:'complete',id:intent.id,title:'R2 fixture'}));assert.equal(response.status,200);
  const art=await response.json(),key=art.image.slice('/media/'.length);assert.equal(art.width,2048);assert.equal(art.height,1024);
  assert.equal(await assets.canReadMedia(key,owner),true);assert.equal(await assets.canReadMedia(key,other),false);
  const view=(email:string)=>new Request('http://site.test'+art.image+'?variant=thumbnail',{headers:{cookie:'nv_user='+signUserSession(email,Date.now())}});
  assert.equal((await media.GET(view(other),{params:Promise.resolve({path:key.split('/')})})).status,404);
  const delivered=await media.GET(view(owner),{params:Promise.resolve({path:key.split('/')})});assert.equal(delivered.status,307);assert.ok(delivered.headers.get('location')?.includes('media-variants'));
  const record=await assets.getMediaAsset(key);assert.ok(record?.thumbnail_key&&record.preview_key);assert.equal((await sharp(objects.get(record.thumbnail_key)!).metadata()).width,512);
  // The still-valid PUT can only rewrite staging, never the committed object.
  objects.set('pending-uploads/'+intent.id,Buffer.from('later overwrite'));
  const replay=await uploads.POST(request({action:'complete',id:intent.id}));assert.equal(replay.status,200);assert.equal((await replay.json()).id,art.id);
  assert.deepEqual(objects.get(key),bytes);
  assert.equal((await db.getPool().query('SELECT count(*)::int n FROM app_artworks WHERE id=$1',[art.id])).rows[0].n,1);
  const zipRequest=new Request('http://site.test/api/suite/download',{method:'POST',headers:{cookie:'nv_user='+signUserSession(other,Date.now()),'content-type':'application/json'},body:JSON.stringify({items:[{url:art.image,name:'private'}]})});
  assert.equal((await zip.POST(zipRequest)).status,404);
  const {readCanvasImage}=await import('../src/lib/canvas-image-input');await assert.rejects(()=>readCanvasImage(art.image,'http://site.test',other));
  const {managedAgentReference}=await import('../src/lib/agent/managed-reference');assert.equal((await managedAgentReference('http://site.test'+art.image,['http://site.test'],owner))?.contentType,'image/png');await assert.rejects(()=>managedAgentReference('http://site.test'+art.image,['http://site.test'],other));
  console.log('PASS private upload lifecycle, owned variants, foreign account denial, replay and immutable formal key; model calls=0; storage requests='+requests);
 }finally{globalThis.fetch=originalFetch;await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

