// Actual withModelRequest/createModelExecutor/context and planImagegen/simulateModel.
// Only config/DB/auth/billing/input/media/supplier boundaries are fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(arg('--source-root',root)),out=path.resolve(arg('--output-root',path.join(root,'output/canvas-model-admission'))),baseline=args.includes('--baseline');
const configPath=path.resolve(arg('--config','E:/Workspace/naumi/output/canvas-reported-issues-20261029/live/MODEL_CONFIG_SANITIZED.json'));
fs.mkdirSync(out,{recursive:true});const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),loaded=new Map(),cache=new Map(),checks=[],evidence={};
const captured=JSON.parse(fs.readFileSync(configPath,'utf8')),owner='admission@fixture.test',tenant='11111111-1111-4111-8111-111111111111';
const state={models:null,billing:null,inputs:[],actor:owner,modelReads:0,billingReads:0,quotes:[],supplierCalls:0,network:0,dbEnabled:true,job:null,sql:[]};
class FeatureAccessError extends Error{constructor(message){super(message);this.status=403;}}
const fatal=name=>(()=>{throw Error('Unexpected boundary call: '+name)});
const fakeDb={query:async(sql,p=[])=>{state.sql.push({sql,p});
 if(sql.includes('SELECT * FROM app_image_jobs WHERE id=$1 AND kind=$2'))return {rows:state.job&&state.job.id===p[0]&&state.job.kind===p[1]?[structuredClone(state.job)]:[]};
 if(sql.includes("payload->'creationScope' AS scope"))return {rows:state.job&&state.job.id===p[0]&&state.job.email===p[1]?[{scope:state.job.payload.creationScope,request:state.job.payload.plan.request}]:[]};
 if(sql.startsWith('SELECT to_regclass'))return {rows:[{name:null}]};
 if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory)/.test(sql))return {rows:[]};
 if(sql.includes('UPDATE app_image_jobs SET lease_token='))return {rows:[],rowCount:0};
 if(sql.includes('FROM app_image_jobs'))return {rows:[],rowCount:0};
 throw Error('Unexpected SQL: '+sql);
},connect:async()=>({...fakeDb,release:()=>{}})};
const dbBoundary={get dbEnabled(){return state.dbEnabled},ensureSchema:async()=>{},getPool:()=>fakeDb,listArtworksByIds:async()=>[],addArtworks:fatal('addArtworks'),getSetting:async()=>null,totalPaidCents:async()=>0};
const scope=()=>({actorEmail:state.actor,scopeKind:'personal',tenantId:null,parentContext:'tree:fixture'});
const boundaries={
 'src/lib/db.ts':dbBoundary,
 'src/lib/admin-auth.ts':{resolveUserEmail:async()=>state.actor},
 'src/lib/settings-secret.ts':{settingsSecret:()=> 'fixture-only-settings-secret-with-no-production-value',workerSecret:()=> 'fixture-only-worker-secret-with-no-production-value'},
 'src/lib/settings.ts':{getOpenAISettings:async()=>({}),getCutoutSettings:async()=>({backend:'openai'})},
 'src/lib/feature-access/server.ts':{FeatureAccessError,userFeaturePolicy:async()=>({mode:'default',allowed:[]})},
 'src/lib/saas/creation-context.ts':{currentCreationContext:scope,assertCurrentCreationFeature:async()=>{},withFrozenCreation:(_c,run)=>run(),frozenCreationScope:(value,email)=>{assert.equal(value.actorEmail,email);return value}},
 'src/lib/saas/creation-writer.ts':new Proxy({}, {get:(_t,k)=>fatal('creation-writer:'+String(k))}),
 'src/lib/canvas/image-version-store.ts':{assertCanvasRegeneration:async()=>{},attachCanvasImageVersions:fatal('image version attach')},
 'src/lib/image-skills/server.ts':{resolveImageSkill:async()=>null},
 'src/lib/imagegen/inputs.ts':{readImagegenInputs:async request=>request.inputs.map(input=>{const found=state.inputs.find(x=>x.artworkId===input.artworkId);if(!found)throw Error('fixture input not owned');return {...found,...input}})},
 'src/lib/model-config/server.ts':{getModelAdministration:async()=>admin},
 'src/lib/model-config/clients.ts':{executionOpenAI:fatal('supplier client'),modelAwareOpenAI:fatal('supplier client')},
 'src/lib/billing/server.ts':{quoteForActor:async(_owner,facts,options)=>{state.quotes.push({facts:structuredClone(facts),options});return {configVersion:state.billing.version,modelVersion:state.models.version,facts,requestedCredits:6,reserveCredits:6,authorizedCredits:6,imageParameterPlanVersion:1,tariff:{pricing:{mode:'fixed',credits:6}}}},getBillingRuntime:async()=>({config:admin.billing})},
 'src/lib/canvas-image-input.ts':{readCanvasOutput:fatal('media read'),readCanvasImage:fatal('media read')},
 'src/lib/imagegen/adapters.ts':{executeImagegenStep:async()=>{state.supplierCalls++;throw Error('supplier execution forbidden')}},
 'src/lib/canvas-local-image-edit.ts':{saveCanvasLocalEdit:fatal('local edit')},
 'src/lib/imagegen/input-assets.ts':{readImagegenInputAsset:fatal('asset read')},
 'src/lib/imagegen/postprocess.ts':{inspectImagegenPixels:fatal('pixel read')},
 'src/lib/imagegen/stored-delivery.ts':{storedDeliveryState:fatal('stored delivery'),recoverStoredDelivery:fatal('stored delivery')},
 'src/lib/bi/model-observer.ts':{withBiModelContext:(_c,run)=>run()},
};
// Source ownership moved, fixture boundaries did not: config/SQL/auth and
// quote providers remain fixtures; real preparation/executor/planner run.
boundaries['src/platform/db/pool.ts']=dbBoundary;
boundaries['src/lib/persistence/schema.ts']={ensureSchema:async()=>{}};
boundaries['src/lib/feature-access/repository.ts']=boundaries['src/lib/feature-access/server.ts'];
boundaries['src/lib/billing/quotation.ts']=boundaries['src/lib/billing/server.ts'];
boundaries['src/lib/saas/creation-scope.ts']=boundaries['src/lib/saas/creation-context.ts'];
boundaries['src/lib/artworks/repository.ts']={listArtworksByIds:async()=>[]};
boundaries['src/lib/model-config/execution-services.ts']={getModelExecutionServices:()=>({...admin,models:admin.repo})};
function read(rel){const p=fs.existsSync(path.join(source,rel))?path.join(source,rel):path.join(root,rel),b=fs.readFileSync(p);loaded.set(rel,{path:p,sha256:hash(b)});return b.toString('utf8');}
function resolve(from,id){if(id.startsWith('@/'))return 'src/'+id.slice(2);if(id.startsWith('.'))return path.posix.normalize(path.posix.join(path.posix.dirname(from),id));return null;}
function load(rel){if(boundaries[rel])return boundaries[rel];if(cache.has(rel))return cache.get(rel).exports;const m={exports:{}};cache.set(rel,m);
 if(rel.endsWith('.json')){m.exports=JSON.parse(read(rel));return m.exports;}
 const code=ts.transpileModule(read(rel),{fileName:rel,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const localRequire=id=>{if(id==='server-only')return {};if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});const p=resolve(rel,id);if(!p)return require(id);for(const ext of ['','.ts','.tsx','.json','/index.ts'])if(fs.statSync(path.join(root,p+ext),{throwIfNoEntry:false})?.isFile())return load(p+ext);throw Error('Module not found '+id+' from '+rel)};
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:rel})(localRequire,m,m.exports);return m.exports;
}
const admin={repo:{current:async()=>{state.modelReads++;return structuredClone(state.models)},byVersion:async v=>{state.modelReads++;assert.equal(v,state.models.version);return structuredClone(state.models)}},billing:{current:async()=>{state.billingReads++;return structuredClone(state.billing)},byVersion:async v=>{state.billingReads++;assert.equal(v,state.billing.version);return structuredClone(state.billing)}},runtime:{byVersion:async v=>admin.repo.byVersion(v),prepareExecution:fatal('external router')},credentials:{read:async()=> 'fixture-not-a-key'},trustedOrigins:['https://fixture.invalid']};
function reset(){state.models={version:Number(captured.version),digest:'a'.repeat(64),config:structuredClone(captured.config)};state.billing={version:7,config:JSON.parse(fs.readFileSync(path.join(root,'src/lib/billing/bootstrap.json'),'utf8'))};state.inputs=[];state.actor=owner;state.modelReads=0;state.billingReads=0;state.quotes=[];state.sql=[];state.job=null;state.dbEnabled=true;}
function ocrRequest(model='gpt6Astra'){return new Request('http://fixture/api/canvas/ocr',{method:'POST',headers:{'content-type':'application/json',...(model?{'x-naumi-feature-model':model}:{})},body:JSON.stringify({artworkId:'source'})})}
function imageRequest(overrides={}){return {version:1,operationId:crypto.randomUUID(),entry:'canvas',mode:'generate',prompt:'一只白色猫在木桥边，保持自然日光',inputs:[],modelId:'gemini-3.0-pro-image-square',parameters:{ratio:'auto',quality:'medium',resolution:'1K'},output:{format:'png'},variants:1,...overrides};}
async function main(){
 process.env.NAUMI_ROUTER_MANAGEMENT_URL='https://fixture.invalid';process.env.MODEL_CONFIG_TRUSTED_ORIGINS='https://fixture.invalid';process.env.NAUMI_RELEASE_RUNTIME='0';
 const priorFetch=global.fetch;global.fetch=async()=>{state.network++;throw Error('No network in admission fixture')};
 try{
  reset();const requests=load('src/lib/model-config/requests.ts'),context=load('src/lib/model-config/context.ts'),execution=load('src/lib/model-config/execution.ts'),runtime=load('src/lib/model-config/runtime.ts'),plans=load('src/lib/imagegen/plan.ts'),frames=load('src/lib/imagegen/frame-ratio.ts');
  const scoped=(model='gpt6Astra')=>requests.withModelRequest(ocrRequest(model),async()=>{const selected=context.currentModelExecution('vision');assert.ok(selected);return structuredClone(selected.frozen)});
  assert.equal(state.models.config.bindings['vision.ocr'],undefined);assert.equal(state.models.config.business?.['canvas.ocr'],undefined);
  if(baseline){await assert.rejects(scoped(),e=>e.code==='MODEL_UNAVAILABLE'&&e.message.includes('可用模型绑定'));checks.push('OCR_EXPLICIT_VISIBLE_VISION_MODEL_REPRODUCED_BINDING_FAILURE');}
  else{const selected=await scoped();assert.equal(selected.publicModelId,'gpt6Astra');assert.equal(selected.binding,'vision.ocr');checks.push('OCR_EXPLICIT_VISIBLE_MODEL_RESOLVES_REAL_EXECUTOR_WITHOUT_LEGACY_BINDING');}
  reset();const textModel=state.models.config.publicModels.find(m=>m.id==='gpt6Astra');textModel.toolScope={features:['canvas.ocr'],defaultFor:['canvas.ocr']};
  const defaultRun=()=>requests.withModelRequest(ocrRequest(''),async()=>context.currentModelExecution('vision').frozen.publicModelId);
  if(baseline){await assert.rejects(defaultRun(),e=>e.code==='MODEL_UNAVAILABLE');checks.push('OCR_FEATURE_DEFAULT_REPRODUCED_BINDING_FAILURE');}
  else{assert.equal(await defaultRun(),'gpt6Astra');checks.push('OCR_FEATURE_DEFAULT_RESOLVES_WITHOUT_LEGACY_BINDING');}
  reset();state.models.config.bindings['vision.ocr']='gpt6Astra';assert.equal(await defaultRun(),'gpt6Astra');checks.push('OCR_EXISTING_LEGACY_BINDING_POSITIVE_CONTROL');
  reset();await assert.rejects(requests.withModelRequest(ocrRequest(''),async()=>true),e=>e.code==='MODEL_UNAVAILABLE');checks.push('OCR_NO_SELECTION_AND_NO_BINDING_STILL_REJECTED');
  if(!baseline){
   const rejection=async(name,codes,model)=>{await assert.rejects(scoped(model),e=>{evidence[name]={code:e.code,message:e.message};return codes.includes(e.code)})};
   reset();const disabled={...structuredClone(state.models.config.publicModels.find(m=>m.id==='gpt6Astra')),id:'fixture-disabled-ocr',enabled:false};state.models.config.publicModels.push(disabled);await rejection('disabledModel',['MODEL_UNAVAILABLE'],disabled.id);checks.push('OCR_DISABLED_MODEL_REJECTED');
   reset();const noVision={...structuredClone(state.models.config.upstreamModels.find(u=>u.id==='apib:glm-5.3-flash')),id:'fixture-no-vision'};noVision.capabilities.vision=false;state.models.config.upstreamModels.push(noVision);const noVisionPublic={...structuredClone(state.models.config.publicModels.find(m=>m.id==='gpt6Astra')),id:'fixture-no-vision-public',target:{type:'upstream',id:noVision.id}};delete noVisionPublic.supplierRouting;state.models.config.publicModels.push(noVisionPublic);await rejection('noVision',['MODEL_INCOMPATIBLE'],noVisionPublic.id);checks.push('OCR_NONVISION_CHANNEL_REJECTED');
   reset();state.models.config.publicModels.find(m=>m.id==='gpt6Astra').toolScope={features:['canvas.text-generate'],defaultFor:[]};await rejection('toolScope',['MODEL_OUTSIDE_TOOL_SCOPE']);checks.push('OCR_TOOL_SCOPE_STILL_ENFORCED');
   reset();state.models.config.providers.find(p=>p.id==='apib-text').enabled=false;await rejection('disabledProvider',['MODEL_INCOMPATIBLE','INVALID_CONFIG']);checks.push('OCR_DISABLED_PROVIDER_REJECTED');
  }
  for(const modelId of ['gemini-3.0-pro-image-square','gemini-3.1-flash-image-square']){
   reset();const request=imageRequest({modelId}),before=JSON.stringify(request),fingerprint=plans.imagegenFingerprint(request);
   if(baseline){await assert.rejects(plans.planImagegen(request,owner),e=>e.code==='IMAGEGEN_NO_CHANNEL');assert.equal(state.quotes.length,0);checks.push(modelId+': TEXT_AUTO_NO_CHANNEL_REPRODUCED');}
   else{const plan=await plans.planImagegen(request,owner);assert.equal(plan.request.parameters.ratio,'1:1');assert.equal(plan.steps[0].parameters.ratio,'1:1');assert.ok(plan.steps[0].eligibleUpstreamIds.length);assert.equal(plan.steps[0].billingQuote.facts.ratio,'1:1');assert.equal(plan.fingerprint,fingerprint);assert.equal(JSON.stringify(request),before);evidence[modelId]=plan;checks.push(modelId+': TEXT_AUTO_FREEZES_SQUARE_WITH_REAL_SIMULATOR_AND_ADAPTER_ADMISSION');}
  }
  reset();const explicit=await plans.planImagegen(imageRequest({parameters:{ratio:'3:4',quality:'medium',resolution:'1K'}}),owner);assert.equal(explicit.request.parameters.ratio,'3:4');assert.equal(explicit.steps[0].parameters.ratio,'3:4');checks.push('EXPLICIT_RATIO_3_4_UNCHANGED_POSITIVE_CONTROL');
  reset();state.inputs=[{artworkId:'source',role:'edit-target',width:768,height:1024,buffer:Buffer.from('fixture'),mimeType:'image/png'}];const edit=imageRequest({mode:'edit',inputs:[{artworkId:'source',role:'edit-target'}]}),editPlan=await plans.planImagegen(edit,owner);assert.equal(editPlan.request.parameters.ratio,'3:4');checks.push('EDIT_AUTO_INHERITS_REFERENCE_ASPECT');
  const raw=imageRequest();for(const operation of ['edit','cutout','postprocess'])assert.equal(frames.automaticFrameRatio(raw,[],operation),undefined);assert.equal(frames.automaticFrameRatio(imageRequest({parameters:{ratio:'auto',width:768,height:1024}}),[],'generate'),undefined);checks.push('NO_FRAME_DEFAULT_FOR_EDIT_CUTOUT_POSTPROCESS_OR_EXPLICIT_PIXELS');
  if(!baseline){
   reset();const original=imageRequest(),plan=await plans.planImagegen(original,owner),quotes=load('src/lib/imagegen/quotes.ts');state.dbEnabled=false;
   const publicQuote=await quotes.issueImagegenQuote(original,owner,plan);state.models.config.publicModels.find(m=>m.id===plan.request.modelId).enabled=false;state.models.version++;state.models.digest='b'.repeat(64);state.billing.version++;const reads=state.modelReads,prices=state.billingReads,old=JSON.stringify(plan);
   const frozen=await quotes.frozenImagegenQuote(original,owner,{quoteId:publicQuote.quote.id,confirmed:true});assert.equal(JSON.stringify(frozen),old);assert.equal(state.modelReads,reads);assert.equal(state.billingReads,prices);checks.push('FROZEN_QUOTE_SURVIVES_CONFIG_CHANGE_WITHOUT_REPLANNING');
   state.dbEnabled=true;
   const oldPlan=structuredClone(plan);oldPlan.request.parameters.ratio='auto';oldPlan.steps[0].parameters.ratio='auto';
   state.job={id:'imagegen-'+original.operationId,kind:'imagegen',email:owner,lease_token:null,billing_settled:false,
    snapshot:{status:'error',paidOperationVersion:1,fingerprint:plan.fingerprint,children:{generate:{state:'starting'}},result:{operationId:original.operationId,jobId:'imagegen-'+original.operationId,status:'failed',stage:'generating',artifacts:[],chargedCredits:0,error:{code:'SUBMISSION_UNKNOWN',message:'fixture accepted but unknown'}}},payload:{creationScope:scope(),plan:oldPlan}};
   const prior=JSON.stringify(state.job),dispatch=load('src/lib/imagegen/dispatch.ts');
   const resumed=await dispatch.submitImagegen(original,owner);assert.equal(resumed.error.code,'SUBMISSION_UNKNOWN');assert.equal(JSON.stringify(state.job),prior);assert.equal(state.modelReads,reads);assert.equal(state.billingReads,prices);assert.equal(state.supplierCalls,0);checks.push('ACCEPTED_UNKNOWN_PARENT_RECEIPT_FIRST_NO_REPLAN_OR_REPOST_OR_RATIO_REWRITE');
  }
  assert.equal(state.supplierCalls,0);assert.equal(state.network,0);checks.push('SUPPLIER_AND_NETWORK_ZERO');
  const result=baseline?'REPRODUCED':'PASS',exit=baseline?1:0;fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({result,checks,loaded:[...loaded.entries()].map(([file,v])=>({file,...v})),config:{path:configPath,sha256:hash(fs.readFileSync(configPath)),version:captured.version},evidence,supplierCalls:state.supplierCalls,network:state.network,exit},null,2));
  console.log(`CANVAS_MODEL_ADMISSION=${result} CHECKS=${checks.length} SUPPLIER_CALLS=0 NETWORK=0 EXIT=${exit}`);process.exitCode=exit;
 }finally{global.fetch=priorFetch;}
}
main().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,checks,loaded:[...loaded.entries()],sql:state.sql},null,2));console.error(error);process.exitCode=1});
