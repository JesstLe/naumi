import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  process.env.SETTINGS_SECRET = "team-fixture-secret-012345678901234567890123456789";
  process.env.NAUMI_MULTI_USER = "1";
  const db = await import("../src/lib/db"), team = await import("../src/lib/teams/server"), native = await import("../src/lib/native-auth"), pw = await import("../src/lib/pw");
  const api = await import("../src/app/api/team/users/route"), adminApi = await import("../src/app/api/admin/teams/route"), snapshotApi = await import("../src/app/api/team/route"), conversationApi = await import("../src/app/api/team/conversation/route"), login = await import("../src/app/api/auth/login/route"), biApi = await import("../src/app/api/admin/bi/users/route");
  await team.ensureTeamSchema(); const pool = db.getPool();
  const owner = "owner@fixture.test", owner2 = "owner2@fixture.test", child = "child@fixture.test", child2 = "child2@fixture.test", admin = "admin@fixture.test", stranger = "stranger@fixture.test";
  for (const email of [owner, owner2, child, child2, admin, stranger]) { await db.getOrCreateUser(email, email); await db.setUserPassword(email, pw.hashPassword("fixture-password")); }
  await db.setUserRole(admin, "admin");
  for(const e of [owner,owner2,admin]) await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,$2,now()-interval '1 day','fixture','fixture')",[e,e===admin?"all":"owned"]);
  const actor = { email: owner, admin: false }, siteAdmin = { email: admin, admin: true, consoleAdmin: true }, actor2 = { email: owner2, admin: false };
  const id = randomUUID(), id2 = randomUUID(), cutoff = new Date(Date.now() + 15 * 86400000).toISOString();
  const cookie = (email: string, now = Date.now()) => `nv_user=${native.signUserSession(email, now)}`;
  const req = (email: string, body?: unknown, endpoint = "/api/team/users", origin?: string) => new Request(`http://fixture.test${endpoint}`, { method: body ? "POST" : "GET", headers: { ...(email ? { cookie: cookie(email) } : {}), "Content-Type": "application/json", ...(origin ? { origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const create = { id: randomUUID(), teamId: id, action: "create" as const, ownerEmail: owner, name: "Fixture team", authorizedUntil: cutoff };
  assert.equal((await adminApi.POST(req(owner, create, "/api/admin/teams"))).status, 403);
  assert.equal((await adminApi.POST(req(admin, create, "/api/admin/teams", "https://evil.test"))).status, 403);
  assert.equal((await adminApi.POST(req(admin, create, "/api/admin/teams"))).status, 200);
  assert.equal((await team.mutateTeam(siteAdmin, create, true)).replayed, true);
  await team.mutateTeam(siteAdmin, { ...create, id: randomUUID(), teamId: id2, ownerEmail: owner2 }, true);
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "attach", email: child, expiresAt: cutoff }, true);
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id2, action: "attach", email: child2, expiresAt: cutoff }, true);
  await assert.rejects(team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "attach", email: owner, expiresAt: cutoff }, true), /普通子账号/);
  await assert.rejects(team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "attach", email: owner2, expiresAt: cutoff }, true), /负责人/);
  await assert.rejects(team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "attach", email: child2, expiresAt: cutoff }, true), /已有归属/);
  assert.equal((await snapshotApi.GET(req(owner, undefined, `/api/team?teamId=${id2}`))).status, 403);
  assert.equal((await api.GET(req("", undefined, `/api/team/users?teamId=${id}&email=${child}`))).status, 401);
  assert.equal((await api.GET(req(owner2, undefined, `/api/team/users?teamId=${id}&email=${child}`))).status, 403);
  assert.equal((await api.GET(req(owner, undefined, `/api/team/users?teamId=${id}&email=${child2}`))).status, 403);
  assert.equal((await snapshotApi.GET(req(stranger))).status, 403);

  const blocker=await pool.connect(),wallet=await pool.connect();
  let pending:ReturnType<typeof team.teamSnapshot>|undefined;
  try{
    await blocker.query('BEGIN');await blocker.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
    pending=team.teamSnapshot(actor,id);
    void pending.catch(()=>{});
    let waiting=false;
    for(let i=0;i<30&&!waiting;i++){
      waiting=(await wallet.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%COALESCE(b.principal,0)-u.credits_used%') AS waiting")).rows[0].waiting;
      if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(waiting,true,'fixture should pause the actual aggregation');
    await wallet.query('BEGIN');await wallet.query("SET LOCAL lock_timeout='750ms'");
    await wallet.query('UPDATE app_users SET credits_used=credits_used WHERE email=$1',[owner]);
    await wallet.query('COMMIT');
    // Authorization can change while an old snapshot is calculating. The
    // report must never release that data after revocation in its final check.
    await wallet.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[owner]);
  }finally{await blocker.query('ROLLBACK');await wallet.query('ROLLBACK');blocker.release();wallet.release();}
  await assert.rejects(pending!,/团队入口授权/);
  await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[owner]);
  const audited=await team.teamSnapshot(actor,id);assert.equal(audited.members[0].email,child);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_account_team_audit WHERE team_id=$1 AND action='view-members'",[id])).rows[0].n,1);
  console.log('LEGACY_TEAM_REPORT_PASS wallet_update_while_blocked=1 live_revocation=1 only_success_audited=1');

  const old = new Request("http://fixture.test", { headers: { cookie: cookie(child, Date.now() - 10000) } });
  assert.equal(await native.activeNativeUserEmail(old), child);
  const reset = { id: randomUUID(), teamId: id, email: child, expectedVersion: 1, action: "reset-password" as const, password: "new-fixture-password" };
  assert.equal((await api.POST(req(owner, reset, undefined, "https://evil.test"))).status, 403);
  assert.equal((await api.POST(req(owner2, reset))).status, 403);
  assert.equal((await api.POST(req(owner, { ...reset, action: "role", role: "admin" }))).status, 400);
  assert.equal((await biApi.POST(req(owner, { id: randomUUID(), email: child, expectedVersion: 1, action: "role", role: "admin", reason: "fixture" }))).status, 404);
  assert.equal((await api.POST(req(owner, reset))).status, 200);
  assert.equal(await native.activeNativeUserEmail(old), null);
  assert.equal(pw.verifyPassword(reset.password, (await db.getUserPasswordHash(child))!), true);
  assert.equal((await team.mutateTeam(actor, reset)).replayed, true);
  await assert.rejects(team.mutateTeam(actor, { ...reset, password: "different-fixture-password" }), /操作编号/);
  const grantsBefore = (await pool.query("SELECT expires_at FROM app_credit_batches WHERE email=$1", [child])).rows;
  await assert.rejects(team.mutateTeam(actor, { id: randomUUID(), teamId: id, email: child, expectedVersion: 2, action: "expiry", expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }), /授权上限/);
  const expires = { id: randomUUID(), teamId: id, email: child, expectedVersion: 2, action: "expiry" as const, expiresAt: new Date(Date.now() - 1000).toISOString() };
  const result = await Promise.allSettled([team.mutateTeam(actor, expires), team.mutateTeam(actor, { ...expires, id: randomUUID() })]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await native.activeNativeUserEmail(new Request("http://fixture.test", { headers: { cookie: cookie(child) } })), null);
  const loginReq = (password: string) => new Request("http://fixture.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: child, password }) });
  const expiredLogin = await login.POST(loginReq(reset.password)); assert.equal(expiredLogin.status, 403); assert.equal(expiredLogin.headers.has("set-cookie"), false);
  await team.mutateTeam(actor, { ...expires, id: randomUUID(), expectedVersion: 3, expiresAt: cutoff });
  assert.equal((await login.POST(loginReq(reset.password))).status, 200);
  assert.deepEqual((await pool.query("SELECT expires_at FROM app_credit_batches WHERE email=$1", [child])).rows, grantsBefore);
  const ban = { id: randomUUID(), teamId: id, email: child, expectedVersion: 4, action: "status" as const, banned: true };
  await team.mutateTeam(actor, ban); assert.equal((await login.POST(loginReq(reset.password))).status, 403);
  await team.mutateTeam(actor, { ...ban, id: randomUUID(), expectedVersion: 5, banned: false });
  await pool.query("INSERT INTO app_agent_sessions(id,email,title,messages) VALUES($1,$2,'Child dialog',$3::jsonb)", ["team-child-session", child, JSON.stringify([{ role: "user", content: "Child private text" }, { role: "assistant", content: "Child reply" }])]);
  await pool.query("INSERT INTO app_agent_sessions(id,email,title,messages) VALUES($1,$2,'Other dialog',$3::jsonb)", ["other-team-session", child2, JSON.stringify([{ role: "user", content: "Other team secret" }])]);
  for (const section of ["artworks", "tasks", "conversations", "ledger", "audit"] as const) { const out = await team.teamContent(actor, id, child, section, 1); assert.ok(Array.isArray(out.rows)); assert.ok(!JSON.stringify(out).includes("Other team secret")); }
  const dialog = await team.teamConversation(actor, id, child, "team-child-session", "agent", 1); assert.equal(dialog.messages[0].text, "Child private text");
  const guessed = await team.teamConversation(actor, id, child, "other-team-session", "agent", 1); assert.equal(guessed.total, 0);
  assert.equal((await conversationApi.GET(req(owner, undefined, `/api/team/conversation?teamId=${id}&email=${child2}&id=other-team-session&kind=agent`))).status, 403);
  const snapshot = await team.teamSnapshot(actor); assert.equal(snapshot.members.length, 1); assert.ok(!JSON.stringify(snapshot).includes("password"));
  const logs = (await pool.query("SELECT action,changes,fingerprint FROM app_account_team_audit WHERE team_id=$1", [id])).rows;
  assert.ok(!JSON.stringify(logs).includes(reset.password)); assert.ok(!JSON.stringify(logs).includes("scrypt$"));
  const state = (await pool.query("SELECT role,management_version FROM app_users WHERE email=$1", [child])).rows[0]; assert.equal(state.role, "user");
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, expectedVersion: 0, action: "update", name: "Fixture team", authorizedUntil: cutoff, enabled: false }, true);
  await assert.rejects(team.teamSnapshot(actor), /管理权限/); await assert.rejects(team.mutateTeam(actor, reset), /管理权限/);
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, expectedVersion: 1, action: "update", name: "Fixture team", authorizedUntil: cutoff, enabled: true }, true);
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "detach", email: child, expectedVersion: state.management_version }, true);
  await assert.rejects(team.teamContent(actor, id, child, "ledger", 1), /不属于/); await assert.rejects(team.mutateTeam(actor, reset), /不属于/);
  assert.equal((await db.getUserPasswordHash(child))?.startsWith("scrypt$"), true);
  await team.mutateTeam(siteAdmin, { id: randomUUID(), teamId: id, action: "attach", email: child, expiresAt: cutoff }, true);
  await pool.query("UPDATE app_account_teams SET authorized_until=now()-interval '1 second' WHERE id=$1", [id]);
  await assert.rejects(team.teamContent(actor, id, child, "ledger", 1), /管理权限/);
  // Team-only access does not satisfy the configured global admin password gate.
  const adminAuth = await import("../src/lib/admin-auth");
  await adminAuth.setAdminPassword("fixture-console-password");
  assert.equal(await adminAuth.requireAdmin(req(admin)), false);
  const adminTeam = await snapshotApi.GET(req(admin));
  assert.equal(adminTeam.status, 200);
  assert.equal((await adminTeam.json()).canManageTeams, true);
  assert.equal((await snapshotApi.GET(req(owner))).status, 403);

  assert.equal((await adminApi.GET(req(admin))).status, 200);
  assert.equal((await adminApi.GET(req(owner))).status, 403);
  const adminLogin = await import("../src/app/api/admin/login/route");
  const passwordState = await (await adminLogin.GET(req(admin))).json();
  assert.equal(passwordState.passwordRequired, true);
  assert.equal(passwordState.localAuthed, false);
  assert.equal(passwordState.nativeAdmin, false);
  const session = await adminAuth.authenticateAdminPassword("fixture-console-password");
  assert.ok(session);
  assert.equal(await adminAuth.requireAdmin(new Request("http://fixture.test/admin", { headers: { cookie: `nv_admin=${session}` } })), true);
  // Banned admins do not inherit the team privilege from a claimed email.
  await pool.query("UPDATE app_users SET banned=true WHERE email=$1", [admin]);
  assert.equal((await adminApi.GET(req(admin))).status, 401);
  await pool.query("UPDATE app_users SET banned=false WHERE email=$1", [admin]);
  await pool.query("DELETE FROM app_settings WHERE k='admin_password_hash'");
  console.log("TEAM_ENTRY_ACCESS=PASS ACCOUNT_ADMIN=200 OWNER_ADMIN=403 GLOBAL_ADMIN_PASSWORD=REQUIRED SECOND_PASSWORD=PASS BANNED_ADMIN=401");
  await pool.end();
  console.log("TEAM_SUBACCOUNTS=PASS OWNERSHIP=ISOLATED CONTENT=SCOPED PASSWORD_RESET=REVOKED EXPIRY=ENFORCED CAP=ENFORCED CSRF=BLOCKED AUDIT=REDACTED REPLAY=IDEMPOTENT CONFLICT=409 CREDITS=UNCHANGED PROVIDER_CALLS=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
