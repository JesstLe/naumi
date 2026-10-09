import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureModelSelect } from "../src/components/tools/feature-model-select";
import { chosenFeatureModel, selectFeatureModel } from "../src/lib/model-config/feature-client";
import { ADMIN_CONFIGURED_FEATURES } from "../src/lib/model-config/selection-policy";
const saved = new Map(ADMIN_CONFIGURED_FEATURES.map(f => [`naumi:model:${f}`, "old-user-cache"]));
Object.assign(globalThis, { localStorage: { getItem: (k: string) => saved.get(k), setItem: (k: string, v: string) => saved.set(k,v), removeItem: (k: string) => saved.delete(k) } });
for (const feature of ADMIN_CONFIGURED_FEATURES) {
  selectFeatureModel(feature, "old-user-cache");
  assert.equal(chosenFeatureModel(feature), undefined);
  assert.equal(renderToStaticMarkup(<FeatureModelSelect feature={feature} />), "");
}
console.log("CANVAS_ADMIN_CLIENT=PASS HIDDEN_SELECTORS=7 USER_CACHE=IGNORED");
