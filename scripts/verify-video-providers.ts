import assert from "node:assert/strict";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const originalFetch = globalThis.fetch;
const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method || "GET"} ${url}`);
  if (url.endsWith("/content") || url.endsWith("/result.mp4")) {
    return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (url.endsWith("/task/openapi/outputs")) return json({ code: 0, data: [{ fileUrl: "https://fixture.test/result.mp4" }] });
  if (init?.method === "POST") {
    if (url.includes("predictLongRunning")) return json({ name: "operations/gemini-1" });
    return json({ id: `${url.includes("createTask") ? "kie" : "task"}-1`, status: "queued" });
  }
  return json({ status: "completed", progress: 100, video_url: "https://fixture.test/result.mp4" });
}) as typeof fetch;

process.env.VIDEO_API_BASE_URL = "https://fixture.test/openai";
process.env.VIDEO_API_KEY = "fixture-key";
process.env.VIDEO_API_MODEL = "fixture-model";
for (const [prefix, base, model] of [
  ["ARK", "https://fixture.test/ark", "seedance"],
  ["KIE", "https://fixture.test/kie", "kling"],
  ["APIMART", "https://fixture.test/apimart", "video-model"],
  ["GEMINI", "https://fixture.test/gemini", "veo-3"],
  ["MINIMAX", "https://fixture.test/minimax", "h3"],
  ["AUTODL", "https://fixture.test/autodl", "workflow"],
  ["RUNNINGHUB", "https://fixture.test/runninghub", "workflow"],
] as const) {
  process.env[`VIDEO_${prefix}_BASE_URL`] = base;
  process.env[`VIDEO_${prefix}_API_KEY`] = "fixture-key";
  process.env[`VIDEO_${prefix}_MODEL`] = model;
}

async function main() {
const { getVideoProvider } = await import("@/lib/video/providers/adapter");
const { openAiVideosAdapter } = await import("@/lib/video/providers/openai-videos");

const request = {
  source: "workbench" as const,
  providerId: "fixture",
  modelId: "fixture-model",
  prompt: "a product rotating in studio light",
  durationSeconds: 4,
  resolution: "1280x720",
  references: [],
  idempotencyKey: "fixture-idem",
};

const openCreated = await openAiVideosAdapter.create(request);
assert.equal(openCreated.upstreamTaskId, "task-1");
const openPoll = await openAiVideosAdapter.poll({ ...request, id: "local", email: "fixture@example.com", upstreamTaskId: openCreated.upstreamTaskId, parameters: {}, references: [] });
assert.equal(openPoll.status, "completed");
const openResult = await openAiVideosAdapter.fetchResult({ ...request, id: "local", email: "fixture@example.com", upstreamTaskId: openCreated.upstreamTaskId, parameters: {}, references: [] }, openPoll);
assert.equal(openResult.mimeType, "video/mp4");

for (const id of ["ark-seedance", "kie", "apimart", "gemini-veo", "minimax-h3", "autodl", "runninghub"]) {
  const adapter = getVideoProvider(id);
  assert.ok(adapter, `${id} adapter should be configured`);
  let created;
  try {
    created = await adapter.create({ ...request, providerId: id, modelId: "fixture-model" });
  } catch (error) {
    console.error("fixture create failure", id, calls.at(-1), error);
    throw error;
  }
  assert.ok(created.upstreamTaskId, `${id} create id`);
  const snapshot = { ...request, providerId: id, modelId: "fixture-model", id: "local", email: "fixture@example.com", upstreamTaskId: created.upstreamTaskId, parameters: {}, references: [] };
  const polled = await adapter.poll(snapshot);
  assert.equal(polled.status, "completed", `${id} poll status`);
  const result = await adapter.fetchResult(snapshot, polled);
  assert.equal(result.mimeType, "video/mp4", `${id} result mime`);
}

assert.ok(calls.some((call) => call.includes("contents/generations/tasks")));
assert.ok(calls.some((call) => call.includes("jobs/createTask")));
assert.ok(calls.some((call) => call.includes("videos/generations")));
assert.ok(calls.some((call) => call.includes("predictLongRunning")));
assert.ok(calls.some((call) => call.includes("video_generation")));
assert.ok(calls.some((call) => call.includes("comfyui_workflow/workflow")));
assert.ok(calls.some((call) => call.includes("task/openapi/create")));
console.log(`PASS video provider fixtures: ${calls.length} HTTP calls across 8 protocols`);
globalThis.fetch = originalFetch;
}

void main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
