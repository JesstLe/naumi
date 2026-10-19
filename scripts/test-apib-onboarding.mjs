import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareAPiB } from "./lib/apib-onboarding.mjs";

const manifest = JSON.parse(readFileSync(new URL("../docs/providers/apib-onboarding-20261019.json", import.meta.url), "utf8"));
function fixture() {
  const config = { schemaVersion: 1, providers: [{ id: "old", enabled: true, sentinel: 0 }], upstreamModels: [{ id: "old:image", enabled: true }],
    publicModels: [
      { id: "gpt-image-2", label: "GPT-Image-2.5", modality: "image", supplierRouting: { mode: "balanced", channels: [{ upstreamId: "old:image", enabled: true, priority: 2, weight: 3 }, { upstreamId: "old:off", enabled: false, priority: 1, weight: 7 }] } },
      ...["Nano Banana Pro", "Nano Banana 2"].flatMap(label => Array.from({ length: 5 }, (_, i) => ({ id: `${label.replaceAll(" ", "-")}-${i}`, label, modality: "image" })))
    ], bindings: { "image.generate": "gpt-image-2" }, business: { price: 6, disabled: false }, pools: [], fixedMonthlyCosts: [] };
  return { snapshot: { version: 117, digest: "fixture-digest", config }, catalog: { source: "https://api.apib.ai/v1/models", checkedAt: "2026-10-19T02:20:00Z", models: manifest.models.map(m => ({ id: m.id, supported_endpoint_types: ["openai"] })) }, manifest, expectedVersion: 117, expectedDigest: "fixture-digest" };
}
test("prepares only explicitly selected exact catalog IDs without mutating input", () => {
  const args = fixture(), before = structuredClone(args), plan = prepareAPiB(args);
  assert.deepEqual(args, before); assert.equal(plan.summary.selectedImageModels, 24);
  assert.equal(plan.summary.selectedVideoModels, 51);
  assert.equal(plan.config.upstreamModels.length, args.snapshot.config.upstreamModels.length + manifest.models.length);
  assert.equal(plan.config.providers.length, 3); assert.equal(plan.summary.newlyEnabledModels, 0);
  assert.equal(plan.config.upstreamModels.filter(u => u.id.startsWith("apib:")).every(u => !u.enabled && !u.capabilities.generate && !u.capabilities.edit && !u.capabilities.verified && !Object.keys(u.parameterMap).length), true);
});
test("preserves public family aliases, disabled old channels, weights, bindings, and prices exactly", () => {
  const a = fixture(), p = prepareAPiB(a);
  for (const key of ["publicModels", "bindings", "business", "pools", "fixedMonthlyCosts"]) assert.deepEqual(p.config[key], a.snapshot.config[key]);
  for (const intent of p.intents.filter(i => i.family.startsWith("Nano Banana") && i.destination === "existing")) assert.equal(intent.publicIds.length, 5);
  assert.equal(p.intents.filter(i => i.destination === "existing").every(i => i.defaultRole === "standby"), true);
});
test("idempotent preparation accepts the identical disabled candidate, not a live-edited collision", () => {
  const a = fixture(), p = prepareAPiB(a); a.snapshot.config = p.config;
  assert.deepEqual(prepareAPiB(a).additions, { providers: [], upstreamModels: [] });
  a.snapshot.config.providers.find(p => p.id === "apib-image").enabled = true;
  assert.throws(() => prepareAPiB(a), /PROVIDER_COLLISION/);
});
test("rejects stale version or digest, foreign source or origin, and missing selected IDs", () => {
  for (const change of [a => a.expectedVersion++, a => a.expectedDigest = "stale", a => a.catalog.source = "https://example.com/v1/models", a => a.manifest.baseUrl = "https://api.apimart.ai/v1", a => a.catalog.models.pop()]) {
    const a = structuredClone(fixture()); change(a); assert.throws(() => prepareAPiB(a));
  }
});
test("rejects duplicate IDs, incompatible existing upstreams, and absent original family", () => {
  for (const change of [a => a.manifest.models.push(a.manifest.models[0]), a => a.catalog.models.push(a.catalog.models[0]), a => a.snapshot.config.upstreamModels.push({ id: `apib:${manifest.models[0].id}`, enabled: true }), a => a.snapshot.config.publicModels = []]) {
    const a = structuredClone(fixture()); change(a); assert.throws(() => prepareAPiB(a));
  }
});
test("observations do not elevate borrowed docs, prices, or catalog endpoint tags into verified capabilities", () => {
  const p = prepareAPiB(fixture());
  assert.equal(p.observations.every(o => o.capabilityState === "unknown" && o.prices.length === 0 && !o.parameterMetadata.onboarding.protocolConfirmed), true);
  assert.equal(p.intents.every(i => i.gates.includes("paid-batch-approval") && i.gates.includes("exact-model-output-acceptance")), true);
  assert.equal(p.intents.filter(i => i.family === "LTX").every(i => i.documentation === null && i.documentationScope === "catalog-only-no-documentation"), true);
  assert.equal(p.config.providers.filter(p => p.id.startsWith("apib-")).every(p => !p.enabled && !p.credentialRef), true);
});
