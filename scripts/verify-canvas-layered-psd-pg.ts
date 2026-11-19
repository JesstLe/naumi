import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const media = await mkdtemp(path.join(tmpdir(), "naumi-layered-psd-"));
  Object.assign(process.env, { STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: media, NAUMI_MULTI_USER: "1",
    NAUMI_RELEASE_RUNTIME: "0", NAUMI_ROUTER_MANAGEMENT_URL: "", NAUMI_ROUTER_MANAGEMENT_TOKEN: "" });
  const fixture = await createModelFixture();
  process.env.PGOPTIONS = `-c search_path=${fixture.schemaName}`;
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = fixture.origin;
  const db = await import("../src/lib/db");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External fetch is disabled in this fixture"); };
  try {
    const credential = await fixture.credentials.importPlain({ providerId: "apib", plain: "layered-psd-fixture-key", actor: "fixture" });
    fixture.config.providers.push({ ...fixture.config.providers[0], id: "apib", protocol: "apimart-images",
      baseUrl: "https://api.apib.ai/v1", credentialRef: credential.id });
    fixture.config.upstreamModels.push({ ...fixture.config.upstreamModels[0], id: "apib:seedream-5-0-pro", providerId: "apib", model: "seedream-5-0-pro" });
    await fixture.repo.current();
    await db.ensureSchema();
    const owner = "psd-owner@fixture.test", other = "psd-other@fixture.test";
    for (const actor of [owner, other]) {
      await db.getOrCreateUser(actor);
      await db.addCreditBatch(actor, 100, { source: "admin", reason: "isolated PSD fixture" });
    }
    const { uploadImage } = await import("../src/lib/media-upload");
    const base = await sharp({ create: { width: 576, height: 768, channels: 4, background: "#ecd9b2" } }).png().toBuffer();
    const foreground = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30"><circle cx="12" cy="15" r="10" fill="#295849"/></svg>')).png().toBuffer();
    const art = async (email: string, id: string) => ({
      id, title: id, createdAt: new Date().toISOString(), category: "main", prompt: "", status: "completed" as const,
      image: await uploadImage(base, "image/png", `layered-fixture/${id}.png`, undefined, email),
      gradient: "", origin: "canvas", source: "canvas-add", width: 576, height: 768, resolution: "1K", ratio: "3:4",
    });
    const root = await art(owner, "psd-root");
    await db.addArtworks(owner, [root, await art(owner, "other-project")]);
    await db.addArtworks(other, [await art(other, "foreign-root")]);

    const native = await import("../src/lib/native-auth");
    const api = await import("../src/app/api/canvas/layered-psd/route");
    const service = await import("../src/lib/canvas/layered-psd-service");
    const { withFrozenCreation } = await import("../src/lib/saas/creation-scope");
    const { getBillingRuntime } = await import("../src/lib/billing/runtime");
    const dbPool = db.getPool();
    const auth = (query = "", email = owner, project = "psd-root", init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("cookie", native.USER_COOKIE + "=" + native.signUserSession(email, Date.now()));
      headers.set("x-naumi-workspace", "personal");
      headers.set("x-naumi-project-context", "tree:" + project);
      headers.set("origin", fixture.origin);
      return new Request(fixture.origin + "/api/canvas/layered-psd" + query, { ...init, headers });
    };

    assert.equal((await api.GET(auth())).status, 503);
    process.env.NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL = owner;
    const pilot = await (await api.GET(auth())).json();
    assert.equal(pilot.credits, 0);
    assert.match(pilot.pilotOperationId, /^[a-f0-9-]{36}$/);
    assert.equal((await (await api.GET(auth())).json()).pilotOperationId, pilot.pilotOperationId);
    assert.equal((await api.GET(auth("", other, "foreign-root"))).status, 503);
    delete process.env.NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL;
    const billing = await getBillingRuntime(), previous = await billing.config.current();
    const config = structuredClone(previous.config);
    config.switches.metering = "on";
    config.features["canvas.layered-psd"].enabled = true;
    config.features["canvas.layered-psd"].pricing = { mode: "fixed", credits: 12 };
    const published = await billing.config.publish({ id: randomUUID(), actor: "fixture", reason: "isolated PSD tariff", expectedVersion: previous.version, config });
    const quote = await api.GET(auth());
    assert.equal(quote.status, 200);
    assert.deepEqual(await quote.json(), { credits: 12, version: published.version });

    const calls: string[] = [];
    let behavior: "success" | "unknown" | "failed" | "pilot" = "success";
    const transport: typeof fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.origin === "https://fixture-media.example") {
        assert.equal(init.headers, undefined);
        return new Response(new Uint8Array(url.pathname === "/base.png" ? base : foreground), { headers: { "content-type": "image/png" } });
      }
      assert.equal(url.origin, "https://api.apib.ai");
      calls.push(url.pathname);
      switch (url.pathname) {
        case "/v1/uploads/images":
          return Response.json({ url: "https://fixture-media.example/input.png" });
        case "/v1/images/generations":
          assert.equal(JSON.parse(String(init.body)).layer_decomposition, true);
          return Response.json(behavior === "unknown" ? { code: 200, data: [] } : { code: 200, data: [{ task_id: "psd-" + behavior }] });
        default:
          return Response.json({ code: 200, data: { id: "psd-" + behavior, status: behavior === "failed" ? "failed" : "completed",
            cost: behavior === "failed" ? 0 : 0.09, result: { images: [{ layer_decomposition: true,
              url: ["https://fixture-media.example/base.png", "https://fixture-media.example/subject.png"],
              sizes: ["576x768", "24x30"], layers: [{ z_index: 0 }, { z_index: 1, name: "商品", bounding_box: { absolute: [20, 30, 44, 60] } }] }] } } });
      }
    };
    const run = (operationId: string, extra: { artworkId?: string; credits?: number; sourceImage?: string } = {}) =>
      withFrozenCreation({ actorEmail: owner, scopeKind: "personal", tenantId: null, parentContext: "tree:psd-root" },
        () => service.runLayerDecomposition(owner, { operationId, artworkId: "psd-root", sourceImage: root.image, version: published.version, credits: 12, ...extra }, transport));

    const denied = await api.POST(auth("", owner, "psd-root", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: randomUUID(), artworkId: "foreign-root", sourceImage: root.image, credits: 12, version: published.version }) }));
    assert.equal(denied.status, 404);
    const stale = await run(randomUUID(), { credits: 3 });
    assert.equal(stale.status, 409);
    await assert.rejects(run(randomUUID(), { sourceImage: "/media/stale-poster.png" }), { code: "OPERATION_CONFLICT" });
    assert.equal(calls.length, 0);

    const id = randomUUID();
    const attempts = await Promise.all([run(id), run(id)]);
    assert.ok(attempts.some(result => result.status === 200));
    assert.equal(calls.filter(item => item === "/v1/images/generations").length, 1);
    assert.equal((await run(id)).status, 200);
    assert.equal(calls.filter(item => item === "/v1/images/generations").length, 1);
    const query = "?operationId=" + id;
    const status = await api.GET(auth(query));
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { state: "ready" });
    const file = await api.GET(auth(query + "&file=1"));
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-type"), "image/vnd.adobe.photoshop");
    assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString(), "8BPS");
    assert.equal((await api.GET(auth(query + "&file=1", owner, "other-project"))).status, 404);
    assert.equal((await api.GET(auth(query + "&file=1", other, "foreign-root"))).status, 404);

    behavior = "unknown";
    const uncertainId = randomUUID();
    assert.equal((await run(uncertainId)).body?.code, "OPERATION_PENDING");
    assert.equal((await run(uncertainId)).body?.code, "OPERATION_PENDING");
    assert.deepEqual(await (await api.GET(auth("?operationId=" + uncertainId))).json(), { state: "pending" });
    assert.equal(calls.filter(item => item === "/v1/images/generations").length, 2);

    behavior = "failed";
    const failedId = randomUUID();
    assert.equal((await run(failedId)).status, 422);
    assert.deepEqual(await (await api.GET(auth("?operationId=" + failedId))).json(), { state: "failed" });
    const rows = (await dbPool.query("SELECT id,state,charged_credits FROM app_billing_operations WHERE feature='canvas.layered-psd'")).rows;
    const outcome = (operation: string) => {
      const item = rows.find(row => row.id === "tool-" + operation);
      return [item?.state, Number(item?.charged_credits)];
    };
    assert.deepEqual(outcome(id), ["settled", 12]);
    assert.deepEqual(outcome(uncertainId), ["hold", 0]);
    assert.deepEqual(outcome(failedId), ["settled", 0]);
    const supplier = (await dbPool.query("SELECT state,task_id,cost_status,amount_micros FROM app_supplier_calls WHERE operation_id=$1", ["tool-" + id])).rows[0];
    assert.deepEqual([supplier.state, supplier.task_id, supplier.cost_status, Number(supplier.amount_micros)], ["completed", "psd-success", "reported", 90_000]);
    process.env.NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL = owner;
    behavior = "pilot";
    assert.equal((await run(randomUUID(), { credits: 0 })).status, 409);
    assert.equal((await run(pilot.pilotOperationId, { credits: 0 })).status, 200);
    assert.equal((await run(pilot.pilotOperationId, { credits: 0 })).status, 200);
    assert.equal(calls.filter(item => item === "/v1/images/generations").length, 4);
    const pilotWallet = (await dbPool.query("SELECT charged_credits FROM app_billing_operations WHERE id=$1", ["tool-" + pilot.pilotOperationId])).rows[0];
    assert.equal(Number(pilotWallet.charged_credits), 0);
    delete process.env.NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL;
    console.log("LAYERED_PSD_PG=PASS explicit_quote=1 concurrent_posts=1 private_scope=1 actual_storage=1 reserve_unknown=1 failure_refund=1 pilot_owner_only=1 pilot_limit=1 fixture_supplier_only=1");
  } finally {
    globalThis.fetch = originalFetch;
    await db.getPool().end();
    await fixture.cleanup();
    assert.equal(path.dirname(path.resolve(media)), path.resolve(tmpdir()));
    assert.match(path.basename(media), /^naumi-layered-psd-/);
    await rm(media, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
