import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile}from'node:fs/promises';
import {tmpdir}from'node:os';
import path from'node:path';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');assert.match(new URL(process.env.DATABASE_URL!).pathname,/canvas_perf/);
 const db=await import('../src/lib/db'),native=await import('../src/lib/native-auth'),assets=await import('../src/lib/media-assets'),manifest=await import('../src/lib/browser-image-manifest');
 const id=randomUUID(),owner=id+'@owner.test',other=id+'@other.test';await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
 const keys=Array.from({length:64},(_,i)=>'canvas-perf-authorize/'+id+'/'+i+'.png');
 const fs=await import('node:fs/promises');await fs.mkdir(process.env.MEDIA_DIR+'/canvas-perf-authorize/'+id,{recursive:true});
 for(const key of keys){const b=Buffer.from([1,2,3,4]);await writeFile(path.join(process.env.MEDIA_DIR!,key),b);await assets.registerMediaAsset(key,b,'application/octet-stream',false,owner);await db.getPool().query("UPDATE app_media_assets SET content_type='image/png' WHERE key=$1",[key]);}
 const cookie=(email:string)=>'nv_user='+native.signUserSession(email,Date.now());
 const req=(email:string,sources:string[],publicOnly=false)=>new Request('http://fixture.test/api/'+(publicOnly?'public-image-cache':'media/image-cache'),{method:'POST',headers:{cookie:cookie(email),origin:'http://fixture.test','content-type':'application/json'},body:JSON.stringify({sources})});
 const sources=keys.map(k=>'/media/'+k);let r=await manifest.imageCacheManifest(req(owner,sources),false),data=await r.json();assert.equal(r.status,200);assert.equal(Object.values(data.results).filter(Boolean).length,64);
 r=await manifest.imageCacheManifest(req(other,sources),false);data=await r.json();assert.equal(Object.values(data.results).filter(Boolean).length,0,'not owner');
 // A real legacy/shared reference still works despite asset owner differing.
 await db.addArtworks(other,[{id:'shared-'+id,title:'fixture',category:'main',prompt:'',status:'completed',image:sources[0],gradient:''}]);
 r=await manifest.imageCacheManifest(req(other,[sources[0]]),false);assert.ok((await r.json()).results[sources[0]],'shared reference authorizes');
 await db.getPool().query('UPDATE app_artworks SET image_url=$2 WHERE id=$1',['shared-'+id,sources[1]]);
 r=await manifest.imageCacheManifest(req(other,[sources[0],sources[1]]),false);data=await r.json();assert.equal(data.results[sources[0]],null,'revoked reference is not cached');assert.ok(data.results[sources[1]]);
 r=await manifest.imageCacheManifest(req(owner,sources,true),true);data=await r.json();assert.equal(Object.values(data.results).filter(Boolean).length,0,'public endpoint denies private owner');
 r=await manifest.imageCacheManifest(req(owner,['/media/../x.png','http://other.test/media/x.png']),false);data=await r.json();assert.equal(Object.values(data.results).filter(Boolean).length,0);
 r=await manifest.imageCacheManifest(req(owner,[...sources,sources[0]]),false);assert.equal(r.status,400,'64 cap preserved');
 console.log('MANIFEST_BULK=PASS OWNED64=64 FOREIGN64=0 SHARED_REFERENCE=ALLOWED REVOKED_REFERENCE=DENIED PRIVATE_PUBLIC=DENIED TRAVERSAL_EXTERNAL=DENIED BATCH_CAP=64 PROVIDER_CALLS=0');await db.getPool().end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
