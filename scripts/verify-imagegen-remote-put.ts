/** Real image handlers/PG/leases/wallet and the original signed S3 adapter.
 * Only the loopback object-store response is controlled; paid results are never seeded. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rename,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import sharp from 'sharp';

async function main(){
 const arg=(name:string)=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1];};
 const root=path.resolve(arg('--source-root')||'.'),mode=arg('--mode')||'modified',out=path.resolve(arg('--out')||process.env.IMAGEGEN_REMOTE_PUT_EVIDENCE||'output/imagegen-remote-put');
 const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 assert.ok(['baseline','modified'].includes(mode));
 if(arg('--read')){
  const {DurableImageJobs}=await load('src/lib/durable-image-jobs.ts'),db=await load('src/lib/db.ts');
  try{const jobs=new DurableImageJobs('generate'),saved=await jobs.get(arg('--read'));const result=(Object.values(saved.paidOperations)as any[])[0].result[0];assert.equal(hash(Buffer.from(result.url.split(',')[1],'base64')),arg('--hash'));console.log('REMOTE_PUT_RESTART=PASS ORIGINAL_PAID_BYTES=EXACT');}
  finally{await db.getPool().end();}return;
 }
 const media=await mkdtemp(path.join(tmpdir(),'naumi-remote-put-')),parked=media+'-parked';
 assert.equal(path.dirname(media),tmpdir());
 const png=await sharp({create:{width:96,height:96,channels:3,background:'#4281bd'}}).png().toBuffer(),sha=hash(png);
 type Trace={method:string;key:string;sha256?:string;bytes?:number;outcome:string;signed:boolean;response?:number;stored?:boolean;ackLost?:boolean};
 type Active={kind:string;posts:number;release:()=>void;gate:Promise<void>;seen:()=>void;hit:Promise<void>;objectMode:string;trace:Trace[]};
 let active:Active|undefined;const objects=new Map<string,Buffer>();
 const store=createServer(async(req,res)=>{
  try{
   const u=new URL(req.url!,'http://fixture'),key=decodeURIComponent(u.pathname),chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks);
   const signed=String(req.headers.authorization||'').startsWith('AWS4-HMAC-SHA256 ')||u.searchParams.get('X-Amz-Algorithm')==='AWS4-HMAC-SHA256';
   assert.equal(signed,true,'actual AWS signing adapter must reach the HTTP fixture');
   const record:Trace={method:req.method!,key,outcome:active?.objectMode||'healthy',signed,...(req.method==='PUT'?{sha256:hash(bytes),bytes:bytes.length}:{})};active?.trace.push(record);
   if(req.method==='PUT'){
    if(active?.objectMode==='put-403'||active?.objectMode==='put-503'||active?.objectMode==='remote-and-local-fail'){res.statusCode=active.objectMode==='put-503'?503:403;record.response=res.statusCode;record.stored=false;res.end('<Error><Code>FixtureWriteRejected</Code></Error>');return;}
    if(active?.objectMode==='delivery-only-503'&&key.includes('/image-delivery/')){res.statusCode=503;record.response=503;record.stored=false;res.end('<Error><Code>FixtureDeliveryRejected</Code></Error>');return;}
    objects.set(key,bytes);record.stored=true;if(active?.objectMode==='stored-ack-lost'){record.ackLost=true;res.destroy();return;}record.response=200;res.statusCode=200;res.end();return;
   }
   const found=objects.get(key);if(req.method==='HEAD'){res.statusCode=found?200:404;res.end();return;}
   if(req.method==='GET'&&found){res.setHeader('content-type',key.endsWith('.png')?'image/png':'application/octet-stream');res.setHeader('content-length',found.length);res.end(found);return;}
   res.statusCode=404;res.end();
  }catch(error){res.statusCode=500;res.end(String(error));}
 });
 await new Promise<void>(done=>store.listen(0,'127.0.0.1',done));const storeOrigin='http://127.0.0.1:'+(store.address()as {port:number}).port;
 const {createModelFixture}=await load('scripts/model-config-fixture.ts');
 const f=await createModelFixture(async(req:any,res:any)=>{
  for await(const _ of req){}if(req.method!=='POST'||!req.url?.includes('/images/generations')||!active){res.writeHead(404);res.end('{}');return;}
  const current=active;current.posts++;current.seen();await current.gate;res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'s3',S3_ENDPOINT:storeOrigin,S3_BUCKET:'remote-put-fixture',S3_REGION:'us-east-1',S3_ACCESS_KEY_ID:'fixture-local-access',S3_SECRET_ACCESS_KEY:'fixture-local-secret',S3_FORCE_PATH_STYLE:'true',MEDIA_REMOTE_ACCESS:'redirect',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_NAS_DEFER_UPLOAD:'0',OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:f.origin+'/v1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-local-router',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-local-envelope',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,VIDEO_WORKER_SECRET:'fixture-local-worker'});
 let db:any,closeLocks:(()=>Promise<void>)|undefined,blocked=false;const observations:any[]=[];
 try{
  f.config.upstreamModels[0].model='gpt-image-2';f.config.upstreamModels[0].capabilities.nativeResolutions=[];f.config.upstreamModels[0].parameterMap.resolution={};await f.repo.current();
  db=await load('src/lib/db.ts');await db.ensureSchema();closeLocks=(await load('src/lib/imagegen/coordination-pool.ts')).closeImageCoordinationPool;
  const plans=await load('src/app/api/imagegen/plan/route.ts'),route=await load('src/app/api/imagegen/route.ts'),generation=await load('src/app/api/generate-image/route.ts'),mediaRoute=await load('src/app/media/[...path]/route.ts');
  const {USER_COOKIE,signUserSession}=await load('src/lib/native-auth.ts'),{recoverMediaMirrors}=await load('src/lib/media-assets/mirror-recovery.ts'),{readCanvasOutput}=await load('src/lib/canvas-image-input.ts');
  const owner=`remote-put-${randomUUID()}@fixture.test`,other=`remote-other-${randomUUID()}@fixture.test`;
  await db.getOrCreateUser(owner);await db.getOrCreateUser(other);await db.addCreditBatch(owner,1000,{source:'admin',reason:'remote PUT isolated fixture'});
  const request=(pathname:string,body?:unknown,email=owner)=>new Request('http://fixture.test'+pathname,{method:body===undefined?'GET':'POST',headers:{origin:'http://fixture.test',cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const waitFor=async<T>(read:()=>Promise<T>,ready:(value:T)=>boolean)=>{const until=Date.now()+15000;let value:T;do{value=await read();if(ready(value))return value;await new Promise(done=>setTimeout(done,25));}while(Date.now()<until);throw Error('remote PUT wait timed out: '+JSON.stringify(value!));};
  for(const kind of ['healthy','put-403','put-503','stored-ack-lost','delivery-only-503','remote-and-local-fail']){
   let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(done=>{release=done;}),hit=new Promise<void>(done=>{seen=done;});active={kind,posts:0,gate,release,hit,seen,objectMode:kind,trace:[]};
   const input={version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',modelId:'image-a',prompt:'remote object PUT '+kind,inputs:[],parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1};
   const qr=await plans.POST(request('/api/imagegen/plan',input));assert.equal(qr.status,200,await qr.clone().text());const quote=await qr.json();assert.equal(quote.totalCredits,6);
   const ar=await route.POST(request('/api/imagegen',{...input,confirmation:{quoteId:quote.quote.id}}));assert.equal(ar.status,200,await ar.clone().text());const accepted=await ar.json();
   let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([hit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('supplier not reached')),10000);})]);}finally{clearTimeout(timer);}
   const parent=(await db.getPool().query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[accepted.jobId])).rows[0];const child=(Object.values(parent.snapshot.children)as any[])[0].jobId;
   const before=(await db.getPool().query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[child])).rows[0].snapshot;assert.ok(!JSON.stringify(before).includes('"state":"done"'),'no paid done checkpoint may be seeded');
   if(kind==='remote-and-local-fail'){await rename(media,parked);await writeFile(media,'fixture file blocks actual local directory writes');blocked=true;}
   release();
   const readReceipt=async()=>{const response=await route.GET(request('/api/imagegen?operationId='+input.operationId));assert.equal(response.status,200);return response.json();};
   const result=await waitFor(readReceipt,value=>['succeeded','failed','partial','needs_attention'].includes(value.status));
   const childRow=await waitFor(async()=>(await db.getPool().query('SELECT snapshot,lease_token,billing_settled FROM app_image_jobs WHERE id=$1',[child])).rows[0],value=>!value.lease_token);
   assert.equal(result.status,'succeeded',JSON.stringify(result));assert.equal(active.posts,1);assert.equal(result.chargedCredits,6);assert.equal(result.billingStatus,'confirmed');assert.equal(result.artifacts.length,1);
   const works=(await db.getPool().query('SELECT id,image_url FROM app_artworks WHERE id=$1',['art-'+child+'-0'])).rows;assert.equal(works.length,1);assert.equal(works[0].id,result.artifacts[0].artworkId);
   assert.equal(hash((await readCanvasOutput(works[0].image_url,'http://internal',owner)).buffer),sha);
   const billing=(await db.getPool().query('SELECT state,reserved_credits,charged_credits FROM app_billing_operations WHERE id=$1',[child])).rows[0];assert.deepEqual(billing,{state:'settled',reserved_credits:0,charged_credits:6});
   const ledger=(await db.getPool().query("SELECT id,delta FROM app_ledger WHERE id=$1 AND kind='consume'",['led-image-'+child])).rows;assert.equal(ledger.length,1);assert.equal(ledger[0].delta,-6);
   const visible=await generation.GET(request('/api/generate-image?job='+accepted.jobId));assert.equal(visible.status,200);const visibleBody=await visible.json();assert.equal(visibleBody.status,'done');assert.equal(visibleBody.images.length,1);assert.ok(!visibleBody.error);
   assert.notEqual((await route.GET(request('/api/imagegen?operationId='+input.operationId,undefined,other))).status,200);
   if(works[0].image_url.startsWith('/media/')){
    const params={params:Promise.resolve({path:works[0].image_url.slice(7).split('/')})};const delivered=await mediaRoute.GET(request(works[0].image_url),params);assert.ok([200,307].includes(delivered.status));const body=delivered.status===307?await fetch(delivered.headers.get('location')!):delivered;assert.equal(body.status,200);assert.equal(hash(Buffer.from(await body.arrayBuffer())),sha);assert.equal((await mediaRoute.GET(request(works[0].image_url,undefined,other),params)).status,404);
   }else{assert.equal(kind,'remote-and-local-fail');assert.ok(works[0].image_url.startsWith('data:image/png;base64,'));}
   const catalog=async()=>(await db.getPool().query('SELECT key,remote_ready,sha256,bytes FROM app_media_assets WHERE key LIKE $1 OR key LIKE $2 ORDER BY key',[`image-delivery/${child}/%`,`image-job-results/${hash(Buffer.from(child))}/%`])).rows;
   const pending=await catalog(),beforeRepair=active.trace.slice();assert.ok(beforeRepair.some(t=>t.method==='PUT'&&t.key.includes('/image-job-results/')));
   if(kind==='stored-ack-lost')assert.ok(beforeRepair.some(t=>t.stored&&t.ackLost&&t.sha256===sha));
   if(kind==='healthy')assert.ok(pending.length>=2&&pending.every((a:any)=>a.remote_ready));
   else if(kind==='remote-and-local-fail'){assert.equal(pending.length,0);assert.ok(JSON.stringify(childRow.snapshot.paidOperations).includes('$imageJobInlineBuffer'));}
   else{assert.ok(pending.some((a:any)=>!a.remote_ready));if(kind==='delivery-only-503')assert.ok(pending.some((a:any)=>a.key.startsWith('image-job-results/')&&a.remote_ready));}
   for(let n=0;n<3;n++)await readReceipt();assert.equal(active.posts,1);
   const restart=await new Promise<{exit:number|null;stdout:string;stderr:string}>((done,reject)=>{const childProcess=spawn(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),'--tsconfig',path.join(root,'tsconfig.json'),fileURLToPath(import.meta.url),'--read',child,'--hash',sha,'--source-root',root],{env:process.env,windowsHide:true});let stdout='',stderr='';childProcess.stdout.on('data',b=>stdout+=b);childProcess.stderr.on('data',b=>stderr+=b);childProcess.on('error',reject);childProcess.on('exit',exit=>done({exit,stdout,stderr}));});assert.equal(restart.exit,0,restart.stderr);assert.ok(restart.stdout.includes('REMOTE_PUT_RESTART=PASS'));
   if(blocked){await rm(media);await rename(parked,media);blocked=false;}
   active.objectMode='healthy';const repaired=await recoverMediaMirrors(100),afterRepair=await catalog();assert.ok(afterRepair.every((a:any)=>a.remote_ready));
   const final=await readReceipt();assert.deepEqual(final,result);assert.equal(active.posts,1);assert.equal(hash((await readCanvasOutput(works[0].image_url,'http://internal',owner)).buffer),sha);
   const finalLedger=(await db.getPool().query("SELECT id,delta FROM app_ledger WHERE id=$1 AND kind='consume'",['led-image-'+child])).rows;assert.deepEqual(finalLedger,ledger);
   const paidAfter=(await db.getPool().query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[child])).rows[0].snapshot.paidOperations;assert.deepEqual(paidAfter,childRow.snapshot.paidOperations);for(const row of afterRepair){const remote=objects.get('/remote-put-fixture/'+row.key);assert.ok(remote);assert.equal(hash(remote),row.sha256);assert.equal(remote.length,Number(row.bytes));}
   const observation={kind,operationId:input.operationId,parent:accepted.jobId,child,quoteCredits:quote.totalCredits,supplierPosts:active.posts,originalSha256:sha,deliveredSha256:sha,artifactId:works[0].id,inlineDelivery:works[0].image_url.startsWith('data:'),receipt:result,publicStatus:visibleBody.status,publicError:visibleBody.error||null,billing,ledger,pendingCatalog:pending,repairedCatalog:afterRepair,mirrorClaims:repaired,remoteTraceBeforeRepair:beforeRepair,remoteTraceAfterRepair:active.trace.slice(beforeRepair.length),restart,noSeedDone:true,paidState:childRow.snapshot.paidOperations};
   observations.push(observation);await mkdir(out,{recursive:true});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'RUNNING',mode,cases:observations},null,2)+'\n');console.log('REMOTE_PUT_CASE='+JSON.stringify({kind,supplierPosts:1,artworks:1,chargedCredits:6,consume:1,bytes:'EXACT',publicStatus:visibleBody.status,failedPuts:beforeRepair.filter(t=>t.method==='PUT'&&(t.ackLost||t.response!==200)).length,pendingObjects:pending.filter((a:any)=>!a.remote_ready).length,restartExit:restart.exit,mirrorClaims:repaired}));
  }
  const casesSource=await readFile(path.join(root,'scripts/verification/refactor-cases.mjs'),'utf8'),registered=casesSource.includes("ts('imagegen-remote-put'");assert.equal(registered,mode==='modified');
  const report={status:'PASS',mode,cases:observations,realHandlers:true,realPG:true,realLease:true,realSignedS3HTTP:true,networkFaultsNotFsSubstitutes:true,actualLocalFsFailure:true,externalPaidCalls:0,actualBrowser:false,catalogRegistered:registered};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`IMAGEGEN_REMOTE_PUT=PASS MODE=${mode.toUpperCase()} CASES=6 REAL_HANDLERS=1 REAL_PG=1 SIGNED_S3_HTTP=1 SUPPLIER_POSTS=6 CONSUMES=6 CREDITS=36 ORIGINAL_BYTES=EXACT RESTARTS=6 MIRROR_ONLY_REPAIR=1 CATALOG_REGISTERED=${registered?1:0} BROWSER=0 EXTERNAL_PAID=0`);
 }finally{
  active?.release();await closeLocks?.();if(db)await db.getPool().end();await f.cleanup();store.closeAllConnections();await new Promise<void>(done=>store.close(()=>done()));if(blocked){await rm(media);await rename(parked,media);}assert.equal(path.dirname(media),tmpdir());await rm(media,{recursive:true,force:true});console.log('REMOTE_PUT_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 SUPPLIER_AND_S3_HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
