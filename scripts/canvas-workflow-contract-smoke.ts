import assert from "node:assert/strict";
import {
  applyWorkflowOverrides,
  detectWorkflowFormat,
  extractWorkflowInputs,
  missingNodes,
  type ApiWorkflow,
} from "../src/lib/comfyui/workflow";

const workflow: ApiWorkflow = {
  "3": { class_type: "KSampler", inputs: { model: ["4", 0], positive: ["6", 0], negative: ["7", 0], seed: 42 } },
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "flux1-dev.safetensors" } },
  "5": { class_type: "LoadImage", inputs: { image: "product.png" }, _meta: { title: "产品图" } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "product hero", clip: ["4", 1] } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "watermark", clip: ["4", 1] } },
  "9": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: "Naumi" } },
};

assert.equal(detectWorkflowFormat(workflow), "api");
assert.equal(detectWorkflowFormat({ nodes: [], links: [] }), "ui");
const inputs = extractWorkflowInputs(workflow);
assert.equal(inputs.images.length, 1);
assert.equal(inputs.texts.find((item) => item.nodeId === "6")?.role, "positive");
assert.equal(inputs.texts.find((item) => item.nodeId === "7")?.role, "negative");
assert.ok(inputs.requiredNodes.includes("SaveImage"));
const changed = applyWorkflowOverrides(workflow, { imageNames: ["uploaded/product.png"], texts: { "6": "clean ecommerce hero" }, seeds: { "3": 99 } });
assert.equal(changed["5"].inputs.image, "uploaded/product.png");
assert.equal(changed["6"].inputs.text, "clean ecommerce hero");
assert.equal(changed["3"].inputs.seed, 99);
assert.deepEqual(missingNodes(inputs.requiredNodes, ["KSampler", "LoadImage", "CLIPTextEncode", "SaveImage"]), ["CheckpointLoaderSimple"]);
console.log("PASS ComfyUI workflow: format, inputs, roles, overrides, missing-node report");
