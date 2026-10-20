import assert from "node:assert/strict";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { publicModelCatalog } from "../src/lib/model-config/runtime";
import { createModelExecutor } from "../src/lib/model-config/execution";
import { featureDefaultModel } from "../src/lib/model-config/tool-scope";
import { requestedFeatureModel, adminConfiguredFeature } from "../src/lib/model-config/selection-policy";
import { fixtureConfig } from "./billing-unit-fixture";

async function main() {
  const baseline = process.argv.includes("--baseline");
  const config = fixtureModelConfig("https://fixture.invalid", "00000000-0000-4000-8000-000000000001");
  config.publicModels[0].id = "gpt-image-1";
  config.publicModels[0].visible = false;
  config.bindings = { "image.generate": "gpt-image-1", "image.cutout": "gpt-image-1" };
  config.upstreamModels[0].capabilities.transparent = true;
  config.upstreamModels[0].capabilities.preserveIdentity = true;
  const snapshot = { version: 123, digest: "a".repeat(64), config };
  const before = JSON.stringify(config);
  let externalAccess = 0;
  const unexpected = async () => { externalAccess++; throw Error("UNEXPECTED_EXTERNAL_ACCESS"); };
  const executor = createModelExecutor({ runtime: { byVersion: unexpected, prepareExecution: unexpected }, credentials: { get: unexpected }, gateway: () => { throw Error("UNEXPECTED_GATEWAY"); } } as never);
  const catalog = publicModelCatalog(snapshot, "image", "tool.cutout");
  const explicit = requestedFeatureModel("tool.cutout", featureDefaultModel(config, "tool.cutout", "image.cutout"));
  const input = { feature: "tool.cutout", binding: "image.cutout", requestedModelId: explicit, snapshot, billing: { version: 8, config: fixtureConfig() }, facts: { task: "product" as const, quality: "medium", resolution: "1K", needsEdit: true, needsText: false, preserveIdentity: true, nativeResolution: false, references: 1 } };
  assert.equal(catalog.models.length, 0, "hidden processor must not leak into the user model list");
  if (baseline) {
    await assert.rejects(executor.resolve(input), (e: any) => e.code === "MODEL_UNAVAILABLE" && e.status === 409);
    assert.equal(adminConfiguredFeature("tool.cutout"), false);
    console.log("BASELINE=REPRODUCED CATALOG_MODELS=0 DEFAULT_AS_EXPLICIT=1 RESULT=MODEL_UNAVAILABLE/409");
  } else {
    assert.equal(adminConfiguredFeature("tool.cutout"), true);
    assert.equal(explicit, undefined);
    assert.equal((catalog as any).available, true);
    assert.equal(catalog.selectionMode, "admin");
    assert.equal((await executor.resolve(input)).publicModelId, "gpt-image-1");
    assert.equal(requestedFeatureModel("tool.cutout", "user-injected-id"), undefined);
    assert.equal(requestedFeatureModel("canvas.image", "chosen-model"), "chosen-model");
    assert.equal(adminConfiguredFeature("canvas.image"), false);
    for (const mutate of [
      (c: typeof config) => { c.publicModels[0].enabled = false; },
      (c: typeof config) => { c.providers[0].enabled = false; },
      (c: typeof config) => { c.providers[0].credentialRef = undefined; },
      (c: typeof config) => { c.upstreamModels[0].enabled = false; },
      (c: typeof config) => { c.upstreamModels[0].capabilities.transparent = false; },
      (c: typeof config) => { c.publicModels[0].toolScope = { features: [], defaultFor: [] }; },
      (c: typeof config) => { delete c.bindings["image.cutout"]; },
      (c: typeof config) => { c.business = { "tool.cutout": { enabled: false, defaultModelId: "gpt-image-1", options: [] } } as any; },
    ]) {
      const changed = structuredClone(snapshot); mutate(changed.config);
      assert.equal((publicModelCatalog(changed, "image", "tool.cutout") as any).available, false);
    }
    const { featureExecutionBlock } = await import("../src/lib/model-config/feature-availability");
    assert.equal(featureExecutionBlock(null, null), "loading");
    assert.equal(featureExecutionBlock({ ...catalog, managed: true }, "network failed"), "failed");
    assert.equal(featureExecutionBlock({ managed: true, models: [] }, null), "unavailable");
    assert.equal(featureExecutionBlock({ managed: true, available: false, models: [{ id: "stale" }] }, null), "unavailable");
    assert.equal(featureExecutionBlock({ managed: true, available: true, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: false, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: true, supported: false, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: true, models: [{ id: "valid" }] }, null), null);
    console.log("MODIFIED=PASS HIDDEN_BACKEND=RESOLVED HIDDEN_LIST=0 DISABLED_SCOPE_CAPABILITY_GUARDS=8 SUBMISSION_STATES=8 CANVAS_SELECTION=UNCHANGED");
  }
  assert.equal(JSON.stringify(config), before);
  assert.equal(externalAccess, 0);
  console.log("CONFIG_MUTATIONS=0 EXTERNAL_ACCESS=0 SUPPLIER_CALLS=0");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
