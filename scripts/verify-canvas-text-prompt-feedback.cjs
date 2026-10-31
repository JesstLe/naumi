// Real complete Route, OpenAI SDK, modelAwareOpenAI and reply-adapter modules.
// Only auth/config/DB/observability/media boundaries are isolated fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const source=path.resolve(arg('--source-root',root)),out=path.resolve(arg('--output-root',process.env.CANVAS_TEXT_PROMPT_EVIDENCE||path.join(root,'output/canvas-text-prompt-feedback'))),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});
const loaded=new Map(),cache=new Map(),checks=[],calls=[],state={mode:'sse',body:null,key:'fixture',scope:null,managed:false,terminal:'stop',catalogCalls:0};
let origin='';
const forbidden=name=>()=>{throw Error('Unexpected boundary '+name)};
const boundaries={
 'src/lib/db.ts':{dbEnabled:true,listArtworksByIds:async(_email,ids)=>ids.map(id=>({id,title:'Owned reference',prompt:'',image:'data:image/png;base64,Zml4dHVyZQ=='}))},
 'src/lib/admin-auth.ts':{resolveUserEmail:async()=> 'fixture@local.test'},
 'src/lib/request-auth.ts':{authenticatedEmail:async()=> 'fixture@local.test'},
 'src/lib/settings.ts':{getOpenAISettings:async()=>({apiKey:state.key})},
 'src/lib/openai-base.ts':{getOpenAIBaseUrl:async()=>origin+'/v1'},
 'src/lib/rate-limit-http.ts':{checkRateLimit:async()=>true},
 'src/lib/ip.ts':{clientIp:()=> '127.0.0.1'},
 'src/lib/api-error.ts':{safeError:(_e,f)=>f},
 'src/lib/text-models.ts':{requestedTextModel:()=> 'fixture-text'},
 'src/lib/bi/model-observer.ts':{observeOpenAI:x=>x,withBiRequest:(_r,run)=>run()},
 'src/lib/billing/synchronous.ts':{withBillingRequest:(_r,_f,run)=>run(),configuredToolCost:async()=>0},
 'src/lib/model-config/requests.ts':{modelConfigurationEnabled:async()=>state.managed},
 'src/lib/model-config/context.ts':{currentModelExecution:()=>state.scope,currentExecutionBundle:()=>state.scope?{}:null},
 'src/lib/supplier-cost/collect.ts':{supplierCostFetch:x=>x},
 'src/lib/vision-image.ts':{toVisionDataUrl:async()=> 'data:image/png;base64,Zml4dHVyZQ=='},
 'src/lib/storage.ts':{dataUrlToBytes:()=>({bytes:Buffer.from('fixture'),contentType:'image/png'}),isManagedImageUrl:()=>false,readManagedObject:forbidden('media')},
 'src/lib/prompt-config.ts':{getAssistSystem:async()=> 'write',getOptimizeSystem:async()=> 'optimize',ASSIST_TOOL_HINTS:{}},
 'src/lib/model-config/local-image-rejection.ts':{localImageRejectionResponse:forbidden('image')},
 'src/lib/model-config/image-plan-runtime.ts':{executionImageParameterPlan:()=>undefined},
 'src/lib/model-config/image-parameter-plan.ts':{applyImageParameterPlan:forbidden('image')},
 'src/lib/model-config/apimart-image-policy.ts':{applicationAPIMartImages:()=>false},
 'src/lib/imagegen/context.ts':{currentImagegenStep:()=>undefined},
 'src/lib/imagegen/parameters.ts':{mapImagegenParameters:forbidden('image'),imagegenWireRequest:forbidden('image')},
 'src/lib/imagegen/capabilities.ts':{publishedImagegenCapabilities:forbidden('image'),IMAGEGEN_FIELDS_BY_CAPABILITY:{}},
 'src/lib/model-config/stage-routing.ts':{stageRoutingFetch:forbidden('stage')},
 'src/lib/model-config/apimart-preset.ts':{apimartImagesFetch:forbidden('image')},
 'src/lib/model-config/channel-fetch.ts':{channelRoutingFetch:()=>async(input,init)=>{const prepared=await load('src/lib/model-config/channel-text-response.ts').prepareChannelText(await global.fetch(input,init),async()=>{});return prepared.response;}},
 'src/lib/model-config/transport.ts':{modelEndpointFetch:()=>global.fetch},
 'src/lib/image-gateway.ts':{appendImageGatewayFields:forbidden('image')},
 'src/lib/model-config/resolution-policy.ts':{mapResolution:forbidden('image'),RESOLUTION_FIELDS:[]},
 'src/lib/model-config/quality-policy.ts':{policyQuality:forbidden('image')},
 'src/lib/model-config/reverse-hub-images.ts':{reverseHubImageFetch:forbidden('image')},
 'src/lib/model-health/observe.ts':{healthObservedFetch:(_scope,transport)=>transport},
 'src/lib/supplier-cost/io.ts':{readBounded:async(response,max)=>{const text=await response.text();if(Buffer.byteLength(text)>max)throw Error('oversize');return text;}},
 'src/lib/model-config/public-client.ts':{MODEL_CATALOG_REFRESH:'fixture:refresh',rememberModelCatalogVersion:()=>{}},
 'src/lib/image-model-routing.ts':{compactImageModelOptions:x=>x,imageModelDisplayId:x=>x},
 'src/lib/supabase.ts':{authHeader:async()=>({})},
};
Object.assign(boundaries,{
 'src/lib/billing/synchronous-operation.ts':boundaries['src/lib/billing/synchronous.ts'],
 'src/lib/bi/request.ts':{withBiRequest:(_r,run)=>run()},
 'src/lib/bi/model-calls.ts':{observeOpenAI:x=>x,observeModelCall:(_m,run)=>run(),modelExecutionTelemetry:()=>null},
 'src/lib/object-storage/runtime.ts':boundaries['src/lib/storage.ts'],
 'src/lib/object-storage/managed-read.ts':boundaries['src/lib/storage.ts'],
 'src/lib/model-config/availability.ts':boundaries['src/lib/model-config/requests.ts'],
 'src/lib/model-config/stage-routing-policy.ts':{createStageRoutingFetch:forbidden('stage')},
 'src/lib/model-config/channel-routing.ts':{createChannelRoutingFetch:boundaries['src/lib/model-config/channel-fetch.ts'].channelRoutingFetch},
 'src/platform/db/pool.ts':boundaries['src/lib/db.ts'],
 'src/lib/artworks/repository.ts':boundaries['src/lib/db.ts'],
 'src/lib/saas/creation-access.ts':{withCreationRoute:(_r,run)=>run()},
});

