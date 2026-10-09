import assert from "node:assert/strict";
import { runModelExecution, type ModelExecutionScope } from "../src/lib/model-config/context";
import { imageGatewayFields, withImageOperation } from "../src/lib/image-gateway";

async function main() {
  const scope = { frozen: { modality: "image", publicModelId: "image", routerDigest: "frozen-router", facts: { needsText: false, resolution: "1K" } }, connection: { protocol: "router-images", wireModel: "image" } } as ModelExecutionScope;
  await runModelExecution(scope, async () => {
    await withImageOperation("image", { id: "frozen-plain-image" }, async () => {
      assert.equal((imageGatewayFields("image").extra_fields as any).naumi.text_accuracy, "best_effort", "compiled negative text instructions cannot introduce an unvalidated requirement");
    });
    scope.frozen.facts!.needsText = true;
    await withImageOperation("image", { id: "frozen-text-image" }, async () => {
      assert.equal((imageGatewayFields("image").extra_fields as any).naumi.text_accuracy, "required", "frozen text requirement must stay enforced");
    });
    scope.frozen.facts!.needsText = false;
    await withImageOperation("image", { id: "explicit-text-image", textAccuracy: "required" }, async () => {
      assert.equal((imageGatewayFields("image").extra_fields as any).naumi.text_accuracy, "required", "explicit operation requirement remains authoritative");
    });
  });
  await withImageOperation("naumi-image-auto", { id: "legacy-auto-image" }, async () => {
    assert.equal((imageGatewayFields("naumi-image-auto").extra_fields as any).naumi.text_accuracy, "auto", "legacy inference remains available");
  });
  console.log("MANAGED_GATEWAY_FROZEN_TEXT_REQUIREMENTS=PASS LEGACY_AUTO=PASS EXPLICIT_REQUIRED=PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
