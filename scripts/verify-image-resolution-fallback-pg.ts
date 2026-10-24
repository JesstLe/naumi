import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig,facts as billingFacts} from './billing-unit-fixture';
import {createModelExecutor} from '../src/lib/model-config/execution';
import {currentModelExecution,runExecutionBundle} from '../src/lib/model-config/context';
import {quote} from '../src/lib/billing/quote';
import {imagegenRequestSchema} from '../src/lib/imagegen/schema';
const baseline=process.argv.includes('--baseline');
async function main(){
 const wires:any[]=[];process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'naumi-resolution-'));process.env.STORAGE_DRIVER='local';const png=await sharp({create:{width:2048,height:2048,channels:3,background:'white'}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{if(req.url?.startsWith('/media/')){res.setHeader('content-type','image/png');res.end(png);return;}if(req.url?.startsWith('/v1/tasks/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:{id:req.url.split('/').at(-1),model:'seedream-5-0-pro',status:'completed',cost:'0.01',result:{images:[{url:[f.origin+'/media/output.png']}]}}}));return;}const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);let data:any={};if(bytes.length){const request=new Request(f.origin+req.url,{method:'POST',headers:{'content-type':req.headers['content-type']||''},body:bytes});data=request.headers.get('content-type')!.includes('multipart')?Object.fromEntries(await request.formData()):await request.json();}wires.push(data);res.setHeader('content-type','application/json');res.end(JSON.stringify(data.model==='seedream-5-0-pro'?{data:[{task_id:'apib-local-1'}]}:{data:[{b64_json:png.toString('base64')}]}));});
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 Object.assign(process.env,{NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'isolated-resolution-router-token-long',MODEL_CONFIG_ENVELOPE_SECRET:'isolated-resolution-envelope-secret-long',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:'fixture-only'});
 f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:'map',field:'size',values:{'1K':'1024x1024','2K':'2048x2048'}}};
 f.config.upstreamModels[0].capabilities.preserveIdentity=true;
 if(!baseline)f.config.publicModels[0].displayResolutions=['1K','2K'];
 let db:typeof import('../src/lib/db')|undefined;
 try{
 const snapshot=await f.repo.current(),billing={version:1,config:fixtureConfig()};
 const executor=createModelExecutor({runtime:{byVersion:f.repo.byVersion,prepareExecution:async()=>{throw Error('not a Router test')}},credentials:f.credentials,trustedOrigins:[f.origin],gateway:()=>{throw Error('no gateway')},billingByVersion:async()=>billing});
 const facts={task:'product' as const,quality:'medium',resolution:'4K',requestedResolution:'4K',ratio:'1:1',needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0};
 if(baseline){
  await assert.rejects(()=>executor.resolve({binding:'image.generate',requestedModelId:'image-a',snapshot,billing,facts}),/不满足/);
  console.log('BASELINE=REPRODUCED REQUEST=4K SUPPORTED=1K,2K RESULT=MODEL_INCOMPATIBLE WIRE_POSTS=0');
  return;
 }
 const frozen=await executor.resolve({binding:'image.generate',requestedModelId:'image-a',snapshot,billing,facts});
 assert.equal(frozen.requestedParameters!.resolution,'4K');assert.equal(frozen.facts!.requestedResolution,'2K');assert.equal(frozen.facts!.resolution,'2K');assert.equal(facts.resolution,'4K');
 const {client}=await executor.clientFor(frozen);
 await executor.run(frozen,()=>client.images.generate({model:'stale',prompt:'fixture',size:'1024x1024'}));assert.equal(wires.at(-1).size,'2048x2048');
 const {executionFetch}=await import('../src/lib/model-config/clients');const transport=executionFetch(await executor.describe(frozen),{trustedOrigins:[f.origin]});
 const form=new FormData();form.set('prompt','fixture');form.set('image',new File(['fixture'],'ref.png',{type:'image/png'}));form.set('size','wrong');await(await transport(f.origin+'/v1/images/edits',{method:'POST',body:form})).text();assert.equal(wires.at(-1).size,'2048x2048');assert.ok(wires.at(-1).image instanceof File);
 db=await import('../src/lib/db');await db.ensureSchema();const owner=`resolution-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,'Fixture');
 const {getModelAdministration}=await import('../src/lib/model-config/server');const admin=await getModelAdministration();const actualBilling=await admin.billing.current();
 const {freezeBusinessQuote}=await import('../src/lib/model-config/business-billing');
 const q=await freezeBusinessQuote(new Request(f.origin+'/api/billing/quote'),actualBilling,billingFacts({modelId:'image-a',resolution:'4K',ratio:'1:1'}),quote);
 const expected=quote(actualBilling,billingFacts({modelId:'image-a',resolution:'4K',ratio:'1:1'}));
 assert.equal(q.facts.resolution,'4K');assert.equal(q.requestedParameters!.resolution,'4K');assert.equal(q.effectiveParameters!.resolution,'2K');assert.equal(q.requestedCredits,expected.requestedCredits);
 const {withModelRequest}=await import('../src/lib/model-config/requests');
 await withModelRequest(new Request(f.origin+'/api/generate-image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'image-a',prompt:'fixture',resolution:'4K',ratio:'1:1'})}),async()=>{const scope=currentModelExecution('image')!;assert.equal(scope.frozen.facts!.requestedResolution,'2K');assert.equal(scope.frozen.requestedParameters!.resolution,'4K');const scoped=await freezeBusinessQuote(new Request(f.origin+'/api/billing/quote'),actualBilling,billingFacts({modelId:'image-a',resolution:'4K'}),quote);assert.equal(scoped.requestedCredits,expected.requestedCredits);assert.equal(scoped.effectiveParameters!.resolution,'2K');});
 await assert.rejects(()=>withModelRequest(new Request(f.origin+'/api/generate-image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'image-a',prompt:'fixture',resolution:'4K',ratio:'1:1',targetWidth:4096,targetHeight:4096})}),async()=>{}),/不满足|未开放/,'custom pixel contract does not become a tier downgrade');
 const {planImagegen,imagegenFingerprint}=await import('../src/lib/imagegen/plan');
 const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',modelId:'image-a',prompt:'draw a bottle',parameters:{resolution:'4K',ratio:'1:1'}});
 const original=JSON.stringify(request),plan=await planImagegen(request,owner);
 assert.equal(plan.request.parameters.resolution,'2K');assert.equal(plan.steps[0].parameters.resolution,'2K');assert.equal(plan.requestedParameters!.resolution,'4K');assert.equal(plan.fingerprint,imagegenFingerprint(request));assert.equal(JSON.stringify(request),original);assert.match(plan.warnings.join(' '),/4K.*2K/);assert.equal(plan.totalCredits,expected.requestedCredits);
 // Version-pinned old requests must not acquire new policy in a recovery path.
 await assert.rejects(()=>planImagegen(request,owner,{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}),/没有支持|未开放此分辨率/);
 const old={...frozen,requestedParameters:undefined,facts:{...facts,resolution:'1K',requestedResolution:'1K'}};
 assert.deepEqual((await executor.describe(old)).frozen.facts,old.facts);assert.equal(wires.length,2,'describe/quote/plan never generate');
 const accepted=await runExecutionBundle({frozen:{modelVersion:snapshot.version,billingVersion:actualBilling.version},billing:actualBilling},()=>freezeBusinessQuote(new Request(f.origin+'/api/billing/quote'),actualBilling,billingFacts({modelId:'image-a',resolution:'2K'}),quote));
 assert.equal(accepted.facts.resolution,'2K','version-frozen task billing is not reinterpreted');
 assert.equal((await db.getPool().query('SELECT count(*)::int n FROM app_image_jobs')).rows[0].n,0);
 const {createBillingService,withBillingTransaction}=await import('../src/lib/billing/service');
 await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:1000,source:'admin',reason:'isolated fallback fixture',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'}));
 const {submitImagegen,getImagegenResult}=await import('../src/lib/imagegen/dispatch');
 const submission=await submitImagegen(request,owner,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});
 let result=submission;
 for(let i=0;i<500&&!['succeeded','failed','needs_attention'].includes(result.status);i++){await new Promise(r=>setTimeout(r,50));result=(await getImagegenResult(request.operationId,owner))!;}
 assert.equal(result.status,'succeeded',JSON.stringify(result));assert.match(result.warnings!.join(' '),/4K.*2K/);assert.equal(result.chargedCredits,12);assert.equal(result.artifacts[0].width,2048);assert.equal(result.artifacts[0].height,2048);assert.equal(wires.length,3);
 const before=wires.length;await submitImagegen(request,owner);assert.equal(wires.length,before,'same raw request never replays');
 const child=(await db.getPool().query("SELECT payload FROM app_image_jobs WHERE kind='generate' AND email=$1",[owner])).rows[0].payload;
 assert.equal(child.p.resolution,'2K');assert.equal(child.billingQuote.facts.resolution,'4K');assert.equal(child.billingQuote.requestedCredits,12);
 assert.equal(child.billingQuote.requestedParameters.resolution,'4K');assert.equal(child.billingQuote.effectiveParameters.resolution,'2K');
 const {POST}=await import('../src/app/api/generate-image/route'),{USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
 const legacyId=randomUUID(),legacyInit={method:'POST',headers:{'content-type':'application/json',cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,'x-naumi-billing-operation-id':legacyId,'x-naumi-model-version':String(plan.modelVersion),'x-naumi-billing-version':String(plan.billingVersion),'x-naumi-billing-credits':'12'},body:JSON.stringify({prompt:'legacy fallback fixture',model:'image-a',origin:'canvas',resolution:'4K',ratio:'1:1',count:1,quality:'medium'})};
 const response=await POST(new Request('http://internal/api/generate-image',legacyInit));const receipt=await response.json();assert.equal(response.ok,true,JSON.stringify(receipt));
 let state:any;for(let i=0;i<500;i++){state=(await db.getPool().query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[receipt.jobId])).rows[0]?.snapshot;if(['done','error','needs_attention'].includes(state?.status))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(state.status,'done',JSON.stringify(state));assert.equal(state.creditsUsed,12);assert.equal(wires.at(-1).size,'2048x2048');assert.equal(wires.length,4);
 const duplicate=await(await POST(new Request('http://internal/api/generate-image',legacyInit))).json();assert.equal(duplicate.jobId,receipt.jobId);assert.equal(wires.length,4);
 // Complete the same quote/plan/child/adapter chain with the real application
 // APIMart transport, while every network endpoint remains loopback.
 const key=await f.credentials.importPlain({providerId:'apib-local',plain:'isolated-async-fixture-only',actor:'fixture'});
 const current=await f.repo.current(),config=structuredClone(current.config);
 config.providers.push({...config.providers[0],id:'apib-local',protocol:'apimart-images',credentialRef:key.id});
 config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id:'apib-local-u',providerId:'apib-local',model:'seedream-5-0-pro',parameterMap:{qualityPolicy:{mode:'omit',choices:[{id:'medium',label:'标准'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'1K':'1K','2K':'2K'}},apimartImages:{schemaVersion:1,maxOutputs:1,supportsMask:false,ratios:['1:1'],outputDimensions:{'1K:1:1':{width:1024,height:1024},'2K:1:1':{width:2048,height:2048}}}}});
 config.publicModels.push({id:'apib-local-model',label:'APIB本机验收',modality:'image',enabled:true,visible:true,target:{type:'upstream',id:'apib-local-u'},displayResolutions:['1K','2K']});
 const draft=await f.repo.draft('fixture'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor:'fixture'});
 const pub=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:'fixture',reason:'isolated application adapter chain'});await f.repo.markApplied(pub.id,pub.digest);
 const asyncRequest=imagegenRequestSchema.parse({...request,operationId:randomUUID(),modelId:'apib-local-model'}),asyncPlan=await planImagegen(asyncRequest,owner);
 assert.equal(asyncPlan.request.parameters.resolution,'2K');assert.equal(asyncPlan.totalCredits,12);assert.equal(asyncPlan.requestedParameters!.resolution,'4K');
 let asyncResult=await submitImagegen(asyncRequest,owner,{billingVersion:asyncPlan.billingVersion,modelVersion:asyncPlan.modelVersion,credits:12,confirmed:true});
 for(let i=0;i<500&&!['succeeded','failed','needs_attention'].includes(asyncResult.status);i++){await new Promise(r=>setTimeout(r,50));asyncResult=(await getImagegenResult(asyncRequest.operationId,owner))!;}
 assert.equal(asyncResult.status,'succeeded',JSON.stringify(asyncResult));assert.equal(asyncResult.chargedCredits,12);assert.equal(asyncResult.artifacts[0].width,2048);assert.equal(wires.at(-1).resolution,'2K');assert.equal(wires.length,5);
 await submitImagegen(asyncRequest,owner);await getImagegenResult(asyncRequest.operationId,owner);assert.equal(wires.length,5,'async recovery never creates another paid POST');


 console.log(`MODIFIED=PASS REQUEST=4K EFFECTIVE=2K QUOTE=${q.requestedCredits} REQUESTED_QUOTE=${quote(actualBilling,billingFacts({modelId:'image-a',resolution:'4K'})).requestedCredits} JSON_SIZE=2048x2048 MULTIPART_SIZE=2048x2048 FINGERPRINT=UNCHANGED HISTORY=UNCHANGED JOBS=5 PLAN_LEGACY_APIB_SETTLED=12 APIB_WIRE=2K IDEMPOTENT=PASS LOOPBACK_POSTS=5 EXTERNAL_CALLS=0`);
 }finally{if(db)await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
