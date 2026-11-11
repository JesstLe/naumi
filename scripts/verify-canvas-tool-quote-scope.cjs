// Actual BillingProvider + whole creation-context/image-quotes/quote Route modules.
// SQL/auth/membership and the supplier boundary are fixtures; no remote calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto'),{createRequire}=require('node:module'),ts=require('typescript');
const React=require('react'),{renderToString}=require('react-dom/server'),{build}=require('esbuild');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const source=path.resolve(arg('--source-root',root)),out=path.resolve(arg('--output-root',path.join(root,'output/canvas-tool-scope'))),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});const loaded=new Map(),checks=[],calls=[],rows=new Map(),bindings=new Map(),physical=new Set();
const OWNER='quote-owner@fixture.test',OTHER='quote-other@fixture.test',TENANT='11111111-1111-4111-8111-111111111111',TENANT2='22222222-2222-4222-8222-222222222222';
let actor=OWNER,dedicated=true,workspace='personal',workspaceRevision=0,paidEntries=0,quoteHook=null,quoteRequestHook=null;
const hash=b=>createHash('sha256').update(b).digest('hex'),key=(owner,project)=>owner+'\n'+project;
function read(rel){const candidate=path.join(source,rel),file=fs.existsSync(candidate)?candidate:path.join(root,rel),content=fs.readFileSync(file,'utf8');loaded.set(rel,{path:file,sha256:hash(content)});return content;}
class TeamError extends Error{constructor(message,status=403){super(message);this.status=status}}
const db={query:async(sql,p=[])=>{
 if(sql.startsWith('CREATE TABLE IF NOT EXISTS app_image_billing_quotes'))return {rows:[],rowCount:0};
 if(sql.startsWith('INSERT INTO app_image_billing_quotes')){rows.set(p[0],{id:p[0],owner:p[1],scope_key:p[2],quote:JSON.parse(p[3]),expires_at:new Date(Date.now()+900000)});return {rows:[],rowCount:1};}
 if(sql.startsWith('SELECT *,expires_at<=now() expired FROM app_image_billing_quotes')){const row=rows.get(p[0]);return {rows:row?.owner===p[1]?[row]:[],rowCount:row?.owner===p[1]?1:0};}
 if(sql.startsWith('SELECT to_regclass'))return {rows:[{name:null}],rowCount:1};
 if(sql.startsWith('SELECT 1 FROM app_artworks')){const found=physical.has(key(p[0],p[1]+':'+p[2]));return {rows:found?[{one:1}]:[],rowCount:found?1:0};}
 if(sql.startsWith('SELECT scope_kind,tenant_id FROM app_creation_contexts')){const found=bindings.get(key(p[0],p[1]));return {rows:found?[found]:[],rowCount:found?1:0};}
 if(sql.startsWith('SELECT DISTINCT c.scope_kind,c.tenant_id FROM app_artworks'))return {rows:[],rowCount:0};
 if(sql.startsWith('INSERT INTO app_creation_contexts')){const id=key(p[0],p[1]);if(!bindings.has(id))bindings.set(id,{scope_kind:p[2],tenant_id:p[3]});return {rows:[],rowCount:1};}
 throw Error('Unexpected fixture SQL: '+sql);
}};
const moduleCache=new Map(),realRequire=createRequire(path.join(root,'package.json'));
function load(rel){if(moduleCache.has(rel))return moduleCache.get(rel).exports;const m={exports:{}};moduleCache.set(rel,m);
 const text=read(rel),code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=id=>{
  if(id==='server-only')return {};
  if(id==='next/server')return {NextResponse:Response};
  if(id==='@/lib/db'||id==='../db'||id==='@/platform/db/pool')return {dbEnabled:true,ensureSchema:async()=>{},getPool:()=>db};
  if(id==='@/lib/admin-auth'||id==='../admin-auth')return {resolveUserEmail:async request=>request.headers.get('x-fixture-owner')||actor};
  if(id==='@/lib/site-control/identity')return {enterpriseSiteIdentity:()=>dedicated?{enterpriseId:TENANT}:null};
  if(id==='@/lib/enterprise/server')return {enterpriseCreationRead:async(email,tenant,run)=>{if(email!==OWNER||tenant!==TENANT)throw new TeamError('企业不存在或无权访问');return run(db,{team:{id:tenant},entitlement:{featurePolicy:{}}})}};
  if(id==='@/lib/teams/server'||id==='@/lib/teams/errors')return {TeamError};
  if(id==='@/lib/persistence/schema')return {ensureSchema:async()=>{}};
  if(id==='./creation-schema')return {ensureCreationSchema:async()=>{}};
  if(id==='@/lib/settings-secret')return {settingsSecret:()=> 'fixture-key-not-a-production-secret'};
  if(id==='@/lib/feature-access/catalog')return {requestRequirement:()=>null,TOOL_ACCESS:{},allows:()=>true};
  if(id==='@/lib/feature-access/server'||id==='@/lib/feature-access/repository')return {userFeaturePolicy:async()=>({})};
  if(id==='@/lib/billing/server')return {quoteForRequest:async(_request,facts)=>({configVersion:7,modelVersion:8,facts,requestedCredits:6,reserveCredits:6,authorizedCredits:6,tariff:{pricing:{mode:'fixed'}},requestedParameters:{quality:'medium',resolution:'1K',ratio:'1:1'},effectiveParameters:{quality:'medium',resolution:'1K',ratio:'1:1'}})};
  if(id==='@/lib/billing/request')return {billingErrorResponse:error=>Response.json({error:error.message,code:error.code},{status:error.status||500})};
  let relPath;if(id.startsWith('@/'))relPath='src/'+id.slice(2);else if(id.startsWith('.'))relPath=path.posix.normalize(path.posix.join(path.posix.dirname(rel),id));else return realRequire(id);
  for(const ext of ['','.ts','.tsx','.json']){const candidate=relPath+ext;if(fs.existsSync(path.join(root,candidate))){if(ext==='.json')return JSON.parse(read(candidate));return load(candidate)}}throw Error('No module '+id);
 };
 const fn=vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:rel});fn(localRequire,m,m.exports);return m.exports;
}
const creation=load('src/lib/saas/creation-context.ts'),quotes=load('src/lib/billing/image-quotes.ts'),quoteRoute=load('src/app/api/billing/quote/route.ts');
const storageEntries=new Map(),storage={getItem:k=>storageEntries.get(k)||null,setItem:(k,v)=>storageEntries.set(k,v),removeItem:k=>storageEntries.delete(k)};
let api,clientContext;
async function main(){
 const bundle=await build({stdin:{contents:read('src/lib/billing/client.tsx'),resolveDir:path.join(root,'src/lib/billing'),sourcefile:'client.tsx',loader:'tsx'},absWorkingDir:root,bundle:true,write:false,metafile:true,platform:'node',format:'cjs',jsx:'automatic',define:{'process.env':'{}'},external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^@\/components\/ui\/toast$|^@\/lib\/auth-context$|^@\/lib\/supabase$|^\.\.\/saas\/workspace-client$/},a=>({path:a.path.includes('toast')?'toast':a.path.includes('auth-context')?'auth':a.path.includes('workspace-client')?'workspace':'headers',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='toast'?'export const useToast=()=>({toast:()=>{}})':a.path==='auth'?'export const useAuth=()=>({user:{email:globalThis.fixtureActor()},ready:false})':a.path==='headers'?'export const authHeader=async()=>{await globalThis.authHook?.();return {"x-naumi-workspace":globalThis.fixtureWorkspace(),"x-fixture-owner":globalThis.fixtureActor()}}':'export const currentWorkspace=()=>globalThis.fixtureWorkspace();export const currentWorkspaceRevision=()=>globalThis.fixtureWorkspaceRevision();export const WORKSPACE_SELECTION="fixture:workspace"'}));
 } }]});
 for(const input of Object.keys(bundle.metafile.inputs))if(!input.includes('node_modules')&&!input.startsWith('fixture:')&&input!=='client.tsx'&&fs.existsSync(path.resolve(root,input))){const full=path.resolve(root,input);loaded.set(input,{path:full,sha256:hash(fs.readFileSync(full))});}
 clientContext={module:{exports:{}},exports:{},require:realRequire,console,Headers,Response,Request,FormData,File,Blob,URL,TextEncoder,Uint8Array,ArrayBuffer,TransformStream,TextDecoder,crypto:webcrypto,localStorage:storage,setTimeout,clearTimeout,fixtureActor:()=>actor,fixtureWorkspace:()=>workspace,fixtureWorkspaceRevision:()=>workspaceRevision};
 clientContext.globalThis=clientContext;clientContext.window={localStorage:storage,dispatchEvent:()=>{}};
 clientContext.fetch=async(url,init)=>{
  const headers=new Headers(init?.headers);headers.set('x-fixture-owner',actor);const request=new Request('http://fixture'+url,{...init,headers});
  calls.push({url,hasAuthorization:headers.has('authorization'),headers:Object.fromEntries([...headers].filter(([name])=>name!=='authorization')),body:typeof init?.body==='string'?JSON.parse(init.body):'<multipart>'});
  if(url==='/api/billing/quote'){await quoteRequestHook?.();const response=await quoteRoute.POST(request);await quoteHook?.();return response;}
  try{return await creation.withCreationRequest(request,actor,async()=>{const q=await quotes.imageBillingQuoteForRequest(request);assert.ok(q);paidEntries++;return Response.json({ok:true,url:"/media/fixture-scope.png",jobId:"job-fixture-scope",scope:creation.currentCreationContext(),feature:q.facts.feature,quoteId:headers.get('x-naumi-image-quote')})})}catch(error){return Response.json({error:error.message,code:error.code},{status:error.status||500})}
 };
 vm.runInNewContext(bundle.outputFiles[0].text,clientContext);const client=clientContext.module.exports;
 function Capture(){api=client.useBilling();return null;}
 const mount=()=>renderToString(React.createElement(client.BillingProvider,null,React.createElement(Capture)));
 function reset(options={}){actor=OWNER;workspace='personal';workspaceRevision=0;dedicated=options.dedicated!==false;rows.clear();bindings.clear();physical.clear();storageEntries.clear();calls.length=0;paidEntries=0;quoteHook=quoteRequestHook=null;clientContext.authHook=null;mount();}
 function project(id,tenant=null,owner=OWNER,proof=true){physical.add(key(owner,id));if(proof)bindings.set(key(owner,id),{scope_kind:tenant?'tenant':'personal',tenant_id:tenant})}
 const input=feature=>({canvas:true,feature,quantity:1,quality:'medium',resolution:'1K',modelId:'fixture-image',ratio:'1:1'});
 const submit=(url,feature,projectContext='tree:personal',guard)=>api.quoteAndSubmit(url,{method:'POST',headers:{'content-type':'application/json','x-naumi-workspace':workspace,'x-naumi-project-context':projectContext,'x-naumi-billing-operation-id':'not-forwarded-to-quote','authorization':'fixture-sensitive-token'},body:JSON.stringify({prompt:'fixture',quality:'medium',ratio:'1:1',artworkId:'owned'})},input(feature),guard);
 const endpoints=[['/api/cutout','tool.cutout'],['/api/generate-image','canvas.image'],['/api/canvas/expand','canvas.expand'],['/api/canvas/annotate','canvas.annotate'],['/api/canvas/text-edit','canvas.text-edit']];
 for(const [url,feature]of endpoints){reset();project('tree:personal');const response=await submit(url,feature),body=await response.json();
  if(baseline){assert.equal(response.status,400);assert.equal(body.code,'IMAGE_QUOTE_INVALID');assert.equal(paidEntries,0);checks.push(feature+': REAL_QUOTE_SCOPE_MISMATCH_REPRODUCED');}
  else{assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.scope.scopeKind,'personal');assert.equal(body.scope.tenantId,null);assert.equal(body.scope.parentContext,'tree:personal');assert.equal(paidEntries,1);assert.equal(calls[0].headers['x-naumi-project-context'],'tree:personal');assert.equal(calls[0].hasAuthorization,false);assert.equal(calls[0].headers['x-naumi-billing-operation-id'],undefined);checks.push(feature+': QUOTE_AND_SUBMISSION_SAME_PERSONAL_PROJECT');}
 }
 reset({dedicated:false});project('tree:personal');const positive=await submit('/api/canvas/expand','canvas.expand');assert.equal(positive.status,200);checks.push('SHARED_PERSONAL_POSITIVE_CONTROL');
 if(!baseline){
  reset();project('tree:legacy',null,OWNER,false);let response=await submit('/api/canvas/expand','canvas.expand','tree:legacy');assert.equal(response.status,200);assert.equal((await response.json()).scope.scopeKind,'personal');checks.push('DEDICATED_UNBOUND_OWNED_LEGACY_PERSONAL_PROJECT');
  reset();project('tree:personal');project('tree:company',TENANT);await submit('/api/canvas/expand','canvas.expand');workspace=TENANT;response=await submit('/api/canvas/expand','canvas.expand','tree:company');assert.equal(response.status,200);assert.equal((await response.json()).scope.tenantId,TENANT);assert.equal(calls.filter(c=>c.url==='/api/billing/quote').length,2);checks.push('PROJECT_CHANGE_HAS_DISTINCT_QUOTE_CACHE_KEY');
  await submit('/api/canvas/expand','canvas.expand','tree:company');assert.equal(calls.filter(c=>c.url==='/api/billing/quote').length,2);checks.push('SAME_SCOPE_QUOTE_CACHE_REUSED');
  project('tree:personal-b',TENANT);await submit('/api/canvas/expand','canvas.expand','tree:personal-b');assert.equal(calls.filter(c=>c.url==='/api/billing/quote').length,3);checks.push('SAME_WORKSPACE_DIFFERENT_PROJECT_GETS_DISTINCT_QUOTE');
  const personalRow=[...rows.values()].find(r=>r.scope_key==='["personal",null]');
  const fake=new Request('http://fixture/api/canvas/expand',{method:'POST',headers:{'content-type':'application/json','x-naumi-image-quote':personalRow.id,'x-fixture-owner':OWNER},body:'{}'});
  await assert.rejects(creation.withFrozenCreation({actorEmail:OWNER,scopeKind:'tenant',tenantId:TENANT},()=>quotes.imageBillingQuoteForRequest(fake)),e=>e.code==='IMAGE_QUOTE_INVALID');checks.push('SERVER_REJECTS_PERSONAL_QUOTE_IN_TENANT');
  const stolen=new Request(fake,{headers:{'x-naumi-image-quote':personalRow.id,'x-fixture-owner':OTHER}});
  await assert.rejects(creation.withFrozenCreation({actorEmail:OTHER,scopeKind:'personal',tenantId:null},()=>quotes.imageBillingQuoteForRequest(stolen)),e=>e.code==='IMAGE_QUOTE_INVALID');checks.push('SERVER_REJECTS_OTHER_OWNER_QUOTE');
  reset({dedicated:false});workspace=TENANT2;project('tree:foreign',TENANT2);await assert.rejects(submit('/api/canvas/expand','canvas.expand','tree:foreign'),/企业不存在或无权访问/);assert.equal(paidEntries,0);assert.equal(calls.filter(c=>c.url!=='/api/billing/quote').length,0);checks.push('FOREIGN_TENANT_DENIED_BEFORE_SUBMISSION');
  reset();project('tree:absent',null,OTHER);await assert.rejects(submit('/api/canvas/expand','canvas.expand','tree:absent'),/画布项目不存在或无权访问/);assert.equal(paidEntries,0);checks.push('FOREIGN_PROJECT_DENIED_BEFORE_SUBMISSION');
  for(const when of ['auth','quote-response','hash']){reset();project('tree:personal');let active=true;const guard=()=>{if(!active)throw Error('project switched')};if(when==='auth')clientContext.authHook=async()=>{workspace=TENANT;workspaceRevision++};if(when==='quote-response')quoteHook=()=>{active=false};const promise=submit('/api/canvas/expand','canvas.expand','tree:personal',guard);if(when==='hash'){const old=clientContext.crypto;clientContext.crypto={...old,subtle:{digest:async(...a)=>{active=false;return webcrypto.subtle.digest(...a)}},randomUUID:()=>webcrypto.randomUUID()};}
   await assert.rejects(promise,/创作空间已切换|project switched/);assert.equal(paidEntries,0);checks.push('STALE_CONTEXT_STOPS_BEFORE_PAID_POST_'+when);clientContext.crypto=webcrypto;
  }
  reset();project('tree:company',TENANT);workspace=TENANT;workspaceRevision++;await submit('/api/canvas/expand','canvas.expand','tree:company');assert.equal(calls[0].headers['x-naumi-workspace'],TENANT);checks.push('CURRENT_WORKSPACE_CAPTURED_EXPLICITLY');
  reset();project('tree:personal');const form=new FormData();form.set('image',new File([new Uint8Array([1,2,3])],'fixture.png',{type:'image/png'}));form.set('ratio','1:1');
  response=await api.quoteAndSubmit('/api/cutout',{method:'POST',headers:{'x-naumi-workspace':'personal','x-naumi-project-context':'tree:personal'},body:form},input('tool.cutout'));assert.equal(response.status,200);assert.equal(calls[0].headers['x-naumi-project-context'],'tree:personal');assert.equal(calls[1].body,'<multipart>');checks.push('MULTIPART_TOOL_KEEPS_PROJECT_WITHOUT_COPYING_BODY_INTO_QUOTE');
  reset();project('tree:personal');await assert.rejects(api.quoteAndSubmit('/api/canvas/expand',{method:'POST',headers:{'content-type':'application/json','x-naumi-workspace':TENANT,'x-naumi-project-context':'tree:personal'},body:'{}'},input('canvas.expand')),/创作空间已切换/);assert.equal(calls.length,0);checks.push('STALE_EXPLICIT_WORKSPACE_REJECTED_BEFORE_QUOTE');
 }
 const result=baseline?'REPRODUCED':'PASS',exit=baseline?1:0;
 fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({result,checks,loaded:[...loaded.entries()].map(([file,data])=>({file,...data})),network:0,supplierCalls:0,exit},null,2));
 console.log(`CANVAS_TOOL_SCOPE=${result} CHECKS=${checks.length} SUPPLIER_CALLS=0 NETWORK=0 EXIT=${exit}`);process.exitCode=exit;
}
main().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,checks,calls,loaded:[...loaded]},null,2));console.error(error);process.exitCode=1});
