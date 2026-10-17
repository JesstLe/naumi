import assert from 'node:assert/strict';
import { generateKeyPairSync,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import type { Pool } from 'pg';
export async function verifyWorkflowIdentity(pool:Pool,source:{root:string;foreign:string;ordinary:string;owner:string}){
 const {SourceIdentityStore,createMappedAuthenticator,createSourceVerifier}=await import('../services/enterprise-workflow/src/source-identity');
 const {createWorkflowServer,WorkflowStore,resolveDatabaseActor,createWorkflowPool,PeopleStore}=await import('../services/enterprise-workflow/src/server');
 const native=await import('../src/lib/native-auth'),{GET,POST}=await import('../src/app/api/enterprise/workflow/route');
 // This isolated fixture starts as a personal user. Explicitly enroll as an ordinary employee,
 // without manager/record-viewing role; collaboration must not grant source analytics access.
 await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,NULL,'permanent')",[source.root,source.ordinary,source.owner]);
 for(const f of ['001-workflow.sql','002-scheduling.sql','003-source-import.sql','004-source-identity.sql','005-people-mapping.sql'])await pool.query(await readFile(new URL('../services/enterprise-workflow/migrations/'+f,import.meta.url),'utf8'));
 const enterpriseId=randomUUID(),teamId=randomUUID();await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)',[enterpriseId,teamId]);
 for(const [s,permissions] of [['provisioner',['manage']],['worker',['execute']]] as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,s]);await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,s,JSON.stringify(permissions),s==='worker'?'["design"]':'[]']);}
 const workflowPool=createWorkflowPool(process.env.DATABASE_URL!);
 const bindings=new SourceIdentityStore(workflowPool),admin={enterpriseId,teamId,subject:'provisioner'},common={sourceInstance:'fixture-source-a',sourceEnterprise:source.root,expectedVersion:0,enabled:true,reason:'isolated source binding'};
 await bindings.configure(admin,{...common,type:'enterprise'});await bindings.configure(admin,{...common,type:'identity',sourceSubject:source.ordinary,subject:'worker'});
 const keys=generateKeyPairSync('ed25519'),verifier=createSourceVerifier({issuer:'naumi-workflow-bff',audience:'enterprise-workflow-source',publicKeys:{fixture:keys.publicKey}});
 const server=createWorkflowServer(new WorkflowStore(workflowPool,resolveDatabaseActor,async()=>false),createMappedAuthenticator(bindings,verifier),undefined,{store:bindings,authenticate:verifier},new PeopleStore(workflowPool,resolveDatabaseActor));server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
 Object.assign(process.env,{NAUMI_WORKFLOW_SERVICE_URL:`http://127.0.0.1:${address.port}`,NAUMI_WORKFLOW_SIGNING_KID:'fixture',NAUMI_WORKFLOW_SIGNING_KEY:keys.privateKey.export({format:'pem',type:'pkcs8'}).toString()});
 const request=(email:string,enterpriseId=source.root,extra:Record<string,string>={})=>new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action:'context',enterpriseId,...extra}),{headers:{cookie:email?'nv_user='+native.signUserSession(email,Date.now()):''}});
 try{
  assert.equal((await GET(request(''))).status,401);assert.equal((await GET(request(source.ordinary,source.root,{role:'manage'}))).status,400);
  const response=await GET(request(source.ordinary));assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.equal(body.workspace.subject,'worker');assert.deepEqual(body.workspace.teams[0].permissions,['execute']);assert(!JSON.stringify(body).includes('token')&&!JSON.stringify(body).includes('PRIVATE KEY'));
  const {GET:records}=await import('../src/app/api/enterprise/integration/route');assert.equal((await records(new Request('http://fixture.invalid/api/enterprise/integration?action=members&enterpriseId='+source.root,{headers:{cookie:'nv_user='+native.signUserSession(source.ordinary,Date.now())}}))).status,403);
  assert.equal((await GET(request(source.ordinary,source.foreign))).status,404);assert.equal((await GET(request(source.owner))).status,403); // owner is not implicitly workflow manager
  await bindings.configure(admin,{...common,type:'identity',sourceSubject:source.owner,subject:'provisioner'});
  await pool.query('INSERT INTO enterprise_workflow.person_directory_admins(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,'provisioner']);
  const profile={commandId:randomUUID(),personId:randomUUID(),expectedVersion:0,realName:'合成人员真名',nickname:'合成花名',source:null,enabled:true,reason:'BFF verification'};
  const post=(email:string,origin='http://fixture.invalid')=>new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action:'people-profile',enterpriseId:source.root,teamId}),{method:'POST',headers:{cookie:'nv_user='+native.signUserSession(email,Date.now()),origin,'content-type':'application/json'},body:JSON.stringify(profile)});
  assert.equal((await POST(post(source.owner,'https://foreign.invalid'))).status,403);assert.equal((await POST(post(source.ordinary))).status,403);assert.equal((await POST(post(source.owner))).status,200);const replay=await POST(post(source.owner));assert.equal((await replay.json()).replayed,true);
  await pool.query('UPDATE app_users SET banned=true WHERE email=$1',[source.ordinary]);assert.equal((await GET(request(source.ordinary))).status,401);await pool.query('UPDATE app_users SET banned=false WHERE email=$1',[source.ordinary]);
  await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[source.root]);assert.equal((await GET(request(source.ordinary))).status,403);await pool.query('UPDATE app_account_teams SET enabled=true WHERE id=$1',[source.root]);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[source.owner]);assert.equal((await GET(request(source.ordinary))).status,403);await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[source.owner]);
  const old=process.env.NAUMI_WORKFLOW_SIGNING_KEY;delete process.env.NAUMI_WORKFLOW_SIGNING_KEY;assert.equal((await GET(request(source.ordinary))).status,503);process.env.NAUMI_WORKFLOW_SIGNING_KEY=old;
  await bindings.configure(admin,{...common,type:'identity',sourceSubject:source.ordinary,subject:'worker',expectedVersion:1,enabled:false});assert.equal((await GET(request(source.ordinary))).status,403);
  console.log('WORKFLOW_BFF_PASS: real_native_session=1 ordinary_employee=200 role_injection=400 foreign=404 unbound_owner=403 banned=401 source_grant_revoked=403 mapping_revoked=403 unconfigured=503 browser_token=0');
  console.log('PEOPLE_BFF_PASS: source_owner_explicitly_bound=1 directory_admin=200 worker=403 origin=403 idempotent=1');
 }finally{delete process.env.NAUMI_WORKFLOW_SIGNING_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await workflowPool.end();}
}
