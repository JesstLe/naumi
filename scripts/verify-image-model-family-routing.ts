import assert from "node:assert/strict";
import {
  compactImageModelOptions,
  imageModelDisplayId,
  routeImageModel,
} from "../src/lib/image-model-routing";
import { isNewApiFlowImageModel } from "../src/lib/image-model-catalog";

const models = [
  { id: "gpt-image-2", label: "gpt-image-2", provider: "managed" },
  { id: "gemini-3.0-pro-image-square", label: "方图", provider: "managed" },
  { id: "gemini-3.0-pro-image-three-four", label: "竖版", provider: "managed" },
  { id: "gemini-3.0-pro-image-four-three", label: "横版", provider: "managed" },
  { id: "gemini-3.0-pro-image-portrait", label: "竖版", provider: "managed" },
  { id: "gemini-3.0-pro-image-landscape", label: "横版", provider: "managed" },
  { id: "jimeng-image-5.0-pro", label: "即梦 5 Pro", provider: "new-api-flow" },
];

const visible = compactImageModelOptions(models);
assert.deepEqual(visible.map(model => model.label), ["gpt-image-2", "gemini-3.0-pro-image", "jimeng-image-5.0-pro"]);
assert.equal(visible.filter(model => model.label === "gemini-3.0-pro-image").length, 1);
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "1:1", models), "gemini-3.0-pro-image-square");
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "3:4", models), "gemini-3.0-pro-image-three-four");
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "4:3", models), "gemini-3.0-pro-image-four-three");
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "9:16", models), "gemini-3.0-pro-image-portrait");
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "16:9", models), "gemini-3.0-pro-image-landscape");
assert.equal(routeImageModel("gpt-image-2", "9:16", models), "gpt-image-2");
assert.equal(imageModelDisplayId("imagen-4.0-generate-preview-landscape"), "imagen-4.0-generate-preview");
assert.ok(isNewApiFlowImageModel("jimeng-image-5.0-pro"));
assert.ok(isNewApiFlowImageModel("jimeng-image-v8.2"));
console.log("PASS image model families collapse to clean IDs, ratios route to variants, and Jimeng IDs are recognized");
const renamed = models.map(m => ({ ...m, provider: "managed", label: m.id.startsWith("gemini-") ? "精致产品图" : m.id === "gpt-image-2" ? "标准产品图" : m.id }));
assert.equal(compactImageModelOptions(renamed)[0].label, "标准产品图");
assert.equal(compactImageModelOptions(renamed)[1].label, "精致产品图");
const preferred = compactImageModelOptions(renamed, ["gemini-3.0-pro-image-portrait"]);
assert.deepEqual(preferred.map(m => imageModelDisplayId(m.id)), compactImageModelOptions(renamed).map(m => imageModelDisplayId(m.id)), "saved/default selection must not promote a family");
assert.equal(preferred[1].label, "精致产品图");
assert.equal(preferred[1].id, "gemini-3.0-pro-image-portrait", "retain the preferred ratio representative within its original family position");
assert.equal(routeImageModel("gemini-3.0-pro-image-square", "16:9", renamed), "gemini-3.0-pro-image-landscape");
assert.equal(compactImageModelOptions(models.map(m => ({ ...m, provider: "managed" })))[1].label, "gemini-3.0-pro-image", "different legacy ratio labels must still collapse to the clean family");
