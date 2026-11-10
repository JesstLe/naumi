import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { modelEndpointFetch } from "../model-config/transport";
import type { ModelExecutionScope } from "../model-config/context";
import { ModelConfigError } from "../model-config/types";
import type { ValidationOptions } from "../model-config/schema";
import { markBillingUpstream } from "../billing/synchronous-operation";
import { observeModelCall, modelExecutionTelemetry } from "../bi/model-calls";
import { AUDIO_MIME, SPEECH_FORMATS, TRANSCRIPTION_MIME } from "./model-capabilities";

export class AudioExecutionError extends ModelConfigError {
  constructor(code: string, message: string, public acceptance: "not-dispatched" | "rejected" | "unknown", status: number) {
    super(code, message, status); this.name = "AudioExecutionError";
  }
}
const invalid = (message: string): never => { throw new AudioExecutionError("AUDIO_REQUEST_INVALID", message, "not-dispatched", 400); };
const unknown = (code: string, message: string): never => { throw new AudioExecutionError(code, message, "unknown", 502); };
const speechInput = z.strictObject({
  text: z.string().min(1).max(1000000).refine(v => v.trim().length > 0),
  voice: z.string().min(1).max(100), format: z.enum(SPEECH_FORMATS),
  speed: z.number().finite().optional(), instructions: z.string().max(10000).optional(),
});
const transcriptionInput = z.strictObject({
  bytes: z.instanceof(Uint8Array), mimeType: z.enum(TRANSCRIPTION_MIME),
  durationSeconds: z.number().finite().positive(), format: z.enum(["json", "verbose_json"]),
  timestamps: z.array(z.enum(["segment", "word"])).max(2).refine(v => new Set(v).size === v.length),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/).optional(), prompt: z.string().max(10000).optional(),
});
export type SpeechInput = z.infer<typeof speechInput>;
export type TranscriptionInput = z.infer<typeof transcriptionInput>;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function assertScope(scope: ModelExecutionScope, binding: "audio.speech" | "audio.transcribe") {
  if (scope.frozen.modality !== "audio" || scope.frozen.binding !== binding || scope.connection.protocol !== "openai-audio" || scope.frozen.target.type !== "upstream" || scope.supplierRouting || scope.routing)
    invalid("声音操作需要对应的直连音频用途");
  if (!scope.capabilities.verified) invalid("音频通道能力尚未核验");
}
async function bounded(response: Response, limit: number): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > limit) {
    await response.body?.cancel(); return unknown("AUDIO_RESULT_TOO_LARGE", "声音响应超过已声明大小，保留原操作核对");
  }
  if (!response.body) return unknown("AUDIO_RESULT_INVALID", "声音响应为空，保留原操作核对");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); return unknown("AUDIO_RESULT_TOO_LARGE", "声音响应超过已声明大小，保留原操作核对"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return unknown("AUDIO_RESULT_INVALID", "声音响应为空，保留原操作核对");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** One HTTP attempt, including body consumption, under the existing BI/cost
 * boundary. Durable operation admission/checkpoint/storage belongs to the caller.
 * This adapter never retries, falls back, or treats an unknown attempt as free. */
async function dispatch<T>(scope: ModelExecutionScope, path: string, body: string | FormData, consume: (response: Response) => Promise<T>, options: ValidationOptions, signal?: AbortSignal): Promise<T> {
  const connection = scope.connection;
  const fetcher = modelEndpointFetch(connection.baseUrl, options, { ...connection, costScope: scope });
  const timeout = AbortSignal.timeout(connection.timeoutMs);
  const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  // Abort before observation/dispatch does not create a paid attempt.
  if (combined.aborted) throw new AudioExecutionError("AUDIO_CANCELLED", "声音操作已取消", "not-dispatched", 409);
  return observeModelCall(connection.wireModel, async () => {
    try {
      const response = await fetcher(`${connection.baseUrl.replace(/\/$/, "")}/audio/${path}`, {
        method: "POST", headers: { Authorization: `Bearer ${connection.apiKey}`, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body, signal: combined,
      });
      if (!response.ok) {
        // Drain a bounded body for the existing supplier receipt collector, but
        // never expose its text, internal URLs or credentials to product users.
        try { await bounded(response, 65536); } catch { /* HTTP rejection is still authoritative. */ }
        const rejected = [400, 401, 403, 404, 413, 415, 422, 429].includes(response.status);
        throw new AudioExecutionError(rejected ? "AUDIO_UPSTREAM_REJECTED" : "AUDIO_UPSTREAM_UNKNOWN", rejected ? "音频通道未受理本次请求" : "音频受理结果待核对，请查询原操作", rejected ? "rejected" : "unknown", rejected ? response.status : 502);
      }
      return await consume(response);
    } catch (error) {
      if (error instanceof AudioExecutionError) throw error;
      if (error instanceof ModelConfigError && ["PROVIDER_BUSY", "CHANNEL_DISABLED", "CONFIG_UNAVAILABLE"].includes(error.code))
        throw new AudioExecutionError(error.code, "音频通道暂未提交本次请求", "not-dispatched", 503);
      throw new AudioExecutionError(combined.aborted ? "AUDIO_UPSTREAM_TIMEOUT" : "AUDIO_UPSTREAM_UNKNOWN", "音频受理结果待核对，请查询原操作", "unknown", 502);
    }
  }, modelExecutionTelemetry(scope)).catch(error => {
    // The generic observer is intentionally conservative. This adapter has the
    // exact pre-dispatch/rejection evidence; keep its original billing semantics.
    if (error instanceof AudioExecutionError && error.acceptance !== "unknown") markBillingUpstream("rejected");
    throw error;
  });
}

export async function executeSpeech(scope: ModelExecutionScope, raw: SpeechInput, options: ValidationOptions = {}, signal?: AbortSignal) {
  assertScope(scope, "audio.speech");
  const parsed = speechInput.safeParse(raw); if (!parsed.success) return invalid("配音参数无效");
  const input = parsed.data, cap = scope.capabilities.audio?.speech;
  if (!scope.capabilities.generate || !cap?.enabled || !cap.voices.includes(input.voice) || !cap.formats.includes(input.format) || Array.from(input.text).length > cap.maxCharacters) return invalid("配音参数超出已发布能力");
  if (input.speed !== undefined && (!cap.speed || input.speed < cap.speed.min || input.speed > cap.speed.max)) return invalid("音频通道未开放此语速");
  if (input.instructions !== undefined && !cap.instructions) return invalid("音频通道未开放朗读指令");
  const body = JSON.stringify({ model: scope.connection.wireModel, input: input.text, voice: input.voice, response_format: input.format,
    ...(input.speed !== undefined ? { speed: input.speed } : {}), ...(input.instructions !== undefined ? { instructions: input.instructions } : {}) });
  return dispatch(scope, "speech", body, async response => {
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const aliases: Record<string, string[]> = { wav: ["audio/wav", "audio/x-wav", "audio/wave"], mp3: ["audio/mpeg", "audio/mp3"], flac: ["audio/flac", "audio/x-flac"], opus: ["audio/ogg", "audio/opus"], aac: ["audio/aac"] };
    const bytes = await bounded(response, cap.maxOutputBytes);
    if (!mime || !aliases[input.format].includes(mime) || !audioFileSignature(bytes, input.format)) return unknown("AUDIO_RESULT_INVALID", "配音响应不是所选音频文件，保留原操作核对");
    return { bytes, mimeType: AUDIO_MIME[input.format], format: input.format, sha256: sha(bytes), textSha256: sha(Buffer.from(input.text)), voice: input.voice,
      ...(response.headers.get("x-request-id") ? { requestId: response.headers.get("x-request-id")!.slice(0, 200) } : {}) };
  }, options, signal);
}

function audioFileSignature(bytes: Uint8Array, format: string) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "wav") return b.length > 44 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE";
  if (format === "flac") return b.length > 4 && b.toString("ascii", 0, 4) === "fLaC";
  if (format === "opus") return b.length > 16 && b.toString("ascii", 0, 4) === "OggS" && b.subarray(0, 4096).includes(Buffer.from("OpusHead"));
  if (format === "mp3") return b.length > 3 && (b.toString("ascii", 0, 3) === "ID3" || b[0] === 255 && (b[1] & 0xe0) === 0xe0);
  return b.length > 7 && b[0] === 255 && (b[1] & 0xf6) === 0xf0;
}
const timedText = z.object({ start: z.number().finite().min(0), end: z.number().finite().min(0), text: z.string().max(1000000) });
const wordText = z.object({ start: z.number().finite().min(0), end: z.number().finite().min(0), word: z.string().max(10000) });
const transcriptionResult = z.object({ text: z.string().max(1000000), language: z.string().max(100).optional(), duration: z.number().finite().positive().optional(), segments: z.array(timedText).max(10000).optional(), words: z.array(wordText).max(100000).optional() });

