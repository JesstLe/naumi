import assert from "node:assert/strict";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { publicModelCatalog } from "../src/lib/model-config/public-catalog";
import { frontendImageCatalog } from "../src/lib/frontend-image-models";
import { canvasImageToolState } from "../src/lib/canvas/image-tool-state";
import { featureExecutionBlock } from "../src/lib/model-config/feature-availability";

const baseline = process.argv.includes("--baseline");
const config = fixtureModelConfig("https://fixture.invalid", "fixture-credential");
config.publicModels[0].toolScope = { features: ["canvas.image"], defaultFor: [] };
config.upstreamModels[0].capabilities.transparent = true;
config.publicModels.push({ id: "image-cutout-verified", label: "Hidden processor", modality: "image", enabled: true, visible: false, target: { type: "upstream", id: "u1" }, toolScope: { features: ["tool.cutout"], defaultFor: [] } });
config.bindings["image.cutout"] = "image-cutout-verified";
const original = JSON.stringify(config);
const catalog = (value = config) => frontendImageCatalog(publicModelCatalog({ version: 1, digest: "fixture", config: value }, "image", "tool.cutout"));
const state = (ready: boolean) => canvasImageToolState({ source: { image: "fixture.png" }, ready: true, readOnly: false, locked: false, cutoutReady: ready });
const hidden = catalog();
assert.equal(hidden.models.length, 0);
assert.equal(hidden.defaultModelId, undefined, "hidden identity must not be published");
assert.ok(!JSON.stringify(hidden).includes("image-cutout-verified"));
if (baseline) {
  assert.equal(hidden.available, false); assert.equal(state(hidden.available).canCutout, false);
  console.log("CUTOUT_READINESS_BASELINE=REPRODUCED configured_hidden=true catalog_available=false dock_disabled=true supplier_calls=0");
} else {
  assert.equal(hidden.available, true); assert.equal(state(hidden.available).canCutout, true);
  assert.equal(featureExecutionBlock({ ...hidden, managed: true }, null), null);
  for (const mutate of [
    (c: typeof config) => { c.publicModels[1].enabled = false; },
    (c: typeof config) => { c.publicModels[1].toolScope = { features: [], defaultFor: [] }; },
    (c: typeof config) => { c.providers[0].enabled = false; },
    (c: typeof config) => { c.providers[0].credentialRef = undefined; },
    (c: typeof config) => { c.upstreamModels[0].enabled = false; },
    (c: typeof config) => { c.upstreamModels[0].capabilities.transparent = false; },
    (c: typeof config) => { delete c.bindings["image.cutout"]; },
    (c: typeof config) => { c.business = { "tool.cutout": { enabled: false, defaultModelId: "image-cutout-verified", options: [] } }; },
  ]) { const c = structuredClone(config); mutate(c); assert.equal(catalog(c).available, false); }
  for (const patch of [{ readOnly: true }, { locked: true }, { ready: false }, { historySaving: true }, { source: null }]) {
    assert.equal(canvasImageToolState({ source: { image: "fixture.png" }, ready: true, readOnly: false, locked: false, cutoutReady: true, ...patch }).canCutout, false);
  }
  const standalone = { managed: true, supported: false, available: true, models: [] };
  assert.equal(featureExecutionBlock(standalone), null, "legacy processor readiness is independent of model selection");
  assert.equal(featureExecutionBlock({ ...hidden, managed: true }, "network failed"), "failed");
  assert.equal(JSON.stringify(config), original);
  console.log("CANVAS_CUTOUT_READINESS=PASS hidden_default=ready hidden_identity=private disabled_scope_capability_credentials=blocked node_guards=preserved supplier_calls=0");
}
