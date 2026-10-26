import assert from "node:assert/strict";
import {createRequire} from "node:module";
import vm from "node:vm";
import path from "node:path";
import {build} from "esbuild";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const originalFetch = globalThis.fetch;
const calls: string[] = [];
const fetchCalls: Array<{ url: string; method: string; headers: Headers; redirect?: RequestRedirect }> = [];
const createIdempotencyKeys: string[] = [];
let forcedPollResponse: "html" | "empty" | "unknown" | "" = "";
let kieOfficialPayload: unknown = null;
let geminiOfficialPayload: unknown = null;
let minimaxOfficialPayload: unknown = null;
let geminiMediaMode: "direct" | "redirect" | "external" | "" = "";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  // The actual cost/transport boundary passes Request objects, not necessarily
  // a URL + init pair. Observe their real method/headers without changing cases.
  const request = new Request(input, init), url = request.url, method = request.method;
  fetchCalls.push({ url, method, headers: request.headers, redirect: request.redirect });
  calls.push(`${method} ${url}`);
  if (method === "POST" && !url.endsWith("/task/openapi/outputs")) {
    const requestHeaders = request.headers;
    createIdempotencyKeys.push(
      requestHeaders.get("Idempotency-Key") || requestHeaders.get("X-Idempotency-Key") || ""
    );
  }
  if (url.endsWith("/content") || url.endsWith("/result.mp4")) {
    return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (forcedPollResponse && url.includes("/jobs/recordInfo")) {
    if (forcedPollResponse === "html") return new Response("<html>upstream proxy</html>", { status: 200, headers: { "content-type": "text/html" } });
    if (forcedPollResponse === "empty") return json({});
    return json({ status: "mystery-provider-state" });
  }
  if (kieOfficialPayload && url.includes("/jobs/recordInfo")) {
    return json(kieOfficialPayload);
  }
  if (geminiOfficialPayload && url.includes("/v1beta/operations/")) {
    return json(geminiOfficialPayload);
  }
  if (minimaxOfficialPayload && url.includes("/v2/query/video_generation/")) {
    return json(minimaxOfficialPayload);
  }
  if (geminiMediaMode && url === "https://fixture.test/gemini/media/video-1") {
    if (geminiMediaMode === "redirect") {
      return new Response(null, { status: 302, headers: { location: "https://cdn.fixture.test/final.mp4" } });
    }
    return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (geminiMediaMode === "redirect" && url === "https://cdn.fixture.test/final.mp4") {
    return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (geminiMediaMode === "external" && url === "https://signed.example.test/external.mp4") {
    return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (url.endsWith("/task/openapi/outputs")) return json({ code: 0, data: [{ fileUrl: "https://fixture.test/result.mp4" }] });
  if (method === "POST") {
    if (url.includes("predictLongRunning")) return json({ name: "operations/gemini-1" });
    return json({ id: `${url.includes("createTask") ? "kie" : "task"}-1`, status: "queued" });
  }
  if (url.includes("/v1beta/operations/")) {
    return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://fixture.test/result.mp4" } }] } } });
  }
  if (url.includes("/v2/query/video_generation/")) {
    return json({ task: { id: "task-1", status: "succeeded", content: { url: "https://fixture.test/result.mp4" } } });
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
  process.env[`VIDEO_${prefix}_IDEMPOTENCY_STRATEGY`] = prefix === "KIE" ? "none" : "header";
}

async function main() {
// Execute actual adapter/decoder/download sources while replacing only the
// network transport port. Production modelEndpointFetch uses node:http rather
// than global fetch, so a fetch-only fixture must not import that live port.
const bundled=await build({stdin:{contents:`export {getVideoProvider} from './src/lib/video/providers/adapter';export {openAiVideosAdapter} from './src/lib/video/providers/openai-videos';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:"node",format:"cjs",external:["pg","sharp"],alias:{"server-only":path.resolve("scripts/fleet-server-only.cjs")},tsconfig:"tsconfig.json",
  plugins:[{name:"fixture-transport-port",setup(b){b.onLoad({filter:/[\\/]model-config[\\/]transport\.ts$/},()=>({contents:"export function modelEndpointFetch(){return (input,init)=>globalThis.fetch(new Request(input,{...init,redirect:'manual'}))}",loader:"ts"}));}}]});
const projected={exports:{} as {getVideoProvider:typeof import('../src/lib/video/providers/adapter')['getVideoProvider'];openAiVideosAdapter:typeof import('../src/lib/video/providers/openai-videos')['openAiVideosAdapter']}};
vm.runInNewContext(bundled.outputFiles[0].text,{module:projected,exports:projected.exports,require:createRequire(import.meta.url),
  fetch:globalThis.fetch,console,process,Error,Buffer,URL,URLSearchParams,Request,Response,Headers,FormData,Blob,File,AbortSignal,AbortController,
  ReadableStream,TransformStream,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,setInterval,clearInterval},{filename:'actual-provider-fixture.cjs',timeout:5000});
const {getVideoProvider,openAiVideosAdapter}=projected.exports;

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
assert.ok(calls.some((call) => call.includes("/models/fixture-model:predictLongRunning")), "Gemini must route the selected model, not the provider default");
assert.ok(calls.some((call) => call.includes("video_generation")));
assert.ok(calls.some((call) => call.includes("comfyui_workflow/fixture-model")), "AutoDL must route the selected workflow, not the provider default");
assert.ok(calls.some((call) => call.includes("task/openapi/create")));
assert.equal(createIdempotencyKeys.length, 8, "all provider create calls captured");
assert.equal(createIdempotencyKeys[2], "", "KIE none strategy performs the first create without claiming idempotency");
assert.ok(createIdempotencyKeys.every((key, index) => index === 2 || key === request.idempotencyKey), "declared header providers forward stable idempotency key");
assert.equal(calls.filter((call) => call.includes("/jobs/createTask")).length, 1, "none strategy still permits exactly one initial create");
const gemini = getVideoProvider("gemini-veo");
assert.ok(gemini, "Gemini fixture adapter exists");
const geminiSnapshot = { ...request, providerId: "gemini-veo", id: "gemini-official", email: "fixture@example.com", upstreamTaskId: "operations/gemini-official", parameters: {}, references: [] };
geminiOfficialPayload = { done: false };
assert.equal((await gemini.poll(geminiSnapshot)).status, "processing", "Gemini done=false maps to processing");
geminiOfficialPayload = { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://fixture.test/gemini/media/video-1" } }] } } };
const completedGemini = await gemini.poll(geminiSnapshot);
assert.equal(completedGemini.status, "completed", "Gemini nested generatedSamples URI maps to completed");
assert.equal(completedGemini.resultUrl, "https://fixture.test/gemini/media/video-1", "Gemini official media URI is retained");
geminiOfficialPayload = { done: true, error: { code: 13, message: "provider rejected fixture" } };
const failedGemini = await gemini.poll(geminiSnapshot);
assert.equal(failedGemini.status, "failed", "Gemini operation error maps to failed");
assert.equal(failedGemini.errorCode, "13", "Gemini operation error code is retained");
assert.equal(failedGemini.errorMessage, "provider rejected fixture", "Gemini operation error message is retained");
geminiOfficialPayload = { done: true, response: { generateVideoResponse: { generatedSamples: [] } } };
await assert.rejects(
  () => gemini.poll(geminiSnapshot),
  (error: unknown) => error instanceof Error && error.name === "TransientPollError",
  "Gemini done=true without media URI must retry"
);
geminiOfficialPayload = null;

geminiMediaMode = "direct";
let fetchStart = fetchCalls.length;
await gemini.fetchResult(geminiSnapshot, { status: "completed", progress: 100, resultUrl: "https://fixture.test/gemini/media/video-1" });
let mediaCalls = fetchCalls.slice(fetchStart);
assert.equal(mediaCalls[0]?.headers.get("x-goog-api-key"), "fixture-key", "Gemini same-origin media request carries x-goog-api-key");
assert.equal(mediaCalls[0]?.redirect, "manual", "Gemini media redirects are inspected manually");
geminiMediaMode = "redirect";
fetchStart = fetchCalls.length;
await gemini.fetchResult(geminiSnapshot, { status: "completed", progress: 100, resultUrl: "https://fixture.test/gemini/media/video-1" });
mediaCalls = fetchCalls.slice(fetchStart);
assert.equal(mediaCalls[0]?.headers.get("x-goog-api-key"), "fixture-key", "Gemini redirect first hop carries x-goog-api-key");
assert.equal(mediaCalls[1]?.url, "https://cdn.fixture.test/final.mp4", "Gemini follows cross-origin media redirect");
assert.equal(mediaCalls[1]?.headers.get("x-goog-api-key"), null, "Gemini cross-origin redirect strips x-goog-api-key");
geminiMediaMode = "external";
fetchStart = fetchCalls.length;
await gemini.fetchResult(geminiSnapshot, { status: "completed", progress: 100, resultUrl: "https://signed.example.test/external.mp4" });
mediaCalls = fetchCalls.slice(fetchStart);
assert.equal(mediaCalls[0]?.headers.get("x-goog-api-key"), null, "Gemini external signed URL never receives x-goog-api-key");
geminiMediaMode = "";

const minimax = getVideoProvider("minimax-h3");
assert.ok(minimax, "MiniMax fixture adapter exists");
const minimaxSnapshot = { ...request, providerId: "minimax-h3", id: "minimax-official", email: "fixture@example.com", upstreamTaskId: "task/id with space", parameters: {}, references: [] };
for (const state of ["queued", "running"]) {
  minimaxOfficialPayload = { task: { id: "task/id with space", status: state } };
  assert.equal((await minimax.poll(minimaxSnapshot)).status, "processing", `MiniMax ${state} maps to processing`);
}
assert.ok(calls.some((call) => call.includes("/v2/query/video_generation/task%2Fid%20with%20space")), "MiniMax uses the official path-segment query endpoint");
minimaxOfficialPayload = { task: { id: "task/id with space", status: "succeeded", content: { url: "https://fixture.test/result.mp4" } } };
const completedMiniMax = await minimax.poll(minimaxSnapshot);
assert.equal(completedMiniMax.status, "completed", "MiniMax succeeded maps to completed");
assert.equal(completedMiniMax.resultUrl, "https://fixture.test/result.mp4", "MiniMax task.content.url is retained");
for (const state of ["failed", "cancelled"]) {
  minimaxOfficialPayload = { task: { id: "task/id with space", status: state, error: { code: "MM_FIXTURE", message: `${state} fixture` } } };
  const failedMiniMax = await minimax.poll(minimaxSnapshot);
  assert.equal(failedMiniMax.status, "failed", `MiniMax ${state} maps to failed`);
  assert.equal(failedMiniMax.errorCode, "MM_FIXTURE", `MiniMax ${state} error code is retained`);
  assert.equal(failedMiniMax.errorMessage, `${state} fixture`, `MiniMax ${state} error message is retained`);
}
minimaxOfficialPayload = { task: { id: "task/id with space", status: "succeeded", content: {} } };
await assert.rejects(
  () => minimax.poll(minimaxSnapshot),
  (error: unknown) => error instanceof Error && error.name === "TransientPollError",
  "MiniMax succeeded without task.content.url must retry"
);
minimaxOfficialPayload = null;

const kie = getVideoProvider("kie");
assert.ok(kie, "KIE fixture adapter exists");
const malformedSnapshot = { ...request, providerId: "kie", id: "malformed", email: "fixture@example.com", upstreamTaskId: "kie-malformed", parameters: {}, references: [] };
for (const mode of ["html", "empty", "unknown"] as const) {
  forcedPollResponse = mode;
  await assert.rejects(
    () => kie.poll(malformedSnapshot),
    (error: unknown) => error instanceof Error && error.name === "TransientPollError",
    `2xx ${mode} poll response must consume transient/unknown-status budget`
  );
}
forcedPollResponse = "";
kieOfficialPayload = {
  code: 200,
  msg: "success",
  data: {
    state: "success",
    resultJson: JSON.stringify({ resultUrls: ["https://fixture.test/result.mp4"] }),
  },
};
const officialKie = await kie.poll(malformedSnapshot);
kieOfficialPayload = null;
assert.equal(officialKie.status, "completed", "Kie official data.state success maps to completed");
assert.equal(officialKie.resultUrl, "https://fixture.test/result.mp4", "Kie resultJson resultUrls is unpacked");
assert.equal(officialKie.errorMessage, undefined, "Kie top-level msg=success is not treated as an error");
for (const state of ["waiting", "queuing", "generating"]) {
  kieOfficialPayload = { code: 200, msg: "success", data: { state } };
  const running = await kie.poll(malformedSnapshot);
  assert.equal(running.status, "processing", `Kie ${state} maps to processing`);
}
kieOfficialPayload = { code: 200, msg: "success", data: { state: "fail", failMsg: "provider rejected fixture" } };
const failedKie = await kie.poll(malformedSnapshot);
assert.equal(failedKie.status, "failed", "Kie fail maps to failed");
assert.equal(failedKie.errorMessage, "provider rejected fixture", "Kie failMsg is retained");
for (const resultJson of [JSON.stringify({ resultUrls: [] }), "{invalid-json"]) {
  kieOfficialPayload = { code: 200, msg: "success", data: { state: "success", resultJson } };
  await assert.rejects(
    () => kie.poll(malformedSnapshot),
    (error: unknown) => error instanceof Error && error.name === "TransientPollError",
    "Kie success without a usable result URL must retry instead of using generic content endpoint"
  );
}
kieOfficialPayload = null;
console.log(`PASS video provider fixtures: ${calls.length} HTTP calls across 8 protocols idempotency=declared first_none_create=1`);
globalThis.fetch = originalFetch;
}

void main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
