import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let active = "";
  const prepared = new Set<string>();
  const f = await createModelFixture(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    const send = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.url === "/internal/config/state") return send({ digest: active });
    if (req.url === "/internal/config/prepare") { prepared.add(body.digest); return send({ digest: body.digest, phase: "prepared" }); }
    if (req.url === "/internal/config/activate") { assert.ok(prepared.has(body.digest)); active = body.digest; return send({ id: body.id, digest: active, phase: "applied" }); }
    res.writeHead(404); res.end(JSON.stringify({ error: `Unexpected fixture URL: ${req.url}` }));
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NAUMI_MULTI_USER = "1";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "fixture-admin-independent-policy-token-20261009";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET = "fixture-envelope-independent-policy-key-20261009";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  const db = await import("../src/lib/db");
  const { signUserSession } = await import("../src/lib/native-auth");
  const { getModelAdministration } = await import("../src/lib/model-config/server");
  const { getBillingRuntime } = await import("../src/lib/billing/server");
  const { withModelRequest } = await import("../src/lib/model-config/requests");
  const { currentExecutionBundle } = await import("../src/lib/model-config/context");
  const { getModelExecutor } = await import("../src/lib/model-config/execution");
  const quoteApi = await import("../src/app/api/billing/quote/route");
  const modelsApi = await import("../src/app/api/models/route");
  const { quoteForRequest } = await import("../src/lib/billing/server");
  const { featureForRequest } = await import("../src/lib/model-config/feature-path");
  const { getImageModelCatalog } = await import("../src/lib/image-model-catalog");
  const email = "canvas-policy@example.test";
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://fixture.test${path}`, {
    method: body ? "POST" : "GET", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", origin: "http://fixture.test", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    await db.ensureSchema(); await db.setSetting("multi_user_enabled", "1"); await db.getOrCreateUser(email, "隔离验收");
    await f.repo.current();
    const config = structuredClone(f.config);
    config.upstreamModels[0].capabilities.preserveIdentity = true; config.upstreamModels[0].capabilities.textAccuracy = true;
    config.upstreamModels.push({ ...structuredClone(config.upstreamModels[0]), id: "u2", model: "wire-image-two" });
    config.publicModels.push({ ...structuredClone(config.publicModels[0]), id: "image-b", target: { type: "upstream", id: "u2" } });
    config.providers.push({ ...config.providers[0], id: "text-p", protocol: "openai-chat", credentialRef: (await f.credentials.importPlain({ providerId: "text-p", plain: "fixture-text-secret", actor: "fixture" })).id });
    for (const suffix of ["a", "b"]) {
      config.upstreamModels.push({ ...structuredClone(config.upstreamModels[0]), id: `text-${suffix}`, providerId: "text-p", model: `wire-text-${suffix}`, modality: "text", capabilities: { ...config.upstreamModels[0].capabilities, vision: true } });
      config.publicModels.push({ id: `text-${suffix}`, label: `text-${suffix}`, modality: "text", enabled: true, visible: true, target: { type: "upstream", id: `text-${suffix}` } });
    }
    config.bindings["text.generate"] = "text-a"; config.bindings["vision.ocr"] = "text-a"; config.bindings["vision.reference"] = "text-a"; config.bindings["agent.text"] = "text-a";
    const features = ["canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate", "canvas.ocr", "canvas.assistant", "canvas.text-generate"] as const;
    config.business = {};
    for (const feature of features) {
      const text = ["canvas.ocr", "canvas.assistant", "canvas.text-generate"].includes(feature), prefix = text ? "text" : "image";
      config.business[feature] = { enabled: true, defaultModelId: `${prefix}-a`, options: ["a", "b"].map((suffix, sort) => ({ modelId: `${prefix}-${suffix}`, enabled: true, sort, unit: text ? "task" : "image", pricing: { mode: "cny-fixed", amountMicros: String(100000 + sort * 100000), creditsPerCnyMicros: "100000000", rounding: "ceil" } })) };
    }
    const billing = await getBillingRuntime(), b = await billing.config.current(), bc = structuredClone(b.config);
    bc.switches.metering = "on"; await billing.config.publish({ id: randomUUID(), expectedVersion: b.version, config: bc, actor: "fixture", reason: "isolated policy validation" });
    const admin = await getModelAdministration();
    const publish = async () => {
      const draft = await admin.repo.draft("fixture"), saved = await admin.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config, actor: "fixture" }), current = await admin.repo.current();
      assert.equal((await admin.runtime.publish({ id: randomUUID(), draftId: saved.id, expectedRevision: saved.revision, expectedVersion: current.version, actor: "fixture", reason: "isolated policy validation" })).phase, "applied");
      return admin.repo.current();
    };
    const first = await publish();
    // Canvas Dock uses the shared generation endpoint: JSON and multipart must
    // follow canvas scope, its price, and its frozen default rather than body/cache overrides.
    if (!baseline) {
      const canvasBody={origin:"canvas",model:"image-b",prompt:"scope fixture",quality:"medium",resolution:"1K"};
      const form=new FormData();for(const [key,value] of Object.entries(canvasBody))form.set(key,value);
      const formRequest=new Request("http://fixture.test/api/generate-image",{method:"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,origin:"http://fixture.test","x-naumi-feature-model":"image-b"},body:form});
      for(const r of [request("/api/generate-image",canvasBody,{"x-naumi-feature-model":"image-b"}),formRequest]) {
        const accepted=await withModelRequest(r,async()=>({catalog:await getImageModelCatalog(email),bundle:structuredClone(currentExecutionBundle()!),quote:await quoteForRequest(r,{feature:featureForRequest("/api/generate-image",canvasBody)!,quantity:2,modelId:"image-b",quality:"medium",resolution:"1K"})}));
        assert.equal(accepted.bundle.image!.feature,"canvas.image");assert.equal(accepted.bundle.image!.binding,"image.edit");assert.equal(accepted.bundle.image!.publicModelId,"image-a");
        assert.equal(accepted.quote.facts.feature,"canvas.image");assert.equal(accepted.quote.facts.modelId,"image-a");assert.equal(accepted.quote.requestedCredits,20);
        assert.deepEqual(accepted.catalog.map(m=>m.id),["image-a"]);
      }
      const ordinary=request("/api/generate-image",{model:"image-b",prompt:"ordinary fixture"});
      const ordinaryBundle=await withModelRequest(ordinary,async()=>structuredClone(currentExecutionBundle()!));
      assert.equal(ordinaryBundle.image!.feature,"image.generate");assert.equal(ordinaryBundle.image!.publicModelId,"image-b");
    }
    const frozen = [];
    for (const feature of features) {
      const prefix = ["canvas.ocr", "canvas.assistant", "canvas.text-generate"].includes(feature) ? "text" : "image";
      const path = `/api/canvas/${feature === "canvas.image" ? "image-tasks" : feature.slice(7)}`;
      const forged = `${prefix}-b`, expected = baseline ? forged : `${prefix}-a`;
      for (const headers of [{ "x-naumi-feature-model": forged }, { "x-naumi-text-model": forged }, {}] as Record<string, string>[]) {
        const r = request(path, { model: forged, modelId: forged, prompt: "fixture", quality: "medium" }, headers);
        const bundle = await withModelRequest(r, async () => structuredClone(currentExecutionBundle()!));
        const primary = bundle[bundle.primary!]; assert.ok(primary);
        // Image body override applies; text-model header affects only text/vision primaries.
        const oldExpected = prefix === "image" || "x-naumi-feature-model" in headers || "x-naumi-text-model" in headers ? expected : "text-a";
        assert.equal(primary.publicModelId, baseline ? oldExpected : expected);
        frozen.push(bundle);
      }
      const quoted = await quoteApi.POST(request("/api/billing/quote", { feature, quantity: 1, modelId: forged }, { "x-naumi-feature-model": forged }));
      assert.equal(quoted.status, 200, await quoted.clone().text()); const q = await quoted.json();
      assert.equal(q.modelId, expected); assert.equal(q.credits, baseline ? 20 : 10);
      const catalog = await (await modelsApi.GET(request(`/api/models?feature=${feature}`))).json();
      assert.equal(catalog.models.length, baseline ? 2 : 1);
      config.business![feature]!.defaultModelId = forged;
    }
    const second = await publish(); assert.ok(second.version > first.version);
    if(!baseline){
      const r=request("/api/generate-image",{origin:"canvas",model:"image-a",prompt:"scope fixture"});
      const bundle=await withModelRequest(r,async()=>structuredClone(currentExecutionBundle()!));assert.equal(bundle.image!.publicModelId,"image-b");
      await assert.rejects(withModelRequest(request("/api/generate-image",{origin:"canvas",prompt:"fixture"},{"x-naumi-model-version":String(first.version)}),async()=>null),(e:any)=>e.code==="MODEL_CHANGED");
    }
    const executor = await getModelExecutor();
    for (const bundle of frozen) await executor.runBundle(bundle, await billing.config.byVersion(bundle.billingVersion), async () => assert.equal(currentExecutionBundle()!.modelVersion, first.version));
    for (const feature of features) {
      const prefix = ["canvas.ocr", "canvas.assistant", "canvas.text-generate"].includes(feature) ? "text" : "image";
      const q = await (await quoteApi.POST(request("/api/billing/quote", { feature, quantity: 1, modelId: `${prefix}-a` }))).json();
      assert.equal(q.modelId, baseline ? `${prefix}-a` : `${prefix}-b`);
      const stale = request(`/api/canvas/${feature === "canvas.image" ? "image-tasks" : feature.slice(7)}`, { prompt: "fixture" }, { "x-naumi-model-version": String(first.version) });
      await assert.rejects(withModelRequest(stale, async () => null), (e: any) => e.code === "MODEL_CHANGED");
    }
    console.log(baseline ? "CANVAS_RUNTIME_BASELINE=PASS FEATURES=7 CLIENT_OVERRIDE=ACTIVE QUOTE_OVERRIDE=ACTIVE"
      : "CANVAS_ADMIN_RUNTIME=PASS FEATURES=7 DOCK_SHARED_ENDPOINT_JSON_FORM=PASS BODY_HEADER_OVERRIDE=IGNORED QUOTE_EXECUTION=CONSISTENT ADMIN_PUBLISH_SWITCH=PASS FROZEN_BUNDLES=21 STALE_VERSION=409 REAL_SUPPLIER_CALLS=0");
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
