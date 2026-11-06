/** GET /api/account?view=user against an isolated local Postgres (DB name must contain
 * "fixture"). Proves the balance-only view returns the same user without the work list,
 * the default view is unchanged, and the view keeps the same authorization.
 * Run: NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://...@127.0.0.1:<port>/<x>_fixture npx tsx scripts/verify-account-user-view.ts */
import assert from "node:assert/strict";

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  const target = new URL(process.env.DATABASE_URL!);
  assert.equal(target.hostname, "127.0.0.1"); assert.match(target.pathname, /fixture/);
  process.env.SETTINGS_SECRET = "account-view-settings-fixture-0123456789012345";
  process.env.VIDEO_WORKER_SECRET = "account-view-worker-fixture-0123456789012345";
  process.env.NAUMI_MULTI_USER = "1"; process.env.NAUMI_VIDEO_WORKER = "0";
  const db = await import("../src/lib/db"), native = await import("../src/lib/native-auth"), writer = await import("../src/lib/artworks/writer");
  const route = await import("../src/app/api/account/route");
  const owner = "owner@account-view.test", stranger = "stranger@account-view.test";
  const get = (email: string, query: string) => route.GET(new Request(`http://localhost:13079/api/account?${query}`, { headers: { cookie: `nv_user=${native.signUserSession(email, Date.now())}` } }));
  let checks = 0; const ok = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
  try {
    await db.ensureSchema();
    for (const email of [owner, stranger]) await db.getOrCreateUser(email, email);
    await writer.addArtworks(owner, Array.from({ length: 40 }, (_, i) => ({ id: `art-view-${i}`, title: `作品 ${i}`, category: "poster", prompt: "提示词".repeat(200), status: "completed", image: `/media/fixture-${i}.png`, gradient: "" } as never)));
    const fullResponse = await get(owner, `email=${encodeURIComponent(owner)}`), full = await fullResponse.json();
    const viewResponse = await get(owner, `email=${encodeURIComponent(owner)}&view=user`), view = await viewResponse.json();
    ok(fullResponse.status === 200 && viewResponse.status === 200, "both views succeed");
    ok(full.artworks.length >= 40, `default view still lists works (${full.artworks.length})`);
    ok(Array.isArray(view.artworks) && view.artworks.length === 0, "user view carries no work list");
    ok(view.persisted === true && view.user?.email === owner, "user view returns the owner");
    assert.deepEqual({ ...view.user }, { ...full.user }); checks++;
    const fullBytes = JSON.stringify(full).length, viewBytes = JSON.stringify(view).length;
    ok(viewBytes * 20 < fullBytes, `user view is small (${viewBytes} vs ${fullBytes} chars)`);
    ok(viewResponse.headers.get("cache-control")?.includes("no-store"), "user view stays private no-store");
    const denied = await get(stranger, `email=${encodeURIComponent(owner)}&view=user`);
    ok(denied.status === 401, `another account cannot read the owner's balance (${denied.status})`);
    console.log(`ACCOUNT_USER_VIEW=PASS CHECKS=${checks} FULL_CHARS=${fullBytes} USER_VIEW_CHARS=${viewBytes}`);
  } finally { await db.getPool().end().catch(() => {}); }
}
main().catch(error => { console.error(error); process.exit(1); });
