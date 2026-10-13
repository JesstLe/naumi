import assert from "node:assert/strict";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let mode = "valid", delay = 0, inspect: ((request: Request) => Promise<Response>) | undefined;
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } }).png().toBuffer();
  process.env.MEDIA_DIR ||= "output/agent-visual-review-fixture/media";
  const { MEDIA_DIR } = await import("../src/lib/storage");
  await mkdir(MEDIA_DIR, { recursive: true }); await writeFile(MEDIA_DIR + "/fixture.png", png);
  const models: string[] = [], paths: string[] = [];

  const f = await createModelFixture(async (request, response) => {
    paths.push(request.url || "");
    if (request.url === "/media/fixture.png") { response.writeHead(200, {"Content-Type":"image/png"});response.end(png);return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(part);
    const bytes = Buffer.concat(parts);
    if (request.url === "/api/agent/verify-image") {
      const result = await inspect!(new Request(f.origin + request.url, {method:"POST",headers:request.headers as Record<string,string>,body:bytes}));
      response.writeHead(result.status, {"Content-Type":"application/json"});response.end(await result.text());return;
    }
    const body = bytes.length ? JSON.parse(bytes.toString()) : {};
    if (request.url === "/internal/config/prepare") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ digest: body.digest, phase: "prepared" })); return;
    }
    models.push(body.model);
    if(delay) await new Promise(resolve => setTimeout(resolve,delay));
    if(mode === "upstream-error") {response.writeHead(400,{"Content-Type":"application/json"});response.end(JSON.stringify({error:{message:"secret-provider-detail-NEVER-SHOW",type:"invalid_request_error"}}));return;}
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: mode === "invalid" ? "{}" : JSON.stringify({ passed: mode !== "failed", score: mode === "failed" ? 40 : 95, summary: "fixture inspected", issues: mode === "failed" ? ["主体裁切"] : [], retryAdvice: mode === "failed" ? "保留完整主体" : "" }) } }] }));
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NAUMI_MULTI_USER = "1";
  process.env.VIDEO_WORKER_SECRET = "fixture-review-video-worker-independent-secret";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "fixture-review-control-independent-secret";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET = "fixture-review-envelope-independent-secret";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  delete process.env.OPENAI_API_KEY;delete process.env.AGENT_API_KEY;
  process.env.INTERNAL_APP_ORIGIN = f.origin;
  const db = await import("../src/lib/db");
  try {
    await db.ensureSchema();
    await db.setSetting("multi_user_enabled", "1");
    const key = await f.credentials.importPlain({ providerId: "chat", plain: "fixture-review-chat", actor: "fixture" });
    f.config.providers.push({ ...f.config.providers[0], id: "chat", protocol: "openai-chat", credentialRef: key.id });
    for (const [id, wire] of [["text-a", "wire-text"], ["reference-a", "wire-reference"], ["review-a", "wire-review"]]) {
      f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: `${id}-upstream`, providerId: "chat", model: wire, modality: "text", parameterMap: {}, capabilities: { ...structuredClone(f.config.upstreamModels[0].capabilities), vision: true } });
      f.config.publicModels.push({ id, label: id, modality: "text", enabled: true, visible: true, target: { type: "upstream", id: `${id}-upstream` } });
    }
    f.config.bindings["text.generate"] = "text-a";
    f.config.bindings["agent.text"] = "text-a";
    f.config.bindings["agent.vision"] = "reference-a";
    f.config.bindings["vision.reference"] = "reference-a";
    f.config.bindings["vision.review"] = "review-a";
    const videoKey = await f.credentials.importPlain({ providerId: "video", plain: "fixture-review-video", actor: "fixture" });
    f.config.providers.push({ ...f.config.providers[0], id: "video", protocol: "openai-videos", credentialRef: videoKey.id });
    f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "video-upstream", providerId: "video", model: "fixture-no-reference-video", modality: "video", parameterMap: {}, capabilities: { ...structuredClone(f.config.upstreamModels[0].capabilities), maxReferenceImages: 0 } });
    f.config.publicModels.push({ id: "video-no-reference", label: "No reference", modality: "video", enabled: true, visible: true, target: { type: "upstream", id: "video-upstream" } });
    f.config.bindings["video.generate"] = "video-no-reference";
    await f.repo.current();
    const { createConfigRuntime } = await import("../src/lib/billing/catalog");
    await createConfigRuntime({ pool: f.sql, ensureSchema: db.ensureSchema, initialize: async () => fixtureConfig() }).current();
    const email = "model-review@example.test";
    await db.getOrCreateUser(email, "Fixture");
    const { signUserSession } = await import("../src/lib/native-auth");
    const cookie = `nv_user=${signUserSession(email, Date.now())}`;
    const { withModelRequest } = await import("../src/lib/model-config/requests");
    const { modelAwareOpenAI } = await import("../src/lib/model-config/clients");
    const client = modelAwareOpenAI({ apiKey: "legacy-must-not-execute" });
    const messages = [{ role: "user" as const, content: [{ type: "image_url" as const, image_url: { url: "data:image/png;base64,fixture" } }] }];
    await withModelRequest(new Request("http://fixture.test/api/canvas/assistant", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "{}" }), async () => {
      await client.chat.completions.create({ model: "stale-client-model", messages });
    });
    assert.equal(models.at(-1), "wire-reference", "Explicit reference binding wins over vision-capable primary text");
    const form = new FormData(); form.set("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
    const { POST } = await import("../src/app/api/agent/verify-image/route");
    inspect = POST;
    const result = await POST(new Request("http://fixture.test/api/agent/verify-image", { method: "POST", headers: { cookie }, body: form }));
    assert.equal(result.status, 200, await result.text());
    assert.equal(models.at(-1), "wire-review", "Actual result-inspection route uses vision.review, independently of Agent vision");
    console.log("PASS managed vision.review works with both legacy API keys absent; supplier receives wire-review");
    const {createNaumiTools,describeNaumiTools,AGENT_SYSTEM_PROMPT} = await import("../src/lib/agent/naumi-tools");
    const tool = createNaumiTools(new Request(f.origin+"/api/agent",{headers:{cookie}}),email).find(t=>t.name==="verify_image_output")!;
    const run = (signal?:AbortSignal) => tool.execute("fixture-inspection",{image_url:f.origin+"/media/fixture.png",goal:"检查主体"},signal);
    const requestImage = async (valid=true) => {
      const form=new FormData();form.set("image",new Blob([new Uint8Array(valid?png:Buffer.from("not-image"))],{type:"image/png"}),"fixture.png");
      return POST(new Request(f.origin+"/api/agent/verify-image",{method:"POST",headers:{cookie},body:form}));
    };
    const ledgerBefore=Number((await f.sql.query("SELECT count(*) FROM app_ledger")).rows[0].count);
    mode="invalid";const malformed=await requestImage();
    if(baseline){assert.equal(malformed.status,200);assert.equal((await malformed.json()).passed,false);console.log("BASELINE_ROUTE=CONFIRMED EMPTY_JSON_MISCLASSIFIED_AS_FAILED");}
    else {assert.equal(malformed.status,502);assert.equal((await malformed.json()).code,"VISION_RESPONSE_INVALID");console.log("PASS malformed review remains unverified, not image-quality failure");}
    mode="valid";delay=16_000;
    if(baseline){await assert.rejects(run(),/工具超时\(15s\)/);console.log("BASELINE_TOOL=CONFIRMED REVIEW_OVER_15S_TIMES_OUT");return;}
    const delayed=await run();assert.equal((delayed.details as any).verificationStatus,"passed");assert.equal(describeNaumiTools([tool])[0].timeoutMs,100_000);console.log("PASS real vision HTTP taking 16s completes under dedicated 100s budget");
    delay=0;mode="failed";const failed=await run();assert.equal((failed.details as any).verificationStatus,"failed");assert.equal((failed.details as any).passed,false);
    mode="upstream-error";const before=models.length;const unavailable=await run();assert.equal(models.length,before+1);assert.equal((unavailable.details as any).verificationStatus,"unavailable");assert.ok(!("passed" in (unavailable.details as any)));assert.ok(!JSON.stringify(unavailable).includes("secret-provider-detail"));assert.match(JSON.stringify(unavailable),/不要因此重新生成/);
    mode="invalid";assert.equal(((await run()).details as any).verificationStatus,"unavailable");
    const badImage=await requestImage(false);assert.equal(badImage.status,400);assert.equal((await badImage.json()).code,"VISION_IMAGE_INVALID");
    const unauth=new Request(f.origin+"/api/agent/verify-image",{method:"POST"});assert.equal((await POST(unauth)).status,401);
    mode="valid";delay=1000;const controller=new AbortController();const pending=run(controller.signal);setTimeout(()=>controller.abort(),80);await assert.rejects(pending);delay=0;
    assert.equal(Number((await f.sql.query("SELECT count(*) FROM app_ledger")).rows[0].count),ledgerBefore);assert.ok(paths.every(p=>!p.includes("generate-image")));assert.match(AGENT_SYSTEM_PROMPT,/verificationStatus=unavailable/);
    console.log("VISION_REVIEW=PASS MANAGED_BINDING=PASS SLOW_16S=PASS INVALID_RESULT=UNVERIFIED FAILURE=ISOLATED ABORT=PROPAGATED AUTH=PASS LEDGER=UNCHANGED GENERATION_CALLS=0 REAL_PROVIDER_CALLS=0");
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
