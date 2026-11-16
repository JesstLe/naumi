/** Reuse the existing actual-source storage fixture, with real files and HTTP. */
const {loadStorageSource:load}=require('./storage-source-fixture.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {backfillOne,contentAddressed}=load('scripts/ops/nas47_backfill.ts');
const {createObjectStorage}=load('src/lib/object-storage/adapter.ts');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let cases=0,objects=new Map(),mode='',puts=0,gets=0,hook=null;
const server=http.createServer(async(req,res)=>{
 if(req.method==='HEAD'){res.writeHead(objects.has(req.url)?200:404);res.end();return;}
 if(req.method==='PUT'){puts++;const b=[];for await(const part of req)b.push(part);assert.equal(req.headers['if-none-match'],'*');if(mode==='race-conflict')objects.set(req.url,Buffer.from('newer remote'));if(mode==='race-same')objects.set(req.url,Buffer.from('exact immutable media'));if(objects.has(req.url)){res.writeHead(412);res.end();return;}objects.set(req.url,mode==='bad-readback'?Buffer.from('wrong'):Buffer.concat(b));res.writeHead(200);res.end();return;}
 if(req.method==='GET'){gets++;if(hook)await hook();const b=objects.get(req.url);res.writeHead(b?(mode==='partial'?206:200):404);res.end(b);return;}
 res.writeHead(405);res.end();
});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=await fs.mkdtemp(path.join(os.tmpdir(),'backfill-fixture-'));const bytes=Buffer.from('exact immutable media');
 try{async function test(name,options={}){
  cases++;objects=new Map();mode=options.mode||'';puts=0;gets=0;hook=null;
  const key=options.key||'item-'+cases+'.png',file=path.join(root,key),row={key,sha256:sha(bytes),bytes:bytes.length,content_type:'image/png'};
  await fs.mkdir(path.dirname(file),{recursive:true});
  if(!options.absent)await fs.writeFile(file,options.corrupt?Buffer.from('bad'):bytes);
  if(options.remote)objects.set('/fixture/'+key,options.remote==='bad'?Buffer.from('conflict'):bytes);
  let published=false,deferred=0,removed=false;const log=[];
  const backend=createObjectStorage({driver:'s3',enabled:true,mediaDir:root,privateMedia:true,accessMode:'proxy',endpoint:`http://127.0.0.1:${server.address().port}`,bucket:'fixture',region:'garage',accessKeyId:'fixture',secretAccessKey:'fixture',pathStyle:true,publicBase:''});
  if(options.mutate)hook=async()=>{if(puts)await fs.writeFile(file,Buffer.from('changed bytes'));};
  const store={claim:async()=>options.noClaim?null:{...row,claim:'lease'},publish:async()=>{assert.ok(log.find(x=>x.phase==='REMOTE_VERIFIED'));if(options.publishError)throw Error('DB_FAILURE');if(options.noPublish)return null;published=true;return 'eviction-lease';},evict:async(r,c,remove)=>{assert.ok(published);if(options.noEvict)return false;removed=await remove();return removed;},defer:async()=>{deferred++;}};
  let outcome,error;try{outcome=await backfillOne(row,{root,backend,store,conditionalCreateVerified:options.noConditional!==true,log:r=>{if(options.logError&&r.phase==='DELETE_INTENT')throw Error('JOURNAL_FAILURE');log.push(r);}});}catch(e){error=e;}
  const exists=await fs.stat(file).then(()=>true,()=>false);
  if(options.error)assert.ok(error,name);else assert.equal(outcome.status,options.status,name);
  assert.equal(exists,!options.absent&&!options.remove,name+' local preservation');
  assert.equal(published,!!options.published,name+' catalog state');assert.equal(puts,options.puts||0,name+' PUT count');
  if(options.remove){assert.ok(removed);assert.ok(log.findIndex(x=>x.phase==='CATALOG_COMMITTED')<log.findIndex(x=>x.phase==='DELETE_INTENT'));assert.ok(log.some(x=>x.phase==='REMOVED'));}
  assert.equal(deferred,options.noClaim?0:1);console.log('CHECK',cases,name);
 }
 await test('new upload full GET before publish and unlink',{status:'evicted',remove:true,published:true,puts:1});
 await test('existing identical NAS object not overwritten',{remote:'good',status:'evicted',remove:true,published:true});
 await test('local absent NAS verified repairs metadata',{remote:'good',absent:true,status:'remote-recovered-local-absent',published:true});
 await test('both absent remains unresolved',{absent:true,status:'missing-both'});
 await test('local corrupt retained',{corrupt:true,status:'local-mismatch'});
 await test('remote conflict never overwritten',{remote:'bad',status:'remote-conflict'});
 await test('206 is not full readback',{remote:'good',mode:'partial',error:true});
 await test('PUT success wrong readback does not publish',{mode:'bad-readback',status:'put-readback-mismatch',puts:1});
 await test('concurrent source rewrite retained',{mutate:true,status:'local-retained-after-publish',published:true,puts:1});
 await test('claim conflict skips all work',{noClaim:true,status:'superseded-or-claimed'});
 await test('publish CAS conflict preserves local',{remote:'good',noPublish:true,status:'publish-conflict'});
 await test('eviction CAS conflict preserves local',{remote:'good',noEvict:true,status:'local-retained-after-publish',published:true});
 await test('database failure preserves local',{remote:'good',publishError:true,error:true});
 await test('durable deletion intent failure preserves local',{remote:'good',logError:true,error:true,published:true});
 await test('404 to PUT race cannot overwrite newer NAS bytes',{mode:'race-conflict',status:'put-readback-mismatch',puts:1});
 await test('404 to PUT identical race verifies without overwrite',{mode:'race-same',status:'evicted',puts:1,published:true,remove:true});
 await test('unverified conditional gateway retains mutable missing destination',{noConditional:true,status:'requires-atomic-create'});
 await test('audited content-addressed destination uploads on unverified gateway',{key:'image-job-inputs/job-fixture/'+sha(bytes)+'.bin',noConditional:true,status:'evicted',puts:1,published:true,remove:true});
 assert.equal(contentAddressed({key:'image-job-inputs/job-1/'+sha(bytes)+'.bin',sha256:sha(bytes)}),true);assert.equal(contentAddressed({key:'image-job-inputs/job-1/'+sha(Buffer.from('other'))+'.bin',sha256:sha(bytes)}),false);cases++;
 for(const key of ['media-variants/'+sha(bytes)+'-512.webp','creation-inputs/taskid-processed.png','image-job-results/collaboration/'+sha(bytes)+'.bin']){assert.equal(contentAddressed({key,sha256:sha(bytes)}),false);cases++;}
 const local=createObjectStorage({driver:'local',mediaDir:root});await local.put('create-only.bin',bytes,'image/png','private',{ifAbsent:true});await assert.rejects(()=>local.put('create-only.bin',Buffer.from('replacement'),'image/png','private',{ifAbsent:true}),e=>e.status===412);assert.equal(sha(await fs.readFile(path.join(root,'create-only.bin'))),sha(bytes));cases++;
 let claimed=false;await assert.rejects(()=>backfillOne({key:'../escape',sha256:sha(bytes),bytes:bytes.length,content_type:'image/png'},{root,store:{claim:async()=>{claimed=true;}}}));assert.equal(claimed,false);cases++;
 console.log('NAS47_BACKFILL_GUARDS=PASS CASES='+cases+' PRODUCTION_WRITES=0');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
