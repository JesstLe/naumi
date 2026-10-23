/* Actual loopback HTTP blackholes + real local files. Catalog/worker are
 * isolated fixtures; no production database, customer media or suppliers. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs');
const path=require('node:path'),os=require('node:os'),http=require('node:http'),vm=require('node:vm');
const crypto=require('node:crypto'),ts=require('typescript');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function load(file,dependencies={}) {
 const source=sync.readFileSync(file,'utf8'),exports={};
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,Buffer,Response,Request,Headers,AbortSignal,URL,process,console,fetch,
  require:n=>n==='server-only'?{}:Object.hasOwn(dependencies,n)?dependencies[n]:require(n)},{filename:file});
 return exports;
}
const availability=load('src/lib/object-storage/write-availability.ts');
let clock=100000;
class TestClockAvailability extends availability.WriteAvailability {constructor(){super(()=>clock);}}
const adapter=load('src/lib/object-storage/adapter.ts',{'./write-availability':{...availability,WriteAvailability:TestClockAvailability}});
let mode='healthy',heads=0,puts=0,gets=0;
const objects=new Map(),sockets=new Set();
const server=http.createServer(async(req,res)=>{
 if(req.method==='HEAD') {heads++;if(mode==='head-stall')return;res.writeHead(objects.has(req.url)?200:404);res.end();return;}
 if(req.method==='PUT') {puts++;const chunks=[];for await(const b of req)chunks.push(b);if(mode==='put-stall')return;
  if(mode==='slow-upload')await new Promise(r=>setTimeout(r,10500));
  objects.set(req.url,Buffer.concat(chunks));res.writeHead(200);res.end();return;}
 if(req.method==='GET'){gets++;if(mode==='head-stall')return;const b=objects.get(req.url);res.writeHead(b?200:404,{'content-type':'image/png'});res.end(b);return;}
 res.writeHead(405);res.end();
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
let directory;
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));directory=await fs.mkdtemp(path.join(os.tmpdir(),'naumi-storage-resilience-'));
 const config={driver:'s3',enabled:true,mediaDir:directory,privateMedia:true,accessMode:'proxy',endpoint:`http://127.0.0.1:${server.address().port}`,bucket:'fixture',region:'garage',accessKeyId:'fixture-access',secretAccessKey:'fixture-secret',pathStyle:true,publicBase:''};
 const catalog=new Map();
 const storage=()=>load('src/lib/storage.ts',{'./object-storage/config':{storageConfiguration:()=>config},'./object-storage/adapter':adapter,'./image-upload-policy':{ORIGINAL_IMAGE_MAX_BYTES:64*1024*1024},'./media-assets':{getMediaAsset:async k=>catalog.get(k)||null}});
 let count=0;function check(value,label){assert.ok(value,label);count++;console.log('CHECK',count,label);}
 const bytes=crypto.randomBytes(8192);let s=storage();
 const h=heads;
 const healthy=await Promise.all(Array.from({length:6},(_,n)=>s.writeStoredObject(bytes,'image/png',`healthy-${n}.png`)));
 check(healthy.every(v=>v.remoteReady),'healthy writes remote-ready');check(heads-h===1,'concurrent admission shares one HEAD');
 check((await fs.readdir(directory)).length===0,'healthy remote success does not mirror');

 // Reproduce the incident: listener accepts TCP but never answers HTTP.
 clock+=16000;mode='head-stall';let start=Date.now();
 const beforePut=puts, failed=await s.writeStoredObject(bytes,'image/png','pending.png');
 check(!failed.remoteReady&&Date.now()-start<5000,'stalled NAS falls back within bounded HEAD budget');
 check(puts===beforePut,'unresponsive HEAD does not enqueue a full upload');
 check((await fs.readFile(path.join(directory,'pending.png'))).equals(bytes),'fallback bytes durable before success');
 start=Date.now();const oldHeads=heads;
 await Promise.all(['thumbnail.webp','preview.webp'].map(k=>s.writeStoredObject(bytes,'image/webp',k)));
 check(Date.now()-start<1000&&heads===oldHeads,'both variants use cooldown without further stalls');
 catalog.set('pending.png',{remote_ready:false,bytes:bytes.length,sha256:sha(bytes),content_type:'image/png'});const oldGets=gets;
 const read=await s.readManagedObject('/media/pending.png',bytes.length);
 check(read.bytes.equals(bytes)&&gets===oldGets,'pending model input reads mirror without contacting unavailable NAS');
 check(read.contentType==='image/png','pending input retains catalog content type');
 await assert.rejects(()=>s.readManagedObject('/media/pending.png',1));count++;

 // Even if a cached healthy observation races with a later outage, PUT has
 // its own budget and the following variants immediately use local storage.
 mode='healthy';clock+=31000;s=storage();await s.writeStoredObject(bytes,'image/png','cache.png');
 mode='put-stall';start=Date.now();const stalled=await s.writeStoredObject(bytes,'image/png','midflight.png');
 check(!stalled.remoteReady&&Date.now()-start<12000,'small PUT stall no longer waits 120 seconds');
 start=Date.now();await s.writeStoredObject(bytes,'image/webp','midflight-preview.webp');
 check(Date.now()-start<1000,'PUT failure opens cooldown for following previews');

 mode='slow-upload';clock+=31000;const large=crypto.randomBytes(3*1024*1024);
 start=Date.now();const slow=await s.writeStoredObject(large,'image/png','slow.png');
 check(slow.remoteReady&&Date.now()-start>=10000,'legitimate slower large write is not limited to small-object deadline');
 check(availability.nasWriteTimeout(64*1024*1024)===120000,'64MiB keeps previous two-minute allowance');
 mode='healthy';clock+=31000;
 const recovered=await s.writeStoredObject(bytes,'image/png','pending.png');
 check(recovered.remoteReady,'same-key retry succeeds after cooldown');catalog.set('pending.png',{remote_ready:true});
 await fs.writeFile(path.join(directory,'pending.png'),'stale');
 const authoritative=await s.readManagedObject('/media/pending.png',bytes.length);
 check(authoritative.bytes.equals(bytes),'acknowledged remote bytes remain authoritative over stale mirror');
 const beforeR2=heads;config.driver='r2';config.accessMode='redirect';const r2=storage();
 const r2result=await r2.writeStoredObject(bytes,'image/png','r2.png');
 check(r2result.remoteReady&&heads===beforeR2,'R2 keeps its existing remote write path without NAS probes');
 config.driver='s3';config.accessMode='proxy';

 // Recovery validates the source and defers a damaged item, allowing the
 // next good item to progress. SQL transaction semantics remain a fixture.
 const queries=[],uploads=[];const rows=[{key:'corrupt',content_type:'image/png',bytes:bytes.length,sha256:sha(bytes)},
  {key:'good',content_type:'image/png',bytes:bytes.length,sha256:sha(bytes)}];
 const pool={connect:async()=>({query:async(q,v)=>{queries.push({q,v});return {rows:q.startsWith('SELECT key,')?rows:[]};},release(){}}),query:async()=>({rows:[]})};
 const media=load('src/lib/media-assets.ts',{'@/lib/release-runtime/background-activity':{withBackgroundActivity:async(_k,_id,_m,f)=>f(),bindBackgroundClaim:async()=>{}},
  './db':{dbEnabled:true,ensureSchema:async()=>{},getPool:()=>pool},'./bi/model-observer':{currentBiContext:()=>null},'./media-variants':{},
  './storage':{privateMedia:true,storageDriver:'s3',readPendingStoredObject:async k=>({bytes:k==='good'?bytes:Buffer.from('damaged'),size:k==='good'?bytes.length:7}),
   readManagedObject:async()=>{throw Error('unexpected remote read');},writeStoredObject:async(b,_t,k)=>{uploads.push({k,hash:sha(b)});return {remoteReady:true};}}});
 await media.recoverMediaMirrors(2);
 check(uploads.length===1&&uploads[0].k==='good','corrupt mirror never uploads and does not starve next item');
 const updates=queries.filter(v=>v.q.startsWith('UPDATE app_media_assets SET remote_ready='));
 check(updates.length===2&&updates[0].v[1]===false&&updates[1].v[1]===true,'both rows receive persisted retry state');
 check(queries.some(v=>v.q==='COMMIT'),'one corrupt mirror does not roll back successful retry');
 console.log(JSON.stringify({passed:true,cases:count,realLoopbackHttp:true,realLocalFiles:true,catalogAndWorker:'fixture',supplierCalls:0}));
}
const deadline=setTimeout(()=>{console.error('TEST_DEADLINE_EXCEEDED');for(const s of sockets)s.destroy();},40000);main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 clearTimeout(deadline);for(const s of sockets)s.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));
 if(directory){for(const name of await fs.readdir(directory))await fs.unlink(path.join(directory,name));await fs.rmdir(directory);}
});
