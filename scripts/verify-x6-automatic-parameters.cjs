// Real plan/simulator/compiler, browser submission and async adapter. Explicit
// config/auth/billing/ledger fixtures; real Sharp and loopback HTTP, no supplier.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),http=require('node:http'),esbuild=require('esbuild'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(arg('--source',root)),ref=arg('--ref',''),out=path.resolve(arg('--output',process.env.IMAGE_AUTO_FRAME_EVIDENCE||'output/capacity-audit-wave2-20261029/x6-auto-fix-20261030/modified'));
fs.mkdirSync(out,{recursive:true});const results=[],loaded=new Map(),baseline=!!ref||args.includes('--original');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/x6-parameters-v152.json'),'utf8'));
const snapshot={version:152,digest:'a'.repeat(64),config:structuredClone(fixture)},billing={version:8,config:JSON.parse(fs.readFileSync(path.join(root,'src/lib/billing/bootstrap.json'),'utf8'))};
let inputs=[],quotes=0,network=0,operation='unit-1',ledgerRow=null,uiStart=0,uiPreview=[],uiStorage=new Map();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ledger={account:async()=>{},begin:async()=>({id:'fixture-call'}),enqueue:async()=>{},apply:async(_id,r)=>{if(r.taskId)ledgerRow.task_id=r.taskId;},pool:{query:async(sql,p=[])=>{
 if(sql.startsWith('SELECT parameters')||sql.startsWith('SELECT *'))return{rows:[structuredClone(ledgerRow)]};
 if(sql.includes('parameters=$2::jsonb')){if(ledgerRow.parameters)return{rows:[],rowCount:0};ledgerRow.parameters=JSON.parse(p[1]);return{rows:[{id:'fixture-call'}],rowCount:1};}
 if(sql.includes('parameters=parameters ||')){Object.assign(ledgerRow.parameters,JSON.parse(p[1]));return{rows:[],rowCount:1};}
 if(sql.includes('SET evidence=COALESCE'))return{rows:[],rowCount:1};
 throw Error('UNEXPECTED_LEDGER_SQL');
}}};
class Pending extends Error{};
const mocks={
 'src/lib/db.ts':{dbEnabled:false,getPool:()=>{throw Error('DB_FORBIDDEN')}},
 'src/lib/model-config/repository.ts':{canonicalConfig:v=>JSON.stringify(v)},
 'src/lib/model-config/server.ts':{getModelAdministration:async()=>({repo:{current:async()=>snapshot,byVersion:async()=>snapshot},billing:{current:async()=>billing,byVersion:async()=>billing}}),getModelRuntime:async()=>({current:async()=>snapshot,byVersion:async()=>snapshot})},
 'src/lib/model-config/requests.ts':{modelConfigurationEnabled:async()=>true},
 'src/lib/settings.ts':{getLegacyOpenAISettings:async()=>({models:[]})},
 'src/lib/user-image-provider.ts':{getUserImageProvider:async()=>null,userImageModelId:id=>id},
 'src/lib/feature-access/server.ts':{userFeaturePolicy:async()=>({mode:'default',allowed:[]}),FeatureAccessError:class extends Error{}},
 'src/lib/saas/creation-context.ts':{assertCurrentCreationFeature:async()=>{}},
 'src/lib/canvas/image-version-store.ts':{assertCanvasRegeneration:async()=>{}},
 'src/lib/image-skills/server.ts':{resolveImageSkill:async()=>undefined},
 'src/lib/imagegen/inputs.ts':{readImagegenInputs:async r=>inputs.filter(i=>r.inputs.some(v=>v.artworkId===i.artworkId))},
 'src/lib/billing/server.ts':{quoteForActor:async(_owner,facts)=>{quotes++;return{facts,configVersion:8,imageParameterPlanVersion:1,tariff:{pricing:{mode:'fixed'}},requestedCredits:6*facts.quantity,authorizedCredits:6*facts.quantity};}},
 'src/lib/image-gateway.ts':{currentImageOperationId:()=>operation,currentImageOperationParameters:()=>undefined,ImageOperationPending:Pending,ImageOperationDeferred:class extends Error{}},
 'src/lib/model-config/channel-availability.ts':{guardChannelSubmission:async()=>{}},
 'src/lib/model-config/transport.ts':{modelEndpointFetch:()=>{throw Error('EXTERNAL_TRANSPORT_FORBIDDEN')}},
 'src/lib/supplier-cost/runtime.ts':{supplierLedger:()=>ledger,accountIdentity:()=> 'fixture-account'},
 'src/lib/supplier-cost/collect.ts':{supplierContext:async()=>({})},
 'src/lib/billing/synchronous.ts':{currentSynchronousBilling:()=>undefined,recordBillingUsage:()=>{}},
 'src/lib/saas/workspace-client.ts':{currentWorkspace:()=> 'personal'},
 'src/lib/imagegen/client.ts':{imagegenScopeHeaders:x=>x||{},ImagegenHttpError:null,
  uploadImagegenInput:async()=>({artworkId:'asset-reference',sourceWidth:941,sourceHeight:1672,width:470,height:836,url:'fixture-url',inputVariant:'processed'}),
  previewImagegen:async r=>{uiPreview.push(structuredClone(r));return plans.planImagegen(r,'fixture@example.test');},
  startImagegen:async r=>{uiStart++;return{jobId:'imagegen-'+r.operationId,operationId:r.operationId};},pollImagegen:async id=>({jobId:'imagegen-'+id,operationId:id})},
};
mocks['src/platform/db/pool.ts']=mocks['src/lib/db.ts'];
mocks['src/lib/model-config/execution-services.ts']={getModelExecutionServices:()=>({models:{current:async()=>snapshot,byVersion:async()=>snapshot},billing:{current:async()=>billing,byVersion:async()=>billing}})};
mocks['src/lib/model-config/published.ts']={readPublishedModelSnapshot:async()=>snapshot};
mocks['src/lib/model-config/availability.ts']={modelConfigurationEnabled:async()=>true};
mocks['src/lib/feature-access/repository.ts']=mocks['src/lib/feature-access/server.ts'];
mocks['src/lib/saas/creation-access.ts']=mocks['src/lib/saas/creation-context.ts'];
mocks['src/lib/billing/quotation.ts']=mocks['src/lib/billing/server.ts'];
mocks['src/lib/model-config/snapshot-value.ts']={canonicalConfig:v=>JSON.stringify(v)};
const cache=new Map();
function load(rel){if(mocks[rel])return mocks[rel];if(cache.has(rel))return cache.get(rel).exports;const m={exports:{}};cache.set(rel,m);
 const file=path.join(source,rel),bytes=ref?cp.execFileSync('git',['show',ref+':'+rel],{cwd:root}):fs.readFileSync(fs.existsSync(file)?file:path.join(root,rel));loaded.set(rel,hash(bytes));
 if(rel.endsWith('.json')){m.exports=JSON.parse(bytes.toString());return m.exports;}
 const code=esbuild.transformSync(bytes.toString(),{loader:rel.endsWith('.tsx')?'tsx':'ts',format:'cjs',target:'node20',supported:{'dynamic-import':false}}).code;
 const req=id=>{if(id==='server-only')return{};if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});if(!id.startsWith('.')&&!id.startsWith('@/'))return require(id);const p=id.startsWith('@/')?'src/'+id.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(rel),id));return load(/\.(?:ts|tsx|json)$/.test(p)?p:p+'.ts');};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Buffer,TextEncoder,TextDecoder,URL,URLSearchParams,FormData,File,Request,Response,Headers,AbortController,AbortSignal,process:{env:{}},performance,structuredClone,console,setTimeout,clearTimeout,crypto:crypto.webcrypto,sessionStorage:{getItem:k=>uiStorage.get(k)??null,setItem:(k,v)=>uiStorage.set(k,v),removeItem:k=>uiStorage.delete(k)},fetch:()=>{network++;throw Error('NETWORK_FORBIDDEN')}})(req,m,m.exports);return m.exports;
}
let plans;
const models=fixture.publicModels.map(m=>m.id);
function request(modelId,ratio='auto',extra={}){return{version:1,operationId:crypto.randomUUID(),entry:'canvas',mode:'edit',prompt:'换成红色',modelId,inputs:[{artworkId:'asset-reference',role:'edit-target'}],parameters:{quality:'medium',resolution:'1K',ratio},output:{format:'png'},variants:3,...extra};}
function reset(){snapshot.config=structuredClone(baseline&&!args.includes('--candidate-config')?fixture:repaired);inputs=[{artworkId:'asset-reference',role:'edit-target',width:941,height:1672}];quotes=0;}
let repaired;
async function test(name,run){try{await run();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.stack});console.log('FAIL '+name+': '+e.message);}}
async function main(){
 // Repair module is test input construction, not baseline product code.
 const b=esbuild.buildSync({entryPoints:[path.join(root,'scripts/repair-x6-automatic-parameters-policy.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m={exports:{}};vm.runInThisContext('(function(require,module,exports){'+b+'\n})')(require,m,m.exports);repaired=m.exports.repairX6AutomaticParameters(fixture);
 plans=load('src/lib/imagegen/plan.ts');mocks['src/lib/imagegen/client.ts'].ImagegenHttpError=load('src/lib/imagegen/http.ts').ImagegenHttpError;
 const compiler=load('src/lib/model-config/image-parameter-plan.ts'),runtime=load('src/lib/model-config/runtime.ts');
 for(const model of models){
  await test(model+' automatic-original-frame',async()=>{reset();const r=request(model),before=JSON.stringify(r),p=await plans.planImagegen(r,'fixture@example.test');assert.equal(p.request.parameters.ratio,'9:16');assert.equal(p.frameChoice.target,'941:1672');assert.equal(p.frameChoice.source,'reference');assert.equal(p.requestedParameters.ratio,'941:1672');assert.equal(p.totalCredits,18);assert.equal(quotes,1);assert.equal(p.fingerprint,plans.imagegenFingerprint(r));assert.equal(JSON.stringify(r),before);const frozen=Object.values(p.steps[0].billingQuote.imageParameterPlans)[0];assert.equal(frozen.wire.size,'9:16');assert.equal(frozen.requested.ratio,'9:16');assert.equal(p.warnings.length,1);});
  await test(model+' browser-original-not-transport-frame',async()=>{reset();uiStorage.clear();uiStart=0;uiPreview=[];const form=new FormData();form.set('model',model);form.set('userPrompt','换成红色');form.set('ratio','auto');form.set('count','3');form.append('image',new File(['fixture-input'],'reference.png',{type:'image/png'}));const notes=[];await load('src/lib/imagegen/canvas-client.ts').submitCanvasImagegen(form,'node',s=>notes.push(s),{owner:'fixture@example.test',project:'workspace'});assert.equal(uiPreview[0].parameters.ratio,'941:1672');assert.equal(uiPreview[0].ratioMode,'automatic');assert.equal(uiStart,1);assert(notes.some(s=>s.includes('9:16')));});
  await test(model+' explicit-supported-3:4',async()=>{reset();const p=await plans.planImagegen(request(model,'3:4'),'fixture@example.test');assert.equal(p.request.parameters.ratio,'3:4');assert.equal(p.automaticFrame,undefined);});
  await test(model+' explicit-unsupported-uses-nearest',async()=>{reset();const p=await plans.planImagegen(request(model,'941:1672'),'fixture@example.test');assert.equal(p.request.parameters.ratio,'9:16');assert.equal(p.frameChoice.source,'explicit');assert.equal(p.frameChoice.target,'941:1672');assert.equal(p.steps[0].billingQuote.facts.ratio,'941:1672');assert.equal(quotes,1);});
  await test(model+' explicit-landscape-beats-portrait-reference',async()=>{reset();const p=await plans.planImagegen(request(model,'16:9'),'fixture@example.test');assert.equal(p.request.parameters.ratio,'16:9');assert.equal(p.frameChoice,undefined);});
  await test(model+' unsupported-9:21-uses-own-enum',async()=>{reset();const p=await plans.planImagegen(request(model,'9:21'),'fixture@example.test');assert.equal(p.request.parameters.ratio,model===models[0]?'9:16':'1:2');assert.equal(p.frameChoice.target,'9:21');assert.equal(p.frameChoice.source,'explicit');});
  await test(model+' old-version-does-not-opt-in',async()=>{reset();await assert.rejects(plans.planImagegen(request(model),'fixture@example.test',{modelVersion:152,billingVersion:8}));assert.equal(quotes,0);});
  await test(model+' supported-reference-keeps-exact-frame',async()=>{reset();inputs[0].width=768;inputs[0].height=1024;const p=await plans.planImagegen(request(model),'fixture@example.test');assert.equal(p.request.parameters.ratio,'3:4');assert.equal(p.automaticFrame,undefined);});
 }
 await test('seedream-old-HOLD-9:16-restored',async()=>{reset();const p=await plans.planImagegen(request(models[0],'9:16'),'fixture@example.test');const wire=Object.values(p.steps[0].billingQuote.imageParameterPlans)[0];assert.equal(wire.wire.size,'9:16');assert.equal(wire.expectedPixels.width,736);assert.equal(wire.expectedPixels.height,1312);});
 await test('seedream-4K-keeps-price-and-native-2K',async()=>{reset();const p=await plans.planImagegen(request(models[0],'auto',{parameters:{quality:'medium',resolution:'4K',ratio:'auto'}}),'fixture@example.test');assert.equal(p.steps[0].parameters.resolution,'2K');assert.equal(p.requestedParameters.resolution,'4K');assert.equal(p.steps[0].billingQuote.facts.resolution,'4K');assert.equal(p.request.parameters.ratio,'9:16');});
 await test('mask-never-uses-native-auto',async()=>{reset();inputs.push({artworkId:'mask',role:'mask',width:941,height:1672});const r=request(models[1]);r.inputs.push({artworkId:'mask',role:'mask'});await assert.rejects(plans.planImagegen(r,'fixture@example.test'));assert.equal(quotes,0);});
 await test('catalog-does-not-advertise-unknown-edit',()=>{snapshot.config=structuredClone(fixture);const c=runtime.publicModelCatalog(snapshot,'image');assert.equal(c.models.find(m=>m.id===models[2]).supportsEdit,false);});
 await test('already-bound-legacy-edit-keeps-original-capability',async()=>{snapshot.config=structuredClone(fixture);const scope={frozen:{publicModelId:models[2],modelVersion:152,modality:'image'},capabilities:{edit:true}};const entries=await load('src/lib/model-config/context.ts').runModelExecution(scope,()=>load('src/lib/image-model-catalog.ts').getImageModelCatalog());assert.equal(entries.find(m=>m.id===models[2]).supportsEdit,true);});
 await test('precise-edit-rejection',async()=>{snapshot.config=structuredClone(fixture);inputs=[{artworkId:'asset-reference',role:'edit-target',width:768,height:1024}];await assert.rejects(plans.planImagegen(request(models[2],'3:4'),'fixture@example.test'),e=>e.code==='IMAGEGEN_EDIT_UNSUPPORTED');});
 await test('historic-replan-keeps-precise-ratio-rejection',async()=>{reset();await assert.rejects(plans.planImagegen(request(models[1],'941:1672'),'fixture@example.test',{modelVersion:152,billingVersion:8}),e=>e.code==='IMAGEGEN_RATIO_UNSUPPORTED');});
 await test('manual-disabled-and-negative-preserved',()=>{const f=structuredClone(fixture),u=f.upstreamModels[2];u.parameterMap.apimartImages.automaticRatio={enabled:false,source:'operator',checkedAt:'2026-10-30'};u.capabilities.imagegen={edit:{state:'unsupported',source:'operator',checkedAt:'2026-10-30'}};const fixed=m.exports.repairX6AutomaticParameters(f);assert.equal(fixed.upstreamModels[2].parameterMap.apimartImages.automaticRatio.enabled,false);assert.equal(fixed.upstreamModels[2].capabilities.imagegen.edit.state,'unsupported');assert.equal(fixed.upstreamModels[2].capabilities.verified,false);assert.equal(fixed.upstreamModels[2].capabilities.maxReferenceImages,u.capabilities.maxReferenceImages);});
 await test('native-auto-false-still-allows-nearest-named-ratio',async()=>{reset();snapshot.config.upstreamModels.find(u=>u.id===fixture.publicModels[1].target.id).parameterMap.apimartImages.automaticRatio={enabled:false,source:'operator',checkedAt:'2026-10-30'};const p=await plans.planImagegen(request(models[1]),'fixture@example.test');assert.equal(p.request.parameters.ratio,'9:16');});
 await test('compiler-does-not-guess-custom-pixels',()=>{reset();const u=snapshot.config.upstreamModels[1];assert.throws(()=>compiler.compileImageParameterPlan(u,{quality:'medium',resolution:'1K',ratio:'941:1672'},{publicModelId:models[1],protocol:'apimart-images',modelVersion:152}));});
 await test('two-pixel-difference-is-advisory-not-rejection',()=>{const message=load('src/lib/imagegen/output-advisory.ts').imageRatioWarning('9:16',{width:736,height:1312});assert(message.includes('保留完整画面'));});
 await test('reverse-hub-old-auto-and-new-explicit-match-nearest',async()=>{reset();const u=snapshot.config.upstreamModels.find(u=>u.model==='seedream-5-0-pro');u.parameterMap={qualityPolicy:u.parameterMap.qualityPolicy,resolutionPolicy:{mode:'map',field:'resolution',ratioField:'ratio',values:{'1K':'1.5k','2K':'2k'}}};u.model='jimeng/jimeng-image-5.0-pro';u.providerId='hub-fixture';snapshot.config.providers.push({id:'hub-fixture',name:'Fixture hub',enabled:true,protocol:'openai-images',baseUrl:'https://fixture.invalid/v1',credentialRef:'22222222-2222-4222-8222-222222222222',timeoutMs:5000,maxConcurrent:4,options:{imageAdapter:'reverse-hub',imageRatios:['21:9','16:9','3:2','4:3','1:1','3:4','2:3','9:16']}});for(const ratio of ['auto','941:1672']){const p=await plans.planImagegen(request(models[0],ratio),'fixture@example.test');assert.equal(p.request.parameters.ratio,'9:16');const wire=Object.values(p.steps[0].billingQuote.imageParameterPlans)[0];assert.equal(wire.wire.ratio,'9:16');}});
 await test('text-only-auto-stays-square',async()=>{reset();const p=await plans.planImagegen(request(models[1],'auto',{mode:'generate',inputs:[]}),'fixture@example.test').catch(e=>{throw e});assert.equal(p.request.parameters.ratio,'1:1');});
 await test('config-copy-rollback-and-all-field-guard',()=>{const restored=m.exports.rollbackX6AutomaticParameters(repaired,fixture);assert.deepEqual(restored,fixture);const later=structuredClone(repaired);later.publicModels[0].label='later label';assert.equal(m.exports.rollbackX6AutomaticParameters(later,fixture).publicModels[0].label,'later label');later.upstreamModels.find(u=>u.model==='seedream-5-0-pro').parameterMap.apimartImages.outputDimensions['2K:9:16'].width=1456;const before=JSON.stringify(later);assert.throws(()=>m.exports.rollbackX6AutomaticParameters(later,fixture),/X6_ROLLBACK_LATER_EDIT/);assert.equal(JSON.stringify(later),before);});
 // Use actual adapter/Sharp and local HTTP. Ledger persistence is an explicit
 // deterministic seam; this is not a real PG or live supplier acceptance test.
 const png=await sharp({create:{width:941,height:1672,channels:3,background:'#336699'}}).png().toBuffer();let posts=[],uploads=0,gets=0,origin='',wireModel='',failAck=false;
 const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin);if(url.pathname==='/output'){res.end(png);return;}if(url.pathname==='/v1/uploads/images'){for await(const _ of req){}uploads++;res.end(JSON.stringify({url:'https://fixture.invalid/upload.png'}));return;}if(url.pathname.startsWith('/v1/tasks/')){gets++;res.end(JSON.stringify({data:{id:'task_1',model:wireModel,status:'completed',result:{images:[{url:[origin+'/output']}]}}}));return;}let data='';for await(const chunk of req)data+=chunk;posts.push(JSON.parse(data));res.end(failAck?'invalid-json':JSON.stringify({data:{id:'task_1',status:'submitted'}}));}catch(e){res.statusCode=500;res.end('fixture-error');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 try{for(const model of models)await test(model+' adapter-wire-and-original-task-recovery',async()=>{reset();posts=[];uploads=0;gets=0;ledgerRow={parameters:null,task_id:null};const p=await plans.planImagegen(request(model),'fixture@example.test'),u=snapshot.config.upstreamModels.find(u=>u.id===p.steps[0].eligibleUpstreamIds[0]);wireModel=u.model;const scope={frozen:{publicModelId:model,modelVersion:152,feature:'canvas.image',target:{type:'upstream',id:u.id},facts:{quality:'medium',resolution:'1K',ratio:p.request.parameters.ratio},imageParameterPlanVersion:1,imageParameterPlans:p.steps[0].billingQuote.imageParameterPlans},capabilities:u.capabilities,parameterMap:u.parameterMap,connection:{wireModel,providerId:'apib-image',protocol:'apimart-images',baseUrl:origin+'/v1',apiKey:'fixture-not-secret',timeoutMs:1000}};
 const adapter=load('src/lib/model-config/apimart-preset.ts').apimartImagesFetch(scope,{trustedOrigins:[origin]},{transport:fetch,media:fetch,pollMs:1});const form=new FormData();form.set('prompt','换成红色');form.set('n','1');form.append('image',new File([png],'input.png',{type:'image/png'}));const run=()=>adapter(origin+'/v1/images/edits',{method:'POST',body:form});
 const response=await run(),body=await response.json();assert.equal(response.status,200);assert.equal(hash(Buffer.from(body.data[0].b64_json,'base64')),hash(png));assert.equal(posts.length,1);assert.equal(posts[0].size,'9:16');assert.equal(posts[0].n,1);assert.equal(posts[0].image_urls.length,1);assert.equal(posts[0].model,wireModel);await run();assert.equal(posts.length,1);assert.equal(uploads,1);assert.equal(gets,2);
 // Missing ACK remains UNKNOWN; a repeat reads its marker and issues no POST.
 ledgerRow={parameters:null,task_id:null};failAck=true;await assert.rejects(run(),Pending);await assert.rejects(run(),Pending);assert.equal(posts.length,2);failAck=false;
 });}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 const failed=results.filter(r=>!r.pass).length,record={source,ref,baseline,results,loaded:Object.fromEntries(loaded),realSupplierCalls:0,network,realPostgres:false,httpClosed:!server.listening};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(record,null,2));console.log(`X6_AUTOMATIC cases=${results.length} passed=${results.length-failed} failed=${failed} REAL_SUPPLIER_CALLS=0 HTTP_CLOSED=${!server.listening}`);process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1});
