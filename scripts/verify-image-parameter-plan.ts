/** Real pure/compiler/adapter and frozen-executor regressions; generated local
 * PNG and loopback HTTP only. --baseline exposes the original two regressions. */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createServer} from 'node:http';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
const root=path.resolve(process.env.PARAMETER_SOURCE_ROOT||'.'),baseline=process.argv.includes('--baseline');
const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href);
let checks=0,posts=0;const check=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;};
async function main(){
 const {fixtureModelConfig}=await load('scripts/model-config-unit-fixture.ts');
 const config=fixtureModelConfig('https://fixture.invalid/v1',randomUUID()),u=config.upstreamModels[0];
 u.model='gemini-3-pro-image-preview';u.capabilities.verified=false;u.capabilities.qualities=[];u.capabilities.nativeResolutions=[];u.parameterMap={qualityPolicy:{mode:'map',choices:[{id:'medium',label:'标准',value:'medium'},{id:'high',label:'高',value:'medium'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1k','2K':'2k','4K':'2k'}},apimartImages:{schemaVersion:1,ratios:['1:1','3:4'],maxOutputs:4,supportsMask:true,outputDimensions:{'2K:1:1':{width:2048,height:2048}}}};
 const scope:any={frozen:{modelVersion:150,modelDigest:'a'.repeat(64),publicModelId:'image-a',target:{type:'upstream',id:'u1'},facts:{quality:'high',resolution:'4K',ratio:'1:1'}},capabilities:u.capabilities,parameterMap:u.parameterMap,connection:{providerId:'p1',protocol:'apimart-images',wireModel:u.model,baseUrl:'https://fixture.invalid/v1',apiKey:'fixture',timeoutMs:1000}};
 const {apimartImageParameters}=await load('src/lib/model-config/apimart-image-parameters.ts');
 const {imageSupplierFailure}=await load('src/lib/model-config/supplier-failure.ts');
 const {normalizeLegacyFrameRequest}=await load('src/lib/imagegen/legacy-frame-request.ts');
 const {assertImageBillingSelection}=await load('src/lib/billing/image-quotes.ts');
 const bytes=await sharp({create:{width:96,height:128,channels:3,background:'#365'}}).png().toBuffer();
 const form=new FormData();form.set('ratio','auto');form.set('prompt','重做此图');form.set('userPrompt','保留产品');form.set('image',new File([new Uint8Array(bytes)],'reference.png',{type:'image/png'}));
 const quote:any={facts:{feature:'canvas.image',quantity:1,ratio:'auto',quality:'high',resolution:'4K',modelId:'image-a'}};
 if(baseline){
  assert.throws(()=>apimartImageParameters(scope,{quality:'high',resolution:'4K',ratio:'1:1'}),(e:any)=>e.code==='MODEL_INCOMPATIBLE');checks++;
  const resolved=await normalizeLegacyFrameRequest(new Request('http://fixture/api/generate-image',{method:'POST',body:form}));
  const ratio=(await resolved.formData()).get('ratio');check(ratio,'3:4','auto resolves after quote');
  assert.throws(()=>assertImageBillingSelection(quote,{...quote.facts,ratio}),(e:any)=>e.code==='OPERATION_CONFLICT');checks++;
  check(imageSupplierFailure(422,{error:{code:'MODEL_INCOMPATIBLE',type:'naumi_async_image_rejection'}}).code,'IMAGE_REQUEST_REJECTED','old misleading category');
  console.log(`BASELINE=REPRODUCED CHECKS=${checks} EMPTY_METADATA=REJECTED AUTO_QUOTE=MISMATCH SUPPLIER_CALLS=0`);return;
 }
 const {compileImageParameterPlan,applyImageParameterPlan}=await load('src/lib/model-config/image-parameter-plan.ts');
 const context={publicModelId:'image-a',protocol:'apimart-images',modelVersion:150};
 const plan=compileImageParameterPlan(u,{quality:'high',resolution:'4K',ratio:'1:1'},context);
 check(plan.wire,{quality:'medium',resolution:'2k',size:'1:1'},'4K/high mapped once');
 check(plan.requested,{quality:'high',resolution:'4K',ratio:'1:1'},'user choice stays');check(plan.expectedPixels,{width:2048,height:2048},'expect mapped 2K pixels not 4K');
 const original=JSON.stringify(u);u.capabilities.nativeResolutions=['1K'];u.capabilities.qualities=['low'];
 check(compileImageParameterPlan(u,plan.requested,context),plan,'metadata drift does not change explicit map');Object.assign(u,JSON.parse(original));
 scope.frozen.imageParameterPlanVersion=1;scope.frozen.imageParameterPlans={u1:plan};
 const params=apimartImageParameters(scope,plan.requested);check(params.upstream,plan.wire,'real adapter respects map despite empty metadata');
 const oldScope=structuredClone(scope);delete oldScope.frozen.imageParameterPlanVersion;delete oldScope.frozen.imageParameterPlans;
 assert.throws(()=>apimartImageParameters(oldScope,plan.requested),(e:any)=>e.code==='MODEL_INCOMPATIBLE');checks++;
 const omitted=structuredClone(u);omitted.parameterMap.qualityPolicy.mode='omit';omitted.parameterMap.resolutionPolicy.mode='omit';
 const omittedPlan=compileImageParameterPlan(omitted,plan.requested,context);
 check(applyImageParameterPlan({prompt:'preserved',model:'same',quality:'high',resolution:'4k',image_size:'4K'},omittedPlan),{prompt:'preserved',model:'same',size:'1:1'},'omit removes SDK defaults, preserves prompt/model');
 const collision=structuredClone(u);collision.parameterMap.resolutionPolicy.ratioField='resolution';
 assert.throws(()=>compileImageParameterPlan(collision,plan.requested,context));checks++;
 const missing=structuredClone(u);delete missing.parameterMap.resolutionPolicy.values['4K'];assert.throws(()=>compileImageParameterPlan(missing,plan.requested,context));checks++;
 const advanced=structuredClone(u);advanced.parameterMap.imagegen={moderation:'moderation',outputFormat:'omit',outputCompression:'output_compression'};
 const aplan=compileImageParameterPlan(advanced,{...plan.requested,advanced:{moderation:'low',outputFormat:'png',outputCompression:0}},context);
 check(aplan.wire.moderation,'low','manual advanced map overrides missing evidence');check(aplan.wire.output_compression,0,'zero retained');check('output_format'in aplan.wire,false,'explicit omission');
 check(applyImageParameterPlan({output_format:'png'},aplan).output_format,undefined,'downstream cannot restore omitted field');
 const nested=structuredClone(u);nested.parameterMap.resolutionPolicy={mode:'map',field:'image_config.image_size',ratioField:'image_config.aspect_ratio',values:{'4K':'2K'}};
 check(applyImageParameterPlan({},compileImageParameterPlan(nested,plan.requested,{...context,protocol:'openai-images'})),{quality:'medium',image_config:{image_size:'2K',aspect_ratio:'1:1'}},'nested fields encode once');
 const {resolveCanvasLegacyFrame}=await load('src/lib/imagegen/canvas-client.ts');
 await resolveCanvasLegacyFrame(form,async()=>{throw Error('No choice for one frame');},()=>true);
 check(form.get('ratio'),'3:4','redo resolves before quote');quote.facts.ratio=form.get('ratio');
 const submitted=await normalizeLegacyFrameRequest(new Request('http://fixture/api/generate-image',{method:'POST',body:form}));
 assertImageBillingSelection(quote,{...quote.facts,ratio:(await submitted.formData()).get('ratio')});checks++;
 for(const field of ['quality','resolution','modelId','quantity']){assert.throws(()=>assertImageBillingSelection(quote,{...quote.facts,[field]:field==='quantity'?2:'different'}));checks++;}
 const {ModelConfigError}=await load('src/lib/model-config/types.ts'),{localImageRejectionResponse,localImageRejection}=await load('src/lib/model-config/local-image-rejection.ts');
 const local=localImageRejectionResponse(new ModelConfigError('IMAGE_MAPPING_INVALID','配置缺失',422));check(localImageRejection(local)?.code,'IMAGE_MAPPING_INVALID','local response identity');
 check(localImageRejection(Response.json({error:{code:'IMAGE_MAPPING_INVALID',type:'naumi_local_image_config'}})),undefined,'supplier cannot forge local origin');
 // Direct transport: real HTTP boundary, no mocks for mapping/SDK serialization.
 const received:any[]=[];
 const server=createServer(async(req,res)=>{posts++;let b='';for await(const p of req)b+=p;received.push(JSON.parse(b));res.setHeader('content-type','application/json');res.end('{"data":[]}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${(server.address()as any).port}`;
 try{
  const {executionFetch}=await load('src/lib/model-config/clients.ts');
  const wireScope=structuredClone(scope);wireScope.connection.protocol='openai-images';wireScope.connection.baseUrl=origin+'/v1';delete wireScope.channelGuard;
  const fetcher=executionFetch(wireScope,{trustedOrigins:[origin]});
  await fetcher(origin+'/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'client-model',prompt:'fixture',n:1,quality:'high',resolution:'4k'})});
  check(received[0],{model:u.model,prompt:'fixture',n:1,quality:'medium',resolution:'2k',size:'1:1'},'real HTTP final wire');
  check(posts,1,'one actual loopback POST');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 const frozen=structuredClone(plan);u.parameterMap.resolutionPolicy.values['4K']='1k';check(frozen.wire.resolution,'2k','frozen plan survives admin change');
 console.log(`IMAGE_PARAMETER_PLAN=PASS CHECKS=${checks} LOOPBACK_POSTS=${posts} REAL_SUPPLIER_CALLS=0 AUTO_QUOTE=CONSISTENT OLD_TASK=UNCHANGED`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