function load(rel){
 if(boundaries[rel])return boundaries[rel];if(cache.has(rel))return cache.get(rel).exports;
 const file=path.join(source,rel),bytes=fs.readFileSync(file),mod={exports:{}};cache.set(rel,mod);loaded.set(rel,{file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const code=ts.transpileModule(bytes.toString('utf8'),{fileName:rel,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const requireLocal=id=>{if(id==='server-only')return {};if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});if(id==='next/server')return{NextResponse:{json:(data,options)=>Response.json(data,options)}};let base=id.startsWith('@/')?'src/'+id.slice(2):id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(rel),id)):null;if(!base)return require(id);for(const ext of ['', '.ts','.tsx','.json','/index.ts'])if(boundaries[base+ext]||fs.statSync(path.join(source,base+ext),{throwIfNoEntry:false})?.isFile())return load(base+ext);throw Error('Missing '+base)};
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(requireLocal,mod,mod.exports);return mod.exports;
}
function chunk(delta,finish_reason=null,extra={}){return {id:'fixture-chat',object:'chat.completion.chunk',model:'fixture-wire',choices:[{index:0,delta,finish_reason}],...extra};}
function sse(data){return 'data: '+(typeof data==='string'?data:JSON.stringify(data))+'\r\n\r\n';}
const request=(kind='text',patch={})=>new Request('http://fixture.local'+(kind==='text'?'/api/canvas/text-generate':'/api/prompt-assist'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(kind==='text'?{prompt:'请写商品说明',...patch}:{tool:'canvas-image',mode:'optimize',idea:'保留“晚安”和【图1】',...patch})});
const check=name=>{checks.push(name);console.log('CHECK='+name)};
async function main(){
 const previousFetch=global.fetch;delete process.env.AGENT_API_KEY;delete process.env.AGENT_BASE_URL;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);calls.push(body);state.body=body;
  if(state.mode==='json'||state.mode==='parts'||state.mode==='limit'){
   const content=state.mode==='parts'?[{type:'reasoning',text:'PRIVATE'},{type:'output_text',text:'保留“晚安”和【图1】，自然柔光。'}]:'保留“晚安”和【图1】，自然柔光。';
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'json-fixture',choices:[{index:0,message:{role:'assistant',content},finish_reason:state.mode==='limit'?'length':'stop'}],usage:{prompt_tokens:11,completion_tokens:12}}));return;
  }
  res.writeHead(200,{'content-type':state.mode==='content-type'?'Text/Event-Stream; charset=UTF-8':'text/event-stream; charset=utf-8'});
  let data=sse(chunk({role:'assistant',reasoning_content:'PRIVATE_THOUGHT'}));
  if(state.mode==='error')data+='event: error\ndata: {"error":{"message":"PRIVATE_KEY_UPSTREAM"}}\n\n';
  else if(state.mode==='tools')data+=sse(chunk({tool_calls:[{index:0,id:'call-1',type:'function',function:{name:'look',arguments:'{"x":'}}]}))+sse(chunk({tool_calls:[{index:0,function:{arguments:'1}'}}]},'tool_calls'));
  else if(state.mode==='reasoning')data+=sse(chunk({},'stop'));
  else if(state.mode==='image')data+=sse(chunk({images:[{image_url:{url:'data:image/png;base64,PRIVATE'}}]},'stop'));
  else if(state.mode==='oversize')data+=sse(chunk({content:'x'.repeat(4*1024*1024)}));
  else {data+=sse(chunk({content:'保留“晚安”和【图1】，'}));if(state.mode!=='truncated')data+=sse(chunk({content:'自然柔光。'},state.terminal));}
  if(!['truncated','error','oversize'].includes(state.mode))data+=sse({id:'fixture-chat',choices:[],usage:{prompt_tokens:11,completion_tokens:12,total_tokens:23}})+sse('[DONE]');
  // Split UTF-8 and CRLF arbitrarily to exercise decoder/event framing.
  const bytes=Buffer.from(data);for(let offset=0;offset<bytes.length;offset+=37)res.write(bytes.subarray(offset,offset+37));res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 global.fetch=(input,init)=>{const url=typeof input==='string'?input:input.url||String(input);assert.ok(url.startsWith(origin+'/'),'network outside isolated HTTP fixture');return previousFetch(input,init)};
 try{
  const text=load('src/app/api/canvas/text-generate/route.ts').POST,optimize=load('src/app/api/prompt-assist/route.ts').POST;
  state.mode='sse';let before=calls.length,response=await text(request());let data=await response.json();
  if(baseline){assert.equal(response.status,502);assert.equal(data.code,'TEXT_OUTPUT_EMPTY');check('SSE_NONSTREAM_TEXT_RETURNS_FALSE_EMPTY');response=await optimize(request('prompt'));assert.equal(response.status,502);assert.match((await response.json()).error,/AI 帮写失败/);check('SSE_NONSTREAM_OPTIMIZER_THROWS_GENERIC_ERROR');}
  else{assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.text,'保留“晚安”和【图1】，自然柔光。');assert.equal(calls.length,before+1);check('TEXT_REAL_SDK_ACCEPTS_FORCED_SSE_ONE_POST');response=await optimize(request('prompt'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));check('PROMPT_OPTIMIZER_REAL_SDK_ACCEPTS_FORCED_SSE');}
  state.mode='json';response=await text(request());assert.equal(response.status,200);check('STANDARD_JSON_POSITIVE_CONTROL');
  state.mode='parts';response=await optimize(request('prompt'));data=await response.json();if(baseline){assert.equal(response.status,502);check('STRUCTURED_PROMPT_CONTENT_REPRODUCES_TRIM_FAILURE');}else{assert.equal(response.status,200);assert.ok(!data.prompt.includes('PRIVATE'));check('STRUCTURED_PROMPT_ANSWER_NOT_REASONING');}
  const clients=load('src/lib/model-config/clients.ts'),openai=clients.modelAwareOpenAI({apiKey:'fixture',baseURL:origin+'/v1'});
  if(!baseline){
   for(const mode of ['content-type','truncated','error','reasoning','image','oversize']){state.mode=mode;before=calls.length;response=await text(request());data=await response.json();assert.equal(response.status,mode==='content-type'?200:502,mode+JSON.stringify(data));assert.equal(calls.length,before+1);assert.ok(!JSON.stringify(data).includes('PRIVATE'));check('ONE_POST_'+mode.toUpperCase());}
   state.mode='limit';response=await text(request());assert.equal(response.status,502);assert.equal((await response.json()).code,'TEXT_OUTPUT_LIMIT');check('TRUNCATED_TEXT_NOT_SAVED_AS_SUCCESS');
   state.mode='tools';const tool=await openai.chat.completions.create({model:'fixture',messages:[]});assert.equal(tool.choices[0].message.tool_calls[0].function.arguments,'{"x":1}');assert.equal(tool.usage.total_tokens,23);assert.equal(tool.choices[0].finish_reason,'tool_calls');check('TOOL_CALL_FRAGMENTS_AND_USAGE_PRESERVED');
   state.mode='sse';const stream=await openai.chat.completions.create({model:'fixture',messages:[],stream:true});let streamed='';for await(const part of stream)streamed+=part.choices[0]?.delta?.content||'';assert.equal(streamed,'保留“晚安”和【图1】，自然柔光。');check('REQUESTED_STREAM_STAYS_STREAMING');
   const prepare=load('src/lib/model-config/channel-text-response.ts').prepareChannelText;const prepared=await prepare(Response.json({choices:[{message:{content:[{type:'output_text',text:'可用正文'}]}}]}),async()=>{});assert.equal(prepared.streaming,false);check('CHANNEL_ACCEPTS_STRUCTURED_ANSWER_BLOCKS');
   await assert.rejects(prepare(Response.json({choices:[{message:{reasoning_content:'PRIVATE'}}]}),async()=>{}));check('CHANNEL_REASONING_ONLY_NOT_SUCCESS');
   state.key='';state.managed=true;state.scope={frozen:{modality:'text',publicModelId:'fixture-public'},connection:{providerId:'fixture',wireModel:'fixture-wire',baseUrl:origin+'/v1',apiKey:'managed-fixture',protocol:'openai-chat',timeoutMs:5000},capabilities:{vision:true},parameterMap:{}};
   response=await text(request());assert.equal(response.status,200);assert.equal(state.body.model,'fixture-wire');check('MANAGED_TEXT_WITHOUT_LEGACY_KEY_USES_FROZEN_CONNECTION');
   state.scope.supplierRouting={targets:[{scope:state.scope}]};state.mode='content-type';response=await text(request());assert.equal(response.status,200);check('MANAGED_CHANNEL_RESPONSE_PREPARATION_THEN_SDK_NORMALIZATION');
   state.scope=null;state.key='fixture';state.managed=false;
   const priorWindow=global.window,priorDocument=global.document,priorLocal=global.localStorage,storage=new Map();global.window=new EventTarget();global.document=Object.assign(new EventTarget(),{visibilityState:'visible'});global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
   global.fetch=async()=>{state.catalogCalls++;await Promise.resolve();return Response.json({managed:true,models:[{id:'published-vision',label:'Vision',modality:'text',supportsEdit:false}],defaultModelId:'missing-default'})};
   try{const feature=load('src/lib/model-config/feature-client.ts');assert.equal(feature.chosenFeatureModel('canvas.ocr'),undefined);const ids=await Promise.all([feature.ensureFeatureModelSelection('canvas.ocr'),feature.ensureFeatureModelSelection('canvas.ocr')]);assert.deepEqual(ids,['published-vision','published-vision']);assert.equal(state.catalogCalls,1);check('OCR_IMMEDIATE_ACTION_AWAITS_ONE_CATALOG_AND_VALID_SELECTION');global.fetch=async()=>Response.json({managed:true,models:[],defaultModelId:'stale'});await assert.rejects(feature.ensureFeatureModelSelection('canvas.text-generate'),/没有启用模型/);check('EMPTY_CATALOG_REJECTS_STALE_DEFAULT');}finally{global.window=priorWindow;global.document=priorDocument;global.localStorage=priorLocal;}
  }
  const result=baseline?'REPRODUCED':'PASS',exit=baseline?1:0;
  fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({result,checks,loaded:[...loaded].map(([file,meta])=>({file,...meta})),localHttpPosts:calls.length,realSupplierCalls:0,productionWrites:0,exit},null,2));
  console.log(`CANVAS_TEXT_PROMPT_FEEDBACK=${result} CHECKS=${checks.length} REAL_SDK=YES REAL_ROUTES=YES SUPPLIER_CALLS=0 EXIT=${exit}`);process.exitCode=exit;
 }finally{global.fetch=previousFetch;server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,checks,loaded:[...loaded]},null,2));console.error(error);process.exitCode=1});
