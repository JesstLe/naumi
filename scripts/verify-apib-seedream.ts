import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { createModelFixture } from './model-config-fixture';
import { fixtureConfig } from './billing-unit-fixture';
import { makeSeedreamPlan, rollbackSeedream, applySeedreamDelta } from './lib/apib-seedream.mjs';
import { digest } from './lib/apib-activation.mjs';
import { verifyLocalSeedream, runSeedream } from './ops/apib-seedream';
import { seedreamPreflight } from '../src/lib/model-config/seedream-preflight';
import { publicModelCatalog } from '../src/lib/model-config/runtime';

const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const contract=read('docs/providers/apib-seedream-20261020.json');
const source=Object.fromEntries(contract.models.map((m:any)=>[m.id,readFileSync(m.source.path)]));
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
async function main(){
 let checks=0,uploads=0,posts=0,gets=0,origin='',lose=true,routerActivations=0,state='',lastPayload:any;const tasks=new Map<string,string>(),pubs=new Map<string,any>();
 const png=await sharp({create:{width:256,height:256,channels:3,background:'white'}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{
  const url=new URL(req.url!,origin);
  if(url.pathname==='/v1/uploads/images'){uploads++;for await(const _ of req){}res.end(JSON.stringify({url:'https://fixture.invalid/ref.png'}));return;}
  if(url.pathname.startsWith('/v1/tasks/')){gets++;const id=url.pathname.split('/').at(-1)!;res.end(JSON.stringify({data:{id,model:tasks.get(id),status:'completed',result:{images:[{url:[origin+'/media/output.png']}]}}}));return;}
  if(url.pathname==='/media/output.png'){res.end(png);return;}
  posts++;const chunks=[];for await(const c of req)chunks.push(c);const payload=JSON.parse(Buffer.concat(chunks).toString());lastPayload=payload;assert.equal(payload.output_format,'png');assert.equal(payload.quality,undefined);assert.equal(payload.n,1);assert.equal(payload.resolution,payload.model==='seedream-5-0-pro'?'2K':'1K');const id='task_'+posts;tasks.set(id,payload.model);res.end(JSON.stringify({data:[{task_id:id}]}));
 });origin=f.origin;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,MODEL_CONFIG_TRUSTED_ORIGINS:origin,NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_MULTI_USER:'1'});
 const db=await import('../src/lib/db');
 try{
  const {ensureSupplierSchema}=await import('../src/lib/supplier-cost/schema');
  const {createModelRuntime}=await import('../src/lib/model-config/runtime');
  const {apimartImagesFetch,apimartExecutionParameters}=await import('../src/lib/model-config/apimart-preset');
  const {executionFetch}=await import('../src/lib/model-config/clients');
  const {runModelExecution}=await import('../src/lib/model-config/context');
  const {withImageOperation,ImageOperationPending}=await import('../src/lib/image-gateway');
  const c=f.config;c.publicModels[0].id='jimeng-image-5.0-pro';c.publicModels[0].label='即梦 5.0 Pro';c.publicModels[0].displayResolutions=['1K','2K','4K'];c.publicModels[0].target={type:'upstream',id:'local-jimeng-50-pro'};c.publicModels[0].toolScope={systems:['canvas'],features:['canvas.image','image.generate'],defaultFor:[]};
  c.upstreamModels[0].id='local-jimeng-50-pro';c.upstreamModels[0].model='jimeng/jimeng-image-5.0-pro';c.upstreamModels[0].capabilities={...c.upstreamModels[0].capabilities,verified:false,edit:true,generate:true,qualities:['medium'],nativeResolutions:['2K','4K'],maxReferenceImages:10};c.upstreamModels[0].parameterMap={qualityPolicy:{mode:'omit',choices:[{id:'medium',label:'标准'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'ratio',values:{'1K':'1.5k','2K':'2k','4K':'4k'}}};
  c.providers[0].options={imageAdapter:'reverse-hub',imageRatios:contract.existingRatioUi};c.bindings={'image.generate':'jimeng-image-5.0-pro','image.edit':'jimeng-image-5.0-pro'};
  const key=await f.credentials.importPlain({providerId:'apib-image',plain:'fixture-apib',actor:'fixture'});c.providers.push({id:'apib-image',name:'APIB fixture',enabled:true,baseUrl:contract.baseUrl,protocol:'apimart-images',credentialRef:key.id,timeoutMs:1000,maxConcurrent:1});
  for(const m of contract.models)c.upstreamModels.push({id:m.upstreamId,providerId:'apib-image',model:m.id,label:m.id,modality:'image',enabled:false,capabilities:{verified:false,generate:false,edit:false,vision:false,transparent:false,preserveIdentity:false,textAccuracy:false,qualityRank:1,qualities:[],nativeResolutions:[],maxReferenceImages:0,expectedLatencyMs:0},parameterMap:{}});
  await db.ensureSchema();await ensureSupplierSchema(f.sql);const baseline=await f.repo.current(),billing={version:8,config:fixtureConfig()};let liveBilling=billing;
  const plan=makeSeedreamPlan(baseline,billing,contract,source);assert.equal(plan.delta.length,55);assert.deepEqual(rollbackSeedream(plan.config,plan),baseline.config);assert.deepEqual(applySeedreamDelta(baseline.config,plan.delta),plan.config);checks++;
  const result=verifyLocalSeedream(plan,baseline,billing,contract,[origin]);assert.equal(result.combinations,210);assert.equal(result.conflicts.length,11);checks++;
  const admin=structuredClone(plan.config);admin.publicModels[0].supplierRouting!.mode='balanced';admin.publicModels[0].supplierRouting!.channels[0].weight=9;admin.upstreamModels[0].label='later label';const inverse=rollbackSeedream(admin,plan);assert.equal(inverse.publicModels[0].supplierRouting!.channels[0].weight,9);assert.equal(inverse.publicModels[0].supplierRouting!.mode,'balanced');assert.equal(inverse.upstreamModels[0].label,'later label');checks++;
  const conflict=structuredClone(plan.config);conflict.publicModels[0].supplierRouting!.channels[1].weight=2;assert.throws(()=>rollbackSeedream(conflict,plan));checks++;
  const redacted=structuredClone(baseline);(redacted as any).audit={redacted:true};assert.throws(()=>makeSeedreamPlan(redacted,billing,contract,source));checks++;
  // Catalog: independent models only; preserve mixed Pro main, disabled and admin choices.
  const catalog=(config:any)=>publicModelCatalog({...baseline,config},'image','canvas.image',true).models;
  const disabled=structuredClone(plan.config);disabled.upstreamModels.find((u:any)=>u.id==='apib:seedream-4-0')!.enabled=false;
  assert.equal(catalog(disabled).find(m=>m.id==='jimeng-image-4.0')?.generationParameters?.ratios,undefined);checks++;
  const explicit=structuredClone(plan.config);explicit.business={'canvas.image':{enabled:true,defaultModelId:'jimeng-image-4.0',options:[{modelId:'jimeng-image-4.0',enabled:true,sort:0,parameters:{ratios:['1:1']}}]}} as any;
  assert.deepEqual(catalog(explicit)[0].generationParameters?.ratios,['1:1']);checks++;
  const other=structuredClone(plan.config);other.upstreamModels.find((u:any)=>u.id==='apib:seedream-4-0')!.model='other-wire';assert.equal(catalog(other).find(m=>m.id==='jimeng-image-4.0')?.generationParameters?.ratios,undefined);checks++;
  const wrongProtocol=structuredClone(plan.config);wrongProtocol.providers.find((p:any)=>p.id==='apib-image')!.protocol='openai-images';assert.equal(catalog(wrongProtocol).find(m=>m.id==='jimeng-image-4.0')?.generationParameters?.ratios,undefined);checks++;

  const root=resolve('output/apib-seedream-fixture',randomUUID());mkdirSync(root,{recursive:true});for(const [n,v] of Object.entries({'PLAN.json':plan,'ORIGINAL_MODEL.json':baseline,'ORIGINAL_BILLING.json':billing,'PARAMETER_CONTRACT.json':contract}))writeFileSync(join(root,n),JSON.stringify(v));
  const router:any={seal:()=>({}),prepare:async()=>{},state:async()=>state,status:async(id:string)=>pubs.get(id)||null,activate:async(id:string,old:string,next:string)=>{assert.equal(old,state);routerActivations++;state=next;const p={id,digest:next,phase:'applied'};pubs.set(id,p);if(lose){lose=false;throw Error('lost fixture response');}return p;}};
  const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,billing:async()=>liveBilling,billingByVersion:async()=>liveBilling,trustedOrigins:[origin]});const a={repo:f.repo,runtime,credentials:f.credentials,billing:{current:async()=>liveBilling},trustedOrigins:[origin]};
  await assert.rejects(()=>runSeedream('PLAN',root,a,undefined,false));
  const recipeRoot=resolve('output/apib-seedream-fixture',randomUUID());mkdirSync(recipeRoot,{recursive:true});const {config:omittedConfig,...recipe}=plan;
  writeFileSync(join(recipeRoot,'PLAN.json'),JSON.stringify({...recipe,recipeOnly:true,expectedNormalizedBillingHash:digest({version:billing.version,config:(await import('../src/lib/billing/rules/schema')).validateBillingConfig(billing.config)})}));writeFileSync(join(recipeRoot,'PARAMETER_CONTRACT.json'),JSON.stringify(contract));
  await runSeedream('PLAN',recipeRoot,a,undefined,true);assert.deepEqual(read(join(recipeRoot,'MATERIALIZED_PLAN.json')).config,plan.config);checks++;
  await runSeedream('PLAN',root,a,undefined,true);await assert.rejects(()=>runSeedream('APPLY',root,a,undefined,true),/Retain original UUID/);await runSeedream('APPLY',root,a,undefined,true);await runSeedream('APPLY',root,a,undefined,true);assert.equal(routerActivations,1);await runSeedream('VERIFY',root,a,undefined,true);checks++;
  assert.equal(uploads+posts+gets,0,'Admin publication tests cannot call supplier fixture');
  const current=await f.repo.current(),later=structuredClone(current.config);later.upstreamModels[0].label='later label';later.publicModels[0].supplierRouting!.channels[0].weight=9;const draft=await f.repo.draft('later-admin'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:later,actor:'later-admin'});await runtime.publish({id:randomUUID(),draftId:draft.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:'later-admin',reason:'fixture'});liveBilling={version:9,config:structuredClone(billing.config)};
  await runSeedream('ROLLBACK',root,a,undefined,true);const rolled=await f.repo.current();assert.equal(rolled.config.upstreamModels[0].label,'later label');assert.equal(rolled.config.publicModels[0].supplierRouting!.channels[0].weight,9);assert.equal(liveBilling.version,9);const count=routerActivations;await runSeedream('ROLLBACK',root,a,undefined,true);assert.equal(routerActivations,count);checks++;

  // File helpers test exact boundaries with real image metadata; virtual file
  // sizes below exercise byte thresholds without allocating 30MB padding.
  const file=async(w:number,h:number,type='image/png')=>new File([new Uint8Array(await sharp({create:{width:w,height:h,channels:3,background:'white'}}).png().toBuffer())],'ref.png',{type});
  const image=await file(256,256),at3=await file(45,15),atThird=await file(15,45),at16=await file(240,15),atSixteenth=await file(15,240);
  for(const im of [at3,atThird]){await seedreamPreflight('seedream-4-0','字'.repeat(1000),[im],1);checks++;}
  for(const im of [at16,atSixteenth]){await seedreamPreflight('seedream-5-0-pro','ok',[im],1);checks++;}
  for(const [model,im] of [['seedream-4-0',await file(46,15)],['seedream-4-0',await file(15,46)],['seedream-5-0-pro',await file(241,15)],['seedream-5-0-pro',await file(15,241)],['seedream-4-0',await file(14,15)]] as const){await assert.rejects(()=>seedreamPreflight(model,'ok',[im],1));checks++;}
  await seedreamPreflight('seedream-4-0','😀'.repeat(1000),[],1);await assert.rejects(()=>seedreamPreflight('seedream-4-0','😀'.repeat(1001),[],1));checks++;
  for(const [model,limit] of [['seedream-4-0',10_000_000],['seedream-5-0-pro',30_000_000]] as const){const virtual={type:'image/png',size:limit,arrayBuffer:()=>image.arrayBuffer()} as File;await seedreamPreflight(model,'ok',[virtual],1);await assert.rejects(()=>seedreamPreflight(model,'ok',[{...virtual,size:limit+1} as File],1));checks++;}
  const max=await file(6000,6000);await seedreamPreflight('seedream-4-0','ok',[max],1);const tooMany=await file(6001,6000);await assert.rejects(()=>seedreamPreflight('seedream-4-0','ok',[tooMany],1));checks++;
  await seedreamPreflight('gpt-image-2.5-flare','字'.repeat(1001),[{type:'not-image',size:99_000_000} as File],99);checks++;

  // Exercise real apimartImagesFetch + DB with loopback transport. Current
  // active config is baseline again, so retain audited scope (no channelGuard).
  const baseScope={frozen:{modelVersion:baseline.version,billingVersion:8,modelDigest:baseline.digest,publicModelId:'jimeng-image-4.0',binding:'image.generate',modality:'image',target:{type:'upstream',id:'apib:seedream-4-0'},facts:{quality:'medium',resolution:'1K',ratio:'1:1',nativeResolution:false}},connection:{providerId:'apib-image',protocol:'apimart-images',baseUrl:origin+'/v1',apiKey:'fixture-apib',wireModel:'seedream-4-0',timeoutMs:1000},capabilities:{...plan.config.upstreamModels.find((u:any)=>u.id==='apib:seedream-4-0')!.capabilities},parameterMap:{...structuredClone(contract.models[0].parameters),apimartImages:{...contract.models[0].parameters.apimartImages,outputDimensions:{'1K:1:1':{width:256,height:256}}}},audited:true} as any;
  const invoke=(scope:any,unit:string,prompt:string,images:File[]=[],n=1)=>runModelExecution(scope,()=>withImageOperation(scope.frozen.publicModelId,{id:unit},()=>{
   const fetcher=apimartImagesFetch(scope,{trustedOrigins:[origin]},{pollMs:1});
   if(!images.length)return fetcher(origin+'/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,n})});
   const form=new FormData();form.set('prompt',prompt);form.set('n',String(n));for(const im of images)form.append('image[]',im);return fetcher(origin+'/v1/images/edits',{method:'POST',body:form});
  }));
  const effective=structuredClone(baseScope);effective.connection.wireModel='seedream-5-0-pro';effective.frozen.requestedParameters={quality:'medium',resolution:'4K',ratio:'1:1'};effective.frozen.facts.resolution='2K';effective.frozen.facts.requestedResolution='2K';effective.parameterMap.resolutionPolicy.values={'1K':'1K','2K':'2K'};effective.parameterMap.apimartImages.outputDimensions={'2K:1:1':{width:256,height:256}};
  const effectiveRequest=apimartExecutionParameters(effective,{}, {requestedParameters:{quality:'medium',resolution:'4K',ratio:'1:1'},effectiveParameters:{quality:'medium',resolution:'2K',ratio:'1:1'}} as any,{resolution:'4K',ratio:undefined,quality:undefined});
  const frontendQuote=(await import('../src/lib/billing/quote')).quote(billing,{feature:'image.generate',quantity:1,quality:'medium',resolution:'4K',metered:true,byok:false,paidFen:0,userGroup:'user'} as any);const billed={...frontendQuote,requestedParameters:{quality:'medium',resolution:'4K',ratio:'1:1'},effectiveParameters:{quality:'medium',resolution:'2K',ratio:'1:1'}};const preserved=structuredClone(billed);assert.equal(apimartExecutionParameters(effective,{},billed).resolution,'2K');assert.deepEqual(billed,preserved);assert.equal(billed.facts.resolution,'4K');assert.equal(billed.requestedCredits,frontendQuote.requestedCredits);
  assert.equal(effectiveRequest.resolution,'2K');assert.equal(effective.frozen.requestedParameters.resolution,'4K');assert.equal((await import('../src/lib/model-config/apimart-image-parameters')).apimartImageParameters(effective,effectiveRequest).upstream.resolution,'2K');
  const historical=structuredClone(baseScope);historical.frozen.facts.resolution='2K';historical.frozen.facts.requestedResolution='4K';assert.equal(apimartExecutionParameters(historical,{}).resolution,'4K','Do not reinterpret historical audit-only facts without an explicit effective contract');checks++;
  const restoreEffective=structuredClone(effective);restoreEffective.frozen.facts.resolution='4K';restoreEffective.frozen.facts.requestedResolution='2K';assert.equal(apimartExecutionParameters(restoreEffective,{}).resolution,'2K','Explicit frozen effective field, not quote facts billing tier, drives restored execution');
  for(const [prompt,files] of [['字'.repeat(1001),[]],['ok',[await file(46,15)]],['ok',[await file(14,15)]],['ok',[tooMany]],['ok',[new File([new Uint8Array(png)],'x.webp',{type:'image/webp'})]],['ok',[new File([new Uint8Array(Buffer.concat([png,Buffer.alloc(10_000_001-png.length)]))],'x.png',{type:'image/png'})]],['ok',Array.from({length:11},()=>image)]] as [string,File[]][]){const before=[uploads,posts,gets];await assert.rejects(()=>invoke(baseScope,'negative-'+checks,prompt,files));assert.deepEqual([uploads,posts,gets],before);checks++;}
  assert.equal((await invoke(effective,'effective-wire-2K','ok')).status,200);assert.equal(posts,1);assert.equal(uploads,0);checks++;
  assert.equal((await invoke(baseScope,'valid-seedream','ok',[image])).status,200);assert.equal(uploads,1);assert.equal(posts,2);checks++;
  assert.equal((await invoke(baseScope,'valid-seedream','ok',[image])).status,200);assert.equal(uploads,1);assert.equal(posts,2);checks++;
  // Install a historical saved receipt with a preexisting >1000-char prompt.
  // Same frozen request hash is preserved; new input rule must not re-POST.
  const unit='valid-seedream',savedRow=(await f.sql.query('SELECT * FROM app_supplier_calls WHERE billing_unit_id=$1',[unit])).rows[0];const longPrompt='字'.repeat(1001),params=(await import('../src/lib/model-config/apimart-image-parameters')).apimartImageParameters(baseScope,{quality:'medium',resolution:'1K',ratio:'1:1'});
  const requestHash=hash(JSON.stringify({model:'seedream-4-0',params,n:1,prompt:longPrompt,images:[hash(png)],mask:null}));
  await f.sql.query("UPDATE app_supplier_calls SET parameters=jsonb_set(parameters,'{requestHash}',to_jsonb($2::text)) WHERE id=$1",[savedRow.id,requestHash]);
  const beforePosts=posts,beforeUploads=uploads,beforeGets=gets;assert.equal((await invoke(baseScope,unit,longPrompt,[image])).status,200);assert.equal(posts,beforePosts);assert.equal(uploads,beforeUploads);assert.ok(gets>beforeGets);checks++;
  // Unknown accepted marker with no task remains Pending, not a fresh retry.
  await f.sql.query('UPDATE app_supplier_calls SET task_id=NULL WHERE id=$1',[savedRow.id]);await assert.rejects(()=>invoke(baseScope,unit,longPrompt,[image]),ImageOperationPending);assert.equal(posts,beforePosts);assert.equal(uploads,beforeUploads);checks++;
  const refUploads=uploads,refPosts=posts;assert.equal((await invoke(baseScope,'ten-references','ok',Array.from({length:10},()=>image))).status,200);assert.equal(uploads-refUploads,10);assert.equal(posts-refPosts,1);assert.equal(lastPayload.image_urls.length,10);checks++;
  const proScope=structuredClone(effective);for(const [s,n,mask] of [[proScope,2,false],[baseScope,1,true]] as const){const before:number[]=[uploads,posts];
   if(mask){await assert.rejects(()=>runModelExecution(s,()=>withImageOperation(s.frozen.publicModelId,{id:'no-mask'},()=>{const form=new FormData();form.set('prompt','ok');form.append('image',image);form.append('mask',image);return apimartImagesFetch(s,{trustedOrigins:[origin]},{pollMs:1})(origin+'/v1/images/edits',{method:'POST',body:form});})));}
   else await assert.rejects(()=>invoke(s,'no-n2','ok',[],n));assert.deepEqual([uploads,posts],before);checks++;
  }
  console.log(`APIB_SEEDREAM=PASS; CHECKS=${checks}; SOURCES=5; PUBLIC_MODELS=4; STANDBY=1; COMBINATIONS=${result.combinations}; PIXEL_CONFLICTS=${result.conflicts.length}; DECIMAL_MB_AND_36MP=PASS; UNICODE_CODEPOINTS=PASS; CATALOG_PRIORITY=PASS; EFFECTIVE_2K_REQUESTED_4K=PASS; FRONTEND_QUOTE_UNCHANGED=PASS; NEGATIVE_UPLOADS=0; NEGATIVE_SUBMITS=0; SAVED_RECEIPT_QUERY_ONLY=PASS; UNKNOWN_NO_REPOST=PASS; SELECTIVE_ROLLBACK=PASS; REAL_PROVIDER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
