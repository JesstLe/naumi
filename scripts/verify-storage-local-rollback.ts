import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';import sharp from 'sharp';
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Requires isolated DB');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='nasrollback_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const dir=await mkdtemp(path.join(tmpdir(),'nasrollback-'));
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',MEDIA_DIR:dir,SETTINGS_SECRET:'nas-local-rollback-isolated-fixture-secret',NAUMI_MULTI_USER:'1'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets'),cache=await import('../src/app/api/media/image-cache/route'),media=await import('../src/app/media/[...path]/route'),native=await import('../src/lib/native-auth');
 try {const owner='rollback@fixture.test';await db.getOrCreateUser(owner);const key='rollback/image.png',bytes=await sharp({create:{width:2048,height:1024,channels:3,background:'orange'}}).png().toBuffer();await storage.writeStoredObject(bytes,'image/png',key);await assets.registerMediaAsset(key,bytes,'image/png',true,owner);await db.getPool().query('UPDATE app_media_assets SET remote_ready=true');
 const cookie='nv_user='+native.signUserSession(owner,Date.now()),url='/media/'+key,sources=[url,url+'?variant=thumbnail',url+'?variant=preview'];const response=await cache.POST(new Request('http://rollback.test/api/media/image-cache',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({sources})}));const list=await response.json();
 for(const source of sources){assert.ok(list.results[source].version.startsWith('local:'));const actual=await media.GET(new Request('http://rollback.test'+list.results[source].fetchUrl,{headers:{cookie}}),{params:Promise.resolve({path:key.split('/')})});assert.equal(actual.status,200);await actual.arrayBuffer();}
 console.log('NAS_LOCAL_CONFIG_ROLLBACK=PASS REMOTE_READY_RETAINED=1 ORIGINAL_THUMBNAIL_PREVIEW=3 LOCAL_CACHE_VERSION_GET200=1');
 }finally{await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
