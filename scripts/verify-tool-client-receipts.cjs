// Whole BillingProvider, response reader and actual route modules; transport/auth/DB boundaries are local fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto'),{createRequire}=require('node:module');
const ts=require('typescript'),React=require('react'),{renderToString}=require('react-dom/server'),{build}=require('esbuild');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(__dirname,'..'),source=path.resolve(arg('--source-root',root)),out=path.resolve(arg('--output-root',path.join(root,'output/tool-client-receipts'))),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});const loaded=new Map(),checks=[],calls=[],entries=new Map();
const sha=b=>createHash('sha256').update(b).digest('hex'),read=rel=>{const file=path.join(source,rel),body=fs.readFileSync(file);loaded.set(rel,{path:file,sha256:sha(body)});return body.toString('utf8')};
const storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
const realRequire=createRequire(path.join(root,'package.json'));let api,mode='truncated',invalidation=0;
const q={feature:'tool.cutout',version:7,credits:6,reserveCredits:6,quantity:1,modelId:'fixture-image',quote:{id:'11111111-1111-4111-8111-111111111111',expiresAt:'2000-01-01'}};
async function main(){
 const bundle=await build({stdin:{contents:read('src/lib/billing/client.tsx'),resolveDir:path.join(source,'src/lib/billing'),sourcefile:'client.tsx',loader:'tsx'},absWorkingDir:root,bundle:true,write:false,metafile:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'boundaries',setup(b){
  b.onResolve({filter:/^@\/components\/ui\/toast$|^@\/lib\/(?:auth-context|supabase|browser-data-cache)$|^\.\.\/(?:saas\/workspace-client|model-config\/(?:public-client|feature-client))$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('toast')?'export const useToast=()=>({toast:()=>{}})':a.path.includes('auth-context')?'export const useAuth=()=>({user:{email:"owner@fixture.test"},ready:false})':a.path.includes('supabase')?'export const authHeader=async()=>({})':a.path.includes('browser-data-cache')?'export const invalidateBrowserData=()=>globalThis.invalidate()':a.path.includes('workspace-client')?'export const currentWorkspace=()=>"personal"; export const currentWorkspaceRevision=()=>0;export const WORKSPACE_SELECTION="workspace"':a.path.includes('public-client')?'export const MODEL_CATALOG_REFRESH="models"':'export const chosenFeatureModel=()=>"fixture-image";export const FEATURE_MODEL_SELECTION="selection"'}));
 }}]});
 for(const item of Object.keys(bundle.metafile.inputs))if(!item.startsWith('fixture:')&&item!=='client.tsx'){const full=path.resolve(root,item);if(full.startsWith(source)&&fs.existsSync(full)){const rel=path.relative(source,full).replaceAll('\\','/');read(rel)}}
 const ctx={module:{exports:{}},exports:{},require:realRequire,console,Headers,Response,Request,FormData,File,Blob,URL,TextEncoder,Uint8Array,ArrayBuffer,TransformStream,TextDecoder,ReadableStream,crypto:webcrypto,localStorage:storage,setTimeout,clearTimeout,invalidate:()=>invalidation++,window:{dispatchEvent:()=>{}},Event};ctx.globalThis=ctx;
 ctx.fetch=async(url,init)=>{calls.push({url,id:new Headers(init.headers).get('x-naumi-billing-operation-id')});
  if(mode==='truncated')return new Response('{"ok":true,"url":',{status:200,headers:{'content-type':'application/json'}});
  if(mode==='html')return new Response('<html>upstream unavailable</html>',{status:502,headers:{'content-type':'text/html'}});
  if(mode==='empty')return new Response(null,{status:204});
  if(mode==='null')return Response.json(null);
  if(mode==='missing-receipt')return Response.json({ok:true});
  if(mode==='broken')return new Response(new ReadableStream({start(c){c.error(new Error('transport interrupted'))}}));
  if(mode==='network')throw new TypeError('fetch failed');
  if(mode==='sse')return new Response('event: done\ndata: {"ok":true}\n\n',{headers:{'content-type':'text/event-stream'}});
  if(mode==='denied')return Response.json({code:'OPERATION_CONFLICT',error:'different request'},{status:409});
  if(mode==='terminal-failure'||mode==='foreign-terminal')return Response.json({code:'TOOL_EXECUTION_FAILED',error:'original failure',status:'failed',terminal:true,operationId:mode==='foreign-terminal'?'tool-foreign':`tool-${calls.at(-1).id}`,chargedCredits:0},{status:502});
  return Response.json({ok:true,id:'art-exact-original',url:'/media/fixture.png',creditsUsed:6});
 };
 vm.runInNewContext(bundle.outputFiles[0].text,ctx);const client=ctx.module.exports;
 function Capture(){api=client.useBilling();return null;}
 const mount=()=>{entries.clear();calls.length=0;renderToString(React.createElement(client.BillingProvider,null,React.createElement(Capture)))};
 const submit=()=>api.submit('/api/cutout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:'fixture-original'})},q);
 for(const next of ['truncated','html','empty','null','broken']){
  mount();mode=next;let response,data,cause;
  try{response=await submit();data=await response.json()}catch(e){cause=e}
  assert.equal(calls.length,1,'never auto-retry POST');const id=calls[0].id;
  assert.equal(entries.size,1,'unknown response retains original intent');
  if(baseline){assert.ok(cause||data===null,'raw parse failure/null baseline');checks.push(next+':RAW_UNREADABLE_RECEIPT_REPRODUCED')}
  else{assert.ifError(cause);assert.equal(response.status,409);assert.equal(data.code,'OPERATION_PENDING');assert.equal(data.operationId,id);assert.equal(data.recoveryCode,'RECEIPT_UNREADABLE');checks.push(next+':UNKNOWN_ORIGINAL_ID_RETAINED')}
  mode='success';const replay=await submit();assert.equal((await replay.json()).url,'/media/fixture.png');assert.equal(calls[1].id,id,'explicit retry keeps original id');assert.equal(entries.size,0,'completed receipt clears intent');checks.push(next+':EXPLICIT_ORIGINAL_ID_REPLAY');
 }
 mount();mode='network';await assert.rejects(submit(),/fetch failed/);assert.equal(calls.length,1);assert.equal(entries.size,1);checks.push('NETWORK_UNKNOWN_NO_AUTO_POST');
 mount();mode='denied';const denied=await submit();assert.equal(denied.status,409);assert.equal((await denied.json()).code,'OPERATION_CONFLICT');assert.equal(entries.size,1);checks.push('VALID_JSON_ERROR_PRESERVED');
 mount();mode='sse';const stream=await submit();assert.ok((await stream.text()).includes('event: done'));assert.equal(entries.size,0);checks.push('SSE_STREAM_NOT_BUFFERED_AS_JSON');
 if(!baseline){
  mount();mode='missing-receipt';const incomplete=await submit();assert.equal((await incomplete.json()).code,'OPERATION_PENDING');assert.equal(entries.size,1);assert.equal(calls.length,1);checks.push('JSON_SUCCESS_WITHOUT_IMAGE_KEEPS_ORIGINAL_INTENT');
  mount();mode='missing-receipt';const noJob=await api.submit('/api/generate-image',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},q);assert.equal((await noJob.json()).code,'OPERATION_PENDING');assert.equal(entries.size,1);assert.equal(calls.length,1);checks.push('JSON_SUCCESS_WITHOUT_JOB_KEEPS_ORIGINAL_INTENT');
  mount();mode='terminal-failure';const originalFailure=await submit();assert.equal(originalFailure.status,502);assert.equal(entries.size,0);assert.equal(calls.length,1);const priorId=calls[0].id;mode='success';await submit();assert.notEqual(calls[1].id,priorId);checks.push('CONFIRMED_TERMINAL_FAILURE_NEW_ID_ONLY_ON_EXPLICIT_CLICK');
  mount();mode='foreign-terminal';await submit();assert.equal(entries.size,1);checks.push('FOREIGN_TERMINAL_ID_DOES_NOT_CLEAR_ORIGINAL_INTENT');
  const m={exports:{}};vm.runInNewContext('(function(module,exports){'+ts.transpileModule(read('src/lib/billing/client-response.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})(module,module.exports)',{module:m,Response,Headers,TextDecoder,setTimeout,clearTimeout});
  let cancelled=0;const waiting=new Response(new ReadableStream({pull(){return new Promise(()=>{})},cancel(){cancelled++}}));
  const receipt=await m.exports.readBillingSubmissionResponse(waiting,'same-operation',20);assert.equal(receipt.data.code,'OPERATION_PENDING');assert.equal(receipt.data.operationId,'same-operation');assert.equal(cancelled,1);checks.push('BODY_DEADLINE_CANCELS_READER_ONLY');
 }
 // Execute the actual models/upscale routes with absent processor configuration.
 const counters={quote:0,reserve:0,refund:0,fetch:0};let token='';const moduleCache=new Map();
 function load(rel){if(moduleCache.has(rel))return moduleCache.get(rel).exports;const m={exports:{}};moduleCache.set(rel,m);const code=ts.transpileModule(read(rel),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const req=id=>{
   if(id==='next/server')return {NextResponse:Response};if(id==='server-only')return {};
   if(id==='@/lib/billing/synchronous')return {withBillingRequest:async(_r,_f,run)=>run(),configuredToolCost:async()=>{counters.quote++;return 6},synchronousChargedCredits:n=>n,markBillingUpstream:()=>{}};
   if(id==='@/lib/db')return {dbEnabled:true,reserveCredits:async()=>{counters.reserve++;return true},refundCredits:async()=>{counters.refund++},isBanned:async()=>false};
   if(id==='@/lib/admin-auth')return {resolveUserEmail:async()=> 'owner@fixture.test'};
   if(id==='@/lib/ip')return {clientIp:()=> '127.0.0.1'};
   if(id==='@/lib/storage')return {storageEnabled:false};
   if(id==='@/lib/api-error')return {safeError:(_e,msg)=>msg};
   if(id==='@/lib/supplier-cost/collect')return {supplierCostFetch:()=>{throw Error('supplier forbidden')}};
   if(id==='@/lib/billing/rules/registry')return {isFeatureId:v=>v==='tool.upscale'};
   if(id==='@/lib/model-config/requests')return {modelConfigurationEnabled:async()=>true};
   if(id==='@/lib/model-config/server')return {getModelRuntime:async()=>{throw Error('managed model must not replace super-resolution')}};
   if(id==='@/lib/model-config/business')return {FEATURE_BINDINGS:{}};
   if(id==='@/lib/model-config/bindings')return {MODEL_BINDINGS:{}};
   if(id==='@/lib/model-config/types')return {ModelConfigError:class extends Error{}};
   if(id==='@/lib/frontend-image-models')return {frontendImageCatalog:v=>v};
   return realRequire(id);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'})(require,module,module.exports)',{require:req,module:m,console,Response,Request,Headers,FormData,File,Buffer,URL,process:{env:{get REPLICATE_API_TOKEN(){return token}}},fetch:()=>{counters.fetch++;throw Error('network forbidden')}});return m.exports;
 }
 const models=load('src/app/api/models/route.ts'),upscale=load('src/app/api/upscale/route.ts');
 const catalog=await(await models.GET(new Request('http://fixture/api/models?feature=tool.upscale'))).json();
 const form=new FormData();form.set('image',new File([Buffer.from([1,2,3])],'fixture.png',{type:'image/png'}));
 const result=await upscale.POST(new Request('http://fixture/api/upscale',{method:'POST',body:form}));const body=await result.json();assert.equal(result.status,503);
 if(baseline){assert.equal(catalog.available,undefined);assert.equal(counters.quote,1);assert.equal(counters.reserve,1);assert.equal(counters.refund,1);checks.push('MISSING_UPSCALER_ADVERTISED_AND_RESERVED_REPRODUCED')}
 else{assert.equal(catalog.available,false);assert.equal(body.code,'TOOL_NOT_CONFIGURED');assert.equal(counters.quote,0);assert.equal(counters.reserve,0);assert.equal(counters.refund,0);assert.ok(!JSON.stringify(body).includes('token'));checks.push('MISSING_UPSCALER_BLOCKS_BEFORE_QUOTE_OR_RESERVATION');token='configured-fixture-secret';const enabled=await(await models.GET(new Request('http://fixture/api/models?feature=tool.upscale'))).json();assert.equal(enabled.available,true);assert.equal(enabled.supported,false);assert.ok(!JSON.stringify(enabled).includes(token));checks.push('CONFIGURED_UPSCALER_AVAILABLE_WITHOUT_SECRET_LEAK')}
 assert.equal(counters.fetch,0);
 // Whole shared workspace component: recovered receipts never charge the UI twice.
 if(!baseline){
  let index=0,consumed=0,applied=0,processingCalls=0,unavailable=false;const updates=[];
  const m={exports:{}},empty=()=>null;
  const hookReact={...React,useState:init=>{const n=index++;return [n===0?new File(['input'],'input.png',{type:'image/png'}):n===1?'blob:fixture':typeof init==='function'?init():init,value=>updates.push([n,value])]},useRef:value=>({current:value}),useEffect:()=>{}};
  const deps={
   react:hookReact,'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/auth-context':{useAuth:()=>({user:{email:'owner@fixture.test'},ready:true,remaining:100,consumeCredits:n=>consumed+=n,applyServerUser:()=>applied++})},
   '@/lib/auth-modal-context':{useAuthModal:()=>({openAuth:()=>{}})},'@/lib/i18n/locale-context':{useI18n:()=>({locale:'zh'})},
   '@/lib/model-config/feature-client':{useFeatureModels:()=>({catalog:{managed:true,available:!unavailable,models:[]},error:null})},
   '@/lib/billing/preview':{useFeatureBilling:()=>({quote:{credits:7},cost:7,error:null})},'@/lib/billing/feature-map':{CATEGORY_FEATURES:{cutout:'tool.cutout'}},
   '@/components/image-quality-control':{QUALITY_TOOL_CATEGORIES:new Set(),ImageQualityControl:empty},
   '@/lib/utils':{cn:(...x)=>x.filter(Boolean).join(' ')},'@/lib/clipboard-images':{useClipboardImagePaste:()=>undefined},
  };
  const loadPure=rel=>{const value={exports:{}};vm.runInNewContext('(function(module,exports){'+ts.transpileModule(read(rel),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})(module,module.exports)',{module:value});return value.exports};
  deps['@/lib/model-config/feature-availability']=loadPure('src/lib/model-config/feature-availability.ts');deps['@/lib/tool-ui']=loadPure('src/lib/tool-ui.ts');
  const fallback=new Proxy({}, {get:(_t,k)=>k==='__esModule'?true:empty});
  vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(read('src/components/tools/tool-workspace.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText+'})(require,module,module.exports)',{require:id=>Object.hasOwn(deps,id)?deps[id]:fallback,module:m,console,File,URL,Set,Map});
  function nodes(value){if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object')return [];return [value,...nodes(value.props?.children)]}
  for(const value of [{replayed:true,user:null},{replayed:true,user:{email:'owner@fixture.test'}},{replayed:false,user:null}]){
   index=consumed=applied=processingCalls=0;updates.length=0;
   const tree=m.exports.ToolWorkspace({name:'fixture',desc:'',Icon:empty,tint:'#fff',accent:'#fff',category:'cutout',cost:7,action:'fixture action',onProcess:async()=>{processingCalls++;return {url:'/media/original.png',creditsUsed:7,...value}}});
   const cta=nodes(tree).find(n=>n.type==='button'&&n.props.className?.includes('shadow-btn'));assert.ok(cta);await cta.props.onClick();assert.equal(processingCalls,1);assert.equal(consumed,!value.replayed?7:0);assert.equal(applied,value.user?1:0);assert.ok(updates.some(([n,x])=>n===2&&x==='/media/original.png'));checks.push('WORKSPACE_BALANCE_'+(value.replayed?'REPLAY':'NEW')+(value.user?'_SERVER':'_NO_SERVER'));
  }
  index=0;unavailable=true;const tree=m.exports.ToolWorkspace({name:'fixture',desc:'',Icon:empty,tint:'#fff',accent:'#fff',category:'upscale',feature:'tool.upscale',cost:7,action:'fixture action',onProcess:async()=>{throw Error('unavailable tool cannot run')}});const all=nodes(tree);assert.equal(all.find(n=>n.type==='button'&&n.props.className?.includes('shadow-btn')).props.disabled,true);assert.ok(all.some(n=>n.props?.role==='alert'&&String(n.props.children).includes('当前功能暂不可用')));checks.push('UNAVAILABLE_TOOL_DISABLED_WITH_READABLE_REASON');
 }
 const report={status:baseline?'REPRODUCED':'PASS',checks,loaded:[...loaded].map(([file,x])=>({file,...x})),network:0,supplierCalls:0,productionWrites:0,exit:baseline?1:0};
 fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify(report,null,2));
 console.log(`TOOL_CLIENT_RECEIPTS=${report.status} CASES=${checks.length} NETWORK=0 SUPPLIER_CALLS=0 EXIT=${report.exit}`);process.exitCode=report.exit;
}
main().catch(e=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:e.stack,checks,calls,loaded:[...loaded]},null,2));console.error(e);process.exitCode=2});
