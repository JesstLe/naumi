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
    assert.equal(adminConfiguredFeature("tool.cutout"), false);
    assert.equal(explicit, "gpt-image-1");
    assert.equal(catalog.available, false);
    assert.equal(catalog.selectionMode, "user");
    await assert.rejects(executor.resolve(input), (error: any) => error.code === "MODEL_UNAVAILABLE");
    // Hidden historical defaults may still execute internally, never as public choices.
    assert.equal((await executor.resolve({...input, requestedModelId:undefined})).publicModelId, "gpt-image-1");
    assert.equal(requestedFeatureModel("tool.cutout", "chosen-model"), "chosen-model");
    const visible=structuredClone(snapshot);visible.config.publicModels[0].visible=true;
    visible.config.publicModels.push({...visible.config.publicModels[0],id:"image-other",label:"Other model"});
    const visibleCatalog=publicModelCatalog(visible,"image","tool.cutout");
    assert.equal(visibleCatalog.models.length,2);
    assert.equal((await executor.resolve({...input,snapshot:visible,requestedModelId:"image-other"})).publicModelId,"image-other");
    const unbound=structuredClone(visible);delete unbound.config.bindings["image.cutout"];
    assert.equal((await executor.resolve({...input,snapshot:unbound,requestedModelId:"image-other"})).publicModelId,"image-other");
    for (const mutate of [
      (c: typeof config) => { c.providers[0].enabled = false; },
      (c: typeof config) => { c.upstreamModels[0].enabled = false; },
      (c: typeof config) => { c.upstreamModels[0].capabilities.transparent = false; },
      (c: typeof config) => { for(const model of c.publicModels)model.toolScope = { features: [], defaultFor: [] }; },
    ]) {
      const changed = structuredClone(visible); mutate(changed.config);
      assert.equal(publicModelCatalog(changed, "image", "tool.cutout").available, false);
    }
    const { featureExecutionBlock } = await import("../src/lib/model-config/feature-availability");
    assert.equal(featureExecutionBlock(null, null), "loading");
    assert.equal(featureExecutionBlock({ ...visibleCatalog, managed: true }, "network failed"), "failed");
    assert.equal(featureExecutionBlock({ managed: true, models: [] }, null), "unavailable");
    assert.equal(featureExecutionBlock({ managed: true, available: false, models: [{ id: "stale" }] }, null), "unavailable");
    assert.equal(featureExecutionBlock({ managed: true, available: true, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: false, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: true, supported: false, models: [] }, null), null);
    assert.equal(featureExecutionBlock({ managed: true, models: [{ id: "valid" }] }, null), null);
    console.log("MODIFIED=PASS USER_SELECTION=ACTIVE HIDDEN_LIST=0 LEGACY_DEFAULT=PRESERVED UNBOUND_EXPLICIT=SUPPORTED DISABLED_CAPABILITIES=REJECTED");
  }
  assert.equal(JSON.stringify(config), before);
  assert.equal(externalAccess, 0);
  console.log("CONFIG_MUTATIONS=0 EXTERNAL_ACCESS=0 SUPPLIER_CALLS=0");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
