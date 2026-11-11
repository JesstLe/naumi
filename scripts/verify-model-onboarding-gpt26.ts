import assert from 'node:assert/strict';
import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {GPT26_PROFILES,gpt26Upstream} from '../src/lib/model-config/gpt26-onboarding';
import {createModelRuntime,publicModelCatalog} from '../src/lib/model-config/runtime';
import {createRouterControl,type RouterStatus} from '../src/lib/model-config/router-client';
import {createModelManagementHandler} from '../src/lib/model-config/management-access';
import {createOnboardingHandler} from '../src/lib/model-config/onboarding-access';
import {planModelOnboarding} from '../src/lib/model-config/onboarding';
import {selectedBusinessOption} from '../src/lib/model-config/business';
import {validateModelConfig} from '../src/lib/model-config/schema';
import {modelCreditView} from '../src/lib/model-config/management-pricing';
import type {OnboardingEntry} from '../src/lib/model-config/onboarding-contract';
import {imagegenRequestSchema} from '../src/lib/imagegen/schema';
import {getImagegenResult,submitImagegen} from '../src/lib/imagegen/dispatch';
import {planImagegen} from '../src/lib/imagegen/plan';
import {createBillingService,withBillingTransaction} from '../src/lib/billing/service';

async function main(){
 const real=process.env.NAUMI_GPT26_REAL_API==='BUDGET_1_USD';
 const evidence=process.env.NAUMI_GPT26_EVIDENCE_DIR;
 if(real&&(!evidence||!process.env.NAUMI_GPT26_RELAY))throw Error('REAL_TEST_EVIDENCE_AND_RELAY_REQUIRED');
 async function relay(method:string,path:string,headers:Record<string,unknown>,bytes:Buffer){
  return new Promise<{status:number;body:string}>((resolve,reject)=>{
   const child=spawn('python',[process.env.NAUMI_GPT26_RELAY!],{windowsHide:true,stdio:['pipe','pipe','pipe']});const output:Buffer[]=[];
   child.stdout.on('data',b=>output.push(b));child.stderr.resume();child.on('error',reject);child.on('exit',code=>{try{if(code!==0)throw Error('APIB_RELAY_FAILED_PRESERVE_ORIGINAL_REQUEST');resolve(JSON.parse(Buffer.concat(output).toString()));}catch(e){reject(e);}});
   child.stdin.end(JSON.stringify({method,path,headers:{'content-type':headers['content-type'],'idempotency-key':headers['idempotency-key']},body:bytes.toString('base64')}));
  });
 }
 process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'naumi-onboard-gpt26-'));process.env.STORAGE_DRIVER='local';
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#e2c481'}}).png().toBuffer();
 const posts:any[]=[],tasks=new Map<string,any>();let uploads=0;let gets=0;
 const f=await createModelFixture(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(real){
   const parts:Buffer[]=[];for await(const b of req)parts.push(b);const bytes=Buffer.concat(parts);
   if(req.url==='/v1/images/generations')posts.push(JSON.parse(bytes.toString()));
   if(req.url==='/v1/uploads/images')uploads++;
   if(req.url?.startsWith('/v1/tasks/'))gets++;
   try{const response=await relay(req.method!,req.url!,req.headers,bytes);res.statusCode=response.status;res.end(response.body);}catch{res.statusCode=502;res.end(JSON.stringify({error:'RELAY_UNKNOWN_QUERY_ORIGINAL_TASK_ONLY'}));}return;
  }
  if(req.url==='/v1/models'){res.end(JSON.stringify({data:[...new Set(GPT26_PROFILES.map(p=>p.wire))].map(id=>({id,object:'model'}))}));return;}
  if(req.url?.startsWith('/media/')){res.setHeader('content-type','image/png');res.end(png);return;}
  if(req.url?.startsWith('/v1/tasks/')){gets++;const id=req.url.split('/').at(-1)!,task=tasks.get(id);res.end(JSON.stringify({data:{id,model:task.model,status:'completed',cost:'0.01',usage:{output_tokens:1},result:{images:[{url:[f.origin+'/media/'+id+'.png']}]}}}));return;}
  const bytes=[];for await(const part of req)bytes.push(part);
  if(req.url==='/v1/uploads/images'){uploads++;res.end(JSON.stringify({url:'https://fixture.invalid/uploaded.png'}));return;}
  const body=JSON.parse(Buffer.concat(bytes).toString());assert.equal(req.url,'/v1/images/generations');assert.equal(req.headers['idempotency-key']!==undefined,true);
  posts.push(body);const taskId='task_'+posts.length;tasks.set(taskId,body);res.end(JSON.stringify({data:[{task_id:taskId,status:'submitted'}]}));
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'onboarding-local-router-long-token',MODEL_CONFIG_ENVELOPE_SECRET:'onboarding-local-envelope-long-secret',MODEL_CONFIG_TRUSTED_ORIGINS:real?f.origin+',https://getapib.org':f.origin,OPENAI_API_KEY:'fixture-only'});
 const db=await import('../src/lib/db');
 const actor='onboarding-admin@fixture.test';let currentDigest='',loseResponse=false;const receipts=new Map<string,RouterStatus>();let checks=0;
 const router=createRouterControl({baseUrl:f.origin,token:'onboarding-fixture-router-token-long',envelopeSecret:'onboarding-fixture-envelope-independent-long',trustedOrigins:[f.origin]});
 router.prepare=async()=>{};router.state=async()=>currentDigest;router.status=async id=>receipts.get(id)||null;
 router.activate=async(id,expected,digest)=>{assert.equal(expected,currentDigest);currentDigest=digest;const receipt:RouterStatus={id,digest,phase:'applied'};receipts.set(id,receipt);if(loseResponse){loseResponse=false;throw Error('lost response');}return receipt;};
 try{
  await db.ensureSchema();
  const key=await f.credentials.importPlain({providerId:'apib-image',plain:'fixture-apib-image-secret',actor});
  f.config.providers.push({...f.config.providers[0],id:'apib-image',name:'APIB fixture',protocol:'apimart-images',credentialRef:key.id});
  const old=f.config.publicModels[0];old.id='gpt-image-2';old.label='GPT-Image-2.5';f.config.bindings={'image.generate':old.id,'image.edit':old.id};
  let billing={version:1,config:fixtureConfig()};
  billing.config.features['image.generate'].pricing={mode:'quality-resolution',quality:{low:4,medium:6,high:8,xhigh:10,max:12,auto:6},resolutionExtra:{'1K':0,'2K':2,'4K':4,'5K':6}};
  billing.config.features['canvas.image'].pricing=structuredClone(billing.config.features['image.generate'].pricing);
  const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins:[f.origin],billing:async()=>billing,billingByVersion:async()=>billing});
  const administration=async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins:[f.origin]}) as never;
  const handler=createModelManagementHandler({authorize:async()=>({actor}),administration,managed:async()=>true});
  const drafts=createOnboardingHandler({authorize:async()=>({actor}),administration});
  const request=(body:any)=>new Request('http://fixture.test/api/admin/model-management',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const baseline=await f.repo.current();currentDigest='';const original=structuredClone(baseline),oldBilling=structuredClone(billing);
  const entries:OnboardingEntry[]=GPT26_PROFILES.map(p=>({publicId:p.publicId,label:p.label,source:{upstream:gpt26Upstream(p.id,'apib-image')},features:['image.generate','canvas.image'],price:{mode:'copy',sourceModelId:old.id}}));
  const operation={action:'create-models',id:randomUUID(),expectedVersion:baseline.version,expectedBillingVersion:billing.version,entries,enabled:true,capabilityConfirmed:true};
  const unauthorized=createModelManagementHandler({authorize:async()=>NextResponse.json({}, {status:403}),administration,managed:async()=>true});assert.equal((await unauthorized(request(operation))).status,403);checks++;
  const foreign=request(operation);foreign.headers.set('origin','https://foreign.invalid');assert.equal((await handler(foreign)).status,403);checks++;
  const unmanaged=createModelManagementHandler({authorize:async()=>({actor}),administration,managed:async()=>false});assert.equal((await unmanaged(request(operation))).status,409);checks++;
  const discover=await handler(request({action:'discover',providerId:'apib-image'}));assert.equal(discover.status,200,await discover.clone().text());checks++;
  const draftRead=await drafts(new Request('http://fixture.test/api/admin/model-management/onboarding'));const firstDraft=(await draftRead.json()).draft;
  const savedResponse=await drafts(request({...operation,action:'save',id:undefined,expectedRevision:firstDraft.revision}));assert.equal(savedResponse.status,200,await savedResponse.clone().text());
  assert.equal((await f.repo.current()).version,baseline.version);const saved=(await savedResponse.json()).draft;assert.equal(saved.entries.length,4);checks++;
  const preview=await drafts(request({...operation,action:'preview',id:undefined}));assert.equal(preview.status,200,await preview.clone().text());assert.equal((await preview.json()).changes.length,4);checks++;
  const catalog=(await discover.clone().json());
  const reject=(input:any,code:string)=>{assert.throws(()=>planModelOnboarding(baseline,billing,input,[catalog]),(e:any)=>e.code===code);checks++;};
  reject({...operation,capabilityConfirmed:false},'CAPABILITY_CONFIRMATION_REQUIRED');
  reject({...operation,entries:[entries[0],entries[0]]},'PUBLIC_ID_CONFLICT');
  reject({...operation,entries:[{...entries[0],publicId:old.id}]},'PUBLIC_ID_CONFLICT');
  reject({...operation,entries:[{...entries[0],price:{mode:'copy',sourceModelId:'missing'}}]},'PRICE_SOURCE_UNAVAILABLE');
  const restored=(await(await drafts(new Request('http://fixture.test/api/admin/model-management/onboarding'))).json()).draft;assert.deepEqual(restored.entries,saved.entries);checks++;
  assert.equal((await drafts(request({...operation,action:'save',id:undefined,expectedRevision:firstDraft.revision}))).status,409);checks++;
  loseResponse=true;let result=await handler(request(operation));if(result.status!==200)result=await handler(request(operation));assert.equal(result.status,200,await result.clone().text());const current=await f.repo.current();checks++;
  assert.deepEqual(current.config.providers,original.config.providers);assert.deepEqual(current.config.upstreamModels.slice(0,original.config.upstreamModels.length),original.config.upstreamModels);assert.deepEqual(current.config.bindings,original.config.bindings);assert.deepEqual(billing,oldBilling);checks++;
  const visible=publicModelCatalog(current,'image','image.generate',true);assert.equal(visible.defaultModelId,old.id);assert.equal(visible.models.length,5);for(const p of GPT26_PROFILES)assert.ok(visible.models.some(m=>m.id===p.publicId));checks++;
  assert.equal(selectedBusinessOption(current.config,'canvas.image',old.id),undefined);checks++;
  const disabledModel=structuredClone(current);disabledModel.config.business!['canvas.image']!.options[0].enabled=false;
  assert.ok(!publicModelCatalog(disabledModel,'image','canvas.image',true).models.some(m=>m.id===entries[0].publicId));
  assert.throws(()=>selectedBusinessOption(disabledModel.config,'canvas.image',entries[0].publicId));checks++;
  const forbidden=structuredClone(current);forbidden.config.business!['canvas.image']!.enabled=false;assert.equal(publicModelCatalog(forbidden,'image','canvas.image',true).models.length,0);assert.throws(()=>selectedBusinessOption(forbidden.config,'canvas.image',old.id));checks++;
  const badMatrix=structuredClone(current.config);const matrix=badMatrix.business!['canvas.image']!.options[0].pricing!;if(matrix.mode==='matrix')matrix.prices.medium['1K']=null;assert.throws(()=>validateModelConfig(badMatrix,{trustedOrigins:[f.origin]}));checks++;
  for(const feature of ['image.generate','canvas.image'] as const)for(const p of GPT26_PROFILES)for(const q of ['low','medium','high','xhigh','max'])for(const r of ['1K','2K','4K'])assert.equal(modelCreditView(billing,current,feature,p.publicId,q,r).credits,modelCreditView(billing,original,feature,old.id,q,r).credits);checks++;
  assert.equal((await handler(request(operation))).status,200);assert.equal((await f.repo.current()).version,current.version);checks++;
  assert.equal((await handler(request({...operation,entries:entries.slice(1)}))).status,409);checks++;
  assert.equal((await handler(request({...operation,id:randomUUID()}))).status,409);checks++;
  const owner='user-'+randomUUID()+'@fixture.test';await db.getOrCreateUser(owner,'User');
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:999,source:'admin',reason:'isolated user flow',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor}));
  const actualAdmin=(await import('../src/lib/model-config/server')).getModelAdministration;const actualBilling=await(await actualAdmin()).billing.current();
  // The HTTP/PG runtime reads the same published models; use its actual tariff snapshot.
  const refId='onboarding-reference-'+randomUUID();await db.addArtworks(owner,[{id:refId,title:'reference',prompt:'',category:'main',status:'completed',image:'data:image/png;base64,'+png.toString('base64'),gradient:'',origin:'canvas',width:1024,height:1024}]);
  const results=[];
  for(const profile of GPT26_PROFILES)for(const edit of [false,true]){
   const operationId=randomUUID();const req=imagegenRequestSchema.parse({version:1,operationId,entry:'canvas',mode:edit?'edit':'generate',modelId:profile.publicId,prompt:'one gold product bottle on an ivory background',...(edit?{inputs:[{artworkId:refId,role:'edit-target'}]}:{}),parameters:{quality:'medium',resolution:'1K',ratio:'1:1'}});
   const plan=await planImagegen(req,owner);const count=posts.length;let receipt=await submitImagegen(req,owner,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});
   for(let i=0;i<(real?900:200)&&!['succeeded','failed','needs_attention'].includes(receipt.status);i++){await new Promise(r=>setTimeout(r,real?1000:30));if(real&&i%10===0)await(await import('../src/lib/worker/image-recovery')).recoverDurableImageJobs();receipt=(await getImagegenResult(operationId,owner))!;}
   assert.equal(receipt.status,'succeeded',JSON.stringify(receipt));assert.equal(posts.length,count+1);const wire=posts.at(-1);assert.equal(wire.model,profile.wire);assert.equal(wire.quality,'medium');assert.equal(wire.resolution,'1k');assert.equal(wire.size,'1:1');if('version'in profile)assert.equal(wire.version,profile.version);
   if(real&&evidence){const rows=await db.listArtworksByIds(owner,receipt.artifacts.map(a=>a.artworkId));const {readCanvasOutput}=await import('../src/lib/canvas-image-input');for(const row of rows){const data=await readCanvasOutput(row.image,'http://internal',owner);await writeFile(join(evidence,profile.id+(edit?'-edit':'-generate')+'.png'),data.buffer);}}
   assert.equal(receipt.artifacts.length,1);assert.equal(receipt.artifacts[0].width,1024);assert.equal(receipt.chargedCredits,plan.totalCredits);await submitImagegen(req,owner);await getImagegenResult(operationId,owner);assert.equal(posts.length,count+1);results.push({model:profile.publicId,edit,status:receipt.status,credits:receipt.chargedCredits});checks++;
  }
  assert.equal(uploads,4);assert.equal(posts.length,8);checks++;
  if(real&&evidence)await writeFile(join(evidence,'PAID_USER_FLOW.json'),JSON.stringify({results,posts,gets,uploads,modelVersion:current.version,productionDatabaseWrites:0,productionConfigurationWrites:0},null,2));
  assert.deepEqual(await f.repo.byVersion(original.version),original);checks++;
  const charges=await db.getPool().query("SELECT count(*)::int n,sum(-delta)::int credits FROM app_ledger WHERE email=$1 AND kind='consume'",[owner]);
  assert.equal(charges.rows[0].n,8);assert.equal(charges.rows[0].credits,results.reduce((n,r)=>n+r.credits,0));checks++;
  const pending=await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs WHERE email=$1 AND snapshot->>'status' NOT IN ('done','error','needs_attention')",[owner]);assert.equal(pending.rows[0].n,0);checks++;

  console.log(JSON.stringify({results,posts:posts.length,gets,uploads,checks,actualBillingVersion:actualBilling.version}));
  console.log(`MODEL_ONBOARDING_GPT26=PASS CHECKS=${checks} PUBLIC_MODELS=4 USER_GENERATIONS=8 REAL_PG=1 ORIGINAL_DEFAULT=UNCHANGED PRICE_MATRIX=120_PAIRS SUPPLIER_POST=${real?posts.length:0} LOOPBACK_POSTS=${real?0:posts.length} EXIT=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
