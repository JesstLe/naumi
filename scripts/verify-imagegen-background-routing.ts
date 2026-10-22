import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { planImagegen } from "../src/lib/imagegen/plan";
import { submitImagegen, getImagegenResult } from "../src/lib/imagegen/dispatch";

async function main() {
  const pixels = Buffer.alloc(1024 * 1024 * 4);
  for (let y = 100; y < 924; y++) for (let x = 100; x < 924; x++) { const i = (y * 1024 + x) * 4; pixels[i] = 240; pixels[i + 3] = 255; }
  const png = await sharp(pixels, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const calls: Record<string, unknown>[] = [];
  const f = await createModelFixture(async (req, res) => {
    if (!req.url?.endsWith("/images/edits")) { res.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const form = await new Request(f.origin + req.url, { method: "POST", headers: { "content-type": req.headers["content-type"]! }, body: Buffer.concat(chunks) }).formData();
    calls.push(Object.fromEntries([...form].filter(([, value]) => typeof value === "string")));
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
  });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MULTI_USER: "1", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
    NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "background-fixture-router-only-123456789", MODEL_CONFIG_ENVELOPE_SECRET: "background-fixture-envelope-only-20261022",
    OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: `${f.origin}/v1`, OPENAI_IMAGE_QUALITY: "medium", STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: await mkdtemp(join(tmpdir(), "naumi-background-fixture-")) });
  const first = f.config.upstreamModels[0]; first.capabilities.transparent = true; first.capabilities.preserveIdentity = true;
  first.capabilities.imagegen = { transparent: { state: "unknown", source: "fixture unknown", checkedAt: "" } };
  f.config.upstreamModels.push({ ...structuredClone(first), id: "u2", model: "verified-alpha", capabilities: { ...first.capabilities, imagegen: { transparent: { state: "supported", source: "isolated fixture", checkedAt: "2026-10-22" } } } });
  f.config.upstreamModels.push({ ...structuredClone(first), id: "u3", model: "explicitly-unsupported", capabilities: { ...first.capabilities, imagegen: { transparent: { state: "unsupported", source: "admin fixture override", checkedAt: "2026-10-22" } } } });
  f.config.publicModels[0].supplierRouting = { mode: "priority", channels: ["u1", "u2", "u3"].map((upstreamId, priority) => ({ upstreamId, enabled: true, priority: priority + 1, weight: 1 })) };
  f.config.publicModels.push({ ...structuredClone(f.config.publicModels[0]), id: "cutout-a", label: "Verified cutout fixture", toolScope: { features: ["tool.cutout"], defaultFor: ["tool.cutout"] } });
  f.config.bindings["image.cutout"] = "image-a";
  await f.repo.current().catch(async error => { await f.cleanup(); throw error; });
  const db = await import("../src/lib/db");
  try {
    const owner = `background-${randomUUID()}@example.test`, targetId = `target-${randomUUID()}`;
    await db.getOrCreateUser(owner, "Fixture");
    const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
    await withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, { id: randomUUID(), email: owner, amount: 500, source: "admin", reason: "isolated fixture", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'from-white','canvas')", [targetId, owner, `data:image/png;base64,${png.toString("base64")}`]);
    const request = imagegenRequestSchema.parse({ version: 1, operationId: randomUUID(), entry: "canvas", mode: "edit", modelId: "image-a", prompt: "去掉白色背景，输出透明底图，保持主体不透明", inputs: [{ artworkId: targetId, role: "edit-target" }], parameters: { quality: "medium", resolution: "1K", ratio: "1:1" } });
    const plan = await planImagegen(request, owner);
    assert.equal(plan.steps[0].operation, "cutout"); assert.equal(plan.steps[0].modelId, "cutout-a", "Preview must use the actual configured tool default");
    assert.deepEqual(plan.steps[0].eligibleUpstreamIds, ["u2"]); assert.equal(calls.length, 0, "Preview must not call suppliers");
    const native = await planImagegen({ ...request, operationId: randomUUID(), prompt: "透明背景，主体不透明" }, owner);
    assert.equal(native.steps[0].operation, "edit"); assert.deepEqual(native.steps[0].eligibleUpstreamIds, ["u2"]);
    await assert.rejects(() => planImagegen({ ...request, prompt: "透明背景，同时保留白底" }, owner), /同时要求透明和不透明/);
    assert.equal(calls.length, 0);
    await submitImagegen(request, owner, { modelVersion: plan.modelVersion, billingVersion: plan.billingVersion, credits: plan.totalCredits, confirmed: true });
    let result;
    for (let attempt = 0; attempt < 300; attempt++) { result = await getImagegenResult(request.operationId, owner); if (result && ["succeeded", "failed", "needs_attention"].includes(result.status)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(result?.status, "succeeded", JSON.stringify(result)); assert.equal(calls.length, 1); assert.equal(calls[0].model, "verified-alpha"); assert.equal(calls[0].background, "transparent");
    assert.ok(result!.artifacts[0].transparentPixels > 0 && (result!.artifacts[0].visiblePixels ?? 0) > 0);
    await submitImagegen(request, owner); assert.equal(calls.length, 1, "Existing receipt must not repeat the supplier call");
    const settled = await db.getPool().query("SELECT count(*)::int AS n FROM app_billing_operations WHERE email=$1 AND feature='tool.cutout' AND state='settled'", [owner]);
    assert.equal(settled.rows[0].n, 1); assert.equal(result?.chargedCredits, plan.totalCredits);
    console.log("IMAGE_BACKGROUND_ROUTING=PASS verified_sibling frozen_candidates tool_default real_alpha single_call single_charge fixture_only");
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
