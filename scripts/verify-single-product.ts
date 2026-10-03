import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  delete process.env.NAUMI_EDITION;
  delete process.env.PRO_LICENSE_KEY;
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", NAUMI_BETA_PREVIEW: "1",
    SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789",
    VIDEO_WORKER_SECRET: "fixture-worker-0123456789abcdef0123456789abcdef0123456789",
    OPENAI_API_KEY: "local-fixture-key" });
  const db = await import("../src/lib/db");
  const { signUserSession, multiUserEnabled } = await import("../src/lib/native-auth");
  const users = await import("../src/app/api/admin/users/route");
  const cardkeys = await import("../src/app/api/cardkeys/route");
  const settings = await import("../src/app/api/admin/settings/route");
  const { requireAdmin, signSession } = await import("../src/lib/admin-auth");
  const { pricingVisible } = await import("../src/lib/commerce");
  assert.equal(pricingVisible, false, "Beta previews must not publish internal pricing");
  const health = await import("../src/app/api/health/route");
  const activate = await import("../src/app/api/pro/activate/route");
  const { resolveItem } = await import("../src/lib/payments");
  assert.equal(await resolveItem("pro", "pro-1y"), null, "Product license purchases are retired");
  const templates = await import("../src/app/api/admin/templates/sync/route");
  const setup = await import("../src/app/api/setup/route");
  const email = `single-product-${randomUUID()}@example.test`;
  try {
    await db.getOrCreateUser(email, "Single product fixture");
    assert.equal(await multiUserEnabled(), true, "Multi-user mode no longer requires a license");
    const request = () => new Request("http://fixture.test", { headers: { cookie: `nv_user=${signUserSession(email, Date.now())}` } });
    assert.equal(await requireAdmin(new Request("http://fixture.test/admin/pricing")), false);
    assert.equal(await requireAdmin(request()), false, "Internal pricing denies ordinary accounts");
    assert.equal(await requireAdmin(new Request("http://fixture.test", { headers: { cookie: "nv_admin=forged" } })), false);
    assert.equal(await requireAdmin(new Request("http://fixture.test", { headers: { cookie: `nv_admin=${signSession(Date.now())}` } })), true);
    for (const route of [users, cardkeys, settings]) {
      assert.equal((await route.GET(new Request("http://fixture.test"))).status, 403);
      assert.equal((await route.GET(request())).status, 403, "Ordinary users cannot access admin features");
    }
    assert.equal((await templates.POST(request())).status, 403);
    await db.setUserRole(email, "admin");
    assert.equal(await requireAdmin(request()), true, "Internal pricing accepts a server-verified administrator");
    const syncRequest = () => new Request("http://fixture.test", { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json" }, body: JSON.stringify({page:1}) });
    assert.equal((await templates.POST(syncRequest())).status, 200);
    assert.equal((await (await templates.POST(syncRequest())).json()).imported, 0, "Template sync preserves existing rows");
    for (const route of [users, cardkeys, settings]) assert.equal((await route.GET(request())).status, 200, "Admin features work without edition or license settings");
    const state = await (await health.GET()).json();
    assert.equal(state.product, "Naumi");
    assert.equal("edition" in state, false);
    assert.equal("pro" in state, false);
    assert.equal((await activate.POST(new Request("http://fixture.test", { method: "POST" }))).status, 403);
    assert.equal((await (await activate.POST(request())).json()).activationRequired, false);
    assert.equal((await setup.POST(new Request("http://fixture.test", { method: "POST", headers: {"content-type":"application/json"}, body: "{}" }))).status, 403, "Configured instances keep their setup lock");
    console.log("SINGLE_PRODUCT_RESULT=PASS: no edition/license required; roles, admin access and setup lock preserved");
  } finally { await db.getPool().end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
