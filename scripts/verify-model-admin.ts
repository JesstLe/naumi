import assert from "node:assert/strict";
import { constants, publicEncrypt, randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";

async function main() {
  const f = await createModelFixture();
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.VIDEO_WORKER_SECRET ||= "fixture-video-worker-independent-secret-20261004";
  process.env.NAUMI_MULTI_USER = "1";
  const db = await import("../src/lib/db");
  const native = await import("../src/lib/native-auth");
  const { createModelAdminHandler } = await import("../src/lib/model-config/access");
  const { biAuthorize } = await import("../src/lib/bi/access");
  const { createModelRuntime } = await import("../src/lib/model-config/runtime");
  const { createRouterControl } = await import("../src/lib/model-config/router-client");
  const token = "fixture-admin-control-token-independent-20261004", secret = "fixture-admin-envelope-independent-20261004";
  const control = createRouterControl({ baseUrl: f.origin, token, envelopeSecret: secret, trustedOrigins: [f.origin] });
  const billing = { version: 1, config: fixtureConfig() };
  const router = { ...control, prepare: async () => {}, state: async () => "", status: async () => null, activate: async (id: string, _expected: string, digest: string) => ({ id, digest, phase: "applied" as const }) };
  const runtime = createModelRuntime({ pool: f.sql, repo: f.repo, credentials: f.credentials, router, billing: async () => billing, trustedOrigins: [f.origin] });
  const administration = { runtime, repo: f.repo, credentials: f.credentials, router, trustedOrigins: [f.origin], billing: { current: async () => billing }, pool: f.sql };
  const handler = createModelAdminHandler({ authorize: biAuthorize, administration: async () => administration as never });
  const admin = "model-admin@example.test", personal = "model-personal@example.test", enterprise = "model-enterprise@example.test";
  const cookie = (email: string, now = Date.now()) => `nv_user=${native.signUserSession(email, now)}`;
  let adminSession = cookie(admin);
  const request = (body?: unknown, session = adminSession, extra: Record<string, string> = {}, path = "/api/admin/bi/model-config") => new Request(`http://fixture.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: session, "content-type": "application/json", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    await db.ensureSchema(); await db.setSetting("multi_user_enabled", "1");
    for (const email of [admin, personal, enterprise]) await db.getOrCreateUser(email, email);
    await db.setUserRole(admin, "admin");
    const local = await import("../src/lib/admin-auth");
    await local.setAdminPassword("ModelAdminFixture2026!");
    const passwordSession = await local.authenticateAdminPassword("ModelAdminFixture2026!"); assert.ok(passwordSession);
    adminSession = `${cookie(admin)}; nv_admin=${passwordSession}`;
    assert.equal(native.verifyUserSession(`${native.signUserSession(admin, Date.now())}broken`, Date.now()), null);
    assert.equal(native.verifyResetToken(`${native.signResetToken(admin, Date.now())}broken`, Date.now()), null);
    assert.equal(local.verifySessionToken(`${local.signSession(Date.now())}broken`, Date.now()), false);
    for (const session of ["", cookie(admin), cookie(personal), cookie(enterprise), `${cookie(admin)}broken`, cookie(admin, 0), "nv_admin=%ZZ", "nv_user=%ZZ"]) {
      const denied = await handler(request(undefined, session), "read");
      assert.equal(denied.status, 404);
      assert.equal(denied.headers.get("cache-control"), "private, no-store, max-age=0");
    }
    assert.equal((await handler(request({}, adminSession, { origin: "https://evil.test" }), "publish")).status, 403);
    assert.equal((await handler(request({ actor: "another@example.test" }), "publish")).status, 400);
    const read = await handler(request(), "read"); assert.equal(read.status, 200);
    const page = await read.json(); assert.ok(page.draft.id); assert.ok(page.protocols.includes("openai-chat"));
    assert.ok(!JSON.stringify(page).includes(f.marker));
    const legacySettings = await import("../src/app/api/admin/settings/route");
    const management = process.env.NAUMI_ROUTER_MANAGEMENT_URL;
    process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
    for (const field of ["model", "models", "cutoutModel", "cutoutBackend", "encryptedBaseUrl", "baseUrlPlain", "baseUrlClear", "encryptedKey", "keyPlain"]) {
      const locked = await legacySettings.POST(request({ [field]: field === "models" ? ["old-model"] : "old-model" }));
      assert.equal(locked.status, 409, `Legacy settings cannot independently edit ${field}`);
      assert.equal((await locked.json()).managementPath, "/admin/bi/models");
    }
    delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
    assert.equal((await legacySettings.POST(request({ model: "old-model" }))).status, 503, "Missing management connection cannot unlock legacy writes");
    if (management !== undefined) process.env.NAUMI_ROUTER_MANAGEMENT_URL = management;
    const next = structuredClone(page.draft.config); next.publicModels[0].label = "后台测试名称";
    const saveBody = { id: page.draft.id, expectedRevision: page.draft.revision, config: next };
    const saves = await Promise.all([handler(request(saveBody), "draft"), handler(request(saveBody), "draft")]);
    assert.deepEqual(saves.map(x => x.status).sort(), [200, 409]);
    const draft = await f.repo.draft(admin);
    assert.equal((await handler(request({ draftId: draft.id, expectedRevision: draft.revision - 1 }), "validate")).status, 409);
    const checked = await handler(request({ draftId: draft.id, expectedRevision: draft.revision }), "validate");
    assert.equal(checked.status, 200); assert.equal((await checked.json()).changes[0].entity, "publicModels");
    const facts = { task: "product", quality: "medium", resolution: "1K", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0 };
    assert.equal((await handler(request({ draftId: draft.id, publicModelId: "image-a", facts: { ...facts, needsEdit: true } }), "simulate")).status, 400);
    assert.equal((await handler(request({ draftId: randomUUID(), publicModelId: "image-a", facts }), "simulate")).status, 404);
    assert.equal((await handler(request({ draftId: draft.id, publicModelId: "image-a", facts }), "simulate")).status, 200);
    const publication = { id: randomUUID(), draftId: draft.id, expectedRevision: draft.revision, expectedVersion: page.snapshot.version, reason: "管理接口验收" };
    assert.equal((await handler(request(publication), "publish")).status, 200);
    assert.equal((await handler(request(publication), "publish")).status, 200);
    assert.equal((await handler(request({ ...publication, id: randomUUID() }), "publish")).status, 409);
    assert.equal((await handler(request(undefined, adminSession, {}, "/api/admin/bi/model-config/versions?limit=-1"), "history")).status, 400);
    const { getPublicKeyPem } = await import("../src/lib/settings");
    const ciphertext = publicEncrypt({ key: await getPublicKeyPem(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(f.marker)).toString("base64");
    const created = await handler(request({ providerId: "new-provider", ciphertext }), "credentials");
    assert.equal(created.status, 200); const reference = await created.json();
    assert.equal(await f.credentials.read(reference.id, "new-provider"), f.marker);
    assert.deepEqual(Object.keys(reference).sort(), ["configured", "id", "providerId"]);
    assert.equal((await handler(request({ providerId: "new-provider", ciphertext: "invalid" }), "credentials")).status, 400);
    assert.equal((await handler(request({ x: "x".repeat(512 * 1024) }), "publish")).status, 413);
    const unavailable = createModelAdminHandler({ authorize: biAuthorize, administration: async () => { throw new Error(f.marker); } });
    const error = await unavailable(request(), "read"); assert.equal(error.status, 503); assert.ok(!(await error.text()).includes(f.marker));
    console.log("PASS actual admin/user/enterprise/forged/expired permissions, same-site mutations, bounded strict inputs, concurrent drafts, private RSA credentials and replay");
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
