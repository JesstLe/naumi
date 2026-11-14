import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateCanvasVideoBatch, videoBatchQuote, hasCanvasVideoBatch } from "../src/lib/video/canvas-batch-client";
import { validateVideoOptimizedPrompt } from "../src/lib/video/prompt-assist";
import { reconcileVideoSettings, validateVideoSettings, videoDurations, videoResolutions } from "../src/lib/video/legacy-client-settings";
import type { CanvasVideoNode } from "../src/lib/canvas/video-node-schema";
import type { PublicQuote } from "../src/lib/billing/client";

async function main() {
  const cap = { sources: {}, modes: ["text"] as ["text"], durationResolutionMap: [{ durations: [5, 10], resolutions: ["720p", "1080p"] }, { durations: [15], resolutions: ["720p"] }], aspectRatios: ["adaptive", "16:9"], audio: "optional" as const };
  assert.deepEqual(videoDurations(cap), [5, 10, 15]);
  const chosen = reconcileVideoSettings({ modelId: "fixture", mode: "text", prompt: "完整视频", durationSeconds: 15, resolution: "1080p", aspectRatio: "16:9", generateAudio: false }, cap);
  assert.equal(chosen.config.resolution, "720p"); assert.equal(chosen.config.generateAudio, false);
  assert.deepEqual(videoResolutions(cap, 15), ["720p"]); assert.equal(validateVideoSettings(chosen.config, [], cap), null);
  assert.equal(reconcileVideoSettings(chosen.config, { ...cap, audio: "required" }).config.generateAudio, true);
  assert.equal(reconcileVideoSettings(chosen.config, { ...cap, audio: null }).config.generateAudio, undefined);
  const long = "完整对白。".repeat(200) + "{{ref 1}} 最后一句不能删。";
  assert.equal(validateVideoOptimizedPrompt(long, long + "镜头缓慢推进。", "stop"), long + "镜头缓慢推进。");
  assert.throws(() => validateVideoOptimizedPrompt(long, "{{ref 2}}", "stop"));
  assert.throws(() => validateVideoOptimizedPrompt(long, long, "length"));
  const quote: PublicQuote = { feature: "video.generate", version: 3, credits: 12, reserveCredits: 20, authorizedCredits: 20, quantity: 1, mode: "api-cost-plus" };
  assert.deepEqual(videoBatchQuote(quote, 4), { ...quote, quantity: 4, credits: 48, reserveCredits: 80, authorizedCredits: 80 });
  const map = new Map<string, string>(), storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
  const node = { id: "fixture-node", projectKey: "tree:fixture-node", title: "Video", config: chosen.config, inputs: [], revision: 2 } as unknown as CanvasVideoNode;
  let posts = 0, saves = 0, accepted = false, failResponse = true, lastId = "";
  const run = { nodes: [{ id: node.id, status: "processing", taskId: "task" }] };
  const options = { email: "fixture@example.test", nodeId: node.id, draft: { title: node.title, config: node.config, inputs: [], expectedRevision: 1 }, count: 4, quote: videoBatchQuote(quote, 4), storage,
    assertCurrent() {}, onPersisted(revision: number) { assert.equal(revision, 2); }, async save() { saves++; return node; },
    async request() { return accepted ? Response.json({ runId: lastId, run }) : Response.json({}, { status: 404 }); },
    async submit(_url: string, init: RequestInit) { posts++; const body = JSON.parse(String(init.body)); assert.equal(body.billingCredits, 80); lastId = body.idempotencyKey; assert.match(lastId, /^[\da-f-]{36}$/); accepted = true; if (failResponse) throw new Error("lost response"); return Response.json({ run }); },
  };
  await assert.rejects(generateCanvasVideoBatch(options), /lost response/);
  assert.equal(hasCanvasVideoBatch(storage, options.email, node.id), true);
  run.nodes[0].status = "pending";
  await assert.rejects(generateCanvasVideoBatch(options), /批次正在准备/); assert.equal(posts, 1); assert.equal(map.size, 1);
  run.nodes[0].status = "processing";
  assert.deepEqual(await generateCanvasVideoBatch({ ...options, count: 1 }), run); // Switching quantity cannot escape a pending receipt.
  assert.equal(posts, 1); assert.equal(saves, 1); assert.equal(map.size, 0);
  accepted = false; failResponse = false;
  await generateCanvasVideoBatch(options); assert.equal(posts, 2); assert.equal(saves, 2);
  storage.setItem(`naumi:canvas-video-batch:${options.email}:${node.id}`, JSON.stringify({ draft: "other", body: { idempotencyKey: randomUUID(), count: 4 } }));
  accepted = false; await assert.rejects(generateCanvasVideoBatch(options), /恢复原参数/); assert.equal(posts, 2);
  console.log("VIDEO_NODE_CONTROLS=PASS sparse_duration_resolution audio_policy long_prompt_refs total_quote lost_response_recovery no_replay");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
