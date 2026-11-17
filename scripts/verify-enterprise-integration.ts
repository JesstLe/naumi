import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deploymentPolicy,assertEnterpriseAllowed } from '../src/lib/enterprise/integration/policy';
import { normalizeRecord } from '../src/lib/enterprise/integration/normalize';

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  process.env.SETTINGS_SECRET='enterprise-integration-fixture-0123456789';process.env.NAUMI_MULTI_USER='1';
  const root=randomUUID(),foreign=randomUUID();
  assert.throws(()=>deploymentPolicy({}),/ENTERPRISE_INTEGRATION_NOT_CONFIGURED/);
  assert.throws(()=>deploymentPolicy({NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated'}),/ENTERPRISE_INTEGRATION_NOT_CONFIGURED/);
  assert.throws(()=>deploymentPolicy({NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_ALLOWED_IDS:root+','+foreign}),/ENTERPRISE_INTEGRATION_NOT_CONFIGURED/);
  const shared=deploymentPolicy({NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source-a'}),dedicated=deploymentPolicy({NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source-a',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_ALLOWED_IDS:root});
  assert.throws(()=>assertEnterpriseAllowed(dedicated,foreign),/ENTERPRISE_NOT_FOUND/);
  const sample={id:'same-id',email:'staff@fixture.invalid',source_table:'app_image_jobs',kind:'canvas-real-kind',has_ledger_charge:true,billed_credits:6,quoted_credits:9,content:'原始提示词',source_url:'https://secret.invalid/?key=NEVER_EXPOSE',error:'PRIVATE_ERROR',provider_id:'PRIVATE_PROVIDER'};
  const normalized=normalizeRecord('fixture-source-a',root,'generations',sample);
  assert.equal(normalized.ref.kind,'image-job');assert.equal(normalized.credits.charged,6);assert.equal(normalized.attribution.businessOwnership,'unconfirmed');
  assert.ok(!JSON.stringify(normalized).includes('PRIVATE_')&&!JSON.stringify(normalized).includes('NEVER_EXPOSE'));
  assert.equal(normalizeRecord('fixture-source-a',root,'generations',{...sample,has_ledger_charge:false,billed_credits:0}).credits.charged,null);
  assert.equal(normalizeRecord('fixture-source-a',root,'generations',{...sample,has_ledger_charge:true,billed_credits:0}).credits.charged,0);
  assert.notDeepEqual(normalized.ref,normalizeRecord('fixture-source-b',root,'generations',sample).ref);
  assert.notDeepEqual(normalized.ref,normalizeRecord('fixture-source-a',root,'generations',{...sample,source_table:'app_canvas_image_tasks'}).ref);
  const db=await import('../src/lib/db'),erp=await import('../src/lib/enterprise/server'),bi=await import('../src/lib/bi/repository');
  const {NaumiEnterpriseAdapter}=await import('../src/lib/enterprise/integration/naumi-adapter');
  await erp.ensureEnterpriseSchema();await bi.ensureBiSchema();const pool=db.getPool();
  const admin='site-admin@fixture.invalid',owner='owner@fixture.invalid',staff='staff@fixture.invalid',manager='manager@fixture.invalid',outsider='outside@fixture.invalid',otherOwner='other-owner@fixture.invalid',ordinary='personal@fixture.invalid';
  for(const e of [admin,owner,staff,manager,outsider,otherOwner,ordinary])await db.getOrCreateUser(e,e.split('@')[0]);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  for(const [id,boss,name] of [[root,owner,'天地合大健康 · 合成验收'],[foreign,otherOwner,'其他企业 · 合成验收']]){
    await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by)VALUES($1,'owned','fixture','fixture')",[boss]);
    await pool.query('INSERT INTO app_account_teams(id,name,owner_email,authorized_until)VALUES($1,$2,$3,now()+interval \'30 days\')',[id,name,boss]);
    await pool.query('INSERT INTO app_enterprise_settings(team_id)VALUES($1)',[id]);
    const role=randomUUID();await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records)VALUES($1,$2,'主管',10,true,true)",[id,role]);
    for(const e of id===root?[manager,staff]:[outsider])await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)VALUES($1,$2,$3,$4,'permanent')",[id,e,boss,role]);
  }
  // Keep manager and staff as sibling managers. Manager scope must not include staff or outside enterprise.
  const at='2026-10-17T02:00:00Z';
  const sharp=(await import('sharp')).default;
  const png=await sharp({create:{width:160,height:120,channels:4,background:'#b9d5e6'}}).composite([{input:Buffer.from('<svg width="160" height="120"><rect x="50" y="20" width="60" height="85" rx="9" fill="#fff"/><rect x="56" y="45" width="48" height="38" rx="3" fill="#4b80a3"/><rect x="61" y="9" width="38" height="16" rx="3" fill="#e4edf4"/></svg>')}]).png().toBuffer();
  for(const [i,email] of [staff,manager,outsider,ordinary].entries()){
    await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,creation_provenance)
      VALUES($1,$2,'主图制作','generate',$3,$6,'fixture',$4,$5)`,['art-'+i,email,'提示词-'+i,at,JSON.stringify({version:1,entry:'canvas',operation:'generate',ref:'same-id',evidence:'server-route'}),'data:image/png;base64,'+png.toString('base64')]);
    await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,cost,created_at)VALUES($1,$2,'generate','{\"status\":\"done\"}',$3,false,9,$4)",['job-'+i,email,JSON.stringify({p:{userPrompt:'任务提示词-'+i}}),at]);
  }
  await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)VALUES('led-image-job-0',$1,-6,'consume','PRIVATE_PROVIDER_REASON',$2)",[staff,at]);
  await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)VALUES('fixture-refund',$1,2,'refund','PRIVATE_REFUND_REASON',$2)",[staff,at]);
  const adapter=new NaumiEnterpriseAdapter({email:admin,admin:true,consoleAdmin:true},shared);
  assert.equal((await adapter.list()).length,2);
  const privateAdapter=new NaumiEnterpriseAdapter({email:admin,admin:true,consoleAdmin:true},dedicated);
  assert.equal((await privateAdapter.list()).length,1);await assert.rejects(privateAdapter.members(foreign),/ENTERPRISE_NOT_FOUND/);
  const fingerprint=async()=>createHash('sha256').update(JSON.stringify(await Promise.all(['app_users','app_ledger','app_artworks','app_image_jobs','app_enterprise_members'].map(async t=>(await pool.query(`SELECT row_to_json(x) AS r FROM ${t} x ORDER BY row_to_json(x)::text`)).rows)))).digest('hex');
  const before=await fingerprint();
  const q={enterpriseId:root,from:'2026-10-17',to:'2026-10-17'};
  const artworks=await adapter.records({...q,kind:'artworks'});assert.equal(artworks.total,2);assert.ok(artworks.rows.every(r=>[staff,manager].includes(r.account.email)));assert.ok(artworks.rows.every(r=>r.prompt&&r.media.href?.startsWith('/api/enterprise/media?')));
  const jobs=await adapter.records({...q,kind:'generations'});assert.equal(jobs.total,2);assert.equal(jobs.rows.find(r=>r.account.email===staff)?.credits.charged,6);assert.equal(jobs.rows.find(r=>r.account.email===manager)?.credits.charged,null);
  const ledger=await adapter.records({...q,kind:'ledger'});assert.ok(ledger.rows.some(r=>r.credits.delta===-6)&&ledger.rows.some(r=>r.credits.delta===2));
  assert.ok(!JSON.stringify([artworks,jobs,ledger]).includes('PRIVATE_')&&!JSON.stringify(artworks).includes('SECRET_MEDIA'));
  assert.equal(await fingerprint(),before); // read authority is Naumi, no duplicate billing or user store.
  const scoped=new NaumiEnterpriseAdapter({email:manager,admin:false},shared);
  assert.equal((await scoped.records({...q,kind:'artworks'})).rows.length,1);
  await assert.rejects(scoped.records({...q,kind:'generations',email:staff}),/没有该成员内容/);
  await assert.rejects(new NaumiEnterpriseAdapter({email:ordinary,admin:false},shared).members(root),error=>error instanceof Error&&'status' in error&&error.status===403);
  await assert.rejects(new NaumiEnterpriseAdapter({email:outsider,admin:false},shared).records({...q,kind:'artworks'}),error=>error instanceof Error&&'status' in error&&error.status===403);
  const {GET}=await import('../src/app/api/admin/enterprise-workbench/route'),native=await import('../src/lib/native-auth');
  Object.assign(process.env,{NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source-a',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared',NAUMI_ENTERPRISE_ALLOWED_IDS:''});
  const req=(actor:string,params:Record<string,string>)=>new Request('http://fixture.invalid/api/admin/enterprise-workbench?'+new URLSearchParams(params),{headers:{cookie:actor?'nv_user='+native.signUserSession(actor,Date.now()):''}});
  assert.equal((await GET(req('',{action:'list'}))).status,401);
  assert.equal((await GET(req(owner,{action:'list'}))).status,401);
  let response=await GET(req(admin,{action:'list'}));assert.equal(response.status,200);assert.equal((await response.json()).enterprises.length,2);
  // An unrelated tenant's invalid hierarchy must not be traversed by a restricted integration.
  await pool.query('UPDATE app_enterprise_members SET supervisor_email=$3 WHERE enterprise_id=$1 AND email=$2',[foreign,outsider,staff]);
  try{
   await assert.rejects(adapter.list(),{status:409});
   process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=root;
   const limited=await GET(req(admin,{action:'list'}));assert.equal(limited.status,200);
   assert.deepEqual((await limited.json()).enterprises.map((e:{id:string})=>e.id),[root]);
  }finally{
   process.env.NAUMI_ENTERPRISE_ALLOWED_IDS='';
   await pool.query('UPDATE app_enterprise_members SET supervisor_email=$3 WHERE enterprise_id=$1 AND email=$2',[foreign,outsider,otherOwner]);
  }
  response=await GET(req(admin,{action:'records',...q,kind:'generations'}));assert.equal(response.status,200);assert.equal((await response.json()).rows.length,2);
  response=await GET(req(admin,{action:'records',...q,kind:'ledger',size:'1'}));assert.equal(response.status,200);const routeLedger=await response.json();assert.equal(routeLedger.size,25);assert.deepEqual(routeLedger.rows,ledger.rows);
  assert.equal((await GET(req(admin,{action:'records',...q,kind:'generations',from:'bad'}))).status,400);
  assert.equal((await GET(req(admin,{action:'list',baseUrl:'https://attacker.invalid'}))).status,400);
  process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='dedicated';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=root;
  assert.equal((await erp.enterpriseList({email:admin,admin:true,consoleAdmin:true})).length,1);
  assert.deepEqual(await erp.enterpriseList({email:admin,admin:true,consoleAdmin:true},false,[foreign]),[]);
  await assert.rejects(erp.enterpriseSnapshot({email:admin,admin:true,consoleAdmin:true},foreign),/企业不存在/);
  // A dedicated workspace deliberately denies even an account with the global
  // admin role. The customer endpoint, tested below, still checks foreign IDs.
  assert.equal((await GET(req(admin,{action:'records',enterpriseId:root,kind:'artworks'}))).status,401);
  assert.equal((await GET(req(admin,{action:'records',enterpriseId:foreign,kind:'artworks'}))).status,401);
  process.env.NAUMI_ENTERPRISE_ALLOWED_IDS='';const unconfigured=await GET(req(admin,{action:'list'}));
  assert.equal(unconfigured.status,503);assert.deepEqual(await unconfigured.json(),{error:'ENTERPRISE_INTEGRATION_NOT_CONFIGURED'});
  process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=root;await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[root]);
  await assert.rejects(scoped.records({...q,kind:'artworks'}),/企业授权已关闭/);
  await pool.query('UPDATE app_account_teams SET enabled=true WHERE id=$1',[root]);
  const fixtureOut=process.env.NAUMI_INTEGRATION_EVIDENCE_DIR;
  if(fixtureOut){mkdirSync(fixtureOut,{recursive:true});writeFileSync(resolve(fixtureOut,'SAMPLE_NORMALIZED.json'),JSON.stringify({artworks,jobs,ledger},null,2));writeFileSync(resolve(fixtureOut,'SOURCE_FIXTURE_META.json'),JSON.stringify({root,foreign,admin,owner,staff,ordinary}));}
  const {GET:sourceGET}=await import('../src/app/api/enterprise/integration/route');
  await db.setSetting('multi_user_enabled','1');
  const sourceReq=(actor:string,params:Record<string,string>)=>new Request('http://fixture.invalid/api/enterprise/integration?'+new URLSearchParams(params),{headers:{cookie:actor?'nv_user='+native.signUserSession(actor,Date.now()):''}});
  assert.equal((await sourceGET(sourceReq('',{action:'context'}))).status,401);
  response=await sourceGET(sourceReq(owner,{action:'context'}));assert.equal(response.status,200,await response.clone().text());
  const context=await response.json();assert.equal(context.viewer.email,owner);assert.equal(context.enterprises.length,1);
  response=await sourceGET(sourceReq(owner,{action:'records',...q,kind:'generations'}));assert.equal(response.status,200);assert.equal((await response.json()).rows.length,2);
  response=await sourceGET(sourceReq(owner,{action:'records',...q,kind:'ledger',size:'100'}));assert.equal(response.status,200);const sourceLedger=await response.json();assert.equal(sourceLedger.size,25);assert.deepEqual(sourceLedger.rows,ledger.rows);
  response=await sourceGET(sourceReq(manager,{action:'records',...q,kind:'artworks'}));assert.equal(response.status,200);assert.equal((await response.json()).rows.length,1);
  assert.equal((await sourceGET(sourceReq(owner,{action:'records',enterpriseId:foreign,kind:'artworks'}))).status,404);
  assert.equal((await sourceGET(sourceReq(ordinary,{action:'records',...q,kind:'artworks'}))).status,403);
  assert.equal((await sourceGET(sourceReq(owner,{action:'context',role:'admin'}))).status,400);
  assert.equal((await sourceGET(sourceReq(owner,{action:'records',...q,kind:'generations',from:'bad'}))).status,400);
  await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[root]);
  assert.equal((await sourceGET(sourceReq(owner,{action:'records',...q,kind:'artworks'}))).status,403);
  await pool.query('UPDATE app_account_teams SET enabled=true WHERE id=$1',[root]);
  const navigation=readFileSync(resolve('src/components/admin/center-shell.tsx'),'utf8');assert.ok(!navigation.includes('href:"/admin/enterprise-workbench"'));
  console.log('NAUMI_INTEGRATION_PASS: shared_enterprises=2 dedicated_enterprises=1 allowlist_before_hierarchy=1 disjoint_pin_empty=1 ordinary_denied=1 cross_enterprise_denied=1 hierarchy_scope=1 prompts=1 linked_charge=6 missing_charge=null refund_delta=2 source_writes=0 raw_secrets=0 source_admin_not_product=1 deployment_not_configured=503');
  console.log('ENTERPRISE_SOURCE_ROUTE_PASS: enterprise_owner=200 subtree=1 anonymous=401 personal=403 foreign=404 revoked=403 role_injection=400 platform_admin_required=0');
  // The following fixture verifies the shared workspace shell and signed
  // bridge separately from the dedicated-site HTTP access assertions above.
  Object.assign(process.env,{NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared',NAUMI_ENTERPRISE_ALLOWED_IDS:root});
  const {verifyWorkflowIdentity}=await import('./verify-workflow-identity');await verifyWorkflowIdentity(pool,{root,foreign,ordinary,owner});
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
