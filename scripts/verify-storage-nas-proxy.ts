import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,unlink} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';import {Pool} from 'pg';import sharp from 'sharp';
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Requires isolated loopback PostgreSQL');
 const admin=new Pool({connectionString:process.env.DATABASE_URL});const schema='nas_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-nas-proxy-'));Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:'http://127.0.0.1:19374',S3_BUCKET:'naumi-isolated-contract',S3_REGION:'us-east-1',S3_ACCESS_KEY_ID:'naumi-fixture',S3_SECRET_ACCESS_KEY:'fixture-only-not-production',SETTINGS_SECRET:'fixture-nas-private-account-isolation-secret',NAUMI_MULTI_USER:'1'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets');
 const media=await import('../src/app/media/[...path]/route'),cache=await import('../src/app/api/media/image-cache/route'),native=await import('../src/lib/native-auth');
 const key='nas-contract/'+randomUUID()+'.png',owner='owner@nas.test',other='other@nas.test';
 try {
 await db.getOrCreateUser(owner);await db.getOrCreateUser(other);const body=await sharp({create:{width:2048,height:1024,channels:3,background:'orange'}}).png().toBuffer();
 const url=await storage.uploadImage(body,'image/png',key,undefined,owner);assert.equal(url,'/media/'+key);
 const asset=await assets.getMediaAsset(key);assert.ok(asset?.remote_ready&&asset.thumbnail_key&&asset.preview_key);
 const req=(source:string,email=owner,range?:string)=>new Request('http://nas.test'+source,{headers:{...(email?{cookie:'nv_user='+native.signUserSession(email,Date.now())}:{}),...(range?{range}:{})}});
 const get=(source:string,email=owner,range?:string)=>media.GET(req(source,email,range),{params:Promise.resolve({path:key.split('/')})});
 assert.equal((await get(url,'')).status,401);assert.equal((await get(url,other)).status,404);
 for(const variant of ['', '?variant=thumbnail','?variant=preview']){
 const response=await get(url+variant);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('vary'),'Cookie, Authorization');assert.ok(response.headers.get('cache-control')?.startsWith('private'));
 const bytes=Buffer.from(await response.arrayBuffer());const expected:Buffer=variant?await readFile(path.join(dir,variant.includes('thumbnail')?asset.thumbnail_key:asset.preview_key)):body;assert.deepEqual(bytes,expected);assert.equal(Number(response.headers.get('content-length')),bytes.length);
 }
 const ranged=await get(url,owner,'bytes=0-7');assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),body.subarray(0,8));assert.equal((await get(url,owner,'bytes=999999-')).status,416);
 const download=await get(url+'?download=photo.png');assert.ok(download.headers.get('content-disposition')?.includes('photo.png'));await download.arrayBuffer();
 const manifest=await cache.POST(new Request('http://nas.test/api/media/image-cache',{method:'POST',headers:{cookie:'nv_user='+native.signUserSession(owner,Date.now()),'content-type':'application/json'},body:JSON.stringify({sources:[url,url+'?variant=thumbnail',url+'?variant=preview']})}));assert.equal(manifest.status,200);const m=await manifest.json();assert.ok(m.results[url].fetchUrl.startsWith(url+'?cacheVersion='));
 const valid=await get(m.results[url].fetchUrl);assert.equal(valid.status,200);await valid.arrayBuffer();assert.equal((await get(url+'?cacheVersion=stale')).status,409);assert.equal(m.results[url].version,createHash('sha256').update(body).digest('hex'));
 const httpFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{const r=new Request(input,init);return r.url.startsWith('http://127.0.0.1:19374')?new Response(null,{status:503}):httpFetch(input,init);};
 try {const response=await get(url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body);}finally{globalThis.fetch=httpFetch;}
 const originalFetch=globalThis.fetch;let remoteCalls=0;globalThis.fetch=async(input,init)=>{const r=new Request(input,init);if(r.url.startsWith('http://127.0.0.1:19374')){remoteCalls++;throw Error('fixture NAS offline');}return originalFetch(input,init);};
 try {assert.equal((await get(url,other)).status,404);assert.equal(remoteCalls,0);const fallback=await get(url);assert.equal(fallback.status,200);assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),body);const fallbackDownload=await get(url+"?download=photo.png");assert.ok(fallbackDownload.headers.get("content-disposition")?.includes("photo.png"));await fallbackDownload.arrayBuffer();await unlink(path.join(dir,key));assert.equal((await get(url)).status,503);}finally{globalThis.fetch=originalFetch;}
 const managed=await storage.readManagedObject(url,body.length);assert.deepEqual(managed.bytes,body);await assert.rejects(()=>storage.readManagedObject(url,8));
 const {managedAgentReference}=await import('../src/lib/agent/managed-reference');assert.equal((await managedAgentReference('http://nas.test'+url,['http://nas.test'],owner))?.contentType,'image/png');await assert.rejects(()=>managedAgentReference('http://nas.test'+url,['http://nas.test'],other));
 // Replacing the same stable key rotates original and variant cache versions.
 const updated=await sharp({create:{width:2048,height:1024,channels:3,background:'blue'}}).png().toBuffer();
 await storage.uploadImage(updated,'image/png',key,undefined,owner);
 const newManifest=await(await cache.POST(new Request('http://nas.test/api/media/image-cache',{method:'POST',headers:{cookie:'nv_user='+native.signUserSession(owner,Date.now()),'content-type':'application/json'},body:JSON.stringify({sources:[url,url+'?variant=thumbnail',url+'?variant=preview']})}))).json();
 for(const source of [url,url+'?variant=thumbnail',url+'?variant=preview']){assert.notEqual(newManifest.results[source].version,m.results[source].version);assert.equal((await get(m.results[source].fetchUrl)).status,409);const response=await get(newManifest.results[source].fetchUrl);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),newManifest.results[source].version);}
 const operation='delete-fixture-'+randomUUID();await db.addArtworks(owner,[{id:operation,title:'Delete fixture',category:'main',prompt:'fixture',status:'completed',image:url,source:'',gradient:''}]);
 const rejections:unknown[]=[];const unhandled=(e:unknown)=>rejections.push(e);process.on('unhandledRejection',unhandled);const deleteFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const r=new Request(input,init);return r.method==='DELETE'?new Response(null,{status:403}):deleteFetch(input,init);};
 try{assert.equal(await db.deleteArtwork(operation),true);await new Promise(r=>setTimeout(r,100));assert.equal(rejections.length,0);}finally{globalThis.fetch=deleteFetch;process.off('unhandledRejection',unhandled);}
 await storage.deleteImageByUrl(url);assert.equal(await storage.managedObjectExists(url),false);
 console.log('NAS_PROXY_APP=PASS ACTUAL_MINIO=1 DB=ISOLATED AUTH_BEFORE_NETWORK=1 ORIGINAL_VARIANTS_SHA=1 RANGE=1 CACHE_IDENTITY=1 VERSION_CHANGE_3=1 CLEANUP_REJECTION_HANDLED=1 OUTAGE_MIRROR=1 UNKNOWN503=1 PRIVATE_AGENT_REFERENCE=1 MODEL_CALLS=0');
 }finally{for(const k of [key,(await assets.getMediaAsset(key))?.thumbnail_key,(await assets.getMediaAsset(key))?.preview_key])if(k)await storage.deleteImageByUrl('/media/'+k);await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
