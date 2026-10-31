/** Legacy ingress identity ownership: actual native auth, routes, BI/model/quote
 * wrappers, intent receipts, reservations and PostgreSQL. Existing Worker deferral
 * prevents provider execution. No authentication or domain dependency is replaced.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const root=path.resolve('.'),source=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||'output/legacy-generation-ingress-'+randomUUID());
const mode=arg('--mode')||'modified',baseline=mode==='baseline',phase=arg('--phase')||'all';
assert.ok(['baseline','modified'].includes(mode));assert.ok(['all','pg','no-db'].includes(phase));assert.ok(out.startsWith(root+path.sep+'output'+path.sep));mkdirSync(out,{recursive:true});
const save=(name:string,value:unknown)=>writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
async function loadApi(){
 const modules:Record<string,string[]>={
  'src/app/api/generate-image/route.ts':['POST as legacyPost','GET as legacyGet'],
  'src/app/api/billing/quote/route.ts':['POST as quotePost'],
  'src/app/api/imagegen/plan/route.ts':['POST as planPost'],
  'src/app/api/imagegen/route.ts':['POST as imagePost'],
  'src/lib/billing/intent.ts':['withBillingIntent','claimSubmission'],
  'src/lib/billing/synchronous.ts':['billingRequestIdentity'],
  'src/lib/bi/request.ts':['withBiRequest'],
  'src/lib/bi/context.ts':['currentBiContext'],
  'src/lib/model-config/accepted-context.ts':['signAcceptedModelContext'],
  'src/lib/model-config/server.ts':['getModelAdministration'],
  'src/platform/db/pool.ts':['getPool','closeDatabasePools'],
  'src/lib/persistence/schema.ts':['ensureSchema'],
  'src/lib/accounts/session.ts':['getOrCreateUser'],
  'src/lib/native-auth.ts':['USER_COOKIE','signUserSession'],
  'src/lib/imagegen/coordination-pool.ts':['closeImageCoordinationPool']
 };
 const code=Object.entries(modules).map(([file,fields])=>'export {'+fields.join(',')+'} from '+JSON.stringify(path.join(source,file).replaceAll('\\','/'))+';').join('\n');
 const result=await build({stdin:{contents:code,resolveDir:source,loader:'ts'},absWorkingDir:source,tsconfig:path.join(source,'tsconfig.json'),bundle:true,platform:'node',target:'node24',format:'cjs',write:false,metafile:true,packages:'external',alias:{'server-only':path.join(root,'scripts/fleet-server-only.cjs')}});
 save('SOURCE_INPUTS.json',Object.fromEntries(Object.keys(result.metafile!.inputs).filter(x=>!x.startsWith('<')).map(x=>{const file=path.resolve(source,x);return[file,createHash('sha256').update(readFileSync(file)).digest('hex')];})));
 const m={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.join(root,'package.json')),m,m.exports);return m.exports;
}
async function main(){
 if(phase!=='all')return phase==='pg'?postgres():noDatabase();
 const commands:any[]=[];
 for(const part of ['pg','no-db']){
  const args=['--conditions=react-server','--import','tsx',path.resolve(process.argv[1]),'--mode',mode,'--phase',part,'--source-root',source,'--out',path.join(out,part)];
  const q=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...(part==='no-db'?{DATABASE_URL:'',PGOPTIONS:'',NAUMI_APPLICATION_TASK_EXECUTION:'local'}:{})},encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  writeFileSync(path.join(out,part+'.log'),(q.stdout||'')+(q.stderr||''));commands.push({command:[process.execPath,...args],exit:q.status});save('COMMANDS.json',commands);assert.equal(q.status,0,(q.stdout||'')+(q.stderr||''));
 }
 const pg=JSON.parse(readFileSync(path.join(out,'pg/RESULT.json'),'utf8')),noDb=JSON.parse(readFileSync(path.join(out,'no-db/RESULT.json'),'utf8'));
 const report={status:baseline?'BASELINE_REPRODUCED':'PASS',sourceRoot:source,cases:pg.cases.length+noDb.cases.length,checks:pg.checks+noDb.checks,authReads:pg.authReads,normal:[...pg.normal,...noDb.normal],supplierCalls:pg.supplierCalls,externalCalls:pg.externalCalls,consumes:0,originalPrice:6,currentPrice:17,receiptReplayJobs:0,unknownReposts:0,middlewareIncluded:false};
 if(arg('--compare'))assert.deepEqual(report.normal,JSON.parse(readFileSync(path.resolve(arg('--compare')!),'utf8')).normal,'original public/receipt/identity/price/frame contracts must remain exact');
 save('RESULT.json',report);console.log('LEGACY_GENERATION_INGRESS='+report.status+' CASES='+report.cases+' CHECKS='+report.checks+' AUTH_READS='+Object.values(report.authReads).join('/')+' NATIVE_AUTH=ACTUAL HTTP=ACTUAL BI_MODEL_QUOTE=ACTUAL REAL_PG=1 ORIGINAL_PRICE=6_CURRENT17 RECEIPT_REPLAY_JOBS=0 UNKNOWN_REPOSTS=0 CONSUMES=0 SUPPLIER='+report.supplierCalls+' EXTERNAL='+report.externalCalls);
}
async function noDatabase(){
 assert.equal(process.env.DATABASE_URL,'');for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_PORTAL_ONLY','NAUMI_AUTH_LOGIN_ONLY'])delete process.env[key];
 let network=0;const fetch=globalThis.fetch;globalThis.fetch=(async()=>{network++;throw Error('No external HTTP in no-DB legacy ingress');})as typeof fetch;
 const api=await loadApi(),normal:any[]=[];let checks=0;
 try{
  const req=(query='',body?:unknown)=>new Request('http://legacy.fixture/api/generate-image'+query,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',origin:'http://legacy.fixture'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const health=await api.legacyGet(req());assert.equal(health.status,200);checks++;normal.push({case:'no-db-health',status:200});
  const active=await api.legacyGet(req('?active=1'));assert.equal(active.status,401);checks++;normal.push({case:'no-db-active',status:401});
  const parent=await api.legacyGet(req('?job=imagegen-'+randomUUID()));assert.equal(parent.status,401);checks++;normal.push({case:'no-db-parent',status:401});
  const bad=await api.legacyPost(req('',[]));assert.equal(bad.status,400);checks++;normal.push({case:'no-db-invalid-body',status:400});
  let actor:any='not-called';const intent=await api.withBillingIntent(req('',{}),(value:any)=>{actor=value;return Promise.resolve(Response.json({ok:true}));});assert.equal(actor,undefined);assert.equal(intent.status,200);checks+=2;normal.push({case:'no-db-intent-callback',actor:'unresolved'});
  const bi=await api.withBiRequest(req('',{}),(value:any)=>Promise.resolve(Response.json({actor:value===undefined?'unresolved':value,context:!!api.currentBiContext()})));assert.deepEqual(await bi.json(),{actor:'unresolved',context:false});checks++;normal.push({case:'no-db-bi-callback',actor:'unresolved',context:false});
  assert.equal(network,0);checks++;save('RESULT.json',{cases:normal.map(x=>x.case),normal,checks});console.log('LEGACY_INGRESS_NO_DB=PASS CHECKS='+checks+' NETWORK=0');
 }finally{globalThis.fetch=fetch;await api.closeDatabasePools();}
}
async function postgres(){
 const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.match(url.pathname,/fixture/);
 for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_PORTAL_ONLY','NAUMI_AUTH_LOGIN_ONLY','NAUMI_WORKER_EXECUTION'])delete process.env[key];
 let supplierCalls=0,externalCalls=0;const f=await createModelFixture((_req,res)=>{supplierCalls++;res.statusCode=500;res.end('No provider execution in legacy ingress fixture');});
 const media=mkdtempSync(path.join(tmpdir(),'legacy-ingress-')),fetch=globalThis.fetch;globalThis.fetch=(async()=>{externalCalls++;throw Error('No external HTTP in legacy ingress');})as typeof fetch;let api:any;
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',MODEL_CONFIG_ENVELOPE_SECRET:'r9b-isolated-model-envelope-key-20261101',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'r9b-isolated-router-control-token-20261101',NAUMI_APPLICATION_TASK_EXECUTION:'worker',VIDEO_WORKER_SECRET:'r9b-isolated-worker-only-secret-20261101',OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:f.origin+'/v1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_RELEASE_LIFECYCLE:'0'});
 let checks=0;const cases:string[]=[],normal:any[]=[],authReads:Record<string,number>={};const eq=(a:any,b:any,label:string)=>{assert.deepEqual(a,b,label);checks++;};const record=(name:string,projection:Record<string,unknown>)=>{cases.push(name);normal.push({case:name,...projection});};
 try{
  f.config.upstreamModels[0].capabilities.nativeResolutions=['1K','2K','4K'];f.config.upstreamModels[0].capabilities.preserveIdentity=true;f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:'map',field:'size',values:{'1K':'1024x1024','2K':'2048x2048','4K':'4096x4096'}}};
  f.config.publicModels[0].displayResolutions=['1K','2K','4K'];f.config.publicModels[0].supplierRouting={mode:'balanced',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]};
  await f.repo.current();api=await loadApi();await api.ensureSchema();const owner='legacy-ingress-owner@example.test',other='legacy-ingress-other@example.test',poor='legacy-ingress-poor@example.test';
  for(const email of [owner,other,poor])await api.getOrCreateUser(email,email);
  await f.sql.query('DELETE FROM app_credit_batches WHERE email=$1',[owner]);await f.sql.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES($1,$2,5000,5000,'grant',now()+interval '1 year')",['fixture-funding',owner]);await f.sql.query('UPDATE app_users SET credits_used=0 WHERE email=$1',[owner]);
  await f.sql.query('UPDATE app_credit_batches SET remaining=0 WHERE email=$1',[poor]);await f.sql.query('UPDATE app_users SET credits_used=0 WHERE email=$1',[poor]);
  const admin=await api.getModelAdministration();
  const publish=async(credits:number)=>{const old=await admin.billing.current(),config=structuredClone(old.config);config.switches.metering='on';for(const feature of ['canvas.image','image.generate']){config.features[feature].enabled=true;config.features[feature].pricing={mode:'fixed',credits};config.features[feature].rules=[];}return admin.billing.publish({id:randomUUID(),actor:'legacy-ingress-fixture',reason:'isolated price '+credits,expectedVersion:old.version,config});};
  await publish(6);const versions={modelVersion:(await f.repo.current()).version,billingVersion:(await admin.billing.current()).version};
  const tokens=new Map([owner,other,poor].map(email=>[email,api.signUserSession(email,Date.now())])),pool=api.getPool(),query=pool.query.bind(pool);let observed:string[]=[];
  pool.query=function(...args:any[]){observed.push(typeof args[0]==='string'?args[0]:args[0]?.text||'');return query(...args);};
  const measure=async(name:string,old:number,run:()=>Promise<Response>,next=1)=>{observed=[];const response=await run(),count=observed.filter(x=>x.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length;eq(count,baseline?old:next,name+' native account reads');authReads[name]=count;return response;};
  const http=(route:string,body?:unknown,email:string|null=owner,extra:Record<string,string>={})=>{const headers=new Headers({origin:f.origin,'sec-fetch-site':'same-origin',...extra});if(email)headers.set('cookie',api.USER_COOKIE+'='+tokens.get(email));if(body!==undefined&&!(body instanceof FormData))headers.set('content-type','application/json');return new Request(f.origin+route,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});};
  const params=(prompt='A blue ceramic bottle')=>({prompt,origin:'canvas',ratio:'1:1',resolution:'1K',quality:'medium',count:1,model:'image-a',email:other});
  const post=(body:unknown,email:string|null=owner,headers:Record<string,string>={})=>api.legacyPost(http('/api/generate-image',body,email,headers));
  const jobs=async()=>Number((await f.sql.query('SELECT count(*) n FROM app_image_jobs')).rows[0].n);
  const consumes=async()=>Number((await f.sql.query("SELECT count(*) n FROM app_ledger WHERE kind='consume'")).rows[0].n);
  const saved=async(id:string)=>(await f.sql.query('SELECT email,payload,reserved_cost FROM app_image_jobs WHERE id=$1',[id])).rows[0];
  const accepted=async(name:string,response:Response,price:number)=>{const body=await response.json();eq(response.status,200,name+' accepted');assert.match(body.jobId,/^job-/);checks++;const row=await saved(body.jobId);eq([row.email,row.payload.p.email,row.reserved_cost,row.payload.billingQuote.requestedCredits],[owner,owner,price,price],name+' real owner and frozen price');record(name,{status:200,ownerBound:true,price});return body.jobId as string;};
  const plainJob=await accepted('plain-submit',await measure('plainPost',4,()=>post(params())),6);
  const operation=randomUUID(),original=params('Original intent bottle'),intentHeaders={'x-naumi-billing-operation-id':operation};
  const intentJob=await accepted('intent-submit',await measure('intentPost',5,()=>post(original,owner,intentHeaders)),6);
  const quoteResponse=await api.quotePost(http('/api/billing/quote',{feature:'canvas.image',quantity:1,quality:'medium',resolution:'1K',ratio:'1:1',modelId:'image-a'})),quote=await quoteResponse.json();eq(quoteResponse.status,200,'actual original quote');eq(quote.credits,6,'original quote price');
  const context=api.signAcceptedModelContext(owner,versions);await publish(17);await f.sql.query("UPDATE app_image_billing_quotes SET expires_at=now()-interval '1 day' WHERE id=$1",[quote.quote.id]);
  await accepted('expired-original-quote',await measure('quotedPost',6,()=>post(params('Quoted bottle'),owner,{'x-naumi-billing-operation-id':randomUUID(),'x-naumi-image-quote':quote.quote.id})),6);
  await accepted('accepted-versions',await measure('acceptedPost',6,()=>post(params('Signed versions bottle'),owner,{'x-naumi-billing-operation-id':randomUUID(),'x-naumi-accepted-model-context':context})),6);
  await accepted('quoted-accepted-versions',await measure('quotedAcceptedPost',7,()=>post(params('Quote plus signed bottle'),owner,{'x-naumi-billing-operation-id':randomUUID(),'x-naumi-image-quote':quote.quote.id,'x-naumi-accepted-model-context':context})),6);
  const countBeforeReplay=await jobs(),replay=await measure('intentReplay',1,()=>post(original,owner,intentHeaders));eq([replay.status,(await replay.json()).jobId],[200,intentJob],'original receipt after current price change');eq(await jobs(),countBeforeReplay,'receipt does not recreate work');record('receipt-replay',{status:200,sameJob:true,newJobs:0});
  const png=await sharp({create:{width:16,height:16,channels:3,background:'#2874cc'}}).png().toBuffer(),form=new FormData();for(const [k,v]of Object.entries(params('Automatic reference frame')))form.set(k,String(v));form.set('ratio','auto');form.set('image',new File([new Uint8Array(png)],'reference.png',{type:'image/png'}));
  const multipartJob=await accepted('multipart-auto-frame',await measure('multipartPost',5,()=>post(form,owner,{'x-naumi-billing-operation-id':randomUUID()})),17),mp=await saved(multipartJob);eq([mp.payload.p.ratio,mp.payload.p.images.length],['1:1',1],'frame normalized before model and quote');
  const imageRequest={version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',modelId:'image-a',prompt:'Parent receipt fixture',parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1,output:{format:'png'}};
  const preview=await api.planPost(http('/api/imagegen/plan',imageRequest)),parentQuote=await preview.json();eq(preview.status,200,'actual parent quote');eq((await api.imagePost(http('/api/imagegen',{operationId:imageRequest.operationId,quoteId:parentQuote.quote.id}))).status,200,'actual parent accepted');
  const parent=await measure('parentGet',2,()=>api.legacyGet(http('/api/generate-image?job=imagegen-'+imageRequest.operationId))),parentBody=await parent.json();eq([parent.status,parentBody.status,parentBody.operationStatus],[200,'pending','queued'],'legacy parent projection and original operation');record('parent-receipt',{status:200,state:'pending',operationStatus:'queued'});
  const child=await measure('childGet',1,()=>api.legacyGet(http('/api/generate-image?job='+plainJob)));eq([child.status,(await child.json()).status],[200,'pending'],'legacy child read');record('child-receipt',{status:200,state:'pending'});
  const active=await measure('activeGet',1,()=>api.legacyGet(http('/api/generate-image?active=1'))),activeBody=await active.json();eq(active.status,200,'active tasks');eq(activeBody.jobs.length,6,'only original legacy jobs');record('active-receipts',{status:200,jobs:6});
  const health=await measure('healthGet',0,()=>api.legacyGet(http('/api/generate-image',undefined,null)),0),healthBody=await health.json();eq([health.status,healthBody.status,healthBody.db],[200,'ok',true],'health remains unauthenticated');eq(Object.hasOwn(healthBody,'model'),false,'health does not expose provider');record('health',{status:200,db:true,modelHidden:true});
  const beforeNegative=await jobs();
  for(const [name,headers,email]of [
   ['foreign-quote',{'x-naumi-image-quote':quote.quote.id},other],
   ['foreign-context',{'x-naumi-accepted-model-context':context},other],
   ['tampered-context',{'x-naumi-accepted-model-context':context.slice(0,-1)+(context.endsWith('a')?'b':'a')},owner],
   ['expired-context',{'x-naumi-accepted-model-context':api.signAcceptedModelContext(owner,versions,Date.now()-16*60*1000)},owner]
  ]as const){const response=await post(params(name),email,{'x-naumi-billing-operation-id':randomUUID(),...headers});eq(response.status,name==='foreign-quote'?400:403,name+' still rejects');record(name,{status:response.status});}
  const quoteTamper=await post({...params('Wrong quantity'),count:2},owner,{'x-naumi-billing-operation-id':randomUUID(),'x-naumi-image-quote':quote.quote.id});eq(quoteTamper.status,409,'frozen quantity mismatch');record('quote-input-conflict',{status:409});
  const oldScope=(await f.sql.query('SELECT scope_key FROM app_image_billing_quotes WHERE id=$1',[quote.quote.id])).rows[0].scope_key;await f.sql.query('UPDATE app_image_billing_quotes SET scope_key=$2 WHERE id=$1',[quote.quote.id,JSON.stringify(['tenant',randomUUID()])]);const foreignScope=await post(params('Different scope'),owner,{'x-naumi-billing-operation-id':randomUUID(),'x-naumi-image-quote':quote.quote.id});eq(foreignScope.status,400,'scope-bound quote');await f.sql.query('UPDATE app_image_billing_quotes SET scope_key=$2 WHERE id=$1',[quote.quote.id,oldScope]);record('quote-scope-conflict',{status:400});
  const changed=await post({...original,prompt:'Changed original'},owner,intentHeaders),foreignReplay=await post(original,other,intentHeaders);eq([changed.status,foreignReplay.status],[409,409],'receipt input and owner conflict');record('intent-conflicts',{changed:409,foreign:409});
  const poorResponse=await post(params('Insufficient balance'),poor,{'x-naumi-billing-operation-id':randomUUID()});eq(poorResponse.status,402,'real reservation insufficiency');record('real-balance-insufficient',{status:402});
  const foreignChild=await api.legacyGet(http('/api/generate-image?job='+plainJob,undefined,other)),foreignParent=await api.legacyGet(http('/api/generate-image?job=imagegen-'+imageRequest.operationId,undefined,other));eq([foreignChild.status,foreignParent.status],[403,404],'legacy and parent owner boundaries retain original status');record('foreign-receipts',{child:403,parent:404});
  const pendingId=randomUUID(),pendingBody=params('Original pending submission'),pendingRequest=http('/api/generate-image',pendingBody,owner,{'x-naumi-billing-operation-id':pendingId}),identity=await api.billingRequestIdentity(pendingRequest);
  await api.claimSubmission({operationId:pendingId,email:owner,path:'/api/generate-image',hash:identity.hash});const pending=await post(pendingBody,owner,{'x-naumi-billing-operation-id':pendingId}),pendingData=await pending.json();eq([pending.status,pendingData.code],[409,'OPERATION_PENDING'],'pending intent is not a new purchase');eq(pendingData.accepted,undefined,'pending receipt does not prove unaccepted');record('pending-intent',{status:409,code:'OPERATION_PENDING',accepted:'unknown'});
  for(const [name,set,reset]of [['banned','banned=true','banned=false'],['expired',"account_expires_at=now()-interval '1 day'",'account_expires_at=NULL'],['revoked',"auth_revoked_before=now()+interval '1 minute'",'auth_revoked_before=NULL']]){
   await f.sql.query('UPDATE app_users SET '+set+' WHERE email=$1',[owner]);const denied=await post(params(name),owner,{'x-naumi-billing-operation-id':randomUUID()}),deniedParent=await api.legacyGet(http('/api/generate-image?job=imagegen-'+imageRequest.operationId));eq([denied.status,deniedParent.status],[401,401],name+' next request rechecks native session');await f.sql.query('UPDATE app_users SET '+reset+' WHERE email=$1',[owner]);record('native-'+name,{submit:401,parent:401});
  }
  const badCanvas=await post({...params('Invalid canvas'),quality:'unrecognized'}),badJson=await post([]);eq([badCanvas.status,badJson.status],[400,400],'parameter guard and malformed JSON order unchanged');record('payload-validation',{canvas:400,json:400});
  const cross=await post(params('Cross origin'),owner,{'x-naumi-billing-operation-id':randomUUID(),'sec-fetch-site':'cross-site'});eq(cross.status,403,'intent source check');record('cross-site',{status:403});
  const workerHeaders={'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!},worker=await post({workerJobId:'job-'+randomUUID()},null,workerHeaders),badWorker=await post({},null,workerHeaders);eq([worker.status,badWorker.status],[200,400],'worker secret path before normal authentication/parameter logic');record('worker',{resume:200,invalidJob:400});
  eq(await jobs(),beforeNegative,'all negatives/pending/worker do not create tasks');
  let callback:any='not-called';const intentCallback=await api.withBillingIntent(http('/api/generate-image',{},owner,{'x-naumi-billing-operation-id':randomUUID()}),(actor:any)=>{callback=actor;return Promise.resolve(Response.json({ok:true},{status:201}));});eq([intentCallback.status,callback],[201,baseline?undefined:owner],'receipt owner passes its actor');
  let biActor:any;const bi=await api.withBiRequest(http('/api/imagegen',{}),(actor:any)=>{biActor=actor;return Promise.resolve(Response.json({owner:api.currentBiContext()?.email}));},owner);eq([(await bi.json()).owner,biActor],[owner,baseline?undefined:owner],'BI consumer receives owning actor');record('owned-callbacks',{intent:201,biOwner:true});
  const observedQuery=pool.query;pool.query=function(...args:any[]){const text=typeof args[0]==='string'?args[0]:args[0]?.text||'';if(text.includes('FROM app_image_jobs'))throw Error('fixture original task read unavailable');return observedQuery.apply(this,args);};await assert.rejects(()=>api.legacyGet(http('/api/generate-image?job=imagegen-'+imageRequest.operationId)),/fixture original task read unavailable/);checks++;pool.query=observedQuery;record('receipt-read-unknown',{propagatesReadFailure:true,newPurchases:0});
  const lostId=randomUUID(),lostBody=params('Lost acceptance acknowledgement'),beforeLost=await jobs();let failedAck=0;
  pool.query=function(...args:any[]){const text=typeof args[0]==='string'?args[0]:args[0]?.text||'';if(text.startsWith('UPDATE app_billing_intents SET response=')&&failedAck++===0)throw Error('fixture accepted response write failed');return observedQuery.apply(this,args);};
  const lost=await post(lostBody,owner,{'x-naumi-billing-operation-id':lostId}),lostData=await lost.json();pool.query=observedQuery;eq([lost.status,lostData.accepted],[503,undefined],'lost ACK remains unknown');eq(await jobs(),beforeLost+1,'actual job committed before ACK failure');
  const retained=await post(lostBody,owner,{'x-naumi-billing-operation-id':lostId}),retainedData=await retained.json();eq([retained.status,retainedData.code],[409,'OPERATION_PENDING'],'same original intent remains pending');eq(await jobs(),beforeLost+1,'unknown does not buy a second job');record('lost-ack',{first:503,next:409,code:'OPERATION_PENDING',newJobs:1,replays:0});
  const concurrentId=randomUUID(),concurrentBody=params('Concurrent original operation'),beforeConcurrent=await jobs(),concurrent=await Promise.all([post(concurrentBody,owner,{'x-naumi-billing-operation-id':concurrentId}),post(concurrentBody,owner,{'x-naumi-billing-operation-id':concurrentId})]);eq(concurrent.every(x=>[200,409].includes(x.status))&&concurrent.some(x=>x.status===200),true,'concurrent results are original receipt or pending');eq(await jobs(),beforeConcurrent+1,'one original job under concurrent intent');record('concurrent-intent',{responsesConform:true,newJobs:1});
  eq(await consumes(),0,'no settlement before deferred worker');eq([supplierCalls,externalCalls],[0,0],'no supplier or external requests');record('financial-and-network',{consumes:0,supplier:0,external:0});
  save('RESULT.json',{status:baseline?'BASELINE_REPRODUCED':'PASS',cases,checks,normal,authReads,supplierCalls,externalCalls,actual:['native HMAC/PG auth','legacy POST/GET','BI/model/opaque-quote/signed-context wrappers','intent fingerprint and receipt','PostgreSQL job/reservation/wallet transactions','frame normalization','original parent adapter','ACK failure and concurrent submission'],workerExecution:'deferred; no supplier generation or final settlement claimed'});console.log('LEGACY_INGRESS_PG='+(baseline?'BASELINE_REPRODUCED':'PASS')+' CASES='+cases.length+' CHECKS='+checks+' AUTH_READS='+Object.values(authReads).join('/'));
 }finally{globalThis.fetch=fetch;if(api){await api.closeImageCoordinationPool();await api.closeDatabasePools();}await f.cleanup();rmSync(media,{recursive:true,force:true});console.log('LEGACY_INGRESS_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 APP_POOLS_CLOSED=1 COORDINATION_POOL_CLOSED=1 FIXTURE_POOLS_CLOSED=1 LOOPBACK_HTTP_CLOSED=1 OWN_TEMP_MEDIA_REMOVED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
