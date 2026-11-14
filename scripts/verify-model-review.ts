import assert from "node:assert/strict";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function main() {
  const models: string[] = [];
  const f = await createModelFixture(async (request, response) => {
    const parts: Buffer[] = []; for await (const part of request) parts.push(part);
    const body = Buffer.concat(parts).length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    if (request.url === "/internal/config/prepare") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ digest: body.digest, phase: "prepared" })); return;
    }
    models.push(body.model);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ passed: true, score: 95, summary: "fixture inspected", issues: [], retryAdvice: "" }) } }] }));
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NAUMI_MULTI_USER = "1";
  process.env.VIDEO_WORKER_SECRET = "fixture-review-video-worker-independent-secret";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "fixture-review-control-independent-secret";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET = "fixture-review-envelope-independent-secret";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  process.env.OPENAI_API_KEY = "fixture-review-legacy-never-used";
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
    f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "video-upstream", providerId: "video", model: "fixture-no-reference-video", modality: "video", parameterMap: {}, capabilities: { ...structuredClone(f.config.upstreamModels[0].capabilities), maxReferenceImages: 0, video: { modes: ["text", "reference"], durationResolutionMap: [{ durations: [4], resolutions: ["1280x720"] }], limits: { images: 0, videos: 0, audios: 0 } } } });
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
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } }).png().toBuffer();
    const form = new FormData(); form.set("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
    const { POST } = await import("../src/app/api/agent/verify-image/route");
    const result = await POST(new Request("http://fixture.test/api/agent/verify-image", { method: "POST", headers: { cookie }, body: form }));
    assert.equal(result.status, 200, await result.text());
    assert.equal(models.at(-1), "wire-review", "Actual result-inspection route uses vision.review, independently of Agent vision");
    console.log("PASS explicit reference/review bindings control actual SDK and inspection HTTP supplier calls");
    const { GET: videoCatalog } = await import("../src/app/api/video/catalog/route");
    const catalogResponse = await videoCatalog();
    const catalog = await catalogResponse.json();
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalog.models[0].maxReferenceImages, undefined, "Unbound catalog must not invent a reference limit");
    assert.equal(catalog.models[0].executionStatus, 'mapping_required');
    const { createVideoGeneration } = await import("../src/lib/video/service");
    const beforeVideo = models.length;
    await assert.rejects(withModelRequest(new Request("http://fixture.test/api/video/generate", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ modelId: "video-no-reference" }) }), () => createVideoGeneration(email, { source: "workbench", modelId: "video-no-reference", mode: "reference", prompt: "fixture", durationSeconds: 4, seconds: "4", size: "1280x720", references: [{ id: "fixture-ref", kind: "image", role: "first_frame", url: "https://supplier.invalid/fixture.png" }] })), (error: any) => error.code === "VIDEO_EXECUTION_NOT_CONFIGURED" && error.status === 422 && error.fields.includes("binding"));
    assert.equal(models.length, beforeVideo, "Rejected reference cannot reserve/submit a video");
    assert.equal(Number((await f.sql.query("SELECT count(*) FROM app_video_tasks")).rows[0].count), 0);
    console.log("PASS identity-only video catalog and explicit missing-mapping diagnostic, zero task/supplier creation");
    // Execute the exact SQL shipped inside generated ROLLBACK.sh against real
    // task tables, rather than having a mocked psql return a chosen count.
    const source = await readFile("scripts/deploy-release.sh", "utf8");
    const query = source.split("\n").find(line => line.includes("pending=") && line.includes("app_image_jobs"))?.match(/SELECT \(SELECT.+?;/)?.[0];
    assert.ok(query, "rollback guard query must be present");
    await f.sql.query("INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status,parameters) VALUES('review-held-canvas',$1,'fixture','needs_attention',$2)", [email, { modelExecutions: { modelVersion: 1, billingVersion: 1 } }]);
    await f.sql.query("INSERT INTO app_video_tasks(id,email,upstream_id,status,parameters) VALUES('review-held-video',$1,'accepted-original-task','needs_attention',$2)", [email, { modelExecutions: { modelVersion: 1, billingVersion: 1 } }]);
    assert.equal(Number((await f.sql.query(query)).rows[0]["?column?"]), 2, "Both held versioned Canvas/video tasks must block legacy rollback");
    await f.sql.query("UPDATE app_canvas_image_tasks SET status='completed'");
    await f.sql.query("UPDATE app_video_tasks SET status='completed'");
    assert.equal(Number((await f.sql.query(query)).rows[0]["?column?"]), 0, "Terminal completed tasks do not block rollback");
    console.log("PASS exact shipped rollback SQL blocks both real needs_attention task rows");
    const { setAdminPassword, authenticateAdminPassword } = await import("../src/lib/admin-auth");
    await setAdminPassword("FixtureReviewAccess2026!");
    const adminCookie = `${cookie}; nv_admin=${await authenticateAdminPassword("FixtureReviewAccess2026!")}`;
    const {GET:readinessRoute}=await import('../src/app/api/admin/model-management/route');
    const readinessUrl='http://fixture.test/api/admin/model-management?view=video-execution-readiness';
    assert.equal((await readinessRoute(new Request(readinessUrl))).status,404);
    const readinessResponse=await readinessRoute(new Request(readinessUrl,{headers:{cookie:adminCookie}}));
    assert.equal(readinessResponse.status,200);const readiness=await readinessResponse.json();
    assert.equal(readiness.ready,false);assert.equal(readiness.issues[0].code,'VIDEO_EXECUTION_NOT_CONFIGURED');
    assert(!JSON.stringify(readiness).includes('fixture-review-video'));
    console.log('PASS actual authorized admin readiness route, anonymous denied, missing mapping reported without secret');
    const { modelAdminHandler } = await import("../src/lib/model-config/access");
    const draft = await f.repo.draft(email);
    const notStaged = { id: randomUUID(), draftId: draft.id, expectedRevision: draft.revision, expectedVersion: 999, reason: "fixture stale expected version" };
    const publishRequest = (body: unknown) => new Request("http://fixture.test/api/admin/bi/model-config/publish", { method: "POST", headers: { cookie: adminCookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const rejected = await modelAdminHandler(publishRequest(notStaged), "publish");
    const rejectedBody = await rejected.json();
    assert.equal(rejected.status, 409);
    assert.equal(rejectedBody.code, "CONFIG_CONFLICT");
    await assert.rejects(f.repo.publication(notStaged.id), (error: any) => error.code === "PUBLICATION_UNAVAILABLE");
    assert.equal(rejectedBody.operationNotStaged, true, "Definite rejection before durable staging must release the editor's persistent pending operation");
    const { publicationNotStaged } = await import("../src/lib/model-config/publication-result");
    assert.equal(publicationNotStaged(rejectedBody), true);
    for (const uncertain of [{ code: "CONFIG_CONFLICT" }, { code: "ROUTER_UNAVAILABLE", operationNotStaged: true }, { phase: "unknown" }]) assert.equal(publicationNotStaged(uncertain), false, "Unknown/transport outcomes must retain the operation ID");
    const uncertainId = randomUUID();
    const uncertainResponse = await modelAdminHandler(publishRequest({ ...notStaged, id: uncertainId, expectedVersion: 1 }), "publish");
    const uncertainBody = await uncertainResponse.json();
    assert.equal(uncertainResponse.status, 202);
    assert.equal(uncertainBody.phase, "unknown");
    assert.equal(publicationNotStaged(uncertainBody), false);
    assert.equal((await f.repo.publication(uncertainId)).phase, "unknown");
    console.log("PASS actual unstaged publication conflict permits reset; durable ambiguous publication retains operation ID");
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
