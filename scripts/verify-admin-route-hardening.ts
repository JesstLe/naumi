import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * P0 admin route hardening (docs/design/admin-architecture-review-20261105.md):
 * shared same-origin + rate-limit gate, account-safety rules on every legacy
 * account entry point, management-log records, and owner-account re-auth.
 * Requires an isolated local PostgreSQL; no network, no supplier calls.
 */
async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  process.env.SETTINGS_SECRET ||= "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  const db = await import("../src/lib/db"), auth = await import("../src/lib/admin-auth");
  const { isSameOriginRequest } = await import("../src/lib/request-origin");
  const { accountChangeViolation } = await import("../src/lib/accounts/change-policy");
  const login = await import("../src/app/api/admin/login/route");
  const users = await import("../src/app/api/admin/users/route");
  const artworks = await import("../src/app/api/admin/artworks/route");
  const owner = await import("../src/app/api/admin/owner-account/route");
  const others = {
    prompts: await import("../src/app/api/admin/prompts/route"),
    templates: await import("../src/app/api/admin/templates/route"),
    templateCache: await import("../src/app/api/admin/templates/cache/route"),
    templateSync: await import("../src/app/api/admin/templates/sync/route"),
    tryon: await import("../src/app/api/admin/tryon/route"),
    brandLogo: await import("../src/app/api/admin/brand-logo/route"),
    smtpTest: await import("../src/app/api/admin/smtp-test/route"),
  };
  const pool = db.getPool(), base = "http://fixture.test", id = randomUUID().slice(0, 8);
  const fixture = (name: string) => `hardening-${name}-${id}@example.test`;
  const [B, C, D, NEWOWNER] = ["b", "c", "d", "owner"].map(fixture);
  const password = "fixture-console-password-0123";
  const previousHash = await db.getSetting(auth.ADMIN_PW_HASH_SETTING);
  const request = (path: string, init: { method?: string; cookie?: string; origin?: string | null; site?: string; body?: unknown; raw?: string } = {}) =>
    new Request(base + path, {
      method: init.method || "POST",
      headers: {
        ...(init.cookie ? { cookie: init.cookie } : {}),
        "content-type": "application/json",
        ...(init.origin === null ? {} : { origin: init.origin ?? base }),
        ...(init.site ? { "sec-fetch-site": init.site } : {}),
      },
      ...(init.raw !== undefined ? { body: init.raw } : init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  const json = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) as any });
  const logFor = async (subject: string) => (await pool.query("SELECT actor,action,changes::text AS changes FROM app_bi_management_log WHERE email=$1 ORDER BY created_at", [subject])).rows as { actor: string; action: string; changes: string }[];

  // 1. Pure rules.
  assert.equal(isSameOriginRequest(request("/x")), true);
  assert.equal(isSameOriginRequest(request("/x", { origin: null })), true, "non-browser callers keep working");
  assert.equal(isSameOriginRequest(request("/x", { origin: "https://evil.test" })), false);
  assert.equal(isSameOriginRequest(request("/x", { origin: "https://fixture.test" })), false, "protocol must match");
  assert.equal(isSameOriginRequest(request("/x", { site: "cross-site" })), false);
  const rule = (actor: string, change: Parameters<typeof accountChangeViolation>[0]["change"], targetRole: string | null, activeAdmins = 2, targetBanned = false) =>
    accountChangeViolation({ actor, target: "t@example.test", change, targetRole, targetBanned, activeAdmins });
  assert.match(rule("T@example.test", { kind: "ban", banned: true }, "user")!, /自己/);
  assert.match(rule("a@example.test", { kind: "ban", banned: true }, "admin")!, /先调整管理员权限/);
  assert.match(rule("a@example.test", { kind: "delete" }, "admin")!, /先调整管理员权限/);
  assert.match(rule("a@example.test", { kind: "role", role: "user" }, "admin", 1)!, /最后一个/);
  assert.equal(rule("a@example.test", { kind: "role", role: "user" }, "admin", 2), null);
  assert.equal(rule("a@example.test", { kind: "ban", banned: true }, "admin", 1, true), null, "already banned admin is not active");
  assert.equal(rule("a@example.test", { kind: "delete" }, "user"), null);

  const demoted: string[] = (await pool.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned")).rows.map(r => r.email);
  let createdActor: string | null = null;
  try {
    await pool.query("UPDATE app_users SET role='user' WHERE email = ANY($1)", [demoted]);
    await auth.setAdminPassword(password);
    const accepted = await login.POST(new Request(base + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }));
    assert.equal(accepted.status, 200);
    const cookie = accepted.headers.get("set-cookie")!.split(";")[0];
    const actor = (await auth.resolveUserEmail(request("/x", { cookie })))!;
    assert.ok(actor);
    if (!(await db.getUser(actor))) { await db.getOrCreateUser(actor, "Operator"); createdActor = actor; }

    // 2. Legacy user management.
    const post = (body: unknown, extra: Parameters<typeof request>[1] = {}) => users.POST(request("/api/admin/users", { cookie, body, ...extra })).then(json);
    assert.equal((await users.POST(request("/api/admin/users", { body: { action: "create", email: B, password: "pw-123456" } }))).status, 403, "no session");
    assert.equal((await post({ action: "create", email: B, password: "pw-123456" }, { origin: "https://evil.test" })).status, 403);
    assert.equal((await post({ action: "create", email: B, password: "pw-123456" }, { site: "cross-site" })).status, 403);
    for (const email of [B, C, D]) assert.equal((await post({ action: "create", email, name: "Fixture", password: "pw-123456" })).status, 200);
    const created = await logFor(B);
    assert.equal(created[0]?.action, "create"); assert.equal(created[0]?.actor, actor); assert.doesNotMatch(created[0].changes, /pw-123456/);
    assert.equal((await post({ action: "role", email: B, role: "admin" })).status, 200);
    assert.equal((await post({ action: "role", email: C, role: "admin" })).status, 200);
    const banAdmin = await post({ action: "ban", email: B, banned: true });
    assert.equal(banAdmin.status, 403); assert.match(banAdmin.body.error, /先调整管理员权限/);
    assert.equal((await post({ action: "delete", email: B })).status, 403);
    assert.equal((await post({ action: "role", email: B, role: "user" })).status, 200, "two active admins");
    const last = await post({ action: "role", email: C, role: "user" });
    assert.equal(last.status, 403); assert.match(last.body.error, /最后一个/);
    assert.equal((await db.getUserRole(C)), "admin");
    for (const body of [{ action: "ban", email: actor, banned: true }, { action: "reset-password", email: actor, password: "pw-654321" }, { action: "delete", email: actor }])
      assert.equal((await post(body)).status, 403, `self ${body.action}`);
    assert.equal((await post({ action: "note", email: B, note: "fixture note" })).status, 200);
    assert.equal((await post({ action: "reset-password", email: B, password: "pw-654321" })).status, 200);
    assert.equal((await post({ action: "ban-ip", ip: "203.0.113.7", reason: "fixture" })).status, 200);
    assert.equal((await post({ action: "unban-ip", ip: "203.0.113.7" })).status, 200);
    assert.equal((await post({ action: "delete", email: B })).status, 200, "demoted account can be deleted");
    const trail = (await logFor(B)).map(r => r.action);
    assert.deepEqual(trail, ["create", "role", "role", "note", "reset-password", "delete"]);
    assert.ok((await logFor(B)).every(r => !/pw-654321|fixture note/.test(r.changes)), "no secrets or note text in audit");
    assert.deepEqual((await logFor("ip:203.0.113.7")).map(r => r.action), ["ban-ip", "unban-ip"]);

    // 3. Artwork console ban entry shares the same rule.
    const art = (body: unknown, extra: Parameters<typeof request>[1] = {}) => artworks.POST(request("/api/admin/artworks", { cookie, body, ...extra })).then(json);
    assert.equal((await art({ action: "ban-user", email: C, banned: true })).status, 403, "active admin");
    assert.equal((await art({ action: "ban-user", email: actor, banned: true })).status, 403, "self");
    assert.equal((await art({ action: "ban-user", email: D, banned: true }, { origin: "https://evil.test" })).status, 403);
    assert.equal((await art({ action: "ban-user", email: D, banned: true })).status, 200);
    const dTrail = await logFor(D);
    assert.equal(dTrail.at(-1)?.action, "ban"); assert.match(dTrail.at(-1)!.changes, /artworks/);

    // 4. Other admin write routes reject cross-site and anonymous calls.
    const writes: [string, (r: Request) => Promise<Response>, string][] = [
      ["prompts", others.prompts.POST, "POST"], ["templates", others.templates.PATCH, "PATCH"], ["templates/cache", others.templateCache.POST, "POST"],
      ["templates/sync", others.templateSync.POST, "POST"], ["tryon", others.tryon.POST, "POST"], ["brand-logo", others.brandLogo.POST, "POST"], ["smtp-test", others.smtpTest.POST, "POST"],
    ];
    for (const [name, handler, method] of writes) {
      assert.equal((await handler(request(`/api/admin/${name}`, { method, cookie, origin: "https://evil.test", body: {} }))).status, 403, `${name} cross-site`);
      assert.equal((await handler(request(`/api/admin/${name}`, { method, body: {} }))).status, 403, `${name} anonymous`);
    }
    const smtpStatuses: number[] = [];
    for (let i = 0; i < 11; i++) smtpStatuses.push((await others.smtpTest.POST(request("/api/admin/smtp-test", { cookie, raw: "not-json" }))).status);
    assert.ok(smtpStatuses.slice(0, 10).every(s => s !== 429), `first ten allowed: ${smtpStatuses}`);
    assert.equal(smtpStatuses[10], 429, "smtp-test limited to 10/min");

    // 5. Owner rebind requires the console password (last: it moves operator assets).
    const ownerState = await json(await owner.GET(request("/api/admin/owner-account", { method: "GET", cookie })));
    assert.equal(ownerState.status, 200); assert.equal(ownerState.body.reauthRequired, true);
    const rebind = (extra: Record<string, unknown>, init: Parameters<typeof request>[1] = {}) => owner.POST(request("/api/admin/owner-account", { cookie, body: { email: NEWOWNER, password: "owner-123456", ...extra }, ...init })).then(json);
    const missing = await rebind({});
    assert.equal(missing.status, 403); assert.equal(missing.body.code, "ADMIN_REAUTH_REQUIRED");
    assert.equal((await rebind({ adminPassword: "wrong-password" })).status, 403);
    assert.equal((await rebind({ adminPassword: password }, { origin: "https://evil.test" })).status, 403);
    assert.equal((await owner.POST(request("/api/admin/owner-account", { body: { email: NEWOWNER, password: "owner-123456", adminPassword: password } }))).status, 403, "anonymous");
    const done = await rebind({ adminPassword: password });
    assert.equal(done.status, 200, JSON.stringify(done.body)); assert.equal(done.body.ownerEmail, NEWOWNER);
    const ownerTrail = await logFor(NEWOWNER);
    assert.equal(ownerTrail.at(-1)?.action, "owner-account"); assert.match(ownerTrail.at(-1)!.changes, /rebind/); assert.doesNotMatch(ownerTrail.at(-1)!.changes, /owner-123456|fixture-console/);

    console.log("ADMIN_ROUTE_HARDENING=PASS: shared origin gate, account self/admin/last-admin rules on users+artworks, management-log records without secrets, cross-site/anonymous rejection on 7 content routes, smtp-test rate limit, owner rebind re-auth");
  } finally {
    await pool.query("UPDATE app_users SET role='admin' WHERE email = ANY($1)", [demoted]);
    if (previousHash === null) await pool.query("DELETE FROM app_settings WHERE k=$1", [auth.ADMIN_PW_HASH_SETTING]); else await db.setSetting(auth.ADMIN_PW_HASH_SETTING, previousHash);
    await pool.query("DELETE FROM app_users WHERE email = ANY($1)", [[B, C, D, ...(createdActor ? [createdActor] : [])]]);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
