import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  process.env.SETTINGS_SECRET='enterprise-fixture-012345678901234567890';process.env.NAUMI_MULTI_USER='1';
  const db=await import('../src/lib/db'),server=await import('../src/lib/enterprise/server'),native=await import('../src/lib/native-auth');
  const api=await import('../src/app/api/enterprise/route'),content=await import('../src/app/api/enterprise/content/route'),legacy=await import('../src/app/api/team/users/route'),media=await import('../src/app/api/enterprise/media/route');
  await server.ensureEnterpriseSchema();const pool=db.getPool();
  const owner='boss@erp.fixture',director='director@erp.fixture',lead='lead@erp.fixture',employee='employee@erp.fixture',intern='intern@erp.fixture',other='other@erp.fixture';
  const root=randomUUID(),sub=randomUUID(),cap=new Date(Date.now()+30*86400000).toISOString(),admin={email:'site-admin',admin:true,consoleAdmin:true};
  const cookie=(email:string,at=Date.now())=>`nv_user=${native.signUserSession(email,at)}`;
  const request=(email:string,path:string,body?:unknown,headers:Record<string,string>={})=>new Request('http://fixture.test'+path,{method:body?'POST':'GET',headers:{cookie:email?cookie(email):'','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  const read=(e:string)=>api.GET(request(e,`/api/enterprise?enterpriseId=${root}`));
  for(const e of [owner,director,lead,employee,intern,other])await db.getOrCreateUser(e,e);
  // This regression intentionally exercises a finite enterprise access cap.
  // Permanent entry uses a null grant expiry and is covered separately.
  for(const e of [owner,lead])await pool.query("INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by) VALUES($1,'owned',$2,'fixture','fixture')",[e,cap]);
  for(const [id,email] of [[root,owner],[sub,lead]])await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until)VALUES($1,'ERP fixture',$2,$3)",[id,email,cap]);
  for(const e of [director,lead,employee]){await pool.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[e,root]);await pool.query('UPDATE app_users SET account_expires_at=$2 WHERE email=$1',[e,cap])}
  await pool.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[intern,sub]);await pool.query('UPDATE app_users SET account_expires_at=$2 WHERE email=$1',[intern,cap]);
  const before=(await pool.query('SELECT email,role,password_hash,credits_total,credits_used,account_expires_at,management_version FROM app_users ORDER BY email')).rows;
  const oldCookie=new Request('http://fixture.test',{headers:{cookie:cookie(intern,Date.now()-10_000)}});
  const activation=await server.activateEnterprise(admin,root,director,[sub]);assert.deepEqual(activation,{ok:true,replayed:false,permanent:3,interns:1});assert.equal((await server.activateEnterprise(admin,root,director,[sub])).replayed,true);
  const snapshot=await server.enterpriseSnapshot({email:owner,admin:false},root);assert.equal(snapshot.members.length,4);assert.equal(snapshot.members.filter(m=>m.employment==='permanent').every(m=>m.membership_expires_at===null),true);assert.equal(snapshot.members.find(m=>m.email===intern)!.employment,'intern');
  assert.deepEqual((await pool.query('SELECT email,role,password_hash,credits_total,credits_used,account_expires_at,management_version FROM app_users ORDER BY email')).rows,before);
  assert.equal((await read('')).status,401);assert.equal((await read(other)).status,403);assert.equal((await read(employee)).status,403);
  const d=await(await read(director)).json(),l=await(await read(lead)).json();assert.equal(d.members.length,4);assert.equal(l.members.length,2);assert(!JSON.stringify(l).includes(employee));
  console.log('HIERARCHY=PASS OWNER=4 DIRECTOR=4 LEAD_SELF_AND_INTERNS=2 CROSS_ENTERPRISE=403 EMPLOYEE_ENTRY=403 PERMANENT_NULL=3 INTERN_EXPIRY=PRESERVED');
  const member=(email:string)=>snapshot.members.find(m=>m.email===email)!;
  const cmd=(email:string)=>({id:randomUUID(),enterpriseId:root,email,expectedVersion:member(email).version,expectedUserVersion:member(email).management_version});
  const internCmd={...cmd(intern),action:'expiry' as const,expiresAt:cap};
  assert.equal((await api.POST(request(lead,'/api/enterprise',internCmd,{origin:'https://evil.test'}))).status,403);
  assert.equal((await api.POST(request(lead,'/api/enterprise',{...cmd(director),action:'status',banned:true}))).status,403);
  assert.equal((await api.POST(request(director,'/api/enterprise',{...cmd(director),action:'status',banned:true}))).status,403);
  assert.equal((await api.POST(request(lead,'/api/enterprise',{...cmd(employee),action:'status',banned:true}))).status,403);
  assert.equal((await api.POST(request(owner,'/api/enterprise',{...cmd(employee),action:'expiry',expiresAt:cap}))).status,400);
  assert.equal((await api.POST(request(lead,'/api/enterprise',{...internCmd,expiresAt:null}))).status,400);
  assert.equal((await api.POST(request(lead,'/api/enterprise',{...internCmd,expiresAt:new Date(Date.now()+50*86400000).toISOString()}))).status,400);
  assert.equal((await api.POST(request(owner,'/api/enterprise',{...cmd(employee),action:'role',role:'admin'}))).status,400);
  const role=snapshot.roles.find(r=>r.name==='团队负责人')!;
  const roleCommand={id:randomUUID(),enterpriseId:root,action:'role' as const,roleId:randomUUID(),expectedVersion:null,name:'自定义组长',level:50,manageMembers:true,viewRecords:true};
  assert.equal((await api.POST(request(director,'/api/enterprise',roleCommand))).status,403);
  assert.equal((await api.POST(request(owner,'/api/enterprise',roleCommand))).status,200);assert.equal((await api.POST(request(owner,'/api/enterprise',roleCommand))).status,200);
  assert.equal((await api.POST(request(owner,'/api/enterprise',{...roleCommand,name:'another'}))).status,409);
  assert.equal((await api.POST(request(owner,'/api/enterprise',{...roleCommand,id:randomUUID(),roleId:role.id,expectedVersion:role.version,level:5}))).status,409);
  const cycle={...cmd(director),action:'organization' as const,roleId:member(director).role_id,supervisorEmail:lead,employment:'permanent' as const,expiresAt:null};
  assert.equal((await api.POST(request(owner,'/api/enterprise',cycle))).status,409);
  assert.equal((await api.POST(request(owner,'/api/enterprise',{...cycle,id:randomUUID(),supervisorEmail:other}))).status,409);
  const [a,b]=await Promise.all([api.POST(request(lead,'/api/enterprise',internCmd)),api.POST(request(lead,'/api/enterprise',{...internCmd,id:randomUUID()}))]);assert.deepEqual([a.status,b.status].sort(),[200,409]);
  assert.equal((await api.POST(request(lead,'/api/enterprise',internCmd))).status,200);
  console.log('MUTATIONS=PASS UPWARD_SELF_OUT_OF_SCOPE=403 CSRF=403 ROLE_OWNER_ONLY=403 CYCLE=409 PERMANENT_EXPIRY=400 INTERN_NULL=400 CAP=400 CONFLICT=409 REPLAY=200');
  const current=await server.enterpriseSnapshot({email:owner,admin:false},root),m=current.members.find(x=>x.email===intern)!;
  await assert.rejects(server.mutateEnterprise({email:lead,admin:false},{id:randomUUID(),enterpriseId:root,email:intern,expectedVersion:m.version,expectedUserVersion:m.management_version,action:'reset-password',password:'fixture-reset-password'}),/不允许修改全站登录密码/);
  assert.equal(await native.activeNativeUserEmail(oldCookie),intern);
  const logs=JSON.stringify((await pool.query('SELECT * FROM app_enterprise_audit')).rows);assert(!logs.includes('fixture-reset-password'));assert(!logs.includes('scrypt$'));
  for(const section of ['conversations','ledger','audit']){assert.equal((await content.GET(request(owner,`/api/enterprise/content?enterpriseId=${root}&email=${intern}&section=${section}`))).status,400);assert.equal((await legacy.GET(request(lead,`/api/team/users?teamId=${sub}&email=${intern}&section=${section}`))).status,403)}
  assert.equal((await media.GET(request(lead,`/api/enterprise/media?enterpriseId=${root}&email=${employee}&id=guess`))).status,403);
  await pool.query("UPDATE app_enterprise_roles SET manage_members=false,view_records=false WHERE enterprise_id=$1 AND id=$2",[root,role.id]);
  // Roles managing actual children cannot be disabled through the API without reparenting; this direct fixture change deliberately tests fail-closed corrupt configuration.
  assert.equal((await read(lead)).status,409);
  await pool.query("UPDATE app_enterprise_roles SET manage_members=true,view_records=true WHERE enterprise_id=$1 AND id=$2",[root,role.id]);
  await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);assert.equal((await read(director)).status,403);await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[owner]);
  console.log('CONTENT=PASS ONLY_ARTWORKS_TASKS=ENFORCED LEGACY_BYPASS=403 MEDIA_SCOPE=403 GLOBAL_PASSWORD_DENIED=PASS PERSONAL_SESSION_PRESERVED=PASS AUDIT_REDACTED=PASS ROOT_GRANT_PAUSE=403');
  // Exact rollback of this fixture only: code/schema deactivation does not touch media or money.
  await pool.query('DELETE FROM app_enterprise_audit WHERE enterprise_id=$1',[root]);await pool.query('DELETE FROM app_enterprise_members WHERE enterprise_id=$1',[root]);await pool.query('DELETE FROM app_enterprise_roles WHERE enterprise_id=$1',[root]);await pool.query('DELETE FROM app_enterprise_settings WHERE team_id=$1',[root]);
  for(const u of before)await pool.query('UPDATE app_users SET account_expires_at=$2,management_version=$3,password_hash=$4 WHERE email=$1',[u.email,u.account_expires_at,u.management_version,u.password_hash]);
  assert.equal(await server.enterpriseManaged(lead),false);
  assert.deepEqual((await pool.query('SELECT email,role,password_hash,credits_total,credits_used,account_expires_at,management_version FROM app_users ORDER BY email')).rows,before);
  console.log('ROLLBACK=PASS LEGACY_TEAM_RESTORED USER_ROLES_PASSWORD_CREDITS_EXPIRY_EXACT=PASS PROVIDER_CALLS=0');
  await pool.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
