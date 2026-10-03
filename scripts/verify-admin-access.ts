import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  const db = await import("../src/lib/db"), auth = await import("../src/lib/admin-auth"), native = await import("../src/lib/native-auth"), login = await import("../src/app/api/admin/login/route"), billing = await import("../src/app/api/admin/billing/route"), bi = await import("../src/app/api/admin/bi/route"), settings = await import("../src/app/api/admin/settings/route"), { adminDestination } = await import("../src/lib/admin-navigation");
  const email = `admin-access-${randomUUID()}@example.test`, previous = await db.getSetting(auth.ADMIN_PW_HASH_SETTING), pool = db.getPool();
  const req = (cookie = "", password?: string, origin?: string) => new Request("http://fixture.test/api/admin/login", { method: password === undefined ? "GET" : "POST", headers: { cookie, ...(password === undefined ? {} : { "content-type": "application/json" }), ...(origin ? { origin } : {}) }, ...(password === undefined ? {} : { body: JSON.stringify({ password }) }) });
  const guarded = (cookie = "") => new Request("http://fixture.test/api/admin/billing", { headers: { cookie } });
  try {
    await db.getOrCreateUser(email, "Access fixture"); await db.setUserRole(email, "admin");
    const nativeCookie = `nv_user=${native.signUserSession(email, Date.now())}`, legacyCookie = `nv_admin=${auth.signSession(Date.now())}`;
    await db.getPool().query("DELETE FROM app_settings WHERE k=$1", [auth.ADMIN_PW_HASH_SETTING]);
    assert.equal(await auth.requireAdmin(guarded(nativeCookie)), true);
    await auth.setAdminPassword("fixture-admin-access-password");
    assert.equal(await auth.requireAdmin(guarded(nativeCookie)), false);
    assert.equal(await auth.requireAdmin(guarded(legacyCookie)), false);
    const state = await (await login.GET(req(nativeCookie))).json(); assert.equal(state.passwordRequired, true); assert.equal(state.nativeAdmin, false); assert.equal(state.localAuthed, false);
    const userSession = await import("../src/app/api/auth/session/route"); assert.equal((await (await userSession.GET(req(legacyCookie))).json()).user, null);
    assert.equal((await login.POST(req("", "wrong-fixture-password"))).status, 401);
    assert.equal((await login.POST(req("", "fixture-admin-access-password", "https://evil.test"))).status, 403);
    const accepted = await login.POST(req(nativeCookie, "fixture-admin-access-password")); assert.equal(accepted.status, 200); assert.match(accepted.headers.get("cache-control") || "", /no-store/);
    const cookie = accepted.headers.get("set-cookie")!.split(";")[0]; assert.match(accepted.headers.get("set-cookie")!, /HttpOnly/); assert.match(accepted.headers.get("set-cookie")!, /SameSite=lax/i);
    assert.equal(await auth.requireAdmin(guarded(cookie)), true); assert.equal(await auth.resolveUserEmail(guarded(cookie)), await db.getLocalOperatorEmail());
    for (const c of ["", nativeCookie, legacyCookie, "nv_admin=forged"]) { assert.equal((await billing.GET(guarded(c))).status, 404); assert.equal((await bi.GET(guarded(c))).status, 404); assert.equal((await settings.GET(guarded(c))).status, 403); }
    assert.equal((await billing.GET(guarded(cookie))).status, 200);
    await auth.setAdminPassword("fixture-rotated-access-password"); assert.equal(await auth.requireAdmin(guarded(cookie)), false); assert.equal(await auth.authenticateAdminPassword("fixture-admin-access-password"), null); assert.ok(await auth.authenticateAdminPassword("fixture-rotated-access-password"));
    const hash = await db.getSetting(auth.ADMIN_PW_HASH_SETTING); assert.equal(auth.verifySessionToken(auth.signSession(Date.now() - auth.SESSION_TTL_MS - 1, hash!), Date.now(), hash!), false);
    assert.match((await login.DELETE()).headers.get("set-cookie") || "", /Max-Age=0/);
    for (const target of ["https://evil.test", "//evil.test/admin", "/admin\\evil.test", "/api/admin/settings", "/admin"]) assert.equal(adminDestination(target), "/admin/center");
    assert.equal(adminDestination("/admin/billing"), "/admin/billing"); assert.equal(adminDestination("/admin?view=settings"), "/admin?view=settings");
    console.log("ADMIN_ACCESS=PASS: password gate, native-admin and legacy-cookie rejection, private/HttpOnly session, cross-site rejection, rotation, expiry, logout, protected APIs and safe return URLs");
  } finally {
    if (previous === null) await pool.query("DELETE FROM app_settings WHERE k=$1", [auth.ADMIN_PW_HASH_SETTING]); else await db.setSetting(auth.ADMIN_PW_HASH_SETTING, previous);
    await pool.query("DELETE FROM app_users WHERE email=$1", [email]); await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
