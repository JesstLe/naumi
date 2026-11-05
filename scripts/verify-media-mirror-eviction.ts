import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';

/** Local copies of NAS-acknowledged media are evicted only after a digest-exact
 * NAS readback; every mismatch keeps the local bytes. Reads keep working. */
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Isolated loopback PG required');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='evict_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-evict-')),objects=new Map<string,Buffer>();let gets=0,puts=0;
 const server=createServer(async(req,res)=>{
  if(req.method==='HEAD'){res.writeHead(objects.has(req.url!)?200:404);res.end();return;}
  if(req.method==='PUT'){puts++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);objects.set(req.url!,Buffer.concat(chunks));res.writeHead(200);res.end();return;}
  if(req.method==='GET'){gets++;const body=objects.get(req.url!);res.writeHead(body?200:404,{'content-type':'image/png'});res.end(body);return;}
  res.writeHead(405);res.end();
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as {port:number}).port;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${port}`,S3_BUCKET:'fixture',S3_REGION:'garage',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',SETTINGS_SECRET:'fixture-mirror-eviction-isolation-secret',NAUMI_MULTI_USER:'1',NAUMI_NAS_DEFER_UPLOAD:'1',NAUMI_RELEASE_RUNTIME:'0'});
 const db=await import('../src/lib/db'),storage=await import('../src/lib/storage'),assets=await import('../src/lib/media-assets'),eviction=await import('../src/lib/media-assets/mirror-eviction'),media=await import('../src/app/media/[...path]/route'),native=await import('../src/lib/native-auth'),writer=await import('../src/lib/media-assets/writer'),{getPool}=await import('../src/platform/db/pool');
 const {createMediaCapacityFixture}=await import('./fixtures/media-capacity');createMediaCapacityFixture(dir,8*1024**3);
 const local=(key:string)=>path.join(dir,...key.split('/'));
 const exists=async(key:string)=>stat(local(key)).then(()=>true,()=>false);
 const remoteKey=(key:string)=>`/fixture/${key}`;
 const marker=async(key:string)=>(await admin.query(`SELECT local_evict_after::text AS v FROM ${schema}.app_media_assets WHERE key=$1`,[key])).rows[0]?.v as string|null;
 const age=(key:string,hours:number)=>admin.query(`UPDATE ${schema}.app_media_assets SET created_at=now()-($2::double precision*interval '1 hour') WHERE key=$1`,[key,hours]);
 let checks=0;const check=(ok:unknown,msg:string)=>{assert.ok(ok,msg);checks++;};
 try{
  check(eviction.localMirrorRetentionHours(undefined)===48&&eviction.localMirrorRetentionHours('off')===null&&eviction.localMirrorRetentionHours('6')===6&&eviction.localMirrorRetentionHours('-1')===48&&eviction.localMirrorRetentionHours('x')===48,'retention parsing');
  const owner='owner@evict.test';await db.getOrCreateUser(owner);
  const image=async(color:string)=>sharp({create:{width:640,height:320,channels:3,background:color}}).png().toBuffer();
  const upload=async(color:string)=>{const bytes=await image(color),key='evict/'+randomUUID()+'.png';const url=await storage.uploadImage(bytes,'image/png',key,undefined,owner);return {bytes,key,url};};
  const get=(url:string,key:string)=>media.GET(new Request('http://fixture'+url,{headers:{cookie:'nv_user='+native.signUserSession(owner,Date.now())}}),{params:Promise.resolve({path:key.split('/')})});

  // 1. Pending (not NAS-acknowledged) copies are never evicted, even when old.
  const a=await upload('orange');await age(a.key,72);
  check((await eviction.evictVerifiedLocalMirrors({retentionHours:48})).evicted===0&&await exists(a.key),'pending local copy retained');
  const uploaded=await assets.recoverMediaMirrors(50);check(uploaded>=3&&(await assets.getMediaAsset(a.key))!.remote_ready,'NAS upload acknowledged');
  // The same recovery lane evicts the aged, now NAS-verified original (default 48h).
  check(!await exists(a.key)&&await marker(a.key)==='infinity','recovery lane evicts aged NAS-verified copy');
  const aAsset=(await assets.getMediaAsset(a.key))!;
  check(aAsset.thumbnail_key&&await exists(aAsset.thumbnail_key),'fresh derivative copies stay within retention');
  assert.deepEqual((await storage.readManagedObject(a.url,a.bytes.length)).bytes,a.bytes);checks++;

  // 2. Within retention: retained. Past retention + digest-exact NAS: evicted, reads served from NAS.
  const b=await upload('teal');await assets.recoverMediaMirrors(50);
  let r=await eviction.evictVerifiedLocalMirrors({retentionHours:48});
  check(await exists(b.key),'copy younger than retention retained');
  await age(b.key,49);const beforeGets=gets;r=await eviction.evictVerifiedLocalMirrors({retentionHours:48});
  check(r.evicted===1&&r.bytesEvicted===b.bytes.length&&!await exists(b.key)&&gets>beforeGets,'aged copy evicted after NAS readback');
  check(await marker(b.key)==='infinity','evicted row leaves the scan set');
  assert.deepEqual((await storage.readManagedObject(b.url,b.bytes.length)).bytes,b.bytes);checks++;
  const served=await get(b.url,b.key);check(served.status===200,'media route serves evicted original from NAS');assert.deepEqual(Buffer.from(await served.arrayBuffer()),b.bytes);checks++;
  check((await eviction.evictVerifiedLocalMirrors({retentionHours:48})).scanned===0,'finished rows are not rescanned');

  // 3. NAS bytes differ: retained, retried later (not immediately).
  const c=await upload('navy');await assets.recoverMediaMirrors(50);await age(c.key,49);
  objects.set(remoteKey(c.key),Buffer.alloc(c.bytes.length,9));
  r=await eviction.evictVerifiedLocalMirrors({retentionHours:48});
  check(r.remoteUnconfirmed===1&&await exists(c.key),'NAS digest mismatch retains local copy');
  const retry=await marker(c.key);check(retry&&retry!=='infinity'&&new Date(retry).getTime()>Date.now()+50*60*1000,'remote mismatch retried after an hour');
  check((await eviction.evictVerifiedLocalMirrors({retentionHours:48})).scanned===0,'retry not rescanned immediately');

  // 4. NAS missing: retained.
  const d=await upload('olive');await assets.recoverMediaMirrors(50);await age(d.key,49);objects.delete(remoteKey(d.key));
  r=await eviction.evictVerifiedLocalMirrors({retentionHours:48});check(r.remoteUnconfirmed===1&&await exists(d.key),'NAS 404 retains local copy');

  // 5. Local copy differs from catalog (same size): retained, never "repaired" by deletion.
  const e=await upload('maroon');await assets.recoverMediaMirrors(50);await age(e.key,49);
  await writeFile(local(e.key),Buffer.alloc(e.bytes.length,7));
  r=await eviction.evictVerifiedLocalMirrors({retentionHours:48});check(r.mismatch===1&&await exists(e.key),'corrupt local copy retained');

  // 6. Readback budget bounds NAS traffic; deferred rows are picked up next scan.
  const f=await upload('purple'),g=await upload('silver');await assets.recoverMediaMirrors(50);await age(f.key,49);await age(g.key,49);
  r=await eviction.evictVerifiedLocalMirrors({retentionHours:48,readbacks:1});
  check(r.evicted===1&&r.deferred>=1,'one readback per budget');
  r=await eviction.evictVerifiedLocalMirrors({retentionHours:48,readbacks:5});
  check(!await exists(f.key)&&!await exists(g.key),'deferred row evicted on the next scan');

  // 7. Disabled retention never evicts.
  const h=await upload('gold');await assets.recoverMediaMirrors(50);await age(h.key,999);
  check((await eviction.evictVerifiedLocalMirrors({retentionHours:null})).scanned===0&&await exists(h.key),'retention off never evicts');

  // 8. Re-registration makes the key eligible again.
  await eviction.evictVerifiedLocalMirrors({retentionHours:48});check(await marker(h.key)==='infinity','aged copy evicted');
  const asset=(await assets.getMediaAsset(h.key))!;
  await writer.registerMediaMetadata(getPool(),{key:h.key,owner,public:false,driver:'s3',remoteReady:true,contentType:'image/png',sha256:asset.sha256,bytes:Number(asset.bytes)});
  check(await marker(h.key)===null,'re-registration resets the eviction marker');

  // 9. Concurrent scanners: claims are exclusive, no double processing.
  const many=await Promise.all(Array.from({length:4},(_,i)=>upload(['red','blue','green','black'][i])));await assets.recoverMediaMirrors(50);
  for(const m of many)await age(m.key,49);
  const [x,y]=await Promise.all([eviction.evictVerifiedLocalMirrors({retentionHours:48}),eviction.evictVerifiedLocalMirrors({retentionHours:48})]);
  check(x.evicted+y.evicted===4,'four copies evicted exactly once across two scanners');
  for(const m of many){check(!await exists(m.key),'evicted');assert.deepEqual((await storage.readManagedObject(m.url,m.bytes.length)).bytes,m.bytes);checks++;}
  check(puts>0,'fixture NAS exercised');
  console.log(`MEDIA_MIRROR_EVICTION PASS checks=${checks}`);
 }finally{
  server.close();await getPool().end().catch(()=>{});await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(()=>{});await admin.end();await rm(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exit(1);});
