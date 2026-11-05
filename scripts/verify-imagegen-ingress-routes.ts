/** Actual native-session/HTTP/PG routes. Only delivery rows are seeded explicitly;
 * submissions use actual planners/quotes/jobs, deferred to the existing Worker.
 * No authentication, route, scope, billing or storage implementation is replaced.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const root=path.resolve('.'),source=path.resolve(arg('--source-root')||'.');
const out=path.resolve(arg('--out')||'output/imagegen-ingress-routes-'+randomUUID());
const mode=arg('--mode')||'modified',baseline=mode==='baseline',phase=arg('--phase')||'all';
assert.ok(['baseline','modified'].includes(mode));assert.ok(['all','pg','no-db'].includes(phase));
assert.ok(out.startsWith(root+path.sep+'output'+path.sep));mkdirSync(out,{recursive:true});
const save=(name:string,value:unknown)=>writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');

async function loadApi(){
 const modules:Record<string,string[]>={
  'src/app/api/imagegen/route.ts':['POST as imagePost','GET as imageGet'],
  'src/app/api/imagegen/cancel/route.ts':['POST as cancelPost'],
  'src/app/api/imagegen/inputs/route.ts':['POST as inputsPost'],
  'src/app/api/imagegen/batches/[id]/route.ts':['GET as batchGet','POST as batchPost'],
  'src/app/api/imagegen/batches/[id]/download/route.ts':['GET as downloadGet'],
  'src/app/api/imagegen/plan/route.ts':['POST as planPost'],
  'src/lib/saas/creation-context.ts':['withCreationRoute','withCreationReceiptRoute'],
  'src/lib/saas/creation-scope.ts':['currentCreationContext'],
  'src/lib/bi/request.ts':['withBiRequest'],
  'src/lib/bi/context.ts':['currentBiContext'],
  'src/lib/model-config/server.ts':['getModelAdministration'],
  'src/platform/db/pool.ts':['getPool','closeDatabasePools'],
  'src/lib/persistence/schema.ts':['ensureSchema'],
  'src/lib/accounts/session.ts':['getOrCreateUser'],
  'src/lib/native-auth.ts':['USER_COOKIE','signUserSession'],
  'src/lib/imagegen/schema.ts':['imagegenRequestSchema'],
  'src/lib/imagegen/input-assets.ts':['readImagegenInputAsset'],
  'src/lib/imagegen/coordination-pool.ts':['closeImageCoordinationPool']
 };
 const code=Object.entries(modules).map(([name,fields])=>'export {'+fields.join(',')+'} from '+JSON.stringify(path.join(source,name).replaceAll('\\','/'))+';').join('\n');
 const result=await build({stdin:{contents:code,resolveDir:source,loader:'ts'},absWorkingDir:source,tsconfig:path.join(source,'tsconfig.json'),bundle:true,platform:'node',target:'node24',format:'cjs',write:false,metafile:true,packages:'external',alias:{'server-only':path.join(root,'scripts/fleet-server-only.cjs')}});
 save('SOURCE_INPUTS.json',Object.fromEntries(Object.keys(result.metafile!.inputs).filter(p=>!p.startsWith('<')).map(p=>{const file=path.resolve(source,p);return[file,createHash('sha256').update(readFileSync(file)).digest('hex')];})));
 const m={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.join(root,'package.json')),m,m.exports);return m.exports;
}

async function main(){
 if(phase!=='all')return phase==='pg'?postgres():noDatabase();
 const commands:any[]=[];
 for(const part of ['pg','no-db']){
  const args=['--conditions=react-server','--import','tsx',path.resolve(process.argv[1]),'--mode',mode,'--phase',part,'--source-root',source,'--out',path.join(out,part)];
  const q=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...(part==='no-db'?{DATABASE_URL:'',PGOPTIONS:''}:{})},encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  writeFileSync(path.join(out,part+'.log'),(q.stdout||'')+(q.stderr||''));commands.push({command:[process.execPath,...args],exit:q.status});save('COMMANDS.json',commands);
  assert.equal(q.status,0,(q.stdout||'')+(q.stderr||''));
 }
 const pg=JSON.parse(readFileSync(path.join(out,'pg/RESULT.json'),'utf8')),noDb=JSON.parse(readFileSync(path.join(out,'no-db/RESULT.json'),'utf8'));
 const report={status:baseline?'BASELINE_REPRODUCED':'PASS',sourceRoot:source,cases:pg.cases.length+noDb.cases.length,checks:pg.checks+noDb.checks,routeAuthReads:pg.routeAuthReads,normal:[...pg.normal,...noDb.normal],supplierCalls:pg.supplierCalls,externalCalls:pg.externalCalls,paidPosts:0,consumes:0,deliveryFixture:'two explicit terminal rows, not provider output',middlewareIncluded:false};
 if(arg('--compare'))assert.deepEqual(report.normal,JSON.parse(readFileSync(path.resolve(arg('--compare')!),'utf8')).normal,'all original public/authorization/receipt/bytes contracts must match');
 save('RESULT.json',report);
 console.log('IMAGEGEN_INGRESS_ROUTES='+report.status+' CASES='+report.cases+' CHECKS='+report.checks+' AUTH_READS='+Object.values(report.routeAuthReads).join('/')+' NATIVE_AUTH=ACTUAL HTTP=ACTUAL BI=ACTUAL REAL_PG=1 UPLOAD_BYTES=EXACT ZIP_BYTES=EXACT UNKNOWN_REPOSTS=0 PAID_POSTS=0 SUPPLIER='+report.supplierCalls+' EXTERNAL='+report.externalCalls);
}

async function noDatabase(){
 assert.equal(process.env.DATABASE_URL,'');const api=await loadApi();let checks=0;const normal:any[]=[];
 try{
  const req=()=>new Request('http://ingress.fixture/api/imagegen',{method:'POST',headers:{'content-type':'application/json',origin:'http://ingress.fixture'},body:'{}'});
  let actor:any='not-called';const r=await api.withCreationReceiptRoute(req(),(value:any)=>{actor=value;return Promise.resolve(Response.json({legacy:true}));});
  assert.equal(actor,undefined);assert.equal(r.status,200);checks+=2;
  const legacy=await api.withCreationReceiptRoute(req(),()=>Promise.resolve(Response.json({ok:true})));assert.equal(legacy.status,200);checks++;
  normal.push({case:'no-db-callbacks',actor:'unresolved',legacy:200});
  for(const name of ['imagePost','imageGet','cancelPost','inputsPost','batchGet','batchPost','downloadGet']){
   const response=await api[name](req(),{params:Promise.resolve({id:randomUUID()})});assert.equal(response.status,401,name);checks++;normal.push({case:'no-db-'+name,status:401});
  }
  const bi=await api.withBiRequest(req(),()=>Promise.resolve(Response.json({context:!!api.currentBiContext()})),'known-actor@example.test');assert.equal((await bi.json()).context,false);checks++;
  normal.push({case:'no-db-bi',context:false});
  save('RESULT.json',{cases:normal.map(x=>x.case),normal,checks});console.log('INGRESS_ROUTES_NO_DB=PASS CHECKS='+checks+' CALLBACK_UNRESOLVED=1 LEGACY_CALLBACK=1');
 }finally{await api.closeDatabasePools();}
}

async function postgres(){
 const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.match(url.pathname,/fixture/);
 for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_PORTAL_ONLY','NAUMI_AUTH_LOGIN_ONLY','NAUMI_WORKER_EXECUTION'])delete process.env[name];
 let supplierCalls=0,externalCalls=0;const f=await createModelFixture((_req,res)=>{supplierCalls++;res.statusCode=500;res.end('No provider execution in ingress route verification');});
 const media=mkdtempSync(path.join(tmpdir(),'naumi-ingress-routes-')),originalFetch=globalThis.fetch;let api:any;
 globalThis.fetch=(async()=>{externalCalls++;throw Error('No external HTTP in ingress routes fixture');})as typeof fetch;
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',MODEL_CONFIG_ENVELOPE_SECRET:'r9a-isolated-model-envelope-20261101',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'r9a-isolated-router-control-token-20261101',NAUMI_APPLICATION_TASK_EXECUTION:'worker',VIDEO_WORKER_SECRET:'r9a-isolated-worker-only-secret-20261101',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_RELEASE_LIFECYCLE:'0'});
 let checks=0;const cases:string[]=[],normal:any[]=[],routeAuthReads:Record<string,number>={};
 const eq=(a:any,b:any,label:string)=>{assert.deepEqual(a,b,label);checks++;};
 const record=(name:string,value:Record<string,unknown>)=>{cases.push(name);normal.push({case:name,...value});};
 try{
  f.config.upstreamModels[0].capabilities.nativeResolutions=['1K','2K','4K'];f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:'map',field:'size',values:{'1K':'1024x1024','2K':'2048x2048','4K':'4096x4096'}}};
  f.config.publicModels[0].displayResolutions=['1K','2K','4K'];f.config.publicModels[0].supplierRouting={mode:'balanced',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]};
  await f.repo.current();api=await loadApi();await api.ensureSchema();
  const owner='ingress-routes-owner@example.test',other='ingress-routes-other@example.test';await api.getOrCreateUser(owner,'Owner');await api.getOrCreateUser(other,'Other actor');
  const admin=await api.getModelAdministration(),billing=await admin.billing.current(),config=structuredClone(billing.config);config.switches.metering='on';
  for(const feature of ['canvas.image','image.generate']){config.features[feature].enabled=true;config.features[feature].pricing={mode:'fixed',credits:6};config.features[feature].rules=[];}
  await admin.billing.publish({id:randomUUID(),actor:'ingress-routes-fixture',reason:'isolated routes',expectedVersion:billing.version,config});
  const tokens=new Map([[owner,api.signUserSession(owner,Date.now())],[other,api.signUserSession(other,Date.now())]]),pool=api.getPool(),query=pool.query.bind(pool);let observed:string[]=[];
  pool.query=function(...args:any[]){observed.push(typeof args[0]==='string'?args[0]:args[0]?.text||'');return query(...args);};
  const measured=async(name:string,run:()=>Promise<Response>,oldReads=2)=>{observed=[];const value=await run(),auth=observed.filter(x=>x.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length;eq(auth,baseline?oldReads:1,name+' has a single owning native-auth check');routeAuthReads[name]=auth;return value;};
  const http=(route:string,body?:unknown,email:string|null=owner,method='POST',extra:Record<string,string>={})=>{
   const headers=new Headers({origin:f.origin,'sec-fetch-site':'same-origin',...extra});if(email)headers.set('cookie',api.USER_COOKIE+'='+tokens.get(email));
   if(body!==undefined&&!(body instanceof FormData))headers.set('content-type','application/json');
   return new Request(f.origin+route,{method,headers,...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  };
  const context=(id:string)=>({params:Promise.resolve({id})});
  const request=()=>api.imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',modelId:'image-a',prompt:'A blue ceramic bottle',parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1,output:{format:'png'}});
  const plan=async(value:any)=>{const response=await api.planPost(http('/api/imagegen/plan',value));eq(response.status,200,'actual quote route');return response.json();};
  const postQuote=(id:string,quoteId:string,confirmed?:boolean)=>http('/api/imagegen',{operationId:id,quoteId,...(confirmed===undefined?{}:{confirmed})});
  const counts=async()=>(await f.sql.query("SELECT json_build_object('consumes',(SELECT count(*) FROM app_ledger WHERE kind='consume'),'billing',(SELECT count(*) FROM app_billing_operations),'jobs',(SELECT count(*) FROM app_image_jobs),'reservations',(SELECT count(*) FROM app_gen_reservations)) value")).rows[0].value;
  const png=await sharp({create:{width:16,height:16,channels:3,background:'#2874cc'}}).png().toBuffer(),form=()=>{const data=new FormData();data.set('image',new File([new Uint8Array(png)],'reference.png',{type:'image/png'}));return data;};
  const uploadResponse=await measured('inputsPost',()=>api.inputsPost(http('/api/imagegen/inputs',form()))),input=await uploadResponse.json();eq(uploadResponse.status,200,'actual upload');
  const uploaded=await api.readImagegenInputAsset(input.artworkId,owner);eq(Buffer.compare(uploaded.buffer,png),0,'private upload exact original bytes');await assert.rejects(()=>api.readImagegenInputAsset(input.artworkId,other));checks++;
  record('input-upload',{status:200,width:input.width,height:input.height,exactBytes:true,foreignDenied:true});
  const original=request(),quote=await plan(original),post=await measured('imagePost',()=>api.imagePost(postQuote(original.operationId,quote.quote.id)),3),accepted=await post.json();
  eq([post.status,accepted.operationId,accepted.status],[200,original.operationId,'queued'],'actual original operation accepted');eq(Number((await f.sql.query('SELECT count(*) n FROM app_image_jobs')).rows[0].n),1,'one original parent');record('original-submit',{status:200,originalOperation:true,state:'queued',quoteCredits:quote.totalCredits});
  const duplicate=await api.imagePost(postQuote(original.operationId,quote.quote.id,false)),duplicateBody=await duplicate.json();eq([duplicate.status,duplicateBody.operationId],[200,original.operationId],'false on accepted task returns original receipt');eq(Number((await f.sql.query('SELECT count(*) n FROM app_image_jobs')).rows[0].n),1,'duplicate has no new task');record('accepted-false-receipt',{status:200,sameOperation:true,jobs:1});
  const receipt=await measured('imageGet',()=>api.imageGet(http('/api/imagegen?operationId='+original.operationId,undefined,owner,'GET'))),receiptBody=await receipt.json();eq([receipt.status,receiptBody.operationId],[200,original.operationId],'actual receipt');record('original-receipt',{status:200,sameOperation:true});
  const cancelled=await measured('cancelPost',()=>api.cancelPost(http('/api/imagegen/cancel',{action:'cancel',operationId:original.operationId})));eq(cancelled.status,200,'actual cancellation request');eq((await f.sql.query('SELECT payload->\'cancelRequested\' value FROM app_image_jobs WHERE id=$1',['imagegen-'+original.operationId])).rows[0].value,true,'durable cancel flag only');record('cancel-request',{status:200,cancelRequested:true,supplierCancellationClaim:false});
  const makeBatch=()=>api.imagegenRequestSchema.parse({...request(),mode:'batch',batch:{items:[{key:'one',name:'First bottle',prompt:'A blue bottle'},{key:'two',name:'Second bottle',prompt:'A red bottle'}]}});
  const batch=makeBatch(),bq=await plan(batch),batchSubmit=await api.imagePost(postQuote(batch.operationId,bq.quote.id));eq(batchSubmit.status,200,'actual batch submission');
  const batchRead=await measured('batchGet',()=>api.batchGet(http('/api/imagegen/batches/'+batch.operationId,undefined,owner,'GET'),context(batch.operationId))),batchBody=await batchRead.json();eq([batchRead.status,batchBody.items.length,batchBody.totalCredits],[200,2,12],'actual batch read');record('batch-receipt',{status:200,items:2,totalCredits:12});
  const batchCancel=await measured('batchPost',()=>api.batchPost(http('/api/imagegen/batches/'+batch.operationId,{action:'cancel'}),context(batch.operationId)));eq(batchCancel.status,200,'actual batch cancellation');eq((await f.sql.query('SELECT state FROM app_imagegen_batches WHERE id=$1',[batch.operationId])).rows[0].state,'cancelling','preserve accepted batch cancellation state');record('batch-cancel',{status:200,state:'cancelling'});
  const downloadable=makeBatch(),dq=await plan(downloadable);eq((await api.imagePost(postQuote(downloadable.operationId,dq.quote.id))).status,200,'download dataset accepted through actual handler');
  const items=(await f.sql.query('SELECT key,child_operation_id FROM app_imagegen_batch_items WHERE batch_id=$1 ORDER BY ordinal',[downloadable.operationId])).rows;
  for(const [i,item]of items.entries()){
   const artworkId='ingress-download-'+i;await f.sql.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient) VALUES($1,$2,$3,'image','explicit fixture result','completed',$4,'')",[artworkId,owner,'Fixture '+i,input.url]);
   const result={operationId:item.child_operation_id,jobId:'imagegen-'+item.child_operation_id,status:'succeeded',stage:'done',artifacts:[{artworkId}],chargedCredits:0};
   await f.sql.query("UPDATE app_imagegen_batch_items SET state='succeeded',result=$3::jsonb WHERE batch_id=$1 AND key=$2",[downloadable.operationId,item.key,JSON.stringify(result)]);
  }
  await f.sql.query("UPDATE app_imagegen_batches SET state='succeeded' WHERE id=$1",[downloadable.operationId]);
  const download=await measured('downloadGet',()=>api.downloadGet(http('/api/imagegen/batches/'+downloadable.operationId+'/download',undefined,owner,'GET'),context(downloadable.operationId))),zip=Buffer.from(await download.arrayBuffer());eq(download.status,200,'actual zip route');
  const zipFiles:{name:string;bytes:Buffer}[]=[];for(let offset=0;zip.readUInt32LE(offset)===0x04034b50;){const n=zip.readUInt16LE(offset+26),e=zip.readUInt16LE(offset+28),name=zip.subarray(offset+30,offset+30+n).toString('utf8'),length=Number(zip.readBigUInt64LE(offset+30+n+4)),start=offset+30+n+e;zipFiles.push({name,bytes:zip.subarray(start,start+length)});offset=start+length;}
  eq(zipFiles.map(x=>x.name),['First bottle-1.png','Second bottle-2.png','results.jsonl'],'original zip names');eq(zipFiles.slice(0,2).every(x=>x.bytes.equals(png)),true,'download contains exact private originals');eq(zipFiles[2].bytes.toString('utf8').trim().split('\n').length,2,'one metadata line per original child');record('download-bytes',{status:200,names:zipFiles.map(x=>x.name),originalSha256:createHash('sha256').update(png).digest('hex'),metadataLines:2});
  const beforeNegative=await counts();
  for(const [name,run]of [
   ['imageGet',()=>api.imageGet(http('/api/imagegen?operationId='+original.operationId,undefined,other,'GET'))],
   ['cancelPost',()=>api.cancelPost(http('/api/imagegen/cancel',{action:'cancel',operationId:original.operationId},other))],
   ['batchGet',()=>api.batchGet(http('/api/imagegen/batches/'+batch.operationId,undefined,other,'GET'),context(batch.operationId))],
   ['batchPost',()=>api.batchPost(http('/api/imagegen/batches/'+batch.operationId,{action:'cancel'},other),context(batch.operationId))],
   ['downloadGet',()=>api.downloadGet(http('/api/imagegen/batches/'+downloadable.operationId+'/download',undefined,other,'GET'),context(downloadable.operationId))]
  ]as const){const response=await run();eq(response.status,name==='cancelPost'?400:404,'foreign actor '+name);record('foreign-'+name,{status:response.status});}
  for(const name of ['imagePost','cancelPost','inputsPost','batchPost']){const response=await api[name](http('/api/imagegen',{},owner,'POST',{'sec-fetch-site':'cross-site'}),context(batch.operationId));eq(response.status,403,'cross-site '+name);record('cross-site-'+name,{status:403});}
  const badId=await api.imageGet(http('/api/imagegen?operationId=invalid',undefined,owner,'GET'));eq(badId.status,400,'invalid operation id');record('invalid-id',{status:400});
  const large=await api.inputsPost(http('/api/imagegen/inputs',{},owner,'POST',{'content-length':String(14*1024*1024)}));eq(large.status,413,'upload size contract');record('upload-size',{status:413});
  const fresh=request(),freshQuote=await plan(fresh),explicitFalse=await api.imagePost(postQuote(fresh.operationId,freshQuote.quote.id,false));eq(explicitFalse.status,400,'explicit false before acceptance cancels');eq((await f.sql.query('SELECT count(*)::int n FROM app_image_jobs WHERE id=$1',['imagegen-'+fresh.operationId])).rows[0].n,0,'explicit cancel creates zero task');record('explicit-false',{status:400,newTasks:0});
  await f.sql.query("INSERT INTO app_feature_access(email,mode,allowed,version) VALUES($1,'custom','[]'::jsonb,1)",[owner]);
  const retained=await api.imageGet(http('/api/imagegen?operationId='+original.operationId,undefined,owner,'GET'));eq(retained.status,200,'revoked new-creation feature cannot hide accepted receipt');
  const retainedPost=await api.imagePost(postQuote(original.operationId,quote.quote.id));eq(retainedPost.status,200,'accepted receipt-first after revocation');const newDenied=await api.imagePost(http('/api/imagegen',request()));eq(newDenied.status,400,'new work still checks current feature');record('feature-revocation',{receipt:200,repeat:200,newWork:400});await f.sql.query('DELETE FROM app_feature_access WHERE email=$1',[owner]);
  const savedScope=(await f.sql.query('SELECT payload->\'creationScope\' scope FROM app_image_jobs WHERE id=$1',['imagegen-'+original.operationId])).rows[0].scope;
  await f.sql.query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{creationScope}', $2::jsonb) WHERE id=$1",['imagegen-'+original.operationId,JSON.stringify({...savedScope,scopeKind:'tenant',tenantId:randomUUID()})]);
  const wrongScope=await api.imageGet(http('/api/imagegen?operationId='+original.operationId,undefined,owner,'GET'));eq(wrongScope.status,404,'same actor cannot read a foreign frozen scope');record('frozen-scope-mismatch',{status:404});await f.sql.query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{creationScope}',$2::jsonb) WHERE id=$1",['imagegen-'+original.operationId,JSON.stringify(savedScope)]);
  for(const [name,set,reset]of [
   ['banned','banned=true','banned=false'],['expired',"account_expires_at=now()-interval '1 day'",'account_expires_at=NULL'],['revoked',"auth_revoked_before=now()+interval '1 minute'",'auth_revoked_before=NULL']
  ]){await f.sql.query('UPDATE app_users SET '+set+' WHERE email=$1',[owner]);for(const endpoint of ['imagePost','imageGet','cancelPost','inputsPost','batchGet','batchPost','downloadGet']){const response=await api[endpoint](http('/api/imagegen',{}),context(batch.operationId));eq(response.status,401,name+' '+endpoint);}await f.sql.query('UPDATE app_users SET '+reset+' WHERE email=$1',[owner]);record('native-'+name,{deniedRoutes:7,status:401});}
  const worker={'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!};
  const workerRun=await api.imagePost(http('/api/imagegen',{workerJobId:'imagegen-'+randomUUID()},null,'POST',worker));eq(workerRun.status,200,'worker resume still uses dedicated secret');
  const workerTick=await api.batchPost(http('/api/imagegen/batches/'+batch.operationId,{action:'tick'},null,'POST',worker),context(batch.operationId));eq(workerTick.status,200,'worker batch tick');
  const userTick=await api.batchPost(http('/api/imagegen/batches/'+batch.operationId,{action:'tick'}),context(batch.operationId));eq(userTick.status,403,'user cookie is not worker permission');
  const userResume=await api.imagePost(http('/api/imagegen',{workerJobId:'imagegen-'+original.operationId}));eq(userResume.status,403,'user cannot select internal resume');
  record('worker-paths',{resume:200,tick:200,userTick:403,userResume:403});
  observed=[];const bi=await api.withBiRequest(http('/api/imagegen',{}),()=>Promise.resolve(Response.json({actor:api.currentBiContext()?.email})),owner);eq((await bi.json()).actor,owner,'BI receives same authenticated actor');eq(observed.filter(x=>x.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length,baseline?1:0,'BI no longer reauthenticates an already owned actor');record('bi-context',{sameActor:true});
  let callbackActor:any,scopeActor:any;const callback=await api.withCreationReceiptRoute(http('/api/imagegen',{}),(actor:any)=>{callbackActor=actor;scopeActor=api.currentCreationContext()?.actorEmail;return Promise.resolve(Response.json({ok:true}));});eq([callbackActor,scopeActor],[owner,owner],'receipt callback actor and scope align');record('receipt-callback',{sameActor:true});
  const observedQuery=pool.query;pool.query=function(...args:any[]){const text=typeof args[0]==='string'?args[0]:args[0]?.text||'';if(text.includes('FROM app_image_jobs'))throw Error('fixture original receipt read unavailable');return observedQuery.apply(this,args);};
  const unknownResponse=await api.imagePost(http('/api/imagegen',request())),unknown=await unknownResponse.json();pool.query=observedQuery;eq(unknownResponse.status,400,'original read failure remains explicit');eq(Object.hasOwn(unknown,'accepted'),false,'unknown is not converted to unaccepted');record('unknown-read',{status:400,acceptance:'unknown',reposts:0});
  eq(await counts(),beforeNegative,'all negative/recovery requests leave wallet and original job counts unchanged');eq([supplierCalls,externalCalls],[0,0],'no supplier or external POST');record('financial-invariants',{consumes:0,reservations:0,paidPosts:0});
  save('RESULT.json',{status:baseline?'BASELINE_REPRODUCED':'PASS',cases,checks,normal,routeAuthReads,supplierCalls,externalCalls,actual:['native HMAC cookie/PG account verification','all seven HTTP handlers','BI wrapper/context','scope/feature decisions','planner and frozen quotes','job and batch persistence','cancellation transaction','private upload/read','ZIP64 streaming'],seeded:['two terminal batch item results and artwork rows only; no claim of provider execution'],paidPosts:0});
  console.log('INGRESS_ROUTES_PG='+(baseline?'BASELINE_REPRODUCED':'PASS')+' CASES='+cases.length+' CHECKS='+checks+' AUTH_READS='+Object.values(routeAuthReads).join('/')+' SUPPLIER='+supplierCalls+' EXTERNAL='+externalCalls);
 }finally{globalThis.fetch=originalFetch;if(api){await api.closeImageCoordinationPool();await api.closeDatabasePools();}await f.cleanup();rmSync(media,{recursive:true,force:true});console.log('INGRESS_ROUTES_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 APP_POOLS_CLOSED=1 COORDINATION_POOL_CLOSED=1 FIXTURE_POOLS_CLOSED=1 LOOPBACK_HTTP_CLOSED=1 OWN_TEMP_MEDIA_REMOVED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
