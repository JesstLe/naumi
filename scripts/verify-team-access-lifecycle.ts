import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
 process.env.SETTINGS_SECRET="team-fixture-secret-012345678901234567890123456789";process.env.NAUMI_MULTI_USER="1";
 const db=await import("../src/lib/db"),team=await import("../src/lib/teams/server"),grants=await import("../src/lib/teams/grants"),native=await import("../src/lib/native-auth"),gate=await import("../src/lib/admin-auth");
 const api=await import("../src/app/api/admin/team-access/route"),entry=await import("../src/app/api/team/access/route"),snap=await import("../src/app/api/team/route"),users=await import("../src/app/api/team/users/route");
 const pool=db.getPool();
 try{
  await db.ensureSchema();const admin="admin@lifecycle.test",owner="owner@lifecycle.test",fresh="fresh@lifecycle.test",child="child@lifecycle.test";
  for(const email of [admin,owner,fresh,child])await db.getOrCreateUser(email,email);await db.setUserRole(admin,"admin");
  // Simulate a real pre-upgrade owner/team table before the one-time migration.
  await pool.query(`CREATE TABLE app_account_teams(id uuid PRIMARY KEY,name text NOT NULL,owner_email text UNIQUE NOT NULL REFERENCES app_users(email),authorized_until timestamptz NOT NULL,enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`);
  const id=randomUUID(),cap=new Date(Date.now()+15*86400000).toISOString();await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Lifecycle team',$2,$3)",[id,owner,cap]);
  await team.ensureTeamSchema();assert.equal((await grants.teamEntryAccess(admin)).admin,true);assert.equal((await grants.teamEntryAccess(owner)).allowed,true);assert.equal((await grants.teamEntryAccess(fresh)).allowed,false);
  await gate.setAdminPassword("fixture-console-password");const session=await gate.authenticateAdminPassword("fixture-console-password");assert.ok(session);
  const nativeCookie=(email:string)=>`nv_user=${native.signUserSession(email,Date.now())}`;
  const request=(cookie:string,body?:unknown,path="/api/admin/team-access",origin?:string)=>new Request("http://fixture.test"+path,{method:body?"POST":"GET",headers:{cookie,"Content-Type":"application/json",...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const consoleCookie=`${nativeCookie(admin)}; nv_admin=${session}`,actor={email:admin,admin:true,consoleAdmin:true};
  const row=async(email:string)=>(await pool.query("SELECT * FROM app_team_access_grants WHERE email=$1",[email])).rows[0];
  assert.equal((await api.GET(request(nativeCookie(admin)))).status,403);assert.equal((await api.GET(request(consoleCookie))).status,200);
  const grant={id:randomUUID(),email:fresh,action:"grant" as const,scope:"owned" as const,startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),expectedVersion:null};
  assert.equal((await api.POST(request(nativeCookie(admin),grant))).status,403);assert.equal((await api.POST(request(consoleCookie,grant,undefined,"https://evil.test"))).status,403);
  assert.equal((await api.POST(request(consoleCookie,{...grant,scope:"all"}))).status,403);assert.equal((await api.POST(request(consoleCookie,grant))).status,200);
  assert.equal((await api.POST(request(consoleCookie,grant))).status,200);assert.equal((await row(fresh)).version,0);
  assert.equal((await api.POST(request(consoleCookie,{...grant,expiresAt:null}))).status,409);
  assert.equal((await (await entry.GET(request(nativeCookie(fresh),undefined,"/api/team/access"))).json()).allowed,true);
  assert.equal((await snap.GET(request(nativeCookie(fresh),undefined,"/api/team"))).status,200);
  assert.equal((await snap.GET(request(nativeCookie(fresh),undefined,`/api/team?teamId=${id}`))).status,403);
  await team.mutateTeam(actor,{id:randomUUID(),teamId:id,action:"attach",email:child,expiresAt:cap},true);
  assert.equal((await api.POST(request(consoleCookie,{...grant,id:randomUUID(),email:child}))).status,409);
  const credits=(await pool.query("SELECT credits_total,credits_used,password_hash,account_expires_at FROM app_users WHERE email=$1",[owner])).rows;
  const pause={id:randomUUID(),email:owner,expectedVersion:0,action:"pause" as const};await grants.mutateGrant(actor,pause);
  assert.equal((await snap.GET(request(nativeCookie(owner),undefined,"/api/team"))).status,403);
  await assert.rejects(team.teamContent({email:owner,admin:false},id,child,"ledger",1),/入口授权/);
  assert.equal((await (await entry.GET(request(nativeCookie(owner),undefined,"/api/team/access"))).json()).allowed,false);
  const conflicts=await Promise.allSettled([grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:1,action:"resume"}),grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:1,action:"resume"})]);assert.equal(conflicts.filter(r=>r.status==="fulfilled").length,1);
  const future=new Date(Date.now()+86400000).toISOString();await grants.mutateGrant(actor,{...grant,id:randomUUID(),email:owner,expectedVersion:2,startsAt:future,expiresAt:new Date(Date.now()+2*86400000).toISOString()});
  assert.equal(grants.grantStatus(await row(owner)),"scheduled");assert.equal((await snap.GET(request(nativeCookie(owner)))).status,403);
  await grants.mutateGrant(actor,{...grant,id:randomUUID(),email:owner,expectedVersion:3,expiresAt:null});assert.equal((await row(owner)).expires_at,null);
  await pool.query("UPDATE app_team_access_grants SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE email=$1",[owner]);
  assert.equal(grants.grantStatus(await row(owner)),"expired");assert.equal((await users.GET(request(nativeCookie(owner),undefined,`/api/team/users?teamId=${id}&email=${child}`))).status,403);
  await assert.rejects(grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:4,action:"resume"}),/到期/);
  await grants.mutateGrant(actor,{...grant,id:randomUUID(),email:owner,expectedVersion:4});assert.equal((await snap.GET(request(nativeCookie(owner)))).status,200);
  await grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:5,action:"revoke"});assert.equal(grants.grantStatus(await row(owner)),"revoked");
  await team.ensureTeamSchema();assert.equal(grants.grantStatus(await row(owner)),"revoked");await assert.rejects(grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:6,action:"resume"}),/重新授权/);
  await grants.mutateGrant(actor,{...grant,id:randomUUID(),email:owner,expectedVersion:6});assert.equal((await row(owner)).version,7);
  assert.deepEqual((await pool.query("SELECT credits_total,credits_used,password_hash,account_expires_at FROM app_users WHERE email=$1",[owner])).rows,credits);
  await db.setUserRole(fresh,"admin");await team.ensureTeamSchema();assert.equal((await row(fresh)).scope,"owned");
  await grants.mutateGrant(actor,{...grant,id:randomUUID(),email:fresh,expectedVersion:0,scope:"all"});assert.equal((await grants.teamEntryAccess(fresh)).admin,true);
  await pool.query("UPDATE app_users SET banned=true WHERE email=$1",[fresh]);assert.equal((await grants.teamEntryAccess(fresh)).allowed,false);
  const audit=await grants.grantAudit(owner,1);assert.equal(audit.total,8);assert.ok(!JSON.stringify(audit).includes("fixture-console-password"));assert.ok(!JSON.stringify(audit).includes("scrypt$"));
  assert.equal(await gate.requireAdmin(request(nativeCookie(admin))),false);
  // A grant row update waits for a current content-read transaction, then denies all later reads.
  const tx=await pool.connect();await tx.query("BEGIN");await grants.requireTeamGrant(tx,{email:owner,admin:false});let changed=false;
  const blocked=grants.mutateGrant(actor,{...pause,id:randomUUID(),expectedVersion:7}).then(()=>{changed=true;});await new Promise(r=>setTimeout(r,80));assert.equal(changed,false);await tx.query("COMMIT");tx.release();await blocked;
  await assert.rejects(team.teamSnapshot({email:owner,admin:false}),/入口授权/);
  console.log("TEAM_ACCESS_LIFECYCLE=PASS MIGRATION=ONCE GRANT=PASS SCHEDULE=ENFORCED EXPIRY=ENFORCED RENEW=PASS PAUSE_RESUME=PASS REVOKE_REGRANT=PASS OWNER_SCOPE=ISOLATED SECOND_PASSWORD=REQUIRED CSRF=403 CONFLICT=409 REPLAY=IDEMPOTENT AUDIT=REDACTED TRANSACTION_LOCK=PASS ACCOUNT_CREDITS=UNCHANGED PROVIDER_CALLS=0");
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
