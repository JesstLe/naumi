import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { reverseHubImageFetch, reverseHubImageRequest } from "../src/lib/model-config/reverse-hub-images";
import { withImageOperation, ImageOperationPending, ImageOperationReview, isImageGatewayModel } from "../src/lib/image-gateway";
import { runModelExecution, type ModelExecutionScope } from "../src/lib/model-config/context";
import { reverseHubCatalogMetadata } from "../src/lib/supplier-models/discovery";
const scope: ModelExecutionScope = {
  connection: { providerId: "hub", protocol: "openai-images", baseUrl: "http://hub.test/v1", apiKey: "fixture", wireModel: "jimeng/jimeng-image-5.0-pro", timeoutMs: 1000, options: { imageAdapter: "reverse-hub" } },
  frozen: { publicModelId: "jimeng-image-5.0-pro", binding: "image.edit", modality: "image", modelVersion: 1, billingVersion: 1, modelDigest: "a".repeat(64), target: { type: "upstream", id: "jimeng" }, facts: { task: "product", quality: "medium", resolution: "4K", ratio: "1:1", needsEdit: true, preserveIdentity: true, needsText: false, nativeResolution: true, references: 1 } },
  capabilities: { verified: true, generate: true, edit: true, vision: false, transparent: false, preserveIdentity: true, textAccuracy: true, qualityRank: 3, qualities: ["medium"], nativeResolutions: ["2K", "4K"], maxReferenceImages: 10, expectedLatencyMs: 50000 },
  parameterMap: { resolutionPolicy: { mode: "map", field: "resolution", ratioField: "ratio", values: { "1K": "1.5k", "2K": "2k", "4K": "4k" } }, qualityPolicy: { mode: "omit", choices: [{ id: "medium", label: "标准" }] } },
};
async function main() {
  let record: any, task: any, paid = 0, posts = 0, loseSubmit = true;
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "red" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 32, height: 32, channels: 4, background: "blue" } }).png().toBuffer();
  const ledger: any = {
    account: async () => {},
    begin: async () => record ||= { id: randomUUID(), parameters: null },
    apply: async (_id: string, receipt: any) => { record.task_id ||= receipt.taskId; record.state = receipt.state; },
    pool: { query: async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT")) return { rows: [record] };
      if (sql.includes("parameters=$2") && !record.parameters) record.parameters = JSON.parse(args[1]);
      else if (sql.includes("parameters=parameters")) Object.assign(record.parameters, JSON.parse(args[1]));
      return { rowCount: 1 };
    } },
  };
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init), path = new URL(request.url).pathname;
    assert.equal(request.headers.get("authorization"), "Bearer fixture");
    if (request.method === "POST") {
      posts++; const payload = await request.json();
      assert.equal(payload.parameters.resolution, "4k"); assert.equal(payload.parameters.ratio, "1:1");
      assert.ok(!("quality" in payload.parameters)); assert.ok(!("size" in payload.parameters));
      if (!task) { paid++; task = { id: randomUUID(), operation_id: payload.operation_id, model: payload.model, state: "running" }; }
      else assert.equal(task.operation_id, payload.operation_id);
      if (loseSubmit) { loseSubmit = false; throw Error("lost-submit-response"); }
      return Response.json(task, { status: 202 });
    }
    if (path.endsWith("/content")) return new Response(blue);
    task.state = "succeeded"; task.result = { data: [{ artifact: "image-0.png" }] }; return Response.json(task);
  };
  const adapter = reverseHubImageFetch(scope, {}, { transport, ledger, context: { operationId: "fixture", feature: "canvas.image", phase: "generation" } as any, pollMs: 0 });
  const make = () => new Request("http://hub.test/v1/images/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "alias", prompt: "fixture", n: 1, size: "1024x1024", quality: "max" }) });
  await runModelExecution(scope, async () => {
    assert.equal(isImageGatewayModel(scope.frozen.publicModelId), true);
    const auto = await withImageOperation(scope.frozen.publicModelId, { id: "auto-1", ratio: "auto" }, () => reverseHubImageRequest(make(), scope));
    assert.equal(auto.payload.parameters.ratio, "1:1", "Canvas auto resolves to a supported native ratio");
    await assert.rejects(withImageOperation(scope.frozen.publicModelId, { id: "durable-1" }, () => adapter(make())), ImageOperationPending);
    const result = await withImageOperation(scope.frozen.publicModelId, { id: "durable-1" }, () => adapter(make()));
    assert.equal(result.status, 200); assert.equal(paid, 1); assert.equal(posts, 2, "Lost submit is a Hub idempotent replay, not another native generation");
    await withImageOperation(scope.frozen.publicModelId, { id: "durable-1" }, () => adapter(make()));
    assert.equal(posts, 2, "Saved task ID resumes with GET only"); assert.equal(record.parameters.acceptedOutputs, 1);
    const changed = new Request(make().url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "changed" }) });
    await assert.rejects(withImageOperation(scope.frozen.publicModelId, { id: "durable-1" }, () => adapter(changed)), (error: any) => error.cause?.code === "OPERATION_CONFLICT");
    // Verify application mask preservation, including actual bytes outside the region.
    record = undefined; task = undefined;
    const maskBytes = Buffer.alloc(32 * 32 * 4, 255); maskBytes[3] = 0;
    const mask = await sharp(maskBytes, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
    const form = new FormData(); form.set("prompt", "edit"); form.set("image[]", new File([png], "ref.png", { type: "image/png" })); form.set("mask", new File([mask], "mask.png", { type: "image/png" }));
    const output = await withImageOperation(scope.frozen.publicModelId, { id: "mask-1" }, () => adapter("http://hub.test/v1/images/edits", { method: "POST", body: form }));
    const pixels = await sharp(Buffer.from((await output.json()).data[0].b64_json, "base64")).raw().toBuffer();
    assert.deepEqual([...pixels.subarray(0, 4)], [0, 0, 255, 255]); assert.deepEqual([...pixels.subarray(4, 8)], [255, 0, 0, 255]);
    task.state = "reconciling";
    const pendingTransport: typeof fetch = async () => Response.json(task);
    const pending = reverseHubImageFetch(scope, {}, { transport: pendingTransport, ledger, context: {} as any });
    await assert.rejects(withImageOperation(scope.frozen.publicModelId, { id: "mask-1" }, () => pending("http://hub.test/v1/images/edits", { method: "POST", body: form })), ImageOperationReview);
    task.state = "failed";
    assert.equal((await withImageOperation(scope.frozen.publicModelId, { id: "mask-1" }, () => pending("http://hub.test/v1/images/edits", { method: "POST", body: form }))).status, 422);
    task.error = {code:"jimeng_quota_not_submitted",message:"DO_NOT_LEAK fixture secret"};
    task.submission_status="not_submitted"; task.upstream_task_id=null;
    const rejected=await withImageOperation(scope.frozen.publicModelId,{id:"mask-1"},()=>pending("http://hub.test/v1/images/edits",{method:"POST",body:form}));
    const rejection=await rejected.json();assert.equal(rejected.status,422);assert.equal(rejection.error.billing_status,"not_charged","Exact Hub pre-submission proof must not trap the customer in review");assert.ok(!rejection.error.message.includes("DO_NOT_LEAK"));
    task.upstream_task_id="accepted-native-history";
    const ambiguous=await withImageOperation(scope.frozen.publicModelId,{id:"mask-1"},()=>pending("http://hub.test/v1/images/edits",{method:"POST",body:form}));
    assert.equal((await ambiguous.json()).error.billing_status,"task_failed","Accepted native history never becomes a retry permit");
    task.upstream_task_id=null;delete task.submission_status;
    const legacy=await withImageOperation(scope.frozen.publicModelId,{id:"mask-1"},()=>pending("http://hub.test/v1/images/edits",{method:"POST",body:form}));
    assert.equal((await legacy.json()).error.billing_status,"task_failed","Legacy code without explicit new proof stays unchanged");

  });
  const meta = reverseHubCatalogMetadata({ provider: "jimeng", evidence: "catalog", operations: ["image.generate", "image.edit"], image_capabilities: { source: "native_catalog", resolutions: ["1.5k", "2k", "4k"], ratios: ["1:1"], max_reference_images: 10 } }, "http://hub.test/v1/models", new Date().toISOString())!;
  assert.equal(meta.capabilityState, "documented"); assert.equal(meta.prices.length, 0); assert.equal(meta.capabilities.mask, null); assert.deepEqual(meta.capabilities.resolutions, ["1.5k", "2k", "4k"]);
  console.log("REVERSE_HUB_IMAGES=PASS durable replay, GET recovery, conflict, real mask pixels, pending/failure, native metadata");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
