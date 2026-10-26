/** Targeted real-source behavior verifier. No supplier or external HTTP calls.
 * tsx --conditions react-server scripts/verify-pricing-friction-image.ts --mode baseline|modified [--source-root PATH]
 * Baseline projects ONLY the five owned sources; other dependencies stay current.
 * PG requires NAUMI_VERIFY_ISOLATED_DB=1 and loopback DATABASE_URL; random schema is dropped.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';
import {imagegenRequestSchema} from '../src/lib/imagegen/schema';
import {quote} from '../src/lib/billing/quote';
import type {BillingConfig,BillingQuote,FeatureId} from '../src/lib/billing/types';

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]};
const mode=arg('--mode')||'modified',baseline=mode==='baseline';
assert.ok(['baseline','modified'].includes(mode));
const root=path.resolve('.'),sourceRoot=path.resolve(arg('--source-root')||(baseline?'output/pricing-friction-removal-20261023/image/baseline':'.'));
const owned=new Set(['src/lib/imagegen/plan.ts','src/lib/imagegen/batch.ts','src/lib/imagegen/canvas-client.ts','src/lib/imagegen/quotes.ts','src/lib/billing/client.tsx']);
const source=(relative:string)=>path.join(owned.has(relative)?sourceRoot:root,relative);
const browserCrypto={browserRandomUUID:randomUUID,browserSha256Hex:async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')};
const cases:{case:string;result:string;detail?:unknown}[]=[];
let checks=0,networkCalls=0,context:any,featureAllowed=true,inputReads=0;
const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++};
const same=(a:unknown,b:unknown,label:string)=>check(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);
const record=(name:string,detail?:unknown)=>{const row={case:name,result:'PASS',...(detail===undefined?{}:{detail})};cases.push(row);console.log(JSON.stringify(row))};
const owner='pricing-image@example.test';
const creation={currentCreationContext:()=>context,assertCurrentCreationFeature:async()=>{if(!featureAllowed)throw Error('feature revoked')},frozenCreationScope:(value:any,email:string)=>{if(value==null)return undefined;if(value.actorEmail!==email.toLowerCase()||!['personal','tenant'].includes(value.scopeKind)||(value.scopeKind==='tenant')!==(typeof value.tenantId==='string'))throw Error('invalid scope');return value;}};
function load(relative:string,deps:Record<string,any>={},globals:Record<string,any>={}){
 const filename=source(relative),output=ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const projected={exports:{} as any},require=createRequire(path.join(root,relative));
 const imports=(id:string)=>id==='server-only'?{}:Object.hasOwn(deps,id)?deps[id]:require(id);
 vm.runInNewContext(output,{module:projected,exports:projected.exports,require:imports,Error,Buffer,console,structuredClone,Date,URL,Response,Request,Headers,FormData,Blob,File,TextEncoder,TextDecoder,Uint8Array,TransformStream,AbortSignal,DOMException,crypto:webcrypto,setTimeout,clearTimeout,process:{env:{}},...globals},{filename});return projected.exports;
}
class MemoryStorage {values=new Map<string,string>();get length(){return this.values.size}key(i:number){return [...this.values.keys()][i]??null}getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}clear(){this.values.clear()}}
const request=(extra:Record<string,unknown>={})=>imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',prompt:'Draw a ceramic bottle',modelId:'image-a',parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},...extra});

async function canvasTests(){
 const bundled=await build({stdin:{contents:`export * from './src/lib/imagegen/canvas-client';export * from './src/lib/imagegen/client';export * from './src/lib/imagegen/http';export * from './src/lib/saas/workspace-client';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'owned-source-and-auth',setup(b){
  b.onLoad({filter:/[\\/]src[\\/]lib[\\/]imagegen[\\/]canvas-client\.ts$/},args=>({contents:readFileSync(source('src/lib/imagegen/canvas-client.ts'),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));
  b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function authHeader(){await globalThis.fixtureAuth();return {}}`,loader:'js'}));
 }}]});
 let storage=new MemoryStorage(),localStorage=new MemoryStorage(),plans=0,posts:any[]=[],gets=0,confirms=0,heavy=false,auth=async()=>{},nextPrice=14;
 let post=async(body:any)=>Response.json({jobId:`imagegen-${body.operationId}`,operationId:body.operationId});
 const fetcher=async(input:any,init:any)=>{const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.endsWith('/plan')){plans++;return Response.json({request:body,quote:{id:`quote-${plans}`,expiresAt:new Date(Date.now()+900000).toISOString()},steps:heavy?[{operation:'generate'},{operation:'cutout'}]:[{operation:'generate'}],intent:{background:null},totalCredits:heavy?150:plans===1?12:nextPrice,billingVersion:8,modelVersion:12,warnings:[],confirmationRequired:heavy})}
  if(init?.method==='POST'){posts.push(body);return post(body)}gets++;const id=new URL(url,'http://fixture').searchParams.get('operationId');return Response.json({jobId:`imagegen-${id}`,operationId:id,status:'running'});
 };
 const boot=()=>{const m={exports:{} as any};vm.runInNewContext(bundled.outputFiles[0].text,{module:m,exports:m.exports,console,fetch:fetcher,sessionStorage:storage,window:{localStorage,confirm:()=>{confirms++;return false}},fixtureAuth:()=>auth(),Response,Request,Headers,FormData,File,Blob,URL,AbortSignal,TextEncoder,Uint8Array,DOMException,crypto:webcrypto,setTimeout,clearTimeout});return m.exports};
 let client=boot();
 const reset=()=>{storage=new MemoryStorage();localStorage=new MemoryStorage();plans=0;posts=[];gets=0;confirms=0;heavy=false;auth=async()=>{};post=async b=>Response.json({jobId:`imagegen-${b.operationId}`,operationId:b.operationId});client=boot()};
 const form=()=>{const f=new FormData();f.set('prompt','Draw a bottle');f.set('ratio','1:1');f.set('model','image-a');f.set('imagegenNodeId','node-A');return f};
 const run=(scope:any={owner,project:'project-A'})=>client.submitCanvasImagegen(form(),undefined,undefined,scope);
 heavy=true;
 if(baseline)await assert.rejects(run());else await run();
 check([posts.length,confirms],baseline?[0,1]:[1,0],'actual canvas heavy click no extra confirmation');record('canvas_costly_multistep_click',{paidPosts:posts.length,confirms});
 reset();post=async b=>posts.length===1?Response.json({code:'IMAGEGEN_PLAN_CHANGED',accepted:false,error:'fixture old server'},{status:409}):Response.json({jobId:`imagegen-${b.operationId}`});
 if(baseline)await assert.rejects(run());else await run();
 check([posts.length,plans,confirms],baseline?[1,2,1]:[2,2,0],'known unaccepted refresh bounded, no popup');if(!baseline)check(posts[0].operationId,posts[1].operationId,'same operation on proven unaccepted');record('canvas_proven_unaccepted_same_operation',{paidPosts:posts.length,plans,confirms});
 reset();post=async()=>{throw Error('fixture lost receipt')};await assert.rejects(run());client=boot();await run();check([posts.length,plans,gets],[1,1,1],'unknown recovery GET only after reload');
 await run({owner:'other@example.test',project:'project-A'}).catch(()=>{});check(posts.length,2,'different owner separate action');client=boot();await run();check(posts.length,2,'original owner recovers without POST');record('canvas_unknown_reload_scope',{unknownReposts:0,originalPlans:1});
 reset();let current=true;auth=async()=>{current=false};await assert.rejects(run({owner,project:'project-A',isCurrent:()=>current}));check(posts.length,0,'scope switch before paid POST');
 reset();await Promise.all([run(),run()]);check(posts.length,1,'concurrent canvas click single paid POST');
 reset();nextPrice=12;post=async()=>Response.json({accepted:false,error:'explicit rejection'},{status:400});await assert.rejects(run());const original=posts[0].operationId;post=async b=>Response.json({jobId:`imagegen-${b.operationId}`});await run();check(posts[1].operationId,original,'explicit user retry keeps operation');record('canvas_scope_concurrency_explicit_retry');
}

async function genericClientTests(){
 let slots:any[]=[],index=0,confirms=0,allowConfirm=false,posts:{headers:Headers;body:any}[]=[],quoteCalls=0,auth=async()=>{},responseMode='ok';
 const localStorage=new MemoryStorage(),catalog={version:8},user={email:owner};
 let next:any={version:8,modelVersion:12,feature:'canvas.image',quantity:1,credits:6,reserveCredits:30,authorizedCredits:30,mode:'api-cost-plus'};
 const react={createContext:()=>({Provider:'Provider'}),useContext:()=>null,useCallback:(f:any)=>f,useEffect:()=>{},useRef:(value:any)=>{const i=index++;return slots[i]??(slots[i]={current:value})},useState:(value:any)=>{const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],(v:any)=>{slots[i]=v}]}};
 const fetcher=async(input:any,init:any)=>{const url=String(input);if(url.endsWith('/catalog'))return Response.json(catalog);if(url.endsWith('/quote')){quoteCalls++;return Response.json({...next,quote:{id:`quote-${quoteCalls}`,expiresAt:new Date(Date.now()+900000).toISOString()}})}
  posts.push({headers:new Headers(init.headers),body:JSON.parse(String(init.body))});if(responseMode==='unknown')return Response.json({code:'OPERATION_PENDING',error:'unknown'},{status:409});if(responseMode==='expired'&&posts.length===1)return Response.json({code:'IMAGE_QUOTE_EXPIRED',accepted:false},{status:409});return Response.json({ok:true});
 };
 const intent=load('src/lib/billing/client-intent.ts',{'../browser-crypto':browserCrypto});
 const api=load('src/lib/billing/client.tsx',{'react':react,'react/jsx-runtime':{jsx:(_t:any,p:any)=>({props:p}),jsxs:(_t:any,p:any)=>({props:p})},'@/components/ui/toast':{useToast:()=>({toast:()=>{}})},'@/lib/browser-data-cache':{invalidateBrowserData:()=>{}},'@/lib/supabase':{authHeader:async()=>{await auth();return {}}},'@/lib/auth-context':{useAuth:()=>({user,ready:true})},'./client-intent':intent,'../model-config/public-client':{MODEL_CATALOG_REFRESH:'models'},'../model-config/feature-client':{chosenFeatureModel:()=>undefined,FEATURE_MODEL_SELECTION:'selection'},'../browser-crypto':browserCrypto,'../saas/workspace-client':{currentWorkspace:()=> 'personal',currentWorkspaceRevision:()=>0,WORKSPACE_SELECTION:'naumi-workspace-selection'}},{fetch:fetcher,localStorage,window:{confirm:()=>{confirms++;return allowConfirm},addEventListener(){},removeEventListener(){},dispatchEvent(){}}});
 const render=()=>{index=0;return api.BillingProvider({children:null}).props.value};let billing=render();await billing.refresh();billing=render();
 const init={method:'POST',body:JSON.stringify({prompt:'draw',operationId:'initial'})};
 if(baseline)await assert.rejects(billing.submit('/paid',init,next));else await billing.submit('/paid',init,next);
 check([posts.length,confirms],baseline?[0,1]:[1,0],'generic api-cost-plus no window.confirm');if(!baseline)check(posts[0].headers.get('x-naumi-billing-credits'),'30','server authorized cap retained');record('generic_cost_plus_click',{paidPosts:posts.length,confirms});
 posts=[];confirms=0;localStorage.clear();slots[5]?.current?.clear?.();next={...next,mode:'fixed',version:9,feature:'text.generate'};
 if(baseline)await assert.rejects(billing.quoteAndSubmit('/paid',init,{feature:'text.generate',quantity:1}));else await billing.quoteAndSubmit('/paid',init,{feature:'text.generate',quantity:1});
 check(posts.length,baseline?0:1,'fresh server quote accepted despite catalog version');if(!baseline)check(posts[0].headers.get('x-naumi-billing-version'),'9','fresh server version preserved');record('generic_catalog_version_drift',{catalog:8,serverQuote:9,paidPosts:posts.length});
 posts=[];confirms=0;quoteCalls=0;allowConfirm=true;localStorage.clear();responseMode='unknown';next={...next,version:10,credits:14};await billing.submit('/unknown',init,{...next,version:9,credits:12,quote:{id:'original',expiresAt:new Date(Date.now()-10000).toISOString()},selection:{feature:'canvas.image',quantity:1}});check(posts.length,1,'generic unknown response no automatic POST');check([...localStorage.values.values()].length>0,true,'generic unknown keeps identity');check(quoteCalls,baseline?1:0,'TTL must not fetch current quote');check([posts[0].headers.get('x-naumi-image-quote'),posts[0].headers.get('x-naumi-billing-credits')],baseline?['quote-1','14']:['original','12'],'expired server quote retains original price');record('generic_expired_quote_original_price_no_auto_post',{paidPosts:1,quoteRequests:quoteCalls,quoteId:posts[0].headers.get('x-naumi-image-quote'),credits:posts[0].headers.get('x-naumi-billing-credits')});
 posts=[];confirms=0;quoteCalls=0;allowConfirm=false;localStorage.clear();responseMode='expired';const originalQuote={...next,version:9,credits:12,quote:{id:'original',expiresAt:new Date(Date.now()+900000).toISOString()},selection:{feature:'canvas.image',quantity:1}};await billing.submit('/retry',init,originalQuote).catch((e:unknown)=>{if(!baseline)throw e});
 check([posts.length,confirms,quoteCalls],baseline?[1,1,1]:[1,0,0],'old-server expiry never silently reprices or auto reposts');if(!baseline){const originalId=posts[0].headers.get('x-naumi-billing-operation-id');responseMode='ok';await billing.submit('/retry',init,originalQuote);check(posts[1].headers.get('x-naumi-billing-operation-id'),originalId,'explicit retry retains original operation');check(posts[1].headers.get('x-naumi-image-quote'),'original','explicit retry original quote');}record('generic_old_server_error_explicit_retry',{paidPosts:posts.length,confirms,quoteRequests:quoteCalls});
 posts=[];responseMode='ok';await assert.rejects(billing.submit('/guard',init,next,()=>{throw Error('scope changed')}));check(posts.length,0,'generic identity guard remains adjacent to POST');record('generic_scope_guard');
}

async function serverTests(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');
 for(const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];
 const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;process.env.NAUMI_MULTI_USER='1';
 let db:typeof import('../src/lib/db')|undefined;
 try{
  db=await import('../src/lib/db');await db.ensureSchema();const pool=db.getPool();await pool.query("INSERT INTO app_settings(k,v) VALUES('signup_bonus_credits','0') ON CONFLICT(k) DO UPDATE SET v='0'");await db.getOrCreateUser(owner,'Pricing fixture');await db.getOrCreateUser('other@example.test','Other fixture');
  const scope=load('src/lib/imagegen/creation-scope.ts',{'../saas/creation-context':creation});
  const config=JSON.parse(readFileSync(path.join(root,'src/lib/billing/bootstrap.json'),'utf8')) as BillingConfig;config.switches.metering='on';
  for(const feature of ['canvas.image','image.generate','tool.cutout'] as const){config.features[feature].enabled=true;config.features[feature].rules=[];config.features[feature].pricing={mode:'fixed',credits:6};}
  let price=6,costPlus=false,multistep=false;
  const q=(feature:FeatureId='canvas.image',quantity=1):BillingQuote=>{const c=structuredClone(config);c.features[feature].pricing=costPlus?{mode:'api-cost-plus',estimateCnyMicros:'100000',authorizationCnyMicros:'500000',factorBps:10000,creditsPerCnyMicros:'100000000',rounding:'ceil'}: {mode:'fixed',credits:price};return {...quote({version:8,config:c},{feature,quantity,quality:'medium',resolution:'1K',byok:false,metered:true,paidFen:0,userGroup:'free'}),modelVersion:12}};
  const models={version:12,config:{...f.config,bindings:{...f.config.bindings,"image.cutout":"image-cutout"},publicModels:[...f.config.publicModels,{...f.config.publicModels[0],id:'image-cutout',target:{type:'upstream',id:'u2'}}],upstreamModels:[...f.config.upstreamModels,{...f.config.upstreamModels[0],id:'u2'}]}};
  const policy={'../feature-access/server':{userFeaturePolicy:async()=>({}),FeatureAccessError:Error},'../feature-access/catalog':{allows:()=>featureAllowed}};
  const {prepareImageOperation:requirePrepared}=await import('../src/lib/model-config/image-preparation');
  const plan=load('src/lib/imagegen/plan.ts',{'../model-config/resolution-fallback':{resolveImageResolution:()=>undefined,upstreamAcceptsResolution:()=>true},'./inputs':{readImagegenInputs:async()=>{inputReads++;return []}},'./frame-ratio':{automaticFrameRatio:()=>undefined},'./request-admission':{imageRequestAdmission:()=>[]},'../model-config/server':{getModelAdministration:async()=>({repo:{current:async()=>models,byVersion:async()=>models},billing:{current:async()=>({version:8,config}),byVersion:async()=>({version:8,config})}})},'../model-config/image-preset':{selectedImagePreset:()=>undefined},'../model-config/runtime':{simulateModel:(_m:any,_b:any,id:string,facts:any)=>({eligible:multistep&&facts.imagegenRequirements.background==='transparent'&&id!=='image-cutout'?[]:[{upstreamId:id==='image-cutout'?'u2':'u1'}],excluded:[]})},'../model-config/tool-scope':{assertToolScope:()=>{},featureDefaultModel:(_c:any,feature:string)=>feature==='tool.cutout'?'image-cutout':'image-a'},'../image-model-routing':{routeImageModel:(id:string)=>id},'../billing/server':{quoteForActor:async(_o:string,facts:any)=>q(facts.feature,facts.quantity)},'../billing/quotation':{quoteForActor:async(_o:string,facts:any)=>q(facts.feature,facts.quantity)},'../model-config/image-preparation':{prepareImageOperation:(input:any,m:any,b:any)=>requirePrepared({...input,allowResolutionFallback:false},m,b)},'../model-config/context':{runExecutionBundle:async(_o:any,run:any)=>run()},'../image-skills/server':{resolveImageSkill:async()=>undefined},'../saas/creation-context':creation,...policy});
  for(const scenario of ['normal','cost-plus','100-credits','multistep']){
   price=scenario==='100-credits'?150:6;costPlus=scenario==='cost-plus';multistep=scenario==='multistep';const r=request(multistep?{output:{background:'transparent'}}:{}),p=await plan.planImagegen(r,owner);
   check(p.confirmationRequired,baseline&&scenario!=='normal',`${scenario} compatibility flag`);check(p.steps.every((s:any)=>!!s.billingQuote),true,'server quote retained');if(multistep)check(p.steps.length,2,'generate and cutout retained');record(`plan_${scenario}`,{credits:p.totalCredits,steps:p.steps.length,confirmationRequired:p.confirmationRequired});
  }
  price=60;costPlus=false;multistep=false;
  const batchRepo=await import('../src/lib/imagegen/batch-repository');
  let quoteInputAllowed=true;
  const quotes=load('src/lib/imagegen/quotes.ts',{'../db':db,'./creation-scope':scope,'../saas/creation-context':creation,'./plan':plan,'./schema':{imagegenRequestSchema},'./inputs':{readImagegenInputs:async()=>{inputReads++;if(!quoteInputAllowed)throw Error('fixture input access denied')}},...policy});
  const batch=load('src/lib/imagegen/batch.ts',{'@/lib/release-runtime/background-activity':{},'../saas/creation-context':creation,'../saas/creation-writer':{},'../saas/creation-schema':{},'../db':db,'./coordination-pool':{imageCoordinationPool:()=>pool},'./plan':plan,'./quotes':quotes,'./dispatch':{},'./batch-repository':batchRepo,'./creation-scope':scope,...policy});
  const r=request({mode:'batch',batch:{items:[{key:'front',name:'Front',prompt:'Draw front'},{key:'back',name:'Back',prompt:'Draw back'}],concurrency:1,maxAttempts:1}}),p=await batch.planImagegenBatch(r,owner);
  check([p.totalCredits,p.confirmationRequired],[120,baseline],'batch aggregate no 100-credit manual check');record('batch_aggregate_100',{credits:p.totalCredits,confirmationRequired:p.confirmationRequired});
  price=6;const original=request(),originalPlan=await plan.planImagegen(original,owner),issued=await quotes.issueImagegenQuote(original,owner,originalPlan);
  const saved=(await pool.query('SELECT plan FROM app_imagegen_quotes WHERE id=$1',[issued.quote.id])).rows[0].plan;check(issued.steps[0].billingQuote,undefined,'private quote hidden from preview');check(saved.steps[0].billingQuote.requestedCredits,6,'original complete billing quote stored');
  await pool.query("UPDATE app_imagegen_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",[issued.quote.id]);price=150;
  if(baseline)await assert.rejects(quotes.frozenImagegenQuote(original,owner,{quoteId:issued.quote.id,confirmed:true}),{code:'IMAGEGEN_PLAN_CHANGED'});else same(await quotes.frozenImagegenQuote(original,owner,{quoteId:issued.quote.id}),saved,'expired original accepted byte-for-byte');record('pg_expired_original_quote',{original:6,current:150,originalAccepted:!baseline});
  const reissued=await quotes.issueImagegenQuote(original,owner,await plan.planImagegen(original,owner));check(reissued.totalCredits,baseline?150:6,'same intent re-preview cannot silently reprice');check(reissued.quote.id===issued.quote.id,!baseline,'same intent retains quote identity');record('pg_same_intent_repreview',{credits:reissued.totalCredits,sameQuote:reissued.quote.id===issued.quote.id});
  const fresh=request(),freshQuote=await quotes.issueImagegenQuote(fresh,owner,await plan.planImagegen(fresh,owner));
  if(baseline)await assert.rejects(quotes.frozenImagegenQuote(fresh,owner,{quoteId:freshQuote.quote.id}),{code:'IMAGEGEN_PLAN_CHANGED'});else check((await quotes.frozenImagegenQuote(fresh,owner,{quoteId:freshQuote.quote.id})).totalCredits,150,'missing confirmation not cancellation');
  await assert.rejects(quotes.frozenImagegenQuote(fresh,owner,{quoteId:freshQuote.quote.id,confirmed:false}),baseline?{code:'IMAGEGEN_PLAN_CHANGED'}:/已取消提交/);record('pg_missing_confirmation_vs_explicit_cancel');
  // The current plan route is a parent dependency, NOT a sixth OWNED_FIVE projection.
  // Use a live quote and confirmed:true inside that route for legacy-helper compatibility.
  price=6;const routeRequest=request({inputs:[{artworkId:'owned-reference',role:'reference'}]}),routePlan=await plan.planImagegen(routeRequest,owner),routeQuote=await quotes.issueImagegenQuote(routeRequest,owner,routePlan);
  const routeBatchRequest=request({mode:'batch',batch:r.batch}),routeBatchQuote=await quotes.issueImagegenQuote(routeBatchRequest,owner,await batch.planImagegenBatch(routeBatchRequest,owner));price=150;
  let currentPlannerCalls=0,currentBatchPlannerCalls=0,plannerPoison=false;
  const planHttp=load('src/app/api/imagegen/plan/route.ts',{'@/lib/admin-auth':{resolveUserEmail:async()=>owner},'@/lib/billing/access':{sameSiteBillingMutation:()=>true},'@/lib/imagegen/schema':{imagegenRequestSchema},'@/lib/imagegen/plan':{planImagegen:async(req:any,email:string)=>{currentPlannerCalls++;if(plannerPoison)throw Error('fixture current planner poison');return plan.planImagegen(req,email)}},'@/lib/imagegen/batch':{planImagegenBatch:async(req:any,email:string)=>{currentBatchPlannerCalls++;if(plannerPoison)throw Error('fixture current planner poison');return batch.planImagegenBatch(req,email)}},'@/lib/imagegen/quotes':quotes,'@/lib/saas/creation-context':{withCreationRoute:async(_r:any,run:any)=>run()}});
  const planPost=async(body:any)=>{const response=await planHttp.POST(new Request('http://fixture/api/imagegen/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')}};
  const selected=models.config.publicModels[0],beforeVisibility={enabled:selected.enabled,visible:selected.visible};
  for(const state of ['disabled','hidden','planner-poison']){
   Object.assign(selected,beforeVisibility);if(state==='disabled')selected.enabled=false;if(state==='hidden')selected.visible=false;plannerPoison=state==='planner-poison';
   const response=await planPost(routeRequest);check(response.status,200,`plan HTTP original quote bypasses ${state}`);check([response.body.quote.id,response.body.quote.expiresAt,response.body.totalCredits],[routeQuote.quote.id,routeQuote.quote.expiresAt,6],`${state} retains original quote and price`);check(response.body.steps[0].billingQuote,undefined,'plan HTTP hides server-private billing quote');check(response.cache,'private, no-store','plan HTTP remains private');
  }
  const batchResponse=await planPost(routeBatchRequest);check([batchResponse.status,batchResponse.body.quote.id,batchResponse.body.totalCredits],[200,routeBatchQuote.quote.id,12],'batch original bypasses poisoned current planner');
  check([currentPlannerCalls,currentBatchPlannerCalls],[0,0],'saved quotes never invoke current planners');record('plan_http_saved_quote_bypasses_current_disabled_hidden_poison',{projection:'CURRENT_PLAN_ROUTE_PARENT_DEPENDENCY',originalCredits:6,currentCredits:150,currentPlannerCalls,currentBatchPlannerCalls,sameQuote:true});
  featureAllowed=false;const deniedFeature=await planPost(routeRequest);check(deniedFeature.status,400,'plan HTTP current feature revocation still rejects');assert.match(deniedFeature.body.error,/feature revoked/);featureAllowed=true;
  quoteInputAllowed=false;const deniedInput=await planPost(routeRequest);check(deniedInput.status,400,'plan HTTP current owned-input access still checked');assert.match(deniedInput.body.error,/input access denied/);quoteInputAllowed=true;
  check([currentPlannerCalls,currentBatchPlannerCalls],[0,0],'access rejection never falls back to current planner');record('plan_http_saved_quote_rechecks_feature_and_input',{featureStatus:deniedFeature.status,inputStatus:deniedInput.status});
  const poisonedNew=await planPost(request());check(poisonedNew.status,400,'new operation uses poisoned current planner');assert.match(poisonedNew.body.error,/current planner poison/);
  plannerPoison=false;selected.visible=false;const hiddenNew=await planPost(request());check(hiddenNew.status,409,'new operation still obeys current hidden model');Object.assign(selected,beforeVisibility);
  const currentNew=await planPost(request());check([currentNew.status,currentNew.body.totalCredits],[200,150],'new operation obtains fresh current plan/price');check(currentPlannerCalls,3,'only new operations invoke current single planner');record('plan_http_new_operation_uses_current_planner',{poisonStatus:poisonedNew.status,hiddenStatus:hiddenNew.status,currentStatus:currentNew.status,currentCredits:currentNew.body.totalCredits,currentPlannerCalls});
  const http=load('src/app/api/imagegen/route.ts',{'@/lib/bi/model-observer':{withBiRequest:async(_r:any,run:any)=>run()},'@/lib/admin-auth':{resolveUserEmail:async()=>owner},'@/lib/billing/access':{sameSiteBillingMutation:()=>true},'@/lib/durable-image-jobs':{imageWorkerAuthorized:()=>false},'@/lib/imagegen/schema':{imagegenRequestSchema},'@/lib/imagegen/dispatch':{readImagegenReceipt:async()=>null},'@/lib/imagegen/batch':batch,'@/lib/imagegen/quotes':quotes,'@/lib/saas/creation-context':{withCreationReceiptRoute:async(_r:any,run:any)=>run()},'@/lib/imagegen/creation-scope':scope});
  const httpPost=async(body:any)=>{const response=await http.POST(new Request('http://fixture/api/imagegen',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}};
  const makeHttpQuote=async()=>{const req=request({mode:'batch',batch:r.batch}),planned=await batch.planImagegenBatch(req,owner),quoted=await quotes.issueImagegenQuote(req,owner,planned);return {req,quoted}};
  const missing=await makeHttpQuote();await pool.query("UPDATE app_imagegen_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",[missing.quoted.quote.id]);
  const missingResponse=await httpPost({operationId:missing.req.operationId,quoteId:missing.quoted.quote.id});check(missingResponse.status,baseline?409:200,'actual HTTP expired quote + missing confirmed');
  const cancelled=await makeHttpQuote(),cancelledResponse=await httpPost({operationId:cancelled.req.operationId,quoteId:cancelled.quoted.quote.id,confirmed:false});check(cancelledResponse.status,baseline?409:400,'actual HTTP explicit false stops');check(cancelledResponse.body.accepted,false,'explicit false proves not accepted');if(!baseline)assert.match(cancelledResponse.body.error,/已取消提交/);
  check((await pool.query('SELECT count(*)::int n FROM app_imagegen_batches WHERE id=$1',[cancelled.req.operationId])).rows[0].n,0,'HTTP false creates no batch');
  const malformed=await httpPost({operationId:cancelled.req.operationId,quoteId:cancelled.quoted.quote.id,confirmed:'yes'});check(malformed.status,400,'nonboolean confirmed still rejected');
  if(!baseline){await pool.query('DELETE FROM app_imagegen_quotes WHERE id=$1',[missing.quoted.quote.id]);const replay=await httpPost({operationId:missing.req.operationId,quoteId:missing.quoted.quote.id,confirmed:false});check(replay.status,200,'HTTP receipt-first after quote deletion ignores cancellation');same(replay.body,missingResponse.body,'HTTP same receipt');}
  record('http_missing_confirmed_expired_original_vs_explicit_false',{missingStatus:missingResponse.status,falseStatus:cancelledResponse.status,falseAccepted:cancelledResponse.body.accepted,falseParents:0,nonbooleanStatus:malformed.status});
  for(const [req,email] of [[{...fresh,prompt:'different'},owner],[fresh,'other@example.test'],[{...fresh,operationId:randomUUID()},owner]] as const)await assert.rejects(quotes.frozenImagegenQuote(req,email,{quoteId:freshQuote.quote.id,confirmed:true}),{code:'IMAGEGEN_QUOTE_INVALID'});
  context={actorEmail:owner,scopeKind:'tenant',tenantId:randomUUID(),parentContext:'project-A'};await assert.rejects(quotes.frozenImagegenQuote(fresh,owner,{quoteId:freshQuote.quote.id,confirmed:true}));context=undefined;featureAllowed=false;await assert.rejects(quotes.frozenImagegenQuote(fresh,owner,{quoteId:freshQuote.quote.id,confirmed:true}));featureAllowed=true;record('pg_quote_owner_fingerprint_operation_scope_permissions');
  const batchQuote=await quotes.issueImagegenQuote(r,owner,p);await assert.rejects(batch.submitImagegenBatch(r,owner,{quoteId:batchQuote.quote.id,confirmed:false}));
  const accepted=await batch.submitImagegenBatch(r,owner,{quoteId:batchQuote.quote.id,confirmed:true});await pool.query('DELETE FROM app_imagegen_quotes WHERE id=$1',[batchQuote.quote.id]);featureAllowed=false;
  const receipts=await Promise.all([batch.submitImagegenBatch(r,owner),batch.submitImagegenBatch(r,owner,{quoteId:batchQuote.quote.id,confirmed:false})]);same(receipts,[accepted,accepted],'receipt-first survives deleted quote/revoked permission/cancel');featureAllowed=true;
  check((await pool.query('SELECT count(*)::int n FROM app_imagegen_batch_items WHERE batch_id=$1',[r.operationId])).rows[0].n,2,'no duplicate children');
  await assert.rejects(batch.submitImagegenBatch({...r,prompt:'changed'},owner));await assert.rejects(batch.submitImagegenBatch(r,'other@example.test'));
  context={actorEmail:owner,scopeKind:'tenant',tenantId:randomUUID(),parentContext:'project-A'};await assert.rejects(batch.submitImagegenBatch(r,owner));context=undefined;record('pg_receipt_first_duplicate_scope',{parents:1,children:2});
  const {createBillingService,withBillingTransaction}=await import('../src/lib/billing/service'),service=createBillingService();price=6;
  await withBillingTransaction(pool,tx=>service.grantTx(tx,{id:randomUUID(),email:owner,amount:20,source:'admin',reason:'isolated pricing verification',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'}));
  const input={id:randomUUID(),email:owner,quote:saved.steps[0].billingQuote,reason:'frozen original',ledgerId:randomUUID(),fingerprint:plan.imagegenFingerprint(original)};
  await withBillingTransaction(pool,tx=>service.reserveTx(tx,input));await withBillingTransaction(pool,tx=>service.reserveTx(tx,input));const result={state:'succeeded' as const,items:[{id:'fixture-item',state:'succeeded' as const}]};
  const settled=await withBillingTransaction(pool,tx=>service.settleTx(tx,input,result)),again=await withBillingTransaction(pool,tx=>service.settleTx(tx,input,result));check([settled.charge,again.charge,again.replayed],[6,6,true],'original price charged once');
  const billed=(await pool.query('SELECT quote,charged_credits FROM app_billing_operations WHERE id=$1',[input.id])).rows[0];same(billed.quote,input.quote,'settled whole quote remains frozen');check(Number(billed.charged_credits),6,'no current 150-credit charge');
  check((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0].n,1,'one actual debit ledger');
  price=15;await assert.rejects(withBillingTransaction(pool,tx=>service.reserveTx(tx,{...input,id:randomUUID(),ledgerId:randomUUID(),quote:q()})),{code:'INSUFFICIENT_CREDITS'});
  check((await pool.query('SELECT count(*)::int n FROM app_gen_reservations WHERE email=$1',[owner])).rows[0].n,0,'settled and insufficient paths no reservation debt');record('pg_normal_funds_frozen_quote_single_debit_insufficient',{originalCharge:6,remaining:14,currentPrice:150,debits:1,reservations:0});
  // No-DB mode must not erase expired original intents when another quote issues.
  let now=Date.now();class FixtureDate extends Date{constructor(value?:any){super(value===undefined?now:value)}static now(){return now}}
  const memory=load('src/lib/imagegen/quotes.ts',{'../db':{dbEnabled:false},'./creation-scope':scope,'../saas/creation-context':creation,'./plan':plan,'./schema':{imagegenRequestSchema},'./inputs':{readImagegenInputs:async()=>{}},...policy},{Date:FixtureDate});
  const old=await memory.issueImagegenQuote(original,owner,originalPlan);now+=16*60*1000;await memory.issueImagegenQuote(fresh,owner,await plan.planImagegen(fresh,owner));
  if(baseline)await assert.rejects(memory.readImagegenQuote(old.quote.id,owner,original.operationId));else check((await memory.frozenImagegenQuote(original,owner,{quoteId:old.quote.id})).totalCredits,6,'memory maintenance preserves original binding');record('memory_ttl_does_not_erase_original_intent');
 }finally{context=undefined;featureAllowed=true;if(db){const {closeImageCoordinationPool}=await import('../src/lib/imagegen/coordination-pool');await closeImageCoordinationPool();await db.getPool().end()}await f.cleanup();console.log('PG_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 CONNECTIONS_CLOSED=1')}
}

async function main(){
 const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{networkCalls++;throw Error('network blocked by pricing verifier')}) as typeof fetch;
 try{console.log(`MODE=${mode} PROJECTION=OWNED_FIVE_FILES SOURCE_ROOT=${sourceRoot}`);await canvasTests();await genericClientTests();await serverTests();check(networkCalls,0,'no supplier/external HTTP');console.log(`${baseline?'BASELINE=REPRODUCED':'MODIFIED=PASS'} CASES=${cases.length} CHECKS=${checks} SOURCE_PROJECTION=OWNED_FIVE CLIENT_FUNCTIONS=ACTUAL SERVER_FUNCTIONS=ACTUAL PG=ISOLATED UNKNOWN_REPOSTS=0 EXTERNAL_CALLS=0 SUPPLIER_CALLS=0`)}finally{globalThis.fetch=originalFetch}
}
main().catch(error=>{console.error(error);process.exitCode=1});
