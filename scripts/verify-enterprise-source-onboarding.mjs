import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {build} from 'esbuild';

// Actual original/new modules and the actual packaged runtime graph. Database,
// network and clock values here are explicit deterministic ports; the existing
// source-audit PG/CLI and enterprise runtime suites verify those real boundaries.
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root','.')),baseline=args.includes('--baseline'),out=path.resolve(arg('--out',process.env.SOURCE_ONBOARDING_EVIDENCE||'output/enterprise-source-onboarding'));
fs.mkdirSync(out,{recursive:true});
const names=baseline?['scripts/lib/enterprise-source-audit.mjs','scripts/lib/enterprise-pilot-plan.mjs']:['services/enterprise-workflow/src/source-onboarding/audit.mjs','services/enterprise-workflow/src/source-onboarding/pilot-plan.mjs'];
const audit=await import(pathToFileURL(path.join(root,names[0]))),plan=await import(pathToFileURL(path.join(root,names[1])));
let cases=0,checks=0;const normal=[];
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
async function test(name,work){normal.push([name,await work()]);cases++;console.log('PASS '+name);}
const id='1095114e-6b57-429e-a954-7d663907e0c9',foreign='2095114e-6b57-429e-a954-7d663907e0c9';
const site={version:1,adminUrl:'https://fixture.invalid/admin',enterpriseId:id,expectedEnterpriseName:'合成企业'};
const now=new Date('2026-10-31T00:00:00.000Z'),staff='设计甲@username.naumi.local';
const key=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
const env={NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_ALLOWED_IDS:id,NAUMI_WORKFLOW_SERVICE_URL:'http://127.0.0.1:18495',NAUMI_WORKFLOW_SIGNING_KID:'fixture',NAUMI_WORKFLOW_SIGNING_KEY:key};
const columns={app_account_teams:['id','name','owner_email','enabled'],app_enterprise_settings:['team_id','enabled'],app_enterprise_members:['enterprise_id','email','supervisor_email','role_id','employment','version'],app_users:['email','name','banned','account_expires_at'],app_team_access_grants:['email','enabled','revoked_at','starts_at','expires_at']};
function pool(mode='normal'){
 const trace=[],state={release:0,connect:0};
 const connection={release(){state.release++;trace.push(['release']);},async query(sql,values){trace.push([sql,values??null]);
  if(sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL')||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('information_schema.columns'))return {rows:mode==='missing-schema'?[]:Object.entries(columns).flatMap(([table_name,cs])=>cs.map(column_name=>({table_name,column_name})))};
  if(sql.includes('FROM public.app_account_teams'))return {rows:mode==='missing-company'?[]:[{id,name:mode==='wrong-name'?'other':site.expectedEnterpriseName,owner_email:'owner@fixture.invalid',enabled:mode!=='disabled',enterprise_enabled:true,owner_exists:true,owner_available:true,owner_grant_active:mode!=='revoked'}]};
  if(sql.includes('FROM public.app_enterprise_members')){
   if(mode==='transport-failure')throw Object.assign(Error('fixture-transport'),{code:'ECONNRESET'});
   const row={email:staff,supervisor_email:'owner@fixture.invalid',role_id:null,employment:'permanent',version:0,name:'设计甲',account_exists:true,banned:false,account_expires_at:null,account_available:mode!=='unavailable'};
   return {rows:mode==='roster-overflow'?Array(2001).fill(row):[row]};
  }
  if(sql.includes('SELECT email,name,banned,account_expires_at'))return {rows:[{email:'owner@fixture.invalid',name:'Owner',banned:false,account_expires_at:null}]};
  if(sql.includes('observed_at'))return {rows:[{observed_at:now,read_only:mode==='not-readonly'?'off':'on'}]};
  if(sql.includes('pg_catalog.pg_tables'))return {rows:[{tablename:'app_ledger'},{tablename:'app_artworks'}]};
  throw Error('UNEXPECTED_SQL');
 }};
 return {trace,state,async connect(){state.connect++;trace.push(['connect']);if(mode==='connect-failure')throw Object.assign(Error('fixture-connect'),{code:'ECONNREFUSED'});return connection;}};
}
await test('site-canonical',()=>{const result=audit.sourceSite({...site,enterpriseId:id.toUpperCase()});eq(result.enterpriseId,id);return result;});
for(const [name,patch,expected]of [
 ['credentials',{adminUrl:'https://user:secret@fixture.invalid/admin'},'SITE_ADMIN_URL_INVALID'],
 ['extra-field',{cookie:'secret'},'SITE_CONFIG_FIELDS_INVALID'],
 ['invalid-id',{enterpriseId:'all'},'SITE_ENTERPRISE_INVALID'],
 ['normalized-url',{adminUrl:'https://fixture.invalid/foo/../admin'},'SITE_ADMIN_URL_CANONICAL_REQUIRED'],
 ['empty-name',{expectedEnterpriseName:''},'SITE_ENTERPRISE_NAME_REQUIRED'],
])await test('site-'+name,()=>{let error;try{audit.sourceSite({...site,...patch});}catch(e){error=e;}ok(error instanceof audit.SourceAuditError);eq(error.message,expected);return {code:error.message,sharedClass:true};});
for(const [name,patch]of [['valid',{}],['unknown',{NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:''}],['foreign',{NAUMI_ENTERPRISE_ALLOWED_IDS:foreign}],['duplicate',{NAUMI_ENTERPRISE_ALLOWED_IDS:id+','+id}],['invalid-key',{NAUMI_WORKFLOW_SIGNING_KEY:'invalid fixture key'}]])await test('bridge-'+name,()=>{const result=audit.sourceBridge({...env,...patch},id);ok(!JSON.stringify(result).includes('PRIVATE KEY'));eq(result.publicKeyPairMatch,'not-checked');return result;});
let observed;
for(const mode of ['normal','disabled','revoked','unavailable'])await test('snapshot-'+mode,async()=>{const db=pool(mode),result=await audit.inspectSource(db,site,env);eq(db.state,{release:1,connect:1});eq(result.summary.sourceWrites,0);eq(result.summary.sourceReadOnly,true);eq(db.trace.at(-2),['ROLLBACK',null]);eq(result.roster.rows.length,2);ok(!JSON.stringify(result.summary).includes(staff));if(mode==='normal')observed=result;return {result,trace:db.trace};});
for(const [mode,code,shared]of [['missing-schema','SOURCE_SCHEMA_INCOMPLETE',true],['missing-company','SOURCE_ENTERPRISE_NOT_FOUND',true],['wrong-name','SOURCE_ENTERPRISE_NAME_MISMATCH',true],['roster-overflow','SOURCE_ROSTER_LIMIT_EXCEEDED',true],['not-readonly','SOURCE_READ_ONLY_REQUIRED',true],['transport-failure','fixture-transport',false],['connect-failure','fixture-connect',false]])await test('snapshot-error-'+mode,async()=>{const db=pool(mode);let error;try{await audit.inspectSource(db,site,env);}catch(e){error=e;}eq(error?.message,code);eq(error instanceof audit.SourceAuditError,shared);eq(db.state.release,mode==='connect-failure'?0:1);if(mode!=='connect-failure')eq(db.trace.at(-2),['ROLLBACK',null]);return {code:error.message,shared,trace:db.trace};});
const teamId='3095114e-6b57-429e-a954-7d663907e0c9',request={version:1,commandId:'4095114e-6b57-429e-a954-7d663907e0c9',reason:'fixture reviewed mapping',target:{enterpriseId:foreign,sourceEnterprise:id,sourceInstance:'fixture-source'},teams:[{teamId,name:'设计'}],people:[{sourceSubject:staff,alias:'设计甲',realName:'合成真名',workflowSubject:'fixture-designer',personId:'5095114e-6b57-429e-a954-7d663907e0c9',expectedVersion:0,teamId,permissions:['review','execute','dispatch'],workKinds:['design'],confirmed:true}]};
await test('pilot-exact-plan',()=>{const result=plan.preparePilot(site,request,observed.summary,observed.roster,now);eq(result.provision.enterprises[0].accounts[0].memberships[0].permissions,['dispatch','execute','review']);eq(result.summary.sourceWrites,0);eq(result.summary.targetWrites,0);eq(result.summary.employeeReady,false);return result;});
for(const [name,change,code]of [
 ['unconfirmed',r=>{r.people[0].confirmed=false;},'PILOT_REQUEST_INVALID'],
 ['alias',r=>{r.people[0].alias='changed';},'PILOT_ALIAS_CHANGED'],
 ['source-scope',r=>{r.target.sourceEnterprise=foreign;},'PILOT_SOURCE_SCOPE_MISMATCH'],
 ['unknown-account',r=>{r.people[0].sourceSubject='unknown@fixture.invalid';},'PILOT_EXACT_ACCOUNT_REQUIRED'],
 ['duplicate',r=>{r.people.push(structuredClone(r.people[0]));},'PILOT_DUPLICATE_IDENTITY'],
 ['executor-kind',r=>{r.people[0].workKinds=[];},'PILOT_EXECUTOR_KIND_REQUIRED'],
])await test('pilot-error-'+name,()=>{const raw=structuredClone(request);change(raw);let error;try{plan.preparePilot(site,raw,observed.summary,observed.roster,now);}catch(e){error=e;}ok(error instanceof audit.SourceAuditError,'one shared audit error identity');eq(error.message,code);return {code:error.message,sharedClass:true};});
await test('pilot-expiry',()=>{let error;try{plan.preparePilot(site,request,observed.summary,observed.roster,new Date(+now+16*60000));}catch(e){error=e;}ok(error instanceof audit.SourceAuditError);eq(error.message,'PILOT_SNAPSHOT_EXPIRED');return error.message;});
for(const mode of ['normal','oversized','malformed','transport'])await test('probe-'+mode,async()=>{const calls=[];const result=await audit.probeSource(site,async(url,options)=>{calls.push({url,method:options.method,redirect:options.redirect,credentials:options.credentials,headers:options.headers,hasSignal:options.signal instanceof AbortSignal});if(mode==='transport')throw Error('fixture-secret');if(url.endsWith('/api/version'))return new Response(mode==='oversized'?'x'.repeat(20000):mode==='malformed'?'{}':JSON.stringify({commit:'a'.repeat(40),version:'fixture',secret:'not-retained'}),{headers:{'content-type':'application/json'}});return new Response('not-retained',{status:url.endsWith('/admin')?302:401});});eq(calls.length,4);eq(result.credentialsSent,false);eq(result.employeeReady,false);ok(calls.every(c=>c.hasSignal&&c.credentials==='omit'&&c.redirect==='manual'));ok(!JSON.stringify(result).includes('not-retained')&&!JSON.stringify(result).includes('fixture-secret'));const {observedAt,...stable}=result;ok(!Number.isNaN(Date.parse(observedAt)));return {result:stable,calls};});
const consumers=['services/enterprise-workflow/src/runtime-pilot.ts','services/enterprise-workflow/tests/pilot-provision.ts','scripts/enterprise-source-audit.mjs','scripts/enterprise-pilot-plan.mjs','scripts/tests/enterprise-source-audit.test.mjs','scripts/tests/enterprise-pilot-plan.test.mjs'];
const digest=b=>createHash('sha256').update(b).digest('hex');
const canonical=s=>s.replace(/(?:\.\.\/|\.\/)+(?:scripts\/lib\/enterprise-source-audit|lib\/enterprise-source-audit|services\/enterprise-workflow\/src\/source-onboarding\/audit|src\/source-onboarding\/audit|source-onboarding\/audit|enterprise-source-audit|audit)\.mjs/g,'<audit-owner>').replace(/(?:\.\.\/|\.\/)+(?:scripts\/lib\/enterprise-pilot-plan|lib\/enterprise-pilot-plan|services\/enterprise-workflow\/src\/source-onboarding\/pilot-plan|src\/source-onboarding\/pilot-plan|enterprise-pilot-plan|pilot-plan)\.mjs/g,'<pilot-plan-owner>');
const algorithms={audit:digest(fs.readFileSync(path.join(root,names[0]))),plan:digest(canonical(fs.readFileSync(path.join(root,names[1]),'utf8'))),auditTypes:digest(fs.readFileSync(path.join(root,names[0].replace(/\.mjs$/,'.d.mts')))),planTypes:digest(fs.readFileSync(path.join(root,names[1].replace(/\.mjs$/,'.d.mts')))),consumerBodies:Object.fromEntries(consumers.map(n=>[n,digest(canonical(fs.readFileSync(path.join(root,n),'utf8')))]))};
const built=await build({absWorkingDir:root,entryPoints:[path.join(root,'services/enterprise-workflow/tools/runtime.ts')],bundle:true,write:false,metafile:true,platform:'node',format:'esm',target:'node24',external:['pg','sharp']});
const inputs=Object.keys(built.metafile.inputs).map(n=>path.relative(root,path.resolve(root,n)).replaceAll('\\','/'));
const scripts=inputs.filter(n=>n.startsWith('scripts/'));eq(scripts,baseline?['scripts/lib/enterprise-source-audit.mjs']:[],'runtime graph must depend inwards');
const sourceFiles=[...new Set([...names,...names.map(n=>n.replace(/\.mjs$/,'.d.mts')),...consumers,...inputs.filter(n=>!n.startsWith('node_modules/')&&!n.includes('/node_modules/'))])];
const sourceHashes=Object.fromEntries(sourceFiles.map(n=>[n,digest(fs.readFileSync(path.join(root,n)))]));
let comparison='CAPTURED';if(arg('--compare')){const previous=JSON.parse(fs.readFileSync(arg('--compare'),'utf8'));eq(normal,previous.normal,'original/new SQL/errors/probe/plan traces exact');eq(algorithms,previous.algorithms,'algorithms,declarations and consumer bodies unchanged except import ownership');comparison='EXACT';}
const result={status:baseline?'BASELINE_CAPTURED':'PASS',cases,checks,comparison,normal,algorithms,sourceHashes,runtimeScriptInputs:scripts,actualRuntimeEntry:'services/enterprise-workflow/tools/runtime.ts',runtimeBundled:true,actualModules:true,pg:0,ports:['source-query','anonymous-fetch','fixed-planning-clock'],supplierPosts:0,wholeAcceptanceOpen:true};
fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log(`ENTERPRISE_SOURCE_ONBOARDING=${result.status} CASES=${cases} CHECKS=${checks} NORMAL=${comparison} RUNTIME_SCRIPT_IMPORTS=${scripts.length} RUNTIME=ACTUAL_BUNDLE MODULES=ACTUAL PG=0 SUPPLIER_POSTS=0`);
