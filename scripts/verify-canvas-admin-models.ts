import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createModelExecutor } from "../src/lib/model-config/execution";
import { publicModelCatalog } from "../src/lib/model-config/runtime";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import seed from "../src/lib/billing/bootstrap.json";
import type { BillingConfig } from "../src/lib/billing/types";
import type { ModelSnapshot } from "../src/lib/model-config/types";

async function main() {
  const baseline = process.argv.includes("--baseline");
  const config = fixtureModelConfig("http://127.0.0.1:54000/v1", "00000000-0000-4000-8000-000000000001");
  config.upstreamModels.push({ ...structuredClone(config.upstreamModels[0]), id: "u2", model: "wire-image-two" });
  config.publicModels.push({ ...structuredClone(config.publicModels[0]), id: "image-b", target: { type: "upstream", id: "u2" } });
  const features = ["canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate"] as const;
  config.business = Object.fromEntries(features.map(feature => [feature, { enabled: true, defaultModelId: "image-a", options: ["image-a", "image-b"].map((modelId, sort) => ({ modelId, sort, enabled: true, unit: "image", pricing: { mode: "cny-fixed", amountMicros: String(100000 + sort * 100000), creditsPerCnyMicros: "100000000", rounding: "ceil" } })) }])) as typeof config.business;
  const snapshot = { version: 1, digest: "a".repeat(64), config } as ModelSnapshot;
  const billing = { version: 1, config: structuredClone(seed) as BillingConfig };
  const executor = createModelExecutor({ trustedOrigins: ["http://127.0.0.1:54000"],
    runtime: { byVersion: async () => snapshot, prepareExecution: async () => { throw new Error("unexpected router call"); } },
    credentials: { read: async () => "fixture" } as any, gateway: () => { throw new Error("unexpected gateway"); } });
  for (const feature of features) {
    const frozen = await executor.resolve({ feature, binding: "image.edit", requestedModelId: "image-b", snapshot, billing });
    assert.equal(frozen.publicModelId, baseline ? "image-b" : "image-a");
    // Describing persisted executions is intentionally unaffected by the new-request policy.
    assert.equal((await executor.describe(frozen)).frozen.publicModelId, frozen.publicModelId);
    const catalog = publicModelCatalog(snapshot, "image", feature);
    assert.equal(catalog.models.length, baseline ? 2 : 1);
    if (!baseline) assert.equal(catalog.selectionMode, "admin");
    const changed = structuredClone(snapshot); changed.config.business![feature]!.defaultModelId = "image-b";
    assert.equal((await executor.resolve({ feature, binding: "image.edit", requestedModelId: "image-a", snapshot: changed, billing })).publicModelId, baseline ? "image-a" : "image-b");
  }
  assert.equal((await executor.resolve({ feature: "image.generate", binding: "image.generate", requestedModelId: "image-b", snapshot, billing })).publicModelId, "image-b");
  assert.equal(publicModelCatalog(snapshot, "image", "image.generate").models.length, 2);
  const canvas = readFileSync("src/components/canvas/canvas-client.tsx", "utf8");
  assert.equal(canvas.includes("图片编辑操作模型"), baseline);
  assert.equal(canvas.includes('<FeatureModelSelect feature="canvas.expand"'), baseline);
  if (!baseline) {
    const { ADMIN_CONFIGURED_FEATURES, requestedFeatureModel } = await import("../src/lib/model-config/selection-policy");
    for (const feature of ADMIN_CONFIGURED_FEATURES) {
      assert.equal(requestedFeatureModel(feature, "forged-header-or-body"), undefined);
    }
  }
  console.log(baseline
    ? "CANVAS_MODEL_BASELINE=PASS USER_OVERRIDE=ACTIVE CATALOG_OPTIONS=2 PANEL=PRESENT GENERATION_SELECTION=PRESERVED"
    : "CANVAS_ADMIN_MODELS=PASS USER_OVERRIDE=IGNORED ADMIN_DEFAULT_SWITCH=PASS FROZEN_EXECUTION=PRESERVED CATALOG_OPTIONS=1 PANEL=ABSENT CACHE=IGNORED GENERATION_SELECTION=PRESERVED");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
