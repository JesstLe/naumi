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
 for(const f of ['001-workflow.sql','002-scheduling.sql','003-source-import.sql','004-source-identity.sql','005-people-mapping.sql','006-source-intake.sql','007-workspace-labels.sql'])await pool.query(await readFile(new URL('../services/enterprise-workflow/migrations/'+f,import.meta.url),'utf8'));
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
  const {GET:productHtml}=await import('../src/app/enterprise/workflow/route');const shell=await productHtml();assert.equal(shell.status,200);assert.equal(await shell.text(),await readFile('design/enterprise-demo/preview.html','utf8'));
  const {middleware}=await import('../src/middleware');const {NextRequest}=await import('next/server');const loginRedirect=await middleware(new NextRequest('http://fixture.invalid/enterprise/workflow'));assert.equal(loginRedirect.status,307);assert(loginRedirect.headers.get('location')?.includes('/sign-in?redirect=%2Fenterprise%2Fworkflow'));
  const discovery=(email:string)=>GET(new Request('http://fixture.invalid/api/enterprise/workflow?action=discovery',{headers:{cookie:email?'nv_user='+native.signUserSession(email,Date.now()):''}}));
  assert.equal((await discovery('')).status,401);const employeeDiscovery=await discovery(source.ordinary);assert.equal(employeeDiscovery.status,200);assert.equal((await employeeDiscovery.json()).enterprises.length,1);
  const personal='workspace-personal@fixture.invalid';const db=await import('../src/lib/db');await db.getOrCreateUser(personal,'无企业个人账号');assert.equal((await (await discovery(personal)).json()).enterprises.length,0);
  const staleActorRequest=new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action:'context',enterpriseId:source.root}),{headers:{cookie:'nv_user='+native.signUserSession(source.ordinary,Date.now()),'x-workflow-viewer':source.owner}});assert.equal((await GET(staleActorRequest)).status,409);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[source.owner]);assert.equal((await (await discovery(source.ordinary)).json()).enterprises.length,0);await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[source.owner]);
  const originalAllowed=process.env.NAUMI_ENTERPRISE_ALLOWED_IDS;process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=source.foreign;assert.equal((await (await discovery(source.ordinary)).json()).enterprises.length,0);process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=originalAllowed;
  console.log('WORKSPACE_DISCOVERY_PASS: employee=1 personal_empty=1 anonymous=401 pinned_filter=1 grant_revoked_empty=1 account_changed=409 same_product_html=1 middleware_login_redirect=307');
  const response=await GET(request(source.ordinary));assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.equal(body.workspace.subject,'worker');assert.deepEqual(body.workspace.teams[0].permissions,['execute']);assert(!JSON.stringify(body).includes('token')&&!JSON.stringify(body).includes('PRIVATE KEY'));
  const {GET:records}=await import('../src/app/api/enterprise/integration/route');assert.equal((await records(new Request('http://fixture.invalid/api/enterprise/integration?action=members&enterpriseId='+source.root,{headers:{cookie:'nv_user='+native.signUserSession(source.ordinary,Date.now())}}))).status,403);
  assert.equal((await GET(request(source.ordinary,source.foreign))).status,404);assert.equal((await GET(request(source.owner))).status,403); // owner is not implicitly workflow manager
  await bindings.configure(admin,{...common,type:'identity',sourceSubject:source.owner,subject:'provisioner'});
  await pool.query('INSERT INTO enterprise_workflow.person_directory_admins(enterprise_id,subject) VALUES($1,$2)',[enterpriseId,'provisioner']);
  const profile={commandId:randomUUID(),personId:randomUUID(),expectedVersion:0,realName:'合成人员真名',nickname:'合成花名',source:null,enabled:true,reason:'BFF verification'};
  const post=(email:string,origin='http://fixture.invalid')=>new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action:'people-profile',enterpriseId:source.root,teamId}),{method:'POST',headers:{cookie:'nv_user='+native.signUserSession(email,Date.now()),origin,'content-type':'application/json'},body:JSON.stringify(profile)});
  assert.equal((await POST(post(source.owner,'https://foreign.invalid'))).status,403);assert.equal((await POST(post(source.ordinary))).status,403);assert.equal((await POST(post(source.owner))).status,200);const replay=await POST(post(source.owner));assert.equal((await replay.json()).replayed,true);
  await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"manage\",\"request\",\"dispatch\"]' WHERE enterprise_id=$1 AND subject='provisioner'",[enterpriseId]);
  const write=(action:string,data:unknown,email=source.owner)=>POST(new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action,enterpriseId:source.root,teamId}),{method:'POST',headers:{cookie:'nv_user='+native.signUserSession(email,Date.now()),origin:'http://fixture.invalid','content-type':'application/json'},body:JSON.stringify(data)}));
  const command={commandId:randomUUID(),orderId:randomUUID(),expectedVersion:0,action:{type:'create',title:'BFF requirement',brief:'synthetic',acceptance:'verified'}};
  assert.equal((await write('command',command,source.ordinary)).status,403);
  const made=await write('command',command);assert.equal(made.status,200,await made.clone().text());assert.equal((await made.json()).order.requester,'provisioner');
  const listed=await GET(request(source.owner,source.root,{action:'orders',teamId}));assert.equal(listed.status,200);assert.equal((await listed.json()).total,1);
  const hidden=await GET(request(source.ordinary,source.root,{action:'order',teamId,id:command.orderId}));assert.equal(hidden.status,404);
  const detail=await GET(request(source.owner,source.root,{action:'order',teamId,id:command.orderId}));assert.equal(detail.status,200);assert.equal((await detail.json()).events.length,1);
  const sourceHash='f'.repeat(64);await pool.query('INSERT INTO enterprise_workflow.import_batches(enterprise_id,source_hash,document) VALUES($1,$2,$3)',[enterpriseId,sourceHash,{}]);await pool.query('INSERT INTO enterprise_workflow.import_rows(enterprise_id,source_hash,row_number,document) VALUES($1,$2,2,$3)',[enterpriseId,sourceHash,{title:'BFF source',parentLabel:'',raw:{'需求方':'合成真名','设计师':'合成设计师','任务完成情况':'已完成'}}]);
  const promotion={command:{...command,commandId:randomUUID(),orderId:randomUUID()},source:{sourceHash,row:2,expectedVersion:1,intent:'standalone',confirmed:true}};
  assert.equal((await write('intake',promotion)).status,200);assert.equal((await (await write('intake',promotion)).json()).replayed,true);assert.equal((await write('intake',{...promotion,command:{...promotion.command,commandId:randomUUID(),orderId:randomUUID()}})).status,409);
  console.log('INTAKE_BFF_PASS: native_login=1 create=200 scoped_list=1 detail=200 worker_detail=404 source_promote=200 replay=1 source_duplicate=409');
  await pool.query('UPDATE app_users SET banned=true WHERE email=$1',[source.ordinary]);assert.equal((await GET(request(source.ordinary))).status,401);await pool.query('UPDATE app_users SET banned=false WHERE email=$1',[source.ordinary]);
  await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[source.root]);assert.equal((await GET(request(source.ordinary))).status,403);await pool.query('UPDATE app_account_teams SET enabled=true WHERE id=$1',[source.root]);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[source.owner]);assert.equal((await GET(request(source.ordinary))).status,403);await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[source.owner]);
  const old=process.env.NAUMI_WORKFLOW_SIGNING_KEY;delete process.env.NAUMI_WORKFLOW_SIGNING_KEY;assert.equal((await GET(request(source.ordinary))).status,503);process.env.NAUMI_WORKFLOW_SIGNING_KEY=old;
  await bindings.configure(admin,{...common,type:'identity',sourceSubject:source.ordinary,subject:'worker',expectedVersion:1,enabled:false});assert.equal((await GET(request(source.ordinary))).status,403);
  console.log('WORKFLOW_BFF_PASS: real_native_session=1 ordinary_employee=200 role_injection=400 foreign=404 unbound_owner=403 banned=401 source_grant_revoked=403 mapping_revoked=403 unconfigured=503 browser_token=0');
  console.log('PEOPLE_BFF_PASS: source_owner_explicitly_bound=1 directory_admin=200 worker=403 origin=403 idempotent=1');
  if(process.env.NAUMI_WORKSPACE_PREVIEW==='1'){const {workspacePreview}=await import('./preview-workspace');await workspacePreview(pool,{source,enterpriseId,teamId});}
 }finally{delete process.env.NAUMI_WORKFLOW_SIGNING_KEY;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await workflowPool.end();}
}
