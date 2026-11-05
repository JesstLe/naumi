/** Ingress actor and feature-decision ownership.
 * Actual HTTP handler, native cookie verification, PostgreSQL account/policy,
 * planner, quote persistence and billing configuration; no provider execution.
 * baseline is the full R8Y b4e source, not the pre-R8Y quote-race implementation.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';
const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const root=path.resolve('.'),source=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||'output/imagegen-ingress-'+randomUUID());
const baseline=arg('--mode')==='baseline',phase=arg('--phase')||'all';
assert.ok(['baseline','modified'].includes(arg('--mode')||'modified'));assert.ok(['all','pg','no-db'].includes(phase));
assert.ok(out.startsWith(root+path.sep+'output'+path.sep));mkdirSync(out,{recursive:true});
const save=(n:string,v:unknown)=>writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');
async function loadApi(){
 const modules:Record<string,string[]>={
  'src/app/api/imagegen/plan/route.ts':['POST as planPost'],
  'src/lib/imagegen/plan.ts':['planImagegen'],
  'src/lib/imagegen/quotes.ts':['readImagegenQuote','readOriginalImagegenQuote','frozenImagegenQuote'],
  'src/lib/saas/creation-context.ts':['withCreationRoute'],
  'src/lib/saas/creation-scope.ts':['withFrozenCreation','currentCreationContext'],
  'src/lib/saas/creation-access.ts':['assertCurrentCreationFeature'],
  'src/lib/model-config/server.ts':['getModelAdministration'],
  'src/platform/db/pool.ts':['getPool','closeDatabasePools'],
  'src/lib/persistence/schema.ts':['ensureSchema'],
  'src/lib/accounts/session.ts':['getOrCreateUser'],
  'src/lib/native-auth.ts':['USER_COOKIE','signUserSession'],
  'src/lib/imagegen/schema.ts':['imagegenRequestSchema']
 };
 const code=Object.entries(modules).map(([name,fields])=>'export {'+fields.join(',')+'} from '+JSON.stringify(path.join(source,name).replaceAll('\\','/'))+';').join('\n');
 const result=await build({stdin:{contents:code,resolveDir:source,loader:'ts'},absWorkingDir:source,tsconfig:path.join(source,'tsconfig.json'),bundle:true,platform:'node',target:'node24',format:'cjs',write:false,metafile:true,packages:'external',alias:{'server-only':path.join(root,'scripts/fleet-server-only.cjs')}});
 save('SOURCE_INPUTS.json',Object.fromEntries(Object.keys(result.metafile!.inputs).filter(p=>!p.startsWith('<')).map(p=>{const file=path.resolve(source,p);return[file,createHash('sha256').update(readFileSync(file)).digest('hex')];})));
 const m={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(path.join(root,'package.json')),m,m.exports);return m.exports;
}
async function main(){
 if(phase==='all'){
  const commands:any[]=[];
  for(const part of ['pg','no-db']){
   const cmd=['--conditions=react-server','--import','tsx',path.resolve(process.argv[1]),'--mode',baseline?'baseline':'modified','--phase',part,'--source-root',source,'--out',path.join(out,part)];
   const q=spawnSync(process.execPath,cmd,{cwd:root,env:{...process.env,...(part==='no-db'?{DATABASE_URL:'',PGOPTIONS:''}:{})},encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});writeFileSync(path.join(out,part+'.log'),(q.stdout||'')+(q.stderr||''));commands.push({command:[process.execPath,...cmd],exit:q.status});save('COMMANDS.json',commands);assert.equal(q.status,0,(q.stdout||'')+(q.stderr||''));
  }
  const pg=JSON.parse(readFileSync(path.join(out,'pg/RESULT.json'),'utf8')),noDb=JSON.parse(readFileSync(path.join(out,'no-db/RESULT.json'),'utf8'));
  const report={status:baseline?'BASELINE_REPRODUCED':'PASS',sourceRoot:source,cases:pg.cases.length+noDb.cases.length,checks:pg.checks+noDb.checks,routeAuthReads:pg.routeAuthReads,routePolicyReads:pg.routePolicyReads,originalAuthReads:pg.originalAuthReads,originalPolicyReads:pg.originalPolicyReads,normal:[...pg.normal,...noDb.normal],paidSubmits:0,supplierCalls:0,externalCalls:0};
  if(arg('--compare'))assert.deepEqual(report.normal,JSON.parse(readFileSync(path.resolve(arg('--compare')!),'utf8')).normal,'original public and authorization contracts must remain exact');
  save('RESULT.json',report);console.log('IMAGEGEN_INGRESS_OWNERSHIP='+report.status+' CASES='+report.cases+' CHECKS='+report.checks+' ROUTE_AUTH_READS='+report.routeAuthReads+' ROUTE_POLICY_READS='+report.routePolicyReads+' ORIGINAL_AUTH_READS='+report.originalAuthReads+' ORIGINAL_POLICY_READS='+report.originalPolicyReads+' NATIVE_AUTH=ACTUAL REAL_PG=1 CROSS_ACTOR=SEPARATE GLOBAL_CACHE=0 PAID_POSTS=0 SUPPLIER=0 EXTERNAL=0');return;
 }
 if(phase==='no-db')return noDatabase();
 await postgres();
}
async function noDatabase(){
 assert.equal(process.env.DATABASE_URL,'');let calls=0;const original=globalThis.fetch;globalThis.fetch=(async()=>{calls++;throw Error('No HTTP in no-DB ingress fixture');})as typeof fetch;let api:any;
 try{
  api=await loadApi();const request=new Request('http://ingress.fixture/api/imagegen/plan',{method:'POST',headers:{'content-type':'application/json',origin:'http://ingress.fixture'},body:'{}'});
  let callback:any='not-called';const result=await api.withCreationRoute(request,(actor:any)=>{callback=actor;return Promise.resolve(Response.json({legacy:true}));});
  assert.equal(callback,undefined);assert.equal(result.status,200);
  const anonymous=await api.planPost(request);assert.equal(anonymous.status,401);
  const cross=await api.planPost(new Request(request.url,{method:'POST',headers:{'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'}));assert.equal(cross.status,403);assert.equal(calls,0);
  save('RESULT.json',{checks:5,cases:['no-db-unresolved-actor','no-db-actual-anonymous','no-db-cross-site'],normal:[{case:'no-db',actor:'unresolved',callback:200,anonymous:401,crossSite:403}],externalCalls:0});console.log('INGRESS_NO_DB=PASS CALLBACK_ACTOR=UNRESOLVED AUTH_FALLBACK=ACTUAL EXTERNAL=0');
 }finally{globalThis.fetch=original;if(api)await api.closeDatabasePools();}
}
async function postgres(){
 const db=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(db.hostname,'127.0.0.1');assert.match(db.pathname,/fixture/);
 for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_PORTAL_ONLY','NAUMI_AUTH_LOGIN_ONLY'])delete process.env[name];
 let supplierCalls=0,externalCalls=0;const f=await createModelFixture((_req,res)=>{supplierCalls++;res.statusCode=500;res.end('No provider execution in ingress verification');});let api:any;const originalFetch=globalThis.fetch;
 globalThis.fetch=(async()=>{externalCalls++;throw Error('No external HTTP in ingress ownership fixture');})as typeof fetch;
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',MODEL_CONFIG_ENVELOPE_SECRET:'r8z-isolated-model-envelope-key-20261101',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'r8z-isolated-router-control-token-20261101',NAUMI_APPLICATION_TASK_EXECUTION:'worker'});
 let checks=0;const cases:string[]=[],normal:any[]=[];const eq=(a:any,b:any,label:string)=>{assert.deepEqual(a,b,label);checks++;};const record=(name:string,value?:any)=>{cases.push(name);if(value!==undefined)normal.push({case:name,...value});};
 try{
  f.config.upstreamModels[0].capabilities.nativeResolutions=['1K','2K','4K'];f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:'map',field:'size',values:{'1K':'1024x1024','2K':'2048x2048','4K':'4096x4096'}}};
  f.config.publicModels[0].displayResolutions=['1K','2K','4K'];f.config.publicModels[0].supplierRouting={mode:'balanced',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1}]};
  const {validateModelConfig}=await import('./../src/lib/model-config/schema');validateModelConfig(f.config,{trustedOrigins:[f.origin]});
  await f.repo.current();api=await loadApi();await api.ensureSchema();const owner='ingress-owner@example.test',other='ingress-other@example.test';
  await api.getOrCreateUser(owner,'Ingress owner');await api.getOrCreateUser(other,'Other ingress actor');
  const admin=await api.getModelAdministration();
  const publishPrice=async(credits:number)=>{const current=await admin.billing.current(),config=structuredClone(current.config);config.switches.metering='on';for(const feature of ['canvas.image','image.generate']){config.features[feature].enabled=true;config.features[feature].pricing={mode:'fixed',credits};config.features[feature].rules=[];}return admin.billing.publish({id:randomUUID(),actor:'ingress-fixture',reason:'isolated ingress '+credits,expectedVersion:current.version,config});};
  await publishPrice(6);
  const pool=api.getPool(),query=pool.query.bind(pool);let observed:{text:string;actor?:string}[]=[];
  pool.query=function(...args:any[]){const text=typeof args[0]==='string'?args[0]:args[0]?.text||'',values=typeof args[0]==='string'?args[1]:args[0]?.values;observed.push({text,actor:Array.isArray(values)?values[0]:undefined});return query(...args);};
  const measured=async(fn:()=>Promise<any>)=>{observed=[];const value=await fn();return{value,auth:observed.filter(x=>x.text.startsWith('SELECT banned,auth_revoked_before,account_expires_at FROM app_users')).length,policy:observed.filter(x=>x.text.startsWith('SELECT mode,allowed,version FROM app_feature_access')).length,policies:observed.filter(x=>x.text.startsWith('SELECT mode,allowed,version FROM app_feature_access')).map(x=>x.actor)};};
  const tokens=new Map([[owner,api.signUserSession(owner,Date.now())],[other,api.signUserSession(other,Date.now())]]);
  const request=(prompt='Draw a blue ceramic bottle')=>api.imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',modelId:'image-a',prompt,parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},variants:1,output:{format:'png'}});
  const http=(body:any,email:string|null=owner,cross=false)=>{const headers=new Headers({'content-type':'application/json',origin:f.origin,'sec-fetch-site':cross?'cross-site':'same-origin'});if(email)headers.set('cookie',api.USER_COOKIE+'='+tokens.get(email));return new Request(f.origin+'/api/imagegen/plan',{method:'POST',headers,body:JSON.stringify(body)});};
  const post=async(body:any,email:string|null=owner,cross=false)=>{const response=await api.planPost(http(body,email,cross));return{status:response.status,body:await response.json()};};
  const counts=async()=>(await f.sql.query("SELECT json_build_object('consumes',(SELECT count(*) FROM app_ledger WHERE kind='consume'),'operations',(SELECT count(*) FROM app_billing_operations),'jobs',(SELECT count(*) FROM app_image_jobs),'reservations',(SELECT count(*) FROM app_gen_reservations)) value")).rows[0].value;
  const quotes=async()=>Number((await f.sql.query('SELECT count(*) n FROM app_imagegen_quotes')).rows[0].n);
  const before=await counts(),firstRequest=request(),first=await measured(()=>post(firstRequest));
  eq(first.value.status,200,'actual plan HTTP succeeds');eq(first.value.body.totalCredits,6,'actual server billing quote');eq([first.auth,first.policy],baseline?[2,2]:[1,1],'ingress reuses authenticated actor and same-actor feature decision');
  eq(first.value.body.steps[0].billingQuote,undefined,'private billing remains server-only');record('actual-fresh-http',{status:200,credits:6,privateHidden:true});
  const q=first.value.body.quote;await publishPrice(14);const restored=await measured(()=>post(firstRequest));
  eq([restored.value.status,restored.value.body.quote.id,restored.value.body.totalCredits],[200,q.id,6],'original quote bypasses current repricing');eq([restored.auth,restored.policy],baseline?[2,2]:[1,1],'original preview also reads auth/policy once');
  record('original-frozen-http',{status:200,credits:6,sameQuote:true});
  const fresh=await post(request());eq([fresh.status,fresh.body.totalCredits],[200,14],'new operation uses current billing');record('new-current-price',{status:200,credits:14});
  let callbackActor:any,scopeActor:any;const callback=await api.withCreationRoute(http({}),(actor:any)=>{callbackActor=actor;scopeActor=api.currentCreationContext()?.actorEmail;return Promise.resolve(Response.json({ok:true},{status:201}));});
  eq(callbackActor,baseline?undefined:owner,'only server-resolved actor is passed');eq([callback.status,scopeActor],[201,owner],'callback retains actual scope');record('ingress-callback-owner',{status:201,scopeOwner:true});
  const legacy=await api.withCreationRoute(http({}),()=>Promise.resolve(Response.json({legacy:true})));eq([legacy.status,(await legacy.json()).legacy],[200,true],'old zero-argument callbacks remain valid');record('legacy-callback',{status:200,body:true});
  const anon=await post(request(),null),cross=await post(request(),owner,true);eq([anon.status,cross.status],[401,403],'anonymous/source rejection preserved');record('anonymous-and-origin',{anonymous:401,crossSite:403});
  const noChange=await quotes();
  for(const [name,sql,restore]of [
   ['banned',"UPDATE app_users SET banned=true WHERE email=$1","UPDATE app_users SET banned=false WHERE email=$1"],
   ['expired',"UPDATE app_users SET account_expires_at=now()-interval '1 day' WHERE email=$1","UPDATE app_users SET account_expires_at=NULL WHERE email=$1"],
   ['revoked',"UPDATE app_users SET auth_revoked_before=now()+interval '1 minute' WHERE email=$1","UPDATE app_users SET auth_revoked_before=NULL WHERE email=$1"]
  ]){
   await f.sql.query(sql,[owner]);const denied=await post(firstRequest);eq(denied.status,401,name+' actual native session is rechecked on next request');await f.sql.query(restore,[owner]);record('native-'+name,{status:401});
  }
  eq(await quotes(),noChange,'rejected identities persist no quote');
  const policy=async(email:string,allowed:string[],version=1)=>f.sql.query("INSERT INTO app_feature_access(email,mode,allowed,version) VALUES($1,'custom',$2::jsonb,$3) ON CONFLICT(email) DO UPDATE SET mode='custom',allowed=excluded.allowed,version=excluded.version",[email,JSON.stringify(allowed),version]);
  await policy(owner,[]);const denied=await post(firstRequest);eq(denied.status,400,'current feature revocation blocks saved preview');eq(await quotes(),noChange,'revoked preview creates no quote');await f.sql.query('DELETE FROM app_feature_access WHERE email=$1',[owner]);const allowed=await post(firstRequest);eq([allowed.status,allowed.body.totalCredits],[200,6],'next request rereads restored policy');record('feature-revoked-restored',{denied:400,restored:200,credits:6});
  await policy(other,[]);
  await assert.rejects(()=>api.withFrozenCreation({actorEmail:owner,scopeKind:'personal',tenantId:null},()=>api.planImagegen(request(),other)),/此图像功能尚未授权/);checks++;record('cross-actor-does-not-borrow-policy',{denied:true});
  const crossActor=await measured(()=>api.withFrozenCreation({actorEmail:owner,scopeKind:'personal',tenantId:null},()=>api.planImagegen(request(),other)).catch((error:Error)=>error));
  eq(crossActor.policies,[owner,other],'different actor requires its own current account policy');await f.sql.query('DELETE FROM app_feature_access WHERE email=$1',[other]);record('cross-actor-separate-reads');
  const trusted=await measured(()=>api.planImagegen(request(),owner));eq([trusted.auth,trusted.policy,trusted.value.totalCredits],[0,1,14],'trusted direct domain call without ingress has its own account read');record('no-context-domain',{auth:0,policy:1,credits:14});
  await policy(owner,['canvas','generate'],5);
  await api.withFrozenCreation({actorEmail:owner,scopeKind:'personal',tenantId:null},async()=>{
   const decision=await api.assertCurrentCreationFeature('/api/imagegen');if(baseline)eq(decision,undefined,'baseline assertion returns no reusable decision');else eq([decision.actorEmail,decision.policy.version],[owner,5],'decision is owner-bound');
   await policy(owner,[],6);await assert.rejects(()=>api.assertCurrentCreationFeature('/api/imagegen'));checks++;
  });await f.sql.query('DELETE FROM app_feature_access WHERE email=$1',[owner]);record('feature-decision-not-cached',{secondCallRereads:true});
  const regularQuery=pool.query;pool.query=function(...args:any[]){const text=typeof args[0]==='string'?args[0]:args[0]?.text||'';if(text.startsWith('SELECT mode,allowed,version FROM app_feature_access'))throw Error('fixture policy read failed');return regularQuery.apply(this,args);};
  const failed=await post(firstRequest);eq([failed.status,failed.body.error],[400,'fixture policy read failed'],'read failure does not grant a policy');pool.query=regularQuery;eq((await post(firstRequest)).status,200,'explicit subsequent preview recovers original');record('policy-read-failure',{status:400,recovery:200});
  await assert.rejects(()=>api.frozenImagegenQuote(firstRequest,owner,{quoteId:q.id,confirmed:false}),/已取消提交/);checks++;record('explicit-cancel',{rejected:true});
  eq(await counts(),before,'all previews and failures leave jobs/wallet/reservations unchanged');eq([supplierCalls,externalCalls],[0,0],'no provider or external request');record('financial-and-network-unchanged',{paidPosts:0,consumes:0});
  save('RESULT.json',{status:baseline?'BASELINE_REPRODUCED':'PASS',checks,cases,normal,routeAuthReads:first.auth,routePolicyReads:first.policy,originalAuthReads:restored.auth,originalPolicyReads:restored.policy,explicitPorts:['fixture model provider transport is forbidden'],actual:['native signing/DB authentication','HTTP handler','creation ingress/scope','account feature policy','planner','billing quote','quote persistence','PostgreSQL'],paidSubmits:0,supplierCalls,externalCalls});
  console.log('INGRESS_PG='+(baseline?'BASELINE_REPRODUCED':'PASS')+' CASES='+cases.length+' CHECKS='+checks+' AUTH='+first.auth+' POLICY='+first.policy+' ORIGINAL_AUTH='+restored.auth+' ORIGINAL_POLICY='+restored.policy+' NATIVE_AUTH=ACTUAL REAL_PG=1');
 }finally{globalThis.fetch=originalFetch;if(api)await api.closeDatabasePools();await f.cleanup();console.log('INGRESS_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 APP_POOLS_CLOSED=1 FIXTURE_POOLS_CLOSED=1 LOOPBACK_HTTP_CLOSED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1});

