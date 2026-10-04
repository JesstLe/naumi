import assert from "node:assert/strict";
import sharp from "sharp";
import { toFile } from "openai";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { createModelExecutor } from "../src/lib/model-config/execution";
import { modelAwareOpenAI, managedImageEditFetch } from "../src/lib/model-config/clients";

async function main() {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
  const calls: any[] = [];
  let fail = false;
  const f = await createModelFixture(async (request, response) => {
    if (request.url === "/image.png") { response.writeHead(200, { "Content-Type": "image/png" }); response.end(png); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(part);
    calls.push({ path: request.url, body: JSON.parse(Buffer.concat(parts).toString()) });
    if (fail) { response.destroy(); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: `![result](${f.origin}/image.png)` } }] })}\n\ndata: [DONE]\n\n`);
  });
  try {
    process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
    process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
    process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
    const { bootstrapModelConfig } = await import("../src/lib/model-config/bootstrap");
    const imported = await bootstrapModelConfig({ credentials: f.credentials, trustedOrigins: [f.origin], sources: {
      image: { baseUrl: `${f.origin}/v1`, apiKey: f.marker, models: ["gpt-image-1"], defaultModel: "gpt-image-1", qualitySupported: false },
      flow: { baseUrl: `${f.origin}/v1`, apiKey: "fixture-flow-original-account", models: ["original-flow"], defaultModel: "original-flow", qualitySupported: false }, video: [],
    } });
    assert.equal(imported.upstreamModels.find(u => u.model === "original-flow")!.capabilities.maxReferenceImages, 6, "Migration preserves existing Flow adapter's six reference slots");
    f.config.providers[0].protocol = "new-api-flow";
    const snapshot = await f.repo.current();
    const executor = createModelExecutor({ runtime: { byVersion: f.repo.byVersion, prepareExecution: async () => { throw new Error("Direct Flow must not prepare Router"); } }, credentials: f.credentials, trustedOrigins: [f.origin], gateway: () => { throw new Error("Flow must not call generation gateway"); } });
    const billing = { version: 1, config: fixtureConfig() };
    const model = await executor.resolve({ snapshot, billing, binding: "image.edit" });
    const client = modelAwareOpenAI({ apiKey: "legacy-must-not-be-used" });
    const image = await toFile(png, "fixture.png", { type: "image/png" });
    const result = await executor.run(model, () => client.images.edit({ model: "stale-model", prompt: "keep the product", image, response_format: "b64_json", n: 1 }));
    assert.equal(result.data?.[0].b64_json, png.toString("base64"));
    assert.equal(calls[0].path, "/v1/chat/completions");
    assert.equal(calls[0].body.model, "wire-image-one");
    assert.equal(calls[0].body.messages[0].content[1].image_url.url, `data:image/png;base64,${png.toString("base64")}`);
    const form = new FormData(); form.set("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png"); form.set("prompt", "native multipart edit"); form.set("model", "stale-model");
    const native = await executor.run(model, () => managedImageEditFetch("https://legacy.invalid", "unused", form, AbortSignal.timeout(5000)));
    assert.equal(native.status, 200); assert.equal((await native.json()).data[0].b64_json, png.toString("base64"));
    const generated = await executor.run(model, () => client.images.generate({ model: "stale-model", prompt: "new product", n: 1 }));
    assert.equal(generated.data?.[0].b64_json, png.toString("base64"));
    const before = calls.length;
    await assert.rejects(executor.run(model, () => client.images.edit({ model: "x", prompt: "masked", image, mask: image })), /mask|蒙版/i);
    await assert.rejects(executor.run(model, () => client.images.generate({ model: "x", prompt: "multiple", n: 2 })), /单张/);
    assert.equal(calls.length, before, "Unsupported mask/batch cannot submit a paid request");
    fail = true;
    await assert.rejects(executor.run(model, () => client.images.edit({ model: "x", prompt: "uncertain", image })));
    assert.equal(calls.length, before + 1, "An uncertain Flow submission is never automatically retried");
    console.log("PASS actual Flow SDK generation/edit, native multipart, frozen model/reference, pre-submission restrictions and single uncertain POST");
  } finally { const { getPool } = await import("../src/lib/db"); await getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
