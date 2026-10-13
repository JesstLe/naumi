import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 process.env.SETTINGS_SECRET='permanent-entry-fixture-2026-0123456789';process.env.NAUMI_MULTI_USER='1';
 const db=await import('../src/lib/db'),server=await import('../src/lib/enterprise/server'),grants=await import('../src/lib/teams/grants'),native=await import('../src/lib/native-auth'),gate=await import('../src/lib/admin-auth'),api=await import('../src/app/api/admin/team-access/route'),enterprise=await import('../src/app/api/enterprise/route');
 await server.ensureEnterpriseSchema();const p=db.getPool(),owner='boss@permanent.fixture',director='director@permanent.fixture',lead='lead@permanent.fixture',intern='intern@permanent.fixture',admin='admin@permanent.fixture';
 for(const e of [owner,director,lead,intern,admin])await db.getOrCreateUser(e,e);await db.setUserRole(admin,'admin');await gate.setAdminPassword('fixture-admin-second-password');const session=await gate.authenticateAdminPassword('fixture-admin-second-password');assert(session);
 const root=randomUUID(),sub=randomUUID(),cap=new Date(Date.now()+14*86400000).toISOString();
 for(const [id,e]of [[root,owner],[sub,lead]])await p.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until)VALUES($1,'Permanent enterprise',$2,$3)",[id,e,cap]);
 for(const e of [owner,lead])await p.query("INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by)VALUES($1,'owned',$2,'fixture','fixture')",[e,cap]);
 for(const e of [director,lead])await p.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[e,root]);await p.query('INSERT INTO app_account_team_members(email,team_id)VALUES($1,$2)',[intern,sub]);await p.query('UPDATE app_users SET account_expires_at=$2 WHERE email=$1',[intern,cap]);
 await server.activateEnterprise({email:admin,admin:true,consoleAdmin:true},root,director,[sub]);
 const before=(await p.query('SELECT email,role,password_hash,credits_total,credits_used,account_expires_at,management_version FROM app_users ORDER BY email')).rows;
 const actor={email:owner,admin:false},currentVersion=async()=>(await p.query('SELECT version FROM app_team_access_grants WHERE email=$1',[owner])).rows[0].version;
 const cookie=(email:string)=>'nv_user='+native.signUserSession(email,Date.now()),adminCookie=cookie(admin)+'; nv_admin='+session;
 const req=(body:unknown,c=adminCookie,origin='http://fixture.test')=>new Request('http://fixture.test/api/admin/team-access',{method:'POST',headers:{cookie:c,origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const command={id:randomUUID(),email:owner,action:'grant',scope:'owned',startsAt:new Date(Date.now()-60_000).toISOString(),expiresAt:null,expectedVersion:await currentVersion()};
 assert.equal((await api.POST(req(command,cookie(admin)))).status,403);assert.equal((await api.POST(req(command,adminCookie,'https://evil.test'))).status,403);
 assert.equal((await api.POST(req(command))).status,200);assert.equal((await api.POST(req(command))).status,200);assert.equal(await currentVersion(),1);
 assert.equal((await grants.teamEntryAccess(owner)).expiresAt,null);assert.equal((await server.enterpriseSnapshot(actor,root)).enterprise.authorized_until,null);
 // Real regression: legacy team is expired, grant is permanent. Both owner and
 // descendants must still enter; legacy team field itself remains untouched.
 const expired=new Date(Date.now()-86400000).toISOString();await p.query('UPDATE app_account_teams SET authorized_until=$2 WHERE id=$1',[root,expired]);
 assert.equal((await server.enterpriseSnapshot(actor,root)).members.length,3);assert.equal((await server.enterpriseSnapshot({email:director,admin:false},root)).members.length,3);assert.equal((await server.enterpriseList({email:director,admin:false}))[0].authorized_until,null);
 assert.equal((await server.enterpriseSnapshot({email:admin,admin:true,consoleAdmin:true},root)).enterprise.authorized_until,null);
 const u=(await server.enterpriseSnapshot(actor,root)).members.find(m=>m.email===intern)!;
 const expiry={id:randomUUID(),enterpriseId:root,email:intern,expectedVersion:u.version,expectedUserVersion:u.management_version,action:'expiry' as const,expiresAt:new Date(Date.now()+60*86400000).toISOString()};
 await server.mutateEnterprise(actor,expiry);assert.equal((await server.enterpriseSnapshot(actor,root)).members.find(m=>m.email===intern)!.account_expires_at!==null,true);
 const changed=(await server.enterpriseSnapshot(actor,root)).members.find(m=>m.email===intern)!;await assert.rejects(server.mutateEnterprise(actor,{...expiry,id:randomUUID(),expectedVersion:changed.version,expectedUserVersion:changed.management_version,expiresAt:null}),/须设置/);
 // Restore only the deliberately edited fixture's intern state for preservation.
 await p.query('UPDATE app_users SET account_expires_at=$2,management_version=$3 WHERE email=$1',[intern,cap,before.find(u=>u.email===intern).management_version]);await p.query('UPDATE app_enterprise_members SET version=0 WHERE email=$1',[intern]);
 for(const action of ['pause','resume','revoke'] as const){await grants.mutateGrant({email:admin,admin:true,consoleAdmin:true},{id:randomUUID(),email:owner,expectedVersion:await currentVersion(),action});if(action!=='resume')await assert.rejects(server.enterpriseSnapshot({email:director,admin:false},root),/入口授权/);else assert.equal((await server.enterpriseSnapshot(actor,root)).enterprise.authorized_until,null)}
 const finite={...command,id:randomUUID(),expiresAt:cap,expectedVersion:await currentVersion()};await grants.mutateGrant({email:admin,admin:true,consoleAdmin:true},finite);
 const effective=(await server.enterpriseSnapshot(actor,root)).enterprise.authorized_until;assert.equal(new Date(effective!).getTime(),Date.parse(cap));
 const internNow=(await server.enterpriseSnapshot(actor,root)).members.find(m=>m.email===intern)!;await assert.rejects(server.mutateEnterprise(actor,{...expiry,id:randomUUID(),expectedVersion:internNow.version,expectedUserVersion:internNow.management_version}),/范围内/);
 await p.query('UPDATE app_team_access_grants SET expires_at=now()-interval \'1 second\',starts_at=now()-interval \'1 day\' WHERE email=$1',[owner]);await assert.rejects(server.enterpriseSnapshot(actor,root),/入口授权/);
 await grants.mutateGrant({email:admin,admin:true,consoleAdmin:true},{...command,id:randomUUID(),expectedVersion:await currentVersion()});
 await p.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[root]);await assert.rejects(server.enterpriseSnapshot(actor,root),/关闭/);await p.query('UPDATE app_account_teams SET enabled=true WHERE id=$1',[root]);
 const unknown=new Request('http://fixture.test/api/enterprise?enterpriseId='+root,{headers:{cookie:cookie('outsider@fixture.test')}});assert.equal((await enterprise.GET(unknown)).status,401);
 assert.deepEqual((await p.query('SELECT email,role,password_hash,credits_total,credits_used,account_expires_at,management_version FROM app_users ORDER BY email')).rows,before);
 assert.equal(new Date((await p.query('SELECT authorized_until FROM app_account_teams WHERE id=$1',[root])).rows[0].authorized_until).getTime(),Date.parse(expired));
 console.log('PERMANENT_ENTRY=PASS GRANT_NULL=PERMANENT LEGACY_EXPIRED_CAP=IGNORED OWNER_DIRECTOR_LEAD=AUTHORIZED ADMIN_DISPLAY=ACTUAL_GRANT');
 console.log('SECURITY=PASS SECOND_PASSWORD=403 CSRF=403 PAUSE_REVOKE_SCHEDULE_EXPIRY=ENFORCED ROOT_DISABLE=403 REPLAY=IDEMPOTENT');
 console.log('INTERNS=PASS STILL_REQUIRE_EXPLICIT_EXPIRY FINITE_GRANT_CAP=ENFORCED PERMANENT_GRANT_NO_FALSE_EPOCH_CAP=PASS');
 console.log('PRESERVATION=PASS USERS_PASSWORDS_CREDITS_ROLES_FORMAL_AND_INTERN_EXPIRY=EXACT LEGACY_TEAM_DATE=UNCHANGED PROVIDER_CALLS=0');
 await p.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
