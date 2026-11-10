import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { ModelConfig, ModelSnapshot } from "../src/lib/model-config/types";
import type { ModelExecutionScope } from "../src/lib/model-config/context";

async function main() {
  if (!existsSync(path.resolve("src/lib/audio/model-execution.ts"))) {
    console.log("AUDIO_MODEL=FAIL AUDIO_MODEL_MISSING"); process.exitCode = 1; return;
  }
  const { executeSpeech, executeTranscription, AudioExecutionError } = await import("../src/lib/audio/model-execution");
  const { validateModelConfig } = await import("../src/lib/model-config/schema");
  const { createModelExecutor } = await import("../src/lib/model-config/execution");
  const { currentModelExecution } = await import("../src/lib/model-config/context");
  const { publicModelCatalog } = await import("../src/lib/model-config/public-catalog");
  const { fixtureModelConfig } = await import("./model-config-unit-fixture");
  const { fixtureConfig, facts } = await import("./billing-unit-fixture");
  const { validateBillingConfig } = await import("../src/lib/billing/rules/schema");
  const { quote } = await import("../src/lib/billing/quote");
  const { modelCostPhase } = await import("../src/lib/supplier-cost/phase");
  let checks = 0, calls = 0, mode = "valid";
  const pass = () => checks++;
  const requests: Array<{ path: string; headers: Headers; bytes: Buffer }> = [];
  const wav = Buffer.alloc(8044); wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(8000, 40);
  for (let n = 0; n < 4000; n++) wav.writeInt16LE(Math.round(5000 * Math.sin(2 * Math.PI * 440 * n / 8000)), 44 + n * 2);
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    calls++; requests.push({ path: request.url!, headers: new Headers(request.headers as Record<string, string>), bytes: Buffer.concat(chunks) });
    if (mode === "timeout") { setTimeout(() => response.end(), 150); return; }
    if (mode === "drop") { response.destroy(); return; }
    if (mode === "redirect") { response.writeHead(307, { location: "http://169.254.169.254/latest" }); response.end(); return; }
    if (mode.startsWith("http-")) { response.writeHead(Number(mode.slice(5)), { "content-type": "application/json" }); response.end('{"error":"fixture-private-secret-must-not-leak"}'); return; }
    if (mode === "broken") { response.writeHead(200, { "content-type": "audio/wav", "content-length": wav.length }); response.write(wav.subarray(0, 100)); setTimeout(() => response.destroy(), 10); return; }
    if (request.url === "/v1/audio/speech") {
      response.writeHead(200, { "content-type": mode === "mime" ? "application/json" : "audio/wav", "x-request-id": "speech-fixture-request" });
      response.end(mode === "fake" ? Buffer.from("not-a-wave-file".repeat(30)) : mode === "empty" ? Buffer.alloc(0) : wav); return;
    }
    if (request.url === "/v1/audio/transcriptions") {
      response.writeHead(200, { "content-type": "application/json", "x-request-id": "transcription-fixture-request" });
      const result = mode === "missing" ? { text: "爸爸，我到了。" } : mode === "invalid-json" ? "bad" : {
        text: "爸爸，我到了。", language: "zh", duration: 0.5,
        segments: [{ id: 0, start: 0, end: mode === "range" ? 2 : 0.5, text: "爸爸，我到了。" }], words: [{ start: 0, end: 0.5, word: "爸爸" }],
        usage: { type: "duration", seconds: 0.5 },
      };
      response.end(mode === "invalid-json" ? result : JSON.stringify(result)); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const options = { trustedOrigins: [origin] };
  const config = fixtureModelConfig(`${origin}/v1`, randomUUID());
  config.providers.push({ ...config.providers[0], id: "audio-provider", protocol: "openai-audio", credentialRef: randomUUID() });
  config.upstreamModels.push({ ...structuredClone(config.upstreamModels[0]), id: "audio-upstream", providerId: "audio-provider", model: "explicit-audio-wire", modality: "audio", parameterMap: {}, procurement: undefined,
    capabilities: { verified: true, generate: true, transcribe: true, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 1, qualities: [], nativeResolutions: [], maxReferenceImages: 0, expectedLatencyMs: 1000,
      audio: { speech: { enabled: true, voices: ["published_voice"], formats: ["wav"], maxCharacters: 30, maxOutputBytes: wav.length, instructions: false, speed: { min: 0.8, max: 1.2 } },
        transcription: { enabled: true, inputFormats:["audio/wav" as const], formats: ["json", "verbose_json"], timestamps: ["segment", "word"], maxInputBytes: wav.length, maxDurationSeconds: 0.5, language: true, prompt: false } } } });
  config.publicModels.push({ id: "audio-public", label: "测试声音", modality: "audio", enabled: true, visible: true, target: { type: "upstream", id: "audio-upstream" }, toolScope: { features: ["audio.speech", "audio.transcribe"], defaultFor: [] } });
  config.bindings["audio.speech"] = "audio-public"; config.bindings["audio.transcribe"] = "audio-public";
  let active = validateModelConfig(config, options); pass();
  const mutate = (change: (c: ModelConfig) => void) => { const c = structuredClone(config); change(c); return c; };
  for (const change of [
    (c: ModelConfig) => { c.upstreamModels[1].modality = "video"; },
    (c: ModelConfig) => { c.upstreamModels[1].capabilities.audio!.speech!.voices = []; },
    (c: ModelConfig) => { c.upstreamModels[1].capabilities.verified = false; },
    (c: ModelConfig) => { c.upstreamModels[1].capabilities.audio!.transcription!.formats = ["json"]; },
    (c: ModelConfig) => { c.upstreamModels[1].capabilities.maxReferenceImages = 1; },
    (c: ModelConfig) => { c.upstreamModels[1].parameterMap = { resolution: { "1K": "1024" } }; },
    (c: ModelConfig) => { c.providers[1].options = { pollPath: "/poll/{id}" }; },
    (c: ModelConfig) => { c.publicModels[1].supplierRouting = { mode: "priority", channels: [{ upstreamId: "audio-upstream", priority: 1, weight: 1, enabled: true }] }; },
    (c: ModelConfig) => { c.bindings["audio.transcribe"] = "image-a"; },
    (c: ModelConfig) => { c.upstreamModels[1].capabilities.audio!.speech!.speed = { min: 2, max: 1 }; },
  ]) { assert.throws(() => validateModelConfig(mutate(change), options)); pass(); }
  const disabled = mutate(c => { c.upstreamModels[1].capabilities.generate = false; delete c.bindings["audio.speech"]; c.publicModels[1].toolScope!.features = ["audio.transcribe"]; });
  assert.ok(validateModelConfig(disabled, options)); pass();
  const snapshot: ModelSnapshot = { version: 7, digest: "a".repeat(64), config: active };
  const billing = { version: 2, config: fixtureConfig() };
  const executor = createModelExecutor({ runtime: { byVersion: async v => { assert.equal(v, 7); return snapshot; }, prepareExecution: async () => { throw Error("audio must not enter image Router"); } },
    credentials: { read: async () => "isolated-fixture-key" }, gateway: () => { throw Error("audio must not enter gateway"); }, ...options });
  const frozenSpeech = await executor.resolve({ binding: "audio.speech", feature: "audio.speech", snapshot, billing });
  const frozenTranscribe = await executor.resolve({ binding: "audio.transcribe", feature: "audio.transcribe", snapshot, billing });
  const described = await executor.describe(frozenSpeech); assert.equal(described.connection.wireModel, "explicit-audio-wire"); assert.equal(described.frozen.modelVersion, 7); pass();
  await executor.runBundle({ modelVersion: 7, billingVersion: 2, primary: "audio", audio: frozenSpeech }, billing, async () => {
    assert.equal(currentModelExecution("audio")?.frozen.binding, "audio.speech"); assert.equal(currentModelExecution("video"), null); pass();
  }, snapshot);
  await assert.rejects(() => executor.describe({ ...frozenSpeech, modelDigest: "b".repeat(64) })); pass();
  const catalog = publicModelCatalog(snapshot, "audio", "audio.speech");
  assert.equal(catalog.models.length, 1); assert.ok("supportsSpeech" in catalog.models[0]); assert.equal(catalog.models[0].supportsSpeech, true); assert.ok(!JSON.stringify(catalog).includes("credentialRef")); assert.ok(!JSON.stringify(catalog).includes(origin)); pass();
  assert.equal(publicModelCatalog({ ...snapshot, config: disabled }, "audio", "audio.speech").models.length, 0); pass();
  const oldBilling = structuredClone(billing.config); delete (oldBilling.features as any)["audio.speech"]; delete (oldBilling.features as any)["audio.transcribe"];
  assert.equal(validateBillingConfig(oldBilling).features["audio.speech"].enabled, false); pass();
  const explicit = structuredClone(billing.config); explicit.features["audio.speech"].enabled = true; explicit.features["audio.speech"].pricing = { mode: "fixed", credits: 0 };
  assert.equal(validateBillingConfig(explicit).features["audio.speech"].enabled, true); assert.equal(quote({ version: 2, config: explicit }, facts({ feature: "audio.speech" })).requestedCredits, 0); pass();
  assert.equal(modelCostPhase("audio.speech", "audio"), "speech-generation"); assert.equal(modelCostPhase("audio.transcribe", "audio"), "transcription"); pass();
  // Model transport's live negative switch is exercised by the separate PG test.
  const speechScope: ModelExecutionScope = { ...described, channelGuard: undefined };
  const asrScope = { ...await executor.describe(frozenTranscribe), channelGuard: undefined };
  const speech = { text: "爸爸，我到了。", voice: "published_voice", format: "wav" as const };
  const asr = { bytes: wav, mimeType: "audio/wav" as const, durationSeconds: 0.5, format: "verbose_json" as const, timestamps: ["segment" as const, "word" as const], language: "zh" };
  try {
    const result = await executeSpeech(speechScope, speech, options);
    assert.deepEqual(Buffer.from(result.bytes), wav); assert.equal(result.sha256, createHash("sha256").update(wav).digest("hex")); assert.equal(result.textSha256, createHash("sha256").update(speech.text).digest("hex")); pass();
    assert.deepEqual(JSON.parse(requests[0].bytes.toString()), { model: "explicit-audio-wire", input: speech.text, voice: "published_voice", response_format: "wav" }); assert.equal(requests[0].headers.get("authorization"), "Bearer isolated-fixture-key"); pass();
    const t = await executeTranscription(asrScope, asr, options);
    assert.equal(t.text, speech.text); assert.equal(t.timing, "supplier-timestamps"); assert.equal(t.segments?.[0].end, 0.5); assert.equal(t.words?.[0].word, "爸爸"); pass();
    const form = await new Request(`${origin}${requests[1].path}`, { method: "POST", headers: requests[1].headers, body: Uint8Array.from(requests[1].bytes) }).formData();
    assert.equal(form.get("model"), "explicit-audio-wire"); assert.deepEqual(form.getAll("timestamp_granularities[]"), ["segment", "word"]); assert.deepEqual(Buffer.from(await (form.get("file") as File).arrayBuffer()), wav); assert.equal(form.get("language"), "zh"); pass();
    const before = calls;
    for (const input of [{ ...speech, voice: "guessed_voice" }, { ...speech, text: "x".repeat(31) }, { ...speech, speed: 2 }, { ...speech, instructions: "whisper" }, { ...speech, format: "pcm" }]) {
      await assert.rejects(() => executeSpeech(speechScope, input as any, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "not-dispatched"); pass();
    }
    for (const input of [{ ...asr, bytes: Buffer.alloc(wav.length + 1) }, { ...asr, durationSeconds: 0.6 }, { ...asr, prompt: "guess" }, { ...asr, mimeType:"video/mp4" }, { ...asr, format: "json" }, { ...asr, bytes: Buffer.alloc(0) }, { ...asr, timestamps: ["segment", "segment"] }]) {
      await assert.rejects(() => executeTranscription(asrScope, input as any, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "not-dispatched"); pass();
    }
    await assert.rejects(() => executeSpeech(asrScope, speech, options));
    const aborted = new AbortController(); aborted.abort(); await assert.rejects(() => executeSpeech(speechScope, speech, options, aborted.signal)); assert.equal(calls, before); pass();
    for (const m of ["fake", "mime", "empty", "broken", "drop", "redirect", "http-500", "http-408", "http-409"]) {
      mode = m; const previous = calls;
      await assert.rejects(() => executeSpeech(speechScope, speech, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "unknown" && !e.message.includes("fixture-private"));
      assert.equal(calls, previous + 1, "one attempt, zero retry/fallback"); pass();
    }
    for (const m of ["http-400", "http-401", "http-403", "http-404", "http-413", "http-415", "http-422", "http-429"]) {
      mode = m; const previous = calls;
      await assert.rejects(() => executeSpeech(speechScope, speech, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "rejected" && !e.message.includes("fixture-private")); assert.equal(calls, previous + 1); pass();
    }
    mode = "timeout"; await assert.rejects(() => executeSpeech({ ...speechScope, connection: { ...speechScope.connection, timeoutMs: 30 } }, speech, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "unknown"); pass();
    for (const m of ["range", "missing", "invalid-json"]) { mode = m; await assert.rejects(() => executeTranscription(asrScope, asr, options), (e: unknown) => e instanceof AudioExecutionError && e.acceptance === "unknown"); pass(); }
    mode = "valid";
    const noTiming = await executeTranscription(asrScope, { ...asr, format: "json", timestamps: [] }, options);
    assert.equal(noTiming.timing, "untimed"); assert.equal(noTiming.segments, undefined); assert.equal(noTiming.words, undefined); pass();
    const limited = structuredClone(speechScope); limited.capabilities.audio!.speech!.maxOutputBytes = 100;
    await assert.rejects(() => executeSpeech(limited, speech, options), (e: unknown) => e instanceof AudioExecutionError && e.code === "AUDIO_RESULT_TOO_LARGE" && e.acceptance === "unknown"); pass();
    assert.deepEqual(config.upstreamModels[0], fixtureModelConfig(`${origin}/v1`, config.providers[0].credentialRef!).upstreamModels[0]); pass();
    console.log(`AUDIO_MODEL=PASS CHECKS=${checks} HTTP_ATTEMPTS=${calls} RETRIES=0 FALLBACKS=0 REAL_VENDOR_CALLS=0 PUBLIC_GENERATION_ROUTES=0`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
