// Actual plan, quote persistence, signed frozen context, request binding,
// executor resolve/describe and APIMart parameter encoder. Only boundary I/O
// (authentication, config repository, media bytes, SQL, billing) is fixture.
// No supplier transport. --baseline records original rejection; --previous
// records the prior successful native-auto behavior, not a failed generation.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(arg('--source-root',root)),sourceRef=arg('--source-ref',null),out=path.resolve(arg('--output-root',path.join(root,'output/capacity-audit-wave2-20261029/x6-auto-fix-20261030/frozen-tests/revised'))),baseline=args.includes('--baseline'),previous=args.includes('--previous');
const fixtureRoot=path.resolve(arg('--fixtures',path.join(root,'output/capacity-audit-wave2-20261029/x6-parameter-diagnosis-20261030')));
fs.mkdirSync(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),loaded=new Map(),cache=new Map(),checks=[],evidence={};
const captured=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'read-live.json'),'utf8')).modelSnapshot;
const owner='x6-frozen@fixture.test',fail=name=>(()=>{throw Error('UNEXPECTED_BOUNDARY:'+name)});
const state={models:null,billing:null,modelReads:0,currentReads:0,billingReads:0,inputs:[],quotes:[],dbEnabled:true,job:null,sql:[],supplierCalls:0,network:0,modelsByVersion:new Map(),billingsByVersion:new Map()};
const creationScope=()=>({actorEmail:owner,scopeKind:'personal',tenantId:null,parentContext:'tree:x6-fixture'});
class FeatureAccessError extends Error{constructor(message){super(message);this.status=403;}}
const db={query:async(sql,p=[])=>{state.sql.push({sql,p});
 if(sql.includes('SELECT * FROM app_image_jobs WHERE id=$1 AND kind=$2'))return {rows:state.job&&state.job.id===p[0]&&state.job.kind===p[1]?[structuredClone(state.job)]:[]};
 if(sql.includes("payload->'creationScope' AS scope"))return {rows:state.job&&state.job.id===p[0]&&state.job.email===p[1]?[{scope:state.job.payload.creationScope,request:state.job.payload.plan.request}]:[]};
 if(sql.startsWith('SELECT to_regclass'))return {rows:[{name:null}]};
 if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory)/.test(sql))return {rows:[]};
 if(sql.includes('UPDATE app_image_jobs SET lease_token='))return {rows:[],rowCount:0};
 if(sql.includes('FROM app_image_jobs'))return {rows:[],rowCount:0};
 throw Error('UNEXPECTED_SQL:'+sql);
},connect:async()=>({...db,release:()=>{}})};
const boundaries={
 'src/app/api/generate-image/route.ts':{POST:async request=>{const f=await request.formData();state.generated={fields:Object.fromEntries([...f].filter(([,v])=>typeof v==='string')),inputFiles:f.getAll('image').length,step:structuredClone(load('src/lib/imagegen/context.ts').currentImagegenStep())};return Response.json({jobId:'fixture-child'})}},
 'src/lib/db.ts':{get dbEnabled(){return state.dbEnabled},ensureSchema:async()=>{},getPool:()=>db,listArtworksByIds:async()=>[],addArtworks:fail('addArtworks'),getSetting:async()=>null,totalPaidCents:async()=>0},
 'src/lib/admin-auth.ts':{resolveUserEmail:async()=>owner},
 'src/lib/settings-secret.ts':{settingsSecret:()=> 'x6-fixture-only-settings-secret-not-production',workerSecret:()=> 'x6-fixture-only-worker-secret-not-production'},
 'src/lib/settings.ts':{getOpenAISettings:async()=>({}),getCutoutSettings:async()=>({backend:'openai'})},
 'src/lib/feature-access/server.ts':{FeatureAccessError,userFeaturePolicy:async()=>({mode:'default',allowed:[]})},
 'src/lib/saas/creation-context.ts':{currentCreationContext:creationScope,assertCurrentCreationFeature:async()=>{},withFrozenCreation:(_c,run)=>run(),frozenCreationScope:(v,email)=>{assert.equal(v.actorEmail,email);return v}},
 'src/lib/saas/creation-writer.ts':new Proxy({},{get:(_t,k)=>fail('creation-writer:'+String(k))}),
 'src/lib/canvas/image-version-store.ts':{assertCanvasRegeneration:async()=>{},attachCanvasImageVersions:fail('attach')},
 'src/lib/image-skills/server.ts':{resolveImageSkill:async()=>null},
 'src/lib/imagegen/inputs.ts':{readImagegenInputs:async request=>request.inputs.map(i=>{const found=state.inputs.find(x=>x.artworkId===i.artworkId);assert(found,'owned fixture input');return {...found,...i}})},
 'src/lib/model-config/server.ts':{getModelAdministration:async()=>admin},
 'src/lib/model-config/clients.ts':{executionOpenAI:fail('supplier-client'),modelAwareOpenAI:fail('supplier-client')},
 'src/lib/billing/server.ts':{quoteForActor:async(_owner,input,options)=>{
  assert.equal(_owner,owner);const facts={metered:true,byok:false,paidFen:0,userGroup:'default',...input};state.quotes.push({facts:structuredClone(facts),options});
  // Real business tariff selection, unchanged-customer-price policy, effective
  // delivery selection and compiler. Actor lookup alone remains a boundary.
  const snapshot=load('src/lib/model-config/context.ts').currentModelBillingSnapshot()||state.billing;
  return load('src/lib/model-config/business-billing.ts').freezeBusinessQuote(new Request('http://fixture/api/billing/quote'),snapshot,facts,load('src/lib/billing/quote.ts').quote,options);
 },getBillingRuntime:async()=>({config:admin.billing})},
 'src/lib/canvas-image-input.ts':{readCanvasOutput:fail('media-read'),readCanvasImage:fail('media-read')},
 'src/lib/imagegen/adapters.ts':{executeImagegenStep:async()=>{state.supplierCalls++;throw Error('SUPPLIER_FORBIDDEN')}},
 'src/lib/canvas-local-image-edit.ts':{saveCanvasLocalEdit:fail('local-edit')},
 'src/lib/imagegen/input-assets.ts':{readImagegenInputAsset:fail('asset-read')},
 'src/lib/imagegen/postprocess.ts':{inspectImagegenPixels:fail('pixel-read')},
 'src/lib/imagegen/stored-delivery.ts':{storedDeliveryState:fail('stored-delivery'),recoverStoredDelivery:fail('stored-delivery')},
 'src/lib/bi/model-observer.ts':{withBiModelContext:(_c,run)=>run()},
};
function read(rel){const policy=rel==='scripts/repair-x6-automatic-parameters-policy.ts',actual=policy?path.join(root,rel):sourceRef?`git:${sourceRef}:${rel}`:fs.existsSync(path.join(source,rel))?path.join(source,rel):path.join(root,rel),bytes=sourceRef&&!policy?cp.execFileSync('git',['show',sourceRef+':'+rel],{cwd:root,stdio:['ignore','pipe','pipe']}):fs.readFileSync(actual);loaded.set(rel,{path:actual,sha256:hash(bytes)});return bytes.toString('utf8');}
function resolve(from,id){if(id.startsWith('@/'))return 'src/'+id.slice(2);if(id.startsWith('.'))return path.posix.normalize(path.posix.join(path.posix.dirname(from),id));return null;}
function load(rel){if(boundaries[rel])return boundaries[rel];if(cache.has(rel))return cache.get(rel).exports;const m={exports:{}};cache.set(rel,m);
 if(rel.endsWith('.json')){m.exports=JSON.parse(read(rel));return m.exports;}
 const js=ts.transpileModule(read(rel),{fileName:rel,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const req=id=>{if(id==='server-only')return {};if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});const p=resolve(rel,id);if(!p)return require(id);for(const ext of ['','.ts','.tsx','.json','/index.ts'])if(fs.statSync(path.join(root,p+ext),{throwIfNoEntry:false})?.isFile())return load(p+ext);throw Error('MODULE_NOT_FOUND:'+id+' from '+rel)};
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:rel})(req,m,m.exports);return m.exports;
}
const admin={repo:{current:async()=>{state.modelReads++;state.currentReads++;return structuredClone(state.models)},byVersion:async v=>{state.modelReads++;assert(state.modelsByVersion.has(v),'known immutable model version');return structuredClone(state.modelsByVersion.get(v))}},billing:{current:async()=>{state.billingReads++;return structuredClone(state.billing)},byVersion:async v=>{state.billingReads++;assert(state.billingsByVersion.has(v),'known immutable billing version');return structuredClone(state.billingsByVersion.get(v))}},runtime:{byVersion:async v=>admin.repo.byVersion(v),prepareExecution:fail('external-router')},credentials:{read:async()=> 'fixture-not-a-key'},trustedOrigins:[]};
function reset(repaired=true){
 const config=structuredClone(captured.config);for(const [i,p]of config.providers.entries())if(p.credentialRef)p.credentialRef='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
 admin.trustedOrigins=config.providers.map(p=>new URL(p.baseUrl).origin);process.env.MODEL_CONFIG_TRUSTED_ORIGINS=admin.trustedOrigins.join(',');
 const canonical=load('src/lib/model-config/repository.ts').canonicalConfig;
 const old={version:152,digest:hash(canonical(config)),config};
 const modified=repaired?load('scripts/repair-x6-automatic-parameters-policy.ts').repairX6AutomaticParameters(config):structuredClone(config);
 state.models={version:repaired?153:152,digest:hash(canonical(modified)),config:modified};state.modelsByVersion=new Map([[152,old],[state.models.version,structuredClone(state.models)]]);
 state.billing=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'read-sample.json'),'utf8')).billingSnapshot;state.billingsByVersion=new Map([[state.billing.version,structuredClone(state.billing)]]);
 state.inputs=[{artworkId:'x6-source',role:'edit-target',width:941,height:1672,buffer:Buffer.from('input-pixels-fixture-not-decoded-here'),mimeType:'image/png'}];state.quotes=[];state.modelReads=0;state.currentReads=0;state.billingReads=0;state.dbEnabled=true;state.job=null;state.sql=[];
}
function request(modelId,ratio='auto'){return {version:1,operationId:crypto.randomUUID(),entry:'canvas',mode:'edit',prompt:'换成红色',inputs:[{artworkId:'x6-source',role:'edit-target'}],modelId,parameters:{ratio,quality:'medium',resolution:'1K'},output:{format:'png'},variants:3};}
const models=['jimeng-image-5.0-pro','gemini-3.0-pro-image-portrait','gemini-3.1-flash-image-portrait'];
function ok(name){checks.push(name);console.log('PASS '+name);}
async function bind(plan){
 const {withImagegenStep}=load('src/lib/imagegen/context.ts'),{withModelRequest}=load('src/lib/model-config/requests.ts'),context=load('src/lib/model-config/context.ts'),{signAcceptedModelContext}=load('src/lib/model-config/accepted-context.ts'),params=load('src/lib/model-config/apimart-image-parameters.ts'),{apimartExecutionParameters}=load('src/lib/model-config/apimart-preset.ts');
 const step=plan.steps[0],form=new FormData();for(const [k,v]of Object.entries({origin:'canvas',entry:'imagegen',model:step.modelId,prompt:plan.request.prompt,ratio:plan.request.parameters.ratio,quality:plan.request.parameters.quality,resolution:step.parameters.resolution,count:'3'}))form.set(k,v);
 form.append('image',new File([new Uint8Array([1,2,3])],'fixture.png',{type:'image/png'}));
 const http=new Request('http://fixture/api/generate-image',{method:'POST',headers:{'x-naumi-feature-model':step.modelId,'x-naumi-accepted-model-context':signAcceptedModelContext(owner,{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion})},body:form});
 return withImagegenStep(plan.request,plan.intent,()=>withModelRequest(http,async()=>{
  const scope=context.currentModelExecution('image');assert(scope);const targets=scope.supplierRouting?.targets.map(t=>t.scope)||[scope];
  return {frozen:structuredClone(scope.frozen),targets:targets.map(t=>{
   const selected=apimartExecutionParameters(t,{quality:'stale-body',size:'1:1'},step.billingQuote,{quality:plan.request.parameters.quality,resolution:String(step.parameters.resolution),ratio:step.billingQuote.facts.ratio});
   return {upstream:t.channelGuard?.upstreamId,model:t.connection.wireModel,selected,parameters:params.apimartImageParameters(t,selected)};
  })};
 }),plan.ratioContractVersion,plan.requestedParameters,step.eligibleUpstreamIds,{owner,operationId:crypto.randomUUID(),quote:step.billingQuote});
}
async function main(){
 const envKeys=['NAUMI_ROUTER_MANAGEMENT_URL','MODEL_CONFIG_TRUSTED_ORIGINS','NAUMI_RELEASE_RUNTIME'],originalEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 const originalFetch=global.fetch;global.fetch=async()=>{state.network++;throw Error('NETWORK_FORBIDDEN')};process.env.NAUMI_ROUTER_MANAGEMENT_URL='https://fixture.invalid';process.env.NAUMI_RELEASE_RUNTIME='0';
 try{
  const planApi=load('src/lib/imagegen/plan.ts'),quoteApi=load('src/lib/imagegen/quotes.ts');
  for(const modelId of models){
   reset(!baseline);const raw=request(modelId),before=JSON.stringify(raw);
   if(baseline){await assert.rejects(planApi.planImagegen(raw,owner),e=>{evidence[modelId]={code:e.code,message:e.message};return e.code==='IMAGEGEN_NO_CHANNEL'||e.code==='IMAGEGEN_EDIT_UNSUPPORTED'||e.code==='IMAGEGEN_RATIO_UNSUPPORTED'});assert.equal(state.quotes.length,0);ok(modelId+':BASELINE_941_1672_BLOCKED_BEFORE_QUOTE');continue;}
   const effective=previous?'auto':'9:16',pricedRatio=previous?'auto':'941:1672';
   const plan=await planApi.planImagegen(raw,owner);assert.equal(JSON.stringify(raw),before);assert.equal(plan.request.parameters.ratio,effective);
   if(previous){assert.equal(plan.automaticFrame.sourceRatio,'941:1672');assert.equal(plan.frameChoice,undefined);}else{assert.deepEqual(plan.frameChoice,{target:'941:1672',effective:'9:16',source:'reference',method:'nearest'});assert.equal(plan.automaticFrame,undefined);}
   const q=plan.steps[0].billingQuote;assert.equal(q.facts.ratio,pricedRatio);assert.equal(plan.totalCredits,18);
   if(!previous){assert.equal(q.requestedParameters.ratio,'941:1672');assert.equal(q.effectiveParameters.ratio,'9:16');assert.equal(plan.requestedParameters.ratio,'941:1672');}
   ok(modelId+(previous?':PREVIOUS_NATIVE_AUTO_SUCCEEDED':':REFERENCE_NEAREST_9_16_REAL_TARIFF_ORIGINAL_TARGET'));
   state.dbEnabled=false;const issued=await quoteApi.issueImagegenQuote(raw,owner,plan);assert(issued.quote?.id);assert.equal(issued.steps[0].billingQuote,undefined);const saved=await quoteApi.readImagegenQuote(issued.quote.id,owner,raw.operationId);assert.equal(saved.plan.steps[0].billingQuote.imageParameterPlans[plan.steps[0].eligibleUpstreamIds[0]].wire.size,effective);ok(modelId+':SERVER_QUOTE_FREEZES_EFFECTIVE_AND_HIDES_BILLING');
   state.dbEnabled=true;const bound=await bind(plan);assert.equal(bound.frozen.facts.ratio,effective);assert.equal(bound.frozen.modelVersion,153);assert(bound.targets.length);for(const t of bound.targets){assert.equal(t.selected.ratio,effective);assert.equal(t.parameters.upstream.size,effective);assert.equal(t.parameters.requested.ratio,effective);if(previous)assert.equal(t.parameters.expectedPixels,undefined);}evidence[modelId]={raw,plan,bound};ok(modelId+':SIGNED_REQUEST_EXECUTOR_AND_APIMART_EFFECTIVE_NOT_ORIGINAL');
   if(!previous){const response=await load('src/lib/imagegen/generation-core.ts').submitGenerationCore(plan,plan.steps[0].key,owner);assert.equal(response.status,200);assert.equal(state.generated.fields.ratio,'9:16');assert.equal(state.generated.fields.userPrompt,raw.prompt);assert.equal(state.generated.inputFiles,1);assert.equal(state.generated.step.request.parameters.ratio,'9:16');assert.equal(state.generated.step.requestedParameters.ratio,'941:1672');ok(modelId+':REAL_GENERATION_CORE_PRESERVES_EFFECTIVE_FRAME_AND_ORIGINAL_AUDIT');}
   const oldPlan=JSON.stringify(plan),currentReads=state.currentReads;
   state.models=structuredClone(state.models);state.models.version=154;state.models.config.publicModels.find(m=>m.id===plan.steps[0].modelId).enabled=false;state.models.digest='b'.repeat(64);state.modelsByVersion.set(154,structuredClone(state.models));state.billing={...state.billing,version:9};state.billingsByVersion.set(9,structuredClone(state.billing));
   state.dbEnabled=false;const reads=state.modelReads,prices=state.billingReads;const recovered=await quoteApi.frozenImagegenQuote(raw,owner,{quoteId:issued.quote.id,confirmed:true});assert.equal(JSON.stringify(recovered),oldPlan);assert.equal(state.modelReads,reads);assert.equal(state.billingReads,prices);state.dbEnabled=true;
   const rebound=await bind(recovered);assert.equal(state.currentReads,currentReads);assert.equal(rebound.frozen.modelVersion,153);assert.equal(rebound.frozen.billingVersion,8);assert.deepEqual(rebound,bound);ok(modelId+':LIVE_CONFIG_DRIFT_REOPENS_IMMUTABLE_ORIGINAL_WIRE');
  }
  if(!baseline)for(const modelId of models){
   reset(true);const explicit=request(modelId,'9:21');
   if(previous){await assert.rejects(planApi.planImagegen(explicit,owner),e=>e.code==='IMAGEGEN_RATIO_UNSUPPORTED');ok(modelId+':PREVIOUS_EXPLICIT_UNSUPPORTED_REJECTED');continue;}
   const p=await planApi.planImagegen(explicit,owner),effective=modelId===models[0]?'9:16':'1:2',q=p.steps[0].billingQuote;assert.deepEqual(p.frameChoice,{target:'9:21',effective,source:'explicit',method:'nearest'});assert.equal(q.facts.ratio,'9:21');assert.equal(q.requestedParameters.ratio,'9:21');assert.equal(q.effectiveParameters.ratio,effective);assert.equal(q.requestedCredits,18);const b=await bind(p);assert.equal(b.frozen.facts.ratio,effective);assert(b.targets.every(t=>t.selected.ratio===effective&&t.parameters.upstream.size===effective));ok(modelId+':EXPLICIT_UNSUPPORTED_NEAREST_PRICE_AND_WIRE_SPLIT');
   const supported=await planApi.planImagegen(request(modelId,'3:4'),owner);assert.equal(supported.frameChoice,undefined);assert.equal(supported.request.parameters.ratio,'3:4');assert.equal(supported.steps[0].billingQuote.facts.ratio,'3:4');assert((await bind(supported)).targets.every(t=>t.parameters.upstream.size==='3:4'));ok(modelId+':EXPLICIT_SUPPORTED_3_4_UNCHANGED');
  }
  if(!baseline){
   reset(false);const raw=request(models[0],'3:4'),old=await planApi.planImagegen(raw,owner);state.dbEnabled=false;const issued=await quoteApi.issueImagegenQuote(raw,owner,old);const oldText=JSON.stringify(old);const repaired=load('scripts/repair-x6-automatic-parameters-policy.ts').repairX6AutomaticParameters(state.models.config);const canonical=load('src/lib/model-config/repository.ts').canonicalConfig;state.models={version:153,digest:hash(canonical(repaired)),config:repaired};state.modelsByVersion.set(153,structuredClone(state.models));const recovered=await quoteApi.frozenImagegenQuote(raw,owner,{quoteId:issued.quote.id,confirmed:true});assert.equal(JSON.stringify(recovered),oldText);state.dbEnabled=true;const bound=await bind(recovered);assert.equal(bound.frozen.modelVersion,152);assert.equal(bound.frozen.facts.ratio,'3:4');assert(bound.targets.every(t=>t.parameters.upstream.size==='3:4'));ok('PREVIOUS_V152_QUOTE_3_4_UNCHANGED_AFTER_NEW_AUTO_PUBLICATION');
   const oldUnknown=structuredClone(old);state.job={id:'imagegen-'+raw.operationId,kind:'imagegen',email:owner,lease_token:null,billing_settled:false,snapshot:{status:'error',paidOperationVersion:1,fingerprint:old.fingerprint,children:{generate:{state:'starting'}},result:{operationId:raw.operationId,jobId:'imagegen-'+raw.operationId,status:'failed',stage:'generating',artifacts:[],chargedCredits:0,error:{code:'SUBMISSION_UNKNOWN',message:'fixture accepted unknown'}}},payload:{creationScope:creationScope(),plan:oldUnknown}};
   const jobBefore=JSON.stringify(state.job),reads=state.modelReads,prices=state.billingReads;const result=await load('src/lib/imagegen/dispatch.ts').submitImagegen(raw,owner);assert.equal(result.error.code,'SUBMISSION_UNKNOWN');assert.equal(JSON.stringify(state.job),jobBefore);assert.equal(state.modelReads,reads);assert.equal(state.billingReads,prices);assert.equal(state.supplierCalls,0);ok('UNKNOWN_ORIGINAL_RECEIPT_NO_REPLAN_NO_REPLAY_NO_REWRITE');
  }
  if(!baseline&&!previous){
   const previousFile=path.resolve(arg('--previous-evidence',path.join(root,'output/capacity-audit-wave2-20261029/x6-auto-fix-20261030/frozen-tests/revised-previous/RESULT.json'))),previousResult=JSON.parse(fs.readFileSync(previousFile,'utf8'));
   assert.equal(previousResult.phase,'PREVIOUS_NATIVE_AUTO');reset(true);
   for(const modelId of models){
    const record=previousResult.evidence[modelId];assert(record?.plan.automaticFrame&&record.plan.request.parameters.ratio==='auto');state.dbEnabled=false;
    const issued=await quoteApi.issueImagegenQuote(record.raw,owner,record.plan),recovered=await quoteApi.frozenImagegenQuote(record.raw,owner,{quoteId:issued.quote.id,confirmed:true});assert.deepEqual(recovered,record.plan);state.dbEnabled=true;
    const b=await bind(recovered);assert(b.targets.every(t=>t.parameters.upstream.size==='auto'&&t.selected.ratio==='auto'));ok(modelId+':OLD_NATIVE_AUTO_QUOTE_STAYS_AUTO_NOT_NEW_NEAREST');
   }
   const saved=previousResult.evidence[models[0]].plan;
   for(const source of ['reference','explicit']){
    // Explicit frozen-plan fixture for the terminal native-auto branch. This
    // checks the real submission prompt/form seam, not reachability for v152.
    const fixture=structuredClone(saved);delete fixture.automaticFrame;fixture.frameChoice={target:source==='reference'?'941:1672':'9:21',effective:'auto',source,method:'provider-auto'};
    const response=await load('src/lib/imagegen/generation-core.ts').submitGenerationCore(fixture,fixture.steps[0].key,owner);assert.equal(response.status,200);assert.equal(state.generated.fields.ratio,'auto');assert(state.generated.fields.prompt.includes(fixture.frameChoice.target));assert(state.generated.fields.prompt.includes(source==='reference'?'所选参考图':'用户选择'));assert.equal(state.generated.fields.userPrompt,'换成红色');assert.equal(state.generated.inputFiles,1);ok('PROVIDER_AUTO_TERMINAL_PROMPT_TARGET_'+source.toUpperCase());
   }
   evidence.previousNativeAuto={sourceRef:previousResult.sourceRef,sha256:hash(fs.readFileSync(previousFile)),path:previousFile};
  }
  if(!baseline&&!previous){
   const aliases=[];
   for(const mode of ['auto','explicit']){
    reset(true);const upstream=state.models.config.upstreamModels.find(u=>u.id==='apib:gemini-3-pro-image-preview');upstream.parameterMap.apimartImages.ratios=['16:9'];
    state.models.digest=hash(load('src/lib/model-config/repository.ts').canonicalConfig(state.models.config));state.modelsByVersion.set(state.models.version,structuredClone(state.models));state.inputs[0].width=1024;state.inputs[0].height=1024;
    const raw=request(models[1],mode==='auto'?'auto':'1:1'),plan=await planApi.planImagegen(raw,owner),bound=await bind(plan);
    assert.equal(plan.steps[0].modelId,'gemini-3.0-pro-image-square');assert.equal(plan.steps[0].billingQuote.facts.modelId,plan.steps[0].modelId);assert.equal(plan.frameChoice.target,'1:1');assert.equal(plan.frameChoice.effective,'16:9');
    aliases.push({mode,targetRatio:plan.frameChoice.target,effectiveRatio:plan.frameChoice.effective,planModelId:plan.steps[0].modelId,quoteModelId:plan.steps[0].billingQuote.facts.modelId,boundModelId:bound.frozen.publicModelId,wire:bound.targets.map(t=>t.parameters.upstream.size)});
   }
   evidence.aliases=aliases;fs.writeFileSync(path.join(out,'ALIAS_CASE.json'),JSON.stringify(aliases,null,2));
   for(const row of aliases){console.log('ALIAS_CASE '+JSON.stringify(row));assert.equal(row.boundModelId,row.planModelId,'effective-frame fallback must not re-route frozen public model identity');assert(row.wire.every(r=>r==='16:9'));ok('FRAME_FALLBACK_FROZEN_MODEL_ALIAS_'+row.mode.toUpperCase());}
  }
  assert.equal(state.network,0);assert.equal(state.supplierCalls,0);ok('NETWORK_0_SUPPLIER_0');
  const exit=baseline?1:0;const result={phase:baseline?'BASELINE':previous?'PREVIOUS_NATIVE_AUTO':'MODIFIED',checks,evidence,source,sourceRef,loaded:[...loaded].map(([file,v])=>({file,...v})),modelConfigFixtureSha256:hash(fs.readFileSync(path.join(fixtureRoot,'read-live.json'))),network:state.network,supplierCalls:state.supplierCalls,exit};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));
  console.log(`X6_FROZEN_AUTO=${baseline?'REPRODUCED':previous?'PREVIOUS_PASS':'PASS'} CHECKS=${checks.length} NETWORK=0 SUPPLIER_CALLS=0 EXIT=${exit}`);process.exitCode=exit;
 }finally{global.fetch=originalFetch;for(const [key,value]of Object.entries(originalEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
main().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,checks,loaded:[...loaded],sql:state.sql},null,2));console.error(error);process.exitCode=1});