export async function executeTranscription(scope: ModelExecutionScope, raw: TranscriptionInput, options: ValidationOptions = {}, signal?: AbortSignal) {
  assertScope(scope, "audio.transcribe");
  const parsed = transcriptionInput.safeParse(raw); if (!parsed.success) return invalid("转写参数无效");
  const input = parsed.data, cap = scope.capabilities.audio?.transcription;
  if (!scope.capabilities.transcribe || !cap?.enabled || !cap.inputFormats.includes(input.mimeType) || !input.bytes.byteLength || input.bytes.byteLength > cap.maxInputBytes || input.durationSeconds > cap.maxDurationSeconds || !cap.formats.includes(input.format)) return invalid("转写输入超出已发布能力");
  if (input.timestamps.some(t => !cap.timestamps.includes(t)) || input.timestamps.length && input.format !== "verbose_json") return invalid("音频通道未开放所选时间戳");
  if (input.language !== undefined && !cap.language || input.prompt !== undefined && !cap.prompt) return invalid("音频通道未开放所选语言或提示词");
  const form = new FormData(), extensions: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/flac": "flac", "audio/ogg": "ogg", "audio/aac": "aac", "audio/mp4": "m4a", "video/mp4": "mp4", "audio/webm": "webm", "video/webm": "webm" };
  form.set("model", scope.connection.wireModel); form.set("response_format", input.format);
  form.set("file", new Blob([Uint8Array.from(input.bytes)], { type: input.mimeType }), `source.${extensions[input.mimeType]}`);
  for (const value of input.timestamps) form.append("timestamp_granularities[]", value);
  if (input.language !== undefined) form.set("language", input.language);
  if (input.prompt !== undefined) form.set("prompt", input.prompt);
  return dispatch(scope, "transcriptions", form, async response => {
    const bytes = await bounded(response, 8 * 1024 * 1024);
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) return unknown("AUDIO_RESULT_INVALID", "转写响应不是 JSON，保留原操作核对");
    let result: z.infer<typeof transcriptionResult>;
    try { result = transcriptionResult.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
    catch { return unknown("AUDIO_RESULT_INVALID", "转写响应字段无效，保留原操作核对"); }
    // Actual decoded input duration is supplied by the media owner. No clamping,
    // invented segmentation, or converting inferred timing into confirmed timing.
    for (const key of input.timestamps) {
      const entries = key === "segment" ? result.segments : result.words;
      if (!entries || result.text.trim() && !entries.length) return unknown("AUDIO_TIMESTAMPS_MISSING", "转写缺少所请求的时间戳，保留原操作核对");
      let previous = -1;
      for (const entry of entries) {
        if (entry.end <= entry.start || entry.start < previous || entry.end > input.durationSeconds + 0.05) return unknown("AUDIO_TIMESTAMPS_INVALID", "转写时间戳超出原音频或次序无效，保留原操作核对");
        previous = entry.start;
      }
    }
    return { text: result.text, ...(result.language ? { language: result.language } : {}),
      ...(input.timestamps.includes("segment") ? { segments: result.segments } : {}), ...(input.timestamps.includes("word") ? { words: result.words } : {}),
      timing: input.timestamps.length ? "supplier-timestamps" as const : "untimed" as const, inputSha256: sha(input.bytes), responseSha256: sha(bytes),
      ...(response.headers.get("x-request-id") ? { requestId: response.headers.get("x-request-id")!.slice(0, 200) } : {}) };
  }, options, signal);
}
