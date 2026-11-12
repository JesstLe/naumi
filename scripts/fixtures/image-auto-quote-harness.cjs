'use strict';
// Actual route, billing resolution and business-quote functions. Only identity,
// configuration repositories and quote-row I/O are fixtures; no provider calls.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks'),ts=require('typescript');

function createHarness(sourceRoot=process.cwd()){
 const root=path.resolve(__dirname,'../..'),source=path.resolve(sourceRoot),creation=new AsyncLocalStorage();
 const load=p=>require(path.join(root,p));
 const {fixtureModelConfig}=load('scripts/model-config-unit-fixture.ts'),{fixtureConfig}=load('scripts/billing-unit-fixture.ts');
 const state={models:{version:152,digest:'a'.repeat(64),config:fixtureModelConfig('https://fixture.invalid/v1',crypto.randomUUID())},billing:{version:8,config:fixtureConfig()},rows:new Map(),writes:0,calls:[]};
 const cfg=state.models.config,u=cfg.upstreamModels[0];cfg.providers[0].protocol="apimart-images";
 u.model='gpt-image-2.5-sunburst';u.parameterMap={qualityPolicy:{mode:'map',choices:['low','medium','high','xhigh','max'].map(id=>({id,label:id,value:id}))},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1k','2K':'2k','4K':'4k'}},apimartImages:{schemaVersion:1,ratios:['1:1','3:4','16:9'],maxOutputs:4,supportsMask:true}};
 cfg.publicModels[0].id='gpt-image-2';cfg.publicModels[0].supplierRouting={mode:'balanced',channels:[{upstreamId:'u1',enabled:true,weight:1,priority:1}]};
 cfg.bindings={'image.generate':'gpt-image-2','image.edit':'gpt-image-2'};
 state.billing.config.switches.metering='on';
 const tariff=state.billing.config.features['canvas.image'];tariff.enabled=true;tariff.unit='image';tariff.rules=[];
 tariff.pricing={mode:'quality-resolution',quality:{low:0,medium:7,high:11,xhigh:17,max:23},resolutionExtra:{'1K':0,'2K':5,'4K':10}};
 const db={query:async(sql,params=[])=>{
  if(sql.startsWith('CREATE TABLE IF NOT EXISTS app_image_billing_quotes'))return {rows:[]};
  if(sql.startsWith('INSERT INTO app_image_billing_quotes')){state.writes++;const [id,owner,scope_key,quote]=params;state.rows.set(id,{id,owner,scope_key,quote:JSON.parse(quote),expires_at:new Date(Date.now()+900000)});return {rows:[],rowCount:1};}
  if(sql.startsWith('SELECT *,expires_at<=now() expired FROM app_image_billing_quotes')){const row=state.rows.get(params[0]);return {rows:row?.owner===params[1]?[structuredClone(row)]:[]};}
  throw Error('Unexpected fixture SQL');
 }};
 const c={console,Request,Response,Headers,FormData,File,Blob,URL,structuredClone,Date,JSON,Map,Set,BigInt,process:{env:{}},randomUUID:crypto.randomUUID,dbEnabled:true,ensureSchema:async()=>{},getPool:()=>db,
  resolveUserEmail:async req=>req.headers.get('x-fixture-owner'),getSetting:async()=>null,totalPaidCents:async()=>0,
  billingSnapshot:async()=>structuredClone(state.billing),meteringFor:async()=>true,getBillingRuntime:async()=>({config:{current:async()=>structuredClone(state.billing)}}),
  getModelAdministration:async()=>({repo:{current:async()=>structuredClone(state.models),byVersion:async v=>{assert.equal(v,state.models.version);return structuredClone(state.models)}}}),
  readManagedModelSnapshot:async()=>structuredClone(state.models),ensureImageBillingQuotes:async()=>{},modelConfigurationEnabled:async()=>true,currentCreationContext:()=>creation.getStore(),
  withCreationRoute:(req,fn)=>creation.run({scopeKind:req.headers.get('x-fixture-workspace')?'tenant':'personal',tenantId:req.headers.get('x-fixture-workspace')||null},fn),
  getUserImageProvider:async()=>null,upstreamUserImageModel:x=>x,supabaseEnabled:false,multiUserEnabled:async()=>true,
  seed:load('src/lib/billing/bootstrap.json'),...load('src/lib/model-config/context.ts'),...load('src/lib/imagegen/context.ts'),
  ...load('src/lib/model-config/types.ts'),...load('src/lib/billing/types.ts'),...load('src/lib/billing/failure.ts'),...load('src/lib/billing/quote.ts'),...load('src/lib/billing/rules/registry.ts'),
  ...load('src/lib/model-config/selection-policy.ts'),...load('src/lib/model-config/cutout-quality.ts'),...load('src/lib/billing/canvas-defaults.ts'),
  ...load('src/lib/model-config/model-selection.ts'),...load('src/lib/model-config/image-quality-selection.ts'),...load('src/lib/model-config/business.ts'),...load('src/lib/model-config/image-preset.ts'),...load('src/lib/model-config/resolution-fallback.ts'),
  ...load('src/lib/model-config/resolution-options.ts'),...load('src/lib/model-config/public-identity.ts'),...load('src/lib/model-config/billing-identity.ts'),...load('src/lib/model-config/credit-overrides.ts'),...load('src/lib/model-config/quality-policy.ts'),
  ...load('src/lib/model-config/image-parameter-plan.ts'),...load('src/lib/model-config/channel-policy.ts'),...load('src/lib/billing/api-cost.ts'),...load('src/lib/billing/money.ts'),
  ...load('src/lib/request-origin.ts'),...load('src/lib/billing/validation.ts'),...load('src/lib/billing/image-quote-policy.ts'),PRIVATE_HEADERS:load('src/lib/billing/access.ts').PRIVATE_HEADERS,z:require('zod').z};
 // Unused legacy fallbacks fail loudly rather than silently inventing a model.
 for(const name of ['getOpenAISettings','getCutoutSettings','getUserDefaultImageModel','isNewApiFlowImageModel','getImageModelCatalog','routeImageModel','configuredVideoProviders','getVideoProviderConfig','requestedTextModel'])c[name]=()=>{throw Error('Unexpected legacy fallback '+name)};
 const sourceFiles=new Map();
 function declarations(file,names){
  const candidate=path.join(source,file),real=fs.existsSync(candidate)?candidate:path.join(root,file),text=fs.readFileSync(real,'utf8');
  sourceFiles.set(file,{path:real,sha256:crypto.createHash('sha256').update(text).digest('hex')});
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),found=new Map();
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name&&names.includes(n.name.text))found.set(n.name.text,n.getText(ast).replace(/^export\s+/,''));ts.forEachChild(n,visit);}visit(ast);
  return names.map(n=>{assert.ok(found.has(n),'source function '+n);return found.get(n)}).join('\n');
 }
 const body='let ready;\n'+[
  declarations('src/lib/billing/access.ts',['billingJson','sameSiteBillingMutation']),
  declarations('src/lib/billing/request.ts',['billingErrorResponse']),
  declarations('src/lib/model-config/billing-model.ts',['managedBillingModel','managedBillingSelection']),
  declarations('src/lib/billing/image-quotes.ts',['scopeKey','issueImageBillingQuote','imageBillingQuoteForRequest','assertImageBillingSelection']),
  declarations('src/lib/model-config/business-billing.ts',['freezeImagePresetQuote','originalBusinessBillingSnapshot','businessBillingSnapshot','freezeBusinessQuote','freezeBusinessQuoteForModel']),
  declarations('src/lib/billing/quotation.ts',['compatibleQuote','billingFactsForSelection','quoteForImagegenStep','prepareActorQuote']),
  declarations('src/lib/billing/server.ts',['requestSelection','resolveBillingFacts','quoteForRequest']),
  declarations('src/app/api/billing/quote/route.ts',['handlePost','POST']),
 ].join('\n');
 c.billingBinding=f=>c.FEATURE_BINDINGS[f];Object.assign(c,load('src/lib/model-config/bindings.ts'),load('src/lib/model-config/tool-scope.ts'));
 vm.createContext(c);vm.runInContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const request=(input,headers={})=>new Request('http://fixture/api/billing/quote',{method:'POST',headers:{'content-type':'application/json','x-fixture-owner':'quote@example.test',...headers},body:JSON.stringify(input)});
 const post=async(input,headers)=>{const r=await c.POST(request(input,headers)),body=await r.json();state.calls.push({input:structuredClone(input),status:r.status,body});return {status:r.status,body};};
 return {state,context:c,post,request,sourceFiles};
}
module.exports={createHarness};
