// X5 local fixture: real PG/repository/billing/storage; no production environment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const {createHash}=require('node:crypto'),{Pool}=require('pg'),ts=require('typescript'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),source=path.resolve(process.argv[2]||root),mode=process.argv[3]||'modified';
assert.ok(['baseline','modified'].includes(mode));
const out=path.resolve(root,'output/capacity-x5-20261029'),media=path.join(out,`media-${mode}`);
const connection='postgresql://x5_fixture:x5_fixture_only@127.0.0.1:55435/naumi_x5_isolated';
// This dedicated container/database is created by this task, never an inherited URL.
const pool=new Pool({connectionString:connection,ssl:false,max:5,application_name:'naumi-x5-590d9543'});
const digest=b=>createHash('sha256').update(b).digest('hex');
let storageWrites=0,storageReads=0,uploadFault=false,afterWrite,posts=0,txnDuringUpload=0;
const env={STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_IMAGE_JOB_CONCURRENCY_SUITE:'4'};
const scope={connection:{protocol:'openai-images',wireModel:'fixture'},frozen:{publicModelId:'fixture'}};
const db={dbEnabled:true,getPool:()=>pool,ensureSchema:async()=>{},creditMeteringEnabled:async()=>true,expireDueBatches:async()=>{},refreshBalance:async()=>{}};
const mocks={
 db,'saas/creation-context':{currentCreationContext:()=>undefined,withFrozenCreation:(_c,fn)=>fn()},
 'saas/creation-writer':{acceptCreationTx:async()=>null,creationLinkTx:async()=>{},recordImageStateTx:async()=>{},attachBillingCreationTx:async()=>{}},
 'release-runtime/background-activity':{withBackgroundActivity:(_a,_b,_c,fn)=>fn(),detachBackgroundActivity:(_a,_b,_c,fn)=>fn(),bindBackgroundClaim:async()=>{}},
 'release-runtime/identity':{releaseRuntimeEnabled:()=>true},'settings-secret':{workerSecret:()=> 'x'.repeat(32)},
 'settings':{getOpenAISettings:async()=>({apiKey:'fixture'})},'openai-base':{getOpenAIBaseUrl:async()=> 'http://fixture.invalid'},
 'bi/model-observer':{withBiModelContext:(_a,_b,_c,fn)=>fn(),currentBiContext:()=>undefined},
 'model-config/context':{currentExecutionBundle:()=>undefined,currentModelExecution:()=>scope,runLegacyModelExecution:fn=>fn()},
 'model-config/execution':{withFrozenExecutionBundle:(_b,fn)=>fn()},
 'model-config/channel-availability':{acceptedImageOperationIdentities:async()=>({}),withAcceptedImageRead:(_id,fn)=>fn()},
 'model-config/apimart-image-policy':{queryableImageScope:()=>false},
 'request-auth':{authenticatedEmail:async request=>request.headers.get('x-fixture-owner')},
};
function loader(){
 const cache=new Map(),context=vm.createContext({console,process:{env},Buffer,URL,Request,Response,Headers,AbortSignal,AbortController,structuredClone,performance,Date,Error,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,
 fetch:async (...args)=>{assert.ok(String(args[0]?.url||args[0]).startsWith('http://127.0.0.1:'),'fixture only network');return fetch(...args);}});
 function load(rel){
  rel=rel.replaceAll('\\','/');if(cache.has(rel))return cache.get(rel).exports;
  let file=path.join(source,rel);if(!fs.existsSync(file))file=path.join(root,rel);
  const module={exports:{}};cache.set(rel,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const req=spec=>{
   if(spec==='server-only')return {};
   let target=spec.startsWith('@/')?`src/${spec.slice(2)}`:spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(rel),spec)):null;
   if(!target)return require(spec);
   if(target.startsWith('src/lib/')&&mocks[target.slice(8)])return mocks[target.slice(8)];
   for(const ext of ['', '.ts','.json'])if([source,root].some(r=>fs.existsSync(path.join(r,target+ext))&&fs.statSync(path.join(r,target+ext)).isFile()))return load(target+ext);
   throw Error('unresolved '+target);
  };
  vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename:file})(req,module,module.exports);
  if(rel==='src/lib/object-storage/adapter.ts'){
   const original=module.exports.createObjectStorage;
   module.exports={...module.exports,createObjectStorage:config=>{
    const backend=original(config);return {...backend,put:async(...args)=>{
     storageWrites++;const active=await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='naumi-x5-590d9543' AND state='idle in transaction'");txnDuringUpload+=active.rows[0].n;
     if(uploadFault)throw Error('X5_FIXTURE_UPLOAD_FAILURE');await backend.put(...args);if(afterWrite){const hook=afterWrite;afterWrite=null;await hook();}
    },get:async(...args)=>{storageReads++;return backend.get(...args);}};
   }};
  }
  return module.exports;
 }
 return load;
}
const q={schemaVersion:1,engineVersion:1,configVersion:1,facts:{feature:'image.generate',quantity:1,quality:'medium',resolution:'1K',metered:true,byok:false},tariff:{enabled:true,unit:'image',pricing:{mode:'fixed',credits:6},settlement:{unknown:'hold',qualityBasis:'requested',successBasis:'successful-units',failureBps:0,byokBps:10000,reserveBps:10000}},costRates:{},reserveCredits:6,requestedCredits:6,authorizedCredits:6,matchedRuleId:null};
const owner='x5@example.test';
async function schema(){await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE app_users(email text PRIMARY KEY,credits_used int NOT NULL DEFAULT 0,credits_total int NOT NULL DEFAULT 10000);
CREATE TABLE app_credit_batches(id text PRIMARY KEY,email text,amount int,remaining int,expired bool DEFAULT false,created_at timestamptz DEFAULT now(),expires_at timestamptz);
CREATE TABLE app_ledger(id text PRIMARY KEY,email text,delta int,reason text,kind text);
CREATE TABLE app_gen_reservations(job_id text PRIMARY KEY,email text,cost int);
CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,quote jsonb,request_fingerprint text,state text,ledger_id text UNIQUE,reserved_credits int DEFAULT 0,charged_credits int DEFAULT 0,settlement_result jsonb,result_response jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE app_billing_reconciliations(id text PRIMARY KEY,operation_id text,email text,actor text,request_fingerprint text,reason text,proof text,result jsonb,charge int);
CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,cost int,metered bool,reserved_cost int DEFAULT 0,billing_settled bool DEFAULT false,lease_token text,lease_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE app_artworks(id text PRIMARY KEY,email text,image_url text,source_url text,video_url text);
INSERT INTO app_users(email) VALUES ('x5@example.test');
INSERT INTO app_credit_batches(id,email,amount,remaining,expires_at) VALUES('x5','x5@example.test',10000,10000,now()+interval '1 day');`);}
function extract(text,name,bindings){
 const ast=ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn,name);
 const compiled=ts.transpileModule(fn.getText(ast)+'\nexports.fn='+name,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,...bindings,URL,Response,Buffer,console});return exports.fn;
}
async function ready(id){
 // Local fixture only: expire the normal 10s release backoff, not an active lease.
 await pool.query("UPDATE app_image_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 AND lease_token IS NULL",[id]);
}
async function restore(){
 const load=loader(),{DurableImageJobs}=load('src/lib/durable-image-jobs.ts'),jobs=new DurableImageJobs('suite');
 const png=fs.readFileSync(path.join(out,'INPUT.png')),expected='data:image/png;base64,'+png.toString('base64');
 const before=await jobs.get('root-strings',false);let callback=0,resumed=false;await ready('root-strings');
 await jobs.kick('root-strings',async()=>{resumed=true;const result=await jobs.paidOperation('root-strings','fixture',{id:'root-op',managedGateway:false},async()=>{callback++;throw Error('UNEXPECTED_POST');});assert.equal(result[0].url,expected);});
 assert.equal(resumed,true);assert.equal(callback,0);assert.equal((await jobs.get('root-strings',false)).paidOperations['root-op'].attemptToken,before.paidOperations['root-op'].attemptToken);
 const bytes=(await jobs.get('root-buffer')).paidOperations['buffer-op'].result;assert.ok(bytes.equals(png));
 console.log('RESTART=PASS ROOT_TOKEN=UNCHANGED BUFFER_HASH=MATCH POST=0');
}
async function main(){
 if(process.argv[4]==='--restore')return restore();
 await schema();fs.mkdirSync(media,{recursive:true});
 const pixels=Buffer.alloc(768*512*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*13+(i>>>7)*29)%256;
 const png=await sharp(pixels,{raw:{width:768,height:512,channels:3}}).png({compressionLevel:0}).toBuffer(),b64=png.toString('base64'),dataURL='data:image/png;base64,'+b64;
 fs.writeFileSync(path.join(out,'INPUT.png'),png);
 const server=http.createServer((req,res)=>{if(req.method==='POST'&&req.url==='/generate'){posts++;req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify({url:dataURL,b64_json:b64}));}else{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/generate`,load=loader(),repo=load('src/lib/image-job-repository.ts'),{DurableImageJobs}=load('src/lib/durable-image-jobs.ts'),gateway=load('src/lib/image-gateway.ts'),jobs=new DurableImageJobs('suite');
 const create=async(id,snapshot={})=>jobs.create(id,owner,{status:'pending',createdAt:Date.now(),...snapshot},{},6,true,q);
 const row=async id=>(await pool.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[id])).rows[0].snapshot;
 try{
  await create('root-strings');await jobs.kick('root-strings',async()=>jobs.paidOperation('root-strings','fixture',{id:'root-op',managedGateway:false},async()=>{const r=await fetch(url,{method:'POST'});return [await r.json()];}));
  await create('root-buffer');await jobs.kick('root-buffer',async()=>jobs.paidOperation('root-buffer','fixture',{id:'buffer-op',managedGateway:false},async()=>png));
  await create('child-strings');await jobs.kick('child-strings',async()=>jobs.paidOperation('child-strings','fixture',{id:'child-op',managedGateway:false},async()=>[await gateway.withImageIndex('fixture',0,async()=>({url:dataURL,b64_json:b64})),await gateway.withImageIndex('fixture',1,async()=>({url:dataURL}))]));
  const rootSaved=await row('root-strings'),childSaved=await row('child-strings'),bufferSaved=await row('root-buffer');
  assert.ok(bufferSaved.paidOperations['buffer-op'].result.$imageJobBuffer);
  assert.ok(childSaved.paidOperations['child-op'].children['child-op:image:0'].result.b64_json.$imageJobBase64.$imageJobBuffer);
  const rootInline=typeof rootSaved.paidOperations['root-op'].result[0].url==='string';assert.equal(rootInline,mode==='baseline');
  const recovered=await jobs.get('root-strings');assert.equal(recovered.paidOperations['root-op'].result[0].url,dataURL);assert.equal(recovered.paidOperations['root-op'].result[0].b64_json,b64);
  const rawSize=Buffer.byteLength(JSON.stringify(rootSaved)),childSize=Buffer.byteLength(JSON.stringify(childSaved));
  console.log(`INPUT png=${png.length} width=768 height=512 channels=3 sha256=${digest(png)}`);
  console.log(`SNAPSHOT root=${rawSize} root_child=${childSize} buffer=${Buffer.byteLength(JSON.stringify(bufferSaved))} ROOT_INLINE=${rootInline}`);

  // A new OS process must read the reference and return done without any callback.
  const child=require('node:child_process').spawnSync(process.execPath,[__filename,source,mode,'--restore'],{encoding:'utf8'});
  process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(child.status,0);
  const recoveredChildren=await jobs.get('child-strings');assert.equal(recoveredChildren.paidOperations['child-op'].children['child-op:image:0'].result.url,dataURL);
  const countFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?countFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);
  if(mode==='modified')assert.equal(countFiles(path.join(media,'image-job-results',digest(Buffer.from('root-strings')))).length,1);
  const beforeRepeat=await row('root-strings');await ready('root-strings');await jobs.set('root-strings',await jobs.get('root-strings'));await jobs.patch('root-strings',{testStatus:'same-bytes'});
  assert.equal((await row('root-strings')).paidOperations['root-op'].attemptToken,beforeRepeat.paidOperations['root-op'].attemptToken);
  if(mode==='modified')assert.equal(countFiles(path.join(media,'image-job-results',digest(Buffer.from('root-strings')))).length,1);
  const actual=await sharp(Buffer.from(recovered.paidOperations['root-op'].result[0].b64_json,'base64')).raw().toBuffer();assert.ok(actual.equals(pixels));
  console.log('ROOT_CHILD_REPEAT_PIXELS=PASS');
  // Legacy inline URL/base64/JSON Buffer and old external marker formats stay readable.
  const storage=load('src/lib/storage.ts'),oldURL=await storage.uploadImage(png,'application/octet-stream','image-job-inputs/legacy/original.bin');
  const historical={url:dataURL,b64_json:b64,buffer:png.toJSON(),oldBuffer:{$imageJobBuffer:oldURL},oldB64:{$imageJobBase64:{$imageJobBuffer:oldURL}},oldURL:{$imageJobDataURL:'data:image/png;base64,',bytes:{$imageJobBuffer:oldURL}}};
  await repo.createImageJob('history',owner,'suite',{status:'pending',paidOperationVersion:1,paidOperations:{original:{state:'done',attemptToken:'original-token',result:historical}}},{},0,false);
  const historyBefore=JSON.stringify(await row('history'));let historyCallback=0;
  await jobs.kick('history',async()=>{const result=await jobs.paidOperation('history','fixture',{id:'original',managedGateway:false},async()=>{historyCallback++;});assert.equal(result.url,dataURL);assert.equal(result.b64_json,b64);assert.equal(result.oldB64,b64);assert.equal(result.oldURL,dataURL);assert.ok(result.oldBuffer.equals(png));if(mode==='modified')assert.ok(result.buffer.equals(png));else assert.equal(result.buffer.type,'Buffer');});
  assert.equal(historyCallback,0);assert.equal(JSON.stringify(await row('history')),historyBefore);console.log('HISTORY=PASS READ_ONLY=1 POST=0');
  // One sibling succeeded and another is UNKNOWN: preserve success and never POST unknown.
  await create('siblings');let pending;
  await jobs.kick('siblings',async()=>{try{await jobs.paidOperation('siblings','fixture',{id:'siblings-op',managedGateway:false},async()=>{
   await gateway.withImageIndex('fixture',0,async()=>({url:dataURL}));
   await gateway.withImageIndex('fixture',1,async()=>{throw new gateway.ImageOperationPending('siblings-op:image:1',Error('fixture-unknown'));});
  });}catch(e){pending=e;}});assert.ok(pending instanceof gateway.ImageOperationPending);
  const siblingBefore=await row('siblings');let replay=0,resumedSibling=false;await ready('siblings');
  await jobs.kick('siblings',async()=>{try{await jobs.paidOperation('siblings','fixture',{id:'siblings-op',managedGateway:false},async()=>{
   resumedSibling=true;const saved=await gateway.withImageIndex('fixture',0,async()=>{replay++;});assert.equal(saved.url,dataURL);
   await gateway.withImageIndex('fixture',1,async()=>{replay++;});
  });}catch(e){assert.ok(e instanceof gateway.ImageOperationPending);}});
  assert.equal(resumedSibling,true);assert.equal(replay,0);const siblingAfter=await row('siblings');assert.equal(siblingAfter.paidOperations['siblings-op'].children['siblings-op:image:0'].attemptToken,siblingBefore.paidOperations['siblings-op'].children['siblings-op:image:0'].attemptToken);
  assert.equal(siblingAfter.paidOperations['siblings-op'].children['siblings-op:image:0'].state,'done');
  console.log('SIBLING=RETAINED UNKNOWN_POST=0');
  if(mode==='modified'){
   const codec=load('src/lib/image-job-codec.ts');
   const textFixture={status:'pending',prompt:dataURL,paidOperations:{op:{state:'done',attemptToken:'text-identity',result:{url:'data:image/png;base64,!!bad!!',b64_json:'!!bad!!',revised_prompt:dataURL}}}};
   const textSaved=await codec.encodeImageJobSnapshot(textFixture,'text-fixture');assert.equal(textSaved.prompt,dataURL);assert.equal(textSaved.paidOperations.op.result.revised_prompt,dataURL);assert.equal(textSaved.paidOperations.op.result.url,textFixture.paidOperations.op.result.url);assert.equal(textSaved.paidOperations.op.result.b64_json,'!!bad!!');
   console.log('NON_IMAGE_TEXT=UNCHANGED MALFORMED_BYTES=UNCHANGED');
   // No dangling reference on local write failure: exact paid bytes remain durable.
   await create('upload-fail');uploadFault=true;
   try{await jobs.kick('upload-fail',async()=>jobs.paidOperation('upload-fail','fixture',{id:'upload-fail-op',managedGateway:false},async()=>({url:dataURL,b64_json:b64,buffer:png})));}finally{uploadFault=false;}
   const failed=await row('upload-fail');assert.equal(failed.paidOperations['upload-fail-op'].state,'done');assert.ok(JSON.stringify(failed).includes('CHECKPOINT_UPLOAD_FAILED'));assert.ok(!JSON.stringify(failed).includes('$imageJobBuffer'));
   const retained=(await jobs.get('upload-fail')).paidOperations['upload-fail-op'].result;assert.equal(retained.url,dataURL);assert.ok(retained.buffer.equals(png));assert.equal(retained.b64_json,b64);
   const retrySnapshot=JSON.stringify(failed);await ready('upload-fail');await jobs.patch('upload-fail',{status:'pending'});assert.equal(JSON.stringify(await row('upload-fail')),retrySnapshot);
   console.log('UPLOAD_FAILURE=INLINE_RETAINED INVALID_REFS=0 ORIGINAL_BYTES=MATCH');
   // Upload succeeds, another lease owner wins before save: orphan retained, no publish.
   await create('lost-lease');let lostError;
   afterWrite=async()=>{await pool.query("UPDATE app_image_jobs SET lease_token='fixture-new-owner',lease_until=clock_timestamp()+interval '1 minute' WHERE id='lost-lease'");};
   await jobs.kick('lost-lease',async()=>{try{await jobs.paidOperation('lost-lease','fixture',{id:'lost-op',managedGateway:false},async()=>({url:dataURL}));}catch(e){lostError=e;}});
   assert.equal(lostError?.name,'ImageJobLeaseLostError');const lost=await row('lost-lease');assert.equal(lost.paidOperations['lost-op'].state,'started');assert.equal(lost.paidOperations['lost-op'].result,undefined);
   const orphan=path.join(media,'image-job-results',digest(Buffer.from('lost-lease')),digest(png)+'.bin');assert.ok(fs.readFileSync(orphan).equals(png));
   assert.equal((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE id='led-image-lost-lease'")).rows[0].n,0);
   console.log('LOST_LEASE=PUBLISH_BLOCKED ORPHAN_HASH=MATCH CHARGE=0');
   // Content integrity failure is not returned as pixels and cannot cause a POST.
   const ref=(await row('root-buffer')).paidOperations['buffer-op'].result,file=path.join(media,ref.$imageJobBuffer.slice('/media/'.length)),original=fs.readFileSync(file);
   fs.writeFileSync(file,Buffer.from('corrupted-fixture'));try{await assert.rejects(()=>jobs.get('root-buffer'),/\u6821\u9a8c\u5931\u8d25/);}finally{fs.writeFileSync(file,original);}
   assert.ok((await jobs.get('root-buffer')).paidOperations['buffer-op'].result.equals(png));console.log('CONTENT_HASH=VERIFIED CORRUPTION=REJECTED');
   // Public read surfaces may not use internal checkpoint locations as a bypass.
   const assets=load('src/lib/media-assets.ts'),mediaRoute=load('src/app/media/[...path]/route.ts');
   const key=ref.$imageJobBuffer.slice('/media/'.length);assert.equal(await assets.canReadMedia(key,owner),false);assert.equal(await assets.canReadMedia(key,'other@example.test'),false);
   for(const actor of [owner,'other@example.test','']){const response=await mediaRoute.GET(new Request('http://fixture.test'+ref.$imageJobBuffer,{headers:{'x-fixture-owner':actor}}),{params:Promise.resolve({path:key.split('/')})});assert.equal(response.status,404);}
   const dotted=await mediaRoute.GET(new Request('http://fixture.test/media/private'),{params:Promise.resolve({path:['.',...key.split('/')]})});assert.equal(dotted.status,400);
   const upperKey=key.replace('image-job-results','IMAGE-JOB-RESULTS');const upper=await mediaRoute.GET(new Request('http://fixture.test/media/private'),{params:Promise.resolve({path:upperKey.split('/')})});assert.equal(upper.status,404);
   await assert.rejects(()=>storage.readManagedObject(ref.$imageJobBuffer),/\u5185\u90e8/);
   console.log('CHECKPOINT_PUBLIC_READ=404 CROSS_OWNER=DENIED GENERIC_READER=DENIED');
   // Exercise the real SQL proof and recovery decoder, without storage downloads for polling.
   const codeFile=fs.readFileSync(path.join(source,'src/lib/imagegen/stored-delivery.ts'),'utf8');
   const proofFn=extract(codeFile,'storedDeliveryState',{dbEnabled:true,getPool:()=>pool});
   await repo.createImageJob('parent',owner,'imagegen',{status:'error',children:{only:{jobId:'proof-child'}}},{},0,false);
   await repo.createImageJob('proof-child',owner,'generate',{...rootSaved,status:'error'},{},0,false);
   assert.equal((await proofFn('parent',owner)).available,true);assert.equal(await proofFn('parent','other@example.test'),null);
   const checkpoint=load('src/lib/imagegen/delivery-checkpoint.ts').storedDeliveryCheckpoint;
   assert.ok(checkpoint(rootSaved)?.allDone);assert.equal(checkpoint(await codec.decodeImageJobValue(rootSaved)).images[0].url,dataURL);
   await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{paidOperations,root-op,result}','[{\"url\":{\"$imageJobDataURL\":\"data:image/png;base64,\"}}]'::jsonb) WHERE id='proof-child'");assert.equal(await proofFn('parent',owner),null);
   console.log('DELIVERY_PROOF=PASS MALFORMED=REJECTED CROSS_OWNER=DENIED');
   // Existing S3 adapter against a local signed-HTTP fixture: remote success,
   // outage -> durable local mirror, and legacy public config -> local only.
   const objects=new Map();let requests=0,outage=false;
   const s3=http.createServer(async(req,res)=>{
    requests++;const key=new URL(req.url,'http://fixture').pathname;
    if(outage){req.resume();res.statusCode=503;res.end();return;}
    if(req.method==='PUT'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const incoming=Buffer.concat(chunks);if(objects.has(key))assert.ok(objects.get(key).equals(incoming));objects.set(key,incoming);res.end();return;}
    if(!objects.has(key)){res.statusCode=404;res.end();return;}
    res.setHeader('content-length',String(objects.get(key).length));res.end(req.method==='HEAD'?undefined:objects.get(key));
   });
   await new Promise(r=>s3.listen(0,'127.0.0.1',r));
   const savedEnv={...env};Object.assign(env,{STORAGE_DRIVER:'s3',MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',S3_ENDPOINT:'http://127.0.0.1:'+s3.address().port,S3_BUCKET:'x5-fixture',S3_ACCESS_KEY_ID:'x5-local',S3_SECRET_ACCESS_KEY:'x5-local-only'});
   try{
    const remote=loader()('src/lib/storage.ts'),key='image-job-results/s3-fixture/'+digest(png)+'.bin';
    assert.equal(await remote.writeImageJobResult(png,key),'managed');assert.equal(objects.size,1);assert.equal(await remote.writeImageJobResult(png,key),'managed');assert.equal(objects.size,1);
    assert.ok((await remote.readImageJobResult('/media/'+key,'managed',png.length)).equals(png));
    outage=true;const fallback=loader()('src/lib/storage.ts'),mirrorKey='image-job-results/s3-outage/'+digest(png)+'.bin';
    assert.equal(await fallback.writeImageJobResult(png,mirrorKey),'managed');assert.ok((await fallback.readImageJobResult('/media/'+mirrorKey,'managed',png.length)).equals(png));
    const beforePublic=requests;env.MEDIA_PRIVATE='0';const publicStorage=loader()('src/lib/storage.ts'),privateKey='image-job-results/public-config/'+digest(png)+'.bin';
    assert.equal(await publicStorage.writeImageJobResult(png,privateKey),'local');assert.equal(requests,beforePublic);
    assert.ok((await publicStorage.readImageJobResult('/media/'+privateKey,'local',png.length)).equals(png));
    const publicRoute=loader()('src/app/media/[...path]/route.ts');assert.equal((await publicRoute.GET(new Request('http://fixture/media/'+privateKey),{params:Promise.resolve({path:privateKey.split('/')})})).status,404);
    console.log('LOCAL_S3=PASS REMOTE_HASH=MATCH OUTAGE_MIRROR=MATCH PUBLIC_BUCKET_PUT=0 PUBLIC_CHECKPOINT_GET=404');
   }finally{for(const key of Object.keys(env))delete env[key];Object.assign(env,savedEnv);await new Promise(r=>s3.close(r));}

  }
  // Real upload/ACL and real billing settlement. GET implementation is extracted
  // unchanged, only login identity and unrelated review lookup are fixture seams.
  const deliveredURL=await storage.uploadImage(png,'application/octet-stream','generations/x5-delivered.png',undefined,owner);
  await ready('root-strings');await jobs.kick('root-strings',async()=>{await jobs.patch('root-strings',{images:[{id:'art-root-strings',url:deliveredURL}],status:'done'});await jobs.settleResults('root-strings',6,'X5 fixture delivery',{state:'succeeded',items:[{id:'art-root-strings',state:'succeeded'}]});});
  await repo.settleImageJob('root-strings',{state:'succeeded',items:[{id:'art-root-strings',state:'succeeded'}]},'X5 duplicate settle',null);
  const ledger=(await pool.query("SELECT count(*)::int AS n,sum(delta)::int delta FROM app_ledger WHERE id='led-image-root-strings'")).rows[0];assert.deepEqual(ledger,{n:1,delta:-6});
  const assets=load('src/lib/media-assets.ts');assert.equal(await assets.canReadMedia(deliveredURL.slice(7),owner),true);assert.equal(await assets.canReadMedia(deliveredURL.slice(7),'other@example.test'),false);
  const mediaRoute=load('src/app/media/[...path]/route.ts'),params={params:Promise.resolve({path:deliveredURL.slice(7).split('/')})};
  const delivered=await mediaRoute.GET(new Request('http://fixture.test'+deliveredURL,{headers:{'x-fixture-owner':owner}}),params);assert.equal(delivered.status,200);assert.ok(Buffer.from(await delivered.arrayBuffer()).equals(png));
  const denied=await mediaRoute.GET(new Request('http://fixture.test'+deliveredURL,{headers:{'x-fixture-owner':'other@example.test'}}),params);assert.equal(denied.status,404);
  const handleGet=extract(fs.readFileSync(path.join(root,'src/app/api/generate-image/route.ts'),'utf8'),'handleGet',{JOBS:jobs,dbEnabled:true,resolveUserEmail:async req=>req.headers.get('x-fixture-owner'),NextResponse:Response,imageOutputNotice:()=>({}),getUser:async()=>({email:owner}),imageJobPollState:s=>s,storedImageReview:async()=>null});
  const response=await handleGet(new Request('http://fixture.test/api/generate-image?job=root-strings',{headers:{'x-fixture-owner':owner}})),body=await response.text();assert.equal(response.status,200);assert.ok(body.includes(deliveredURL));assert.ok(!body.includes('base64')&&!body.includes('paidOperations')&&!body.includes('$imageJob'));
  assert.equal((await handleGet(new Request('http://fixture.test/api/generate-image?job=root-strings',{headers:{'x-fixture-owner':'other@example.test'}}))).status,403);
  console.log(`DELIVERY=200 PIXELS=MATCH LEDGER_COUNT=1 DELTA=-6 GET_BYTES=${Buffer.byteLength(body)} GET_CROSS_OWNER=403 MEDIA_CROSS_OWNER=404`);
  assert.equal(txnDuringUpload,0);console.log('UPLOAD_DB_TRANSACTIONS=0');

  fs.writeFileSync(path.join(out,`${mode}-metrics.json`),JSON.stringify({pngBytes:png.length,rootBytes:rawSize,rootChildBytes:childSize,rootInline,posts,sha256:digest(png)},null,2));
  console.log(`X5_${mode.toUpperCase()}=${mode==='baseline'?'REPRODUCED':'PASS'}`);
 }finally{await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
