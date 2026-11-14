import {decodeKIECreated} from './protocols/kie';
import {decodeAPIMartCreated} from './protocols/apimart';
import "server-only";
import { currentModelExecution } from "@/lib/model-config/context";
import { modelEndpointFetch } from "@/lib/model-config/transport";
import { supplierCostFetch } from "@/lib/supplier-cost/collect";

import { getVideoProviderConfig, type VideoProviderRuntimeConfig } from "@/lib/video/providers/config";
import { PermanentVideoCreateError, TransientPollError, type VideoGenerationRequest, type VideoProviderAdapter, type VideoProviderCreateResult, type VideoProviderFetchResult, type VideoProviderPollResult, type VideoTaskSnapshot, type VideoTaskStatus } from "@/lib/video/types";
import { readLimitedVideoResponse } from "@/lib/video/result-download";
import {decodeGeminiPoll,GEMINI_WIRE_OPTIONS} from "./protocols/gemini";
import {selectWireOptions} from "./wire-helpers";

function status(value: unknown): VideoTaskStatus {
  const raw = String(value || "").toLowerCase();
  if (["completed", "complete", "success", "succeeded", "done"].includes(raw)) return "completed";
  if (["failed", "fail", "error", "cancelled", "canceled", "expired"].includes(raw)) return "failed";
  if (raw === "queued") return "queued";
  return "processing";
}

function isRecognizedStatus(value: unknown): boolean {
  const raw = String(value || "").toLowerCase();
  return [
    "completed", "complete", "success", "succeeded", "done",
    "failed", "fail", "error", "cancelled", "canceled", "expired",
    "queued", "queuing", "waiting", "pending", "submitted", "starting", "processing",
    "in_progress", "running", "generating",
  ].includes(raw);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function path(value: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((current, key) => Array.isArray(current) ? current[Number(key)] : record(current)[key], value);
}

function firstString(...values: unknown[]): string {
  return values.find((value) => typeof value === "string" && value.trim())?.toString().trim() || "";
}

function firstUrl(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : "";
  if (Array.isArray(value)) return value.map((item) => firstUrl(item, depth + 1)).find(Boolean) || "";
  const root = record(value);
  for (const key of ["video_url", "videoUrl", "url", "download_url", "downloadUrl", "uri", "file_url", "fileUrl", "output_url", "file_url_path"]) {
    const direct = firstString(root[key]);
    if (/^https?:\/\//i.test(direct)) return direct;
  }
  return Object.values(root).map((item) => firstUrl(item, depth + 1)).find(Boolean) || "";
}

function idFrom(value: unknown): string {
  const direct = firstString(
    path(value, "id"), path(value, "task_id"), path(value, "taskId"),
    path(value, "data.id"), path(value, "data.task_id"), path(value, "data.taskId"),
    path(value, "data.name"), path(value, "name"), path(value, "task.id"), path(value, "result.id")
  );
  if (direct) return direct;
  const root = record(value);
  for (const item of Object.values(root)) {
    if (item && typeof item === "object") {
      const nested = idFrom(item);
      if (nested) return nested;
    }
  }
  return "";
}

function base(cfg: VideoProviderRuntimeConfig, pathName: string): string {
  return `${cfg.baseUrl}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
}

function headers(cfg: VideoProviderRuntimeConfig, json = false): Record<string, string> {
  if (cfg.protocol === "gemini") return { "x-goog-api-key": cfg.apiKey, ...(json ? { "content-type": "application/json" } : {}) };
  if (cfg.protocol === "runninghub") return json ? { "content-type": "application/json" } : {};
  const auth = cfg.rawAuthorization || cfg.protocol === "autodl" ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  return { authorization: auth, ...(json ? { "content-type": "application/json" } : {}) };
}

function inputReferences(input: VideoGenerationRequest) {
  return input.references.map((item) => ({ url: item.url || "", role: item.role, kind: item.kind })).filter((item) => item.url);
}

function requestBody(cfg: VideoProviderRuntimeConfig, input: VideoGenerationRequest): Record<string, unknown> {
  const refs = inputReferences(input);
  const images = refs
    .filter((item) => item.kind === "image" && item.role !== "first_frame" && item.role !== "last_frame")
    .map((item) => item.url);
  const videos = refs.filter((item) => item.kind === "video").map((item) => item.url);
  const audios = refs.filter((item) => item.kind === "audio").map((item) => item.url);
  const first = refs.find((item) => item.role === "first_frame")?.url;
  const last = refs.find((item) => item.role === "last_frame")?.url;
  const size = input.width && input.height ? `${input.width}x${input.height}` : input.resolution || input.aspectRatio || "1280x720";

  if (cfg.protocol === "ark") {
    const content: Record<string, unknown>[] = [{ type: "text", text: input.prompt }];
    images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    if (first) content.push({ type: "image_url", image_url: { url: first }, role: "first_frame" });
    if (last) content.push({ type: "image_url", image_url: { url: last }, role: "last_frame" });
    videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    return { model: input.modelId, content, duration: input.durationSeconds, ratio: input.aspectRatio || size, resolution: input.resolution, generate_audio: input.generateAudio, watermark: input.watermark };
  }
  if (cfg.protocol === "gemini") {
    const instance: Record<string, unknown> = { prompt: input.prompt };
    if (first) instance.image = { uri: first };
    if (last) instance.lastFrame = { uri: last };
    if (images.length) instance.referenceImages = images.map((uri) => ({ image: { uri }, referenceType: "asset" }));
    return { instances: [instance], parameters: { aspectRatio: input.aspectRatio, durationSeconds: input.durationSeconds, resolution: input.resolution,negativePrompt:input.negativePrompt,
      ...selectWireOptions({provider:cfg,profile:"gemini",request:input},GEMINI_WIRE_OPTIONS) } };
  }
  if (cfg.protocol === "minimax") {
    const content: Record<string, unknown>[] = [{ type: "text", text: input.prompt }];
    images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    if (first) content.push({ type: "image_url", image_url: { url: first }, role: "first_frame" });
    if (last) content.push({ type: "image_url", image_url: { url: last }, role: "last_frame" });
    videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    return { model: input.modelId, content, duration: input.durationSeconds, resolution: input.resolution, ratio: input.aspectRatio };
  }
  if (cfg.protocol === "kie") {
    return { model: input.modelId, input: { prompt: input.prompt, duration: String(input.durationSeconds), aspect_ratio: input.aspectRatio, resolution: input.resolution, image_urls: images, video_urls: videos, audio_urls: audios, first_frame_url: first, last_frame_url: last, generate_audio: input.generateAudio, watermark: input.watermark, ...(input.providerOptions || {}) } };
  }
  if (cfg.protocol === "apimart") {
    return { model: input.modelId, prompt: input.prompt, seconds: String(input.durationSeconds), size, resolution_name: input.resolution, image_urls: images, video_urls: videos, audio_urls: audios, first_frame_url: first, last_frame_url: last, generate_audio: input.generateAudio, video_watermark: input.watermark, ...(input.providerOptions || {}) };
  }
  if (cfg.protocol === "runninghub") {
    const nodeOverrides = Array.isArray(input.providerOptions?.nodeOverrides)
      ? input.providerOptions?.nodeOverrides
      : [];
    return {
      apiKey: cfg.apiKey,
      workflowId: cfg.workflowId || input.modelId,
      ...(nodeOverrides.length ? { nodeInfoList: nodeOverrides } : {}),
    };
  }
  if (cfg.protocol === "autodl") {
    return {
      model: input.modelId,
      prompt: input.prompt,
      seconds: String(input.durationSeconds),
      size,
      resolution_name: input.resolution,
      "input_reference[]": images,
      "video_reference[]": videos,
      "audio_reference[]": audios,
      ...(first ? { first_frame_url: first } : {}),
      ...(last ? { last_frame_url: last } : {}),
      ...(input.providerOptions || {}),
    };
  }
  return { model: input.modelId, prompt: input.prompt, seconds: String(input.durationSeconds), size, resolution: input.resolution, input_reference: images[0], first_frame_url: first, last_frame_url: last, video_reference: videos, audio_reference: audios, ...(input.providerOptions || {}) };
}

function createPath(cfg: VideoProviderRuntimeConfig, modelId: string) {
  if (cfg.createPath) return cfg.createPath;
  if (cfg.protocol === "ark") return "/contents/generations/tasks";
  if (cfg.protocol === "kie") return "/api/v1/jobs/createTask";
  if (cfg.protocol === "apimart") return "/videos/generations";
  // Gemini and AutoDL encode the selected model/workflow in the URL. Using the
  // provider default here silently routes non-default catalog selections to the
  // wrong upstream model.
  if (cfg.protocol === "gemini") return `/v1beta/models/${encodeURIComponent(modelId || cfg.defaultModel)}:predictLongRunning`;
  if (cfg.protocol === "minimax") return "/v2/video_generation";
  if (cfg.protocol === "autodl") return `/api/v1/comfyui/comfyui_workflow/${encodeURIComponent(cfg.workflowId || modelId || cfg.defaultModel)}`;
  if (cfg.protocol === "runninghub") return "/task/openapi/create";
  return "/videos";
}

function pollPath(cfg: VideoProviderRuntimeConfig, id: string) {
  if (cfg.pollPath) return cfg.pollPath.replace("{id}", encodeURIComponent(id));
  if (cfg.protocol === "ark") return `/contents/generations/tasks/${encodeURIComponent(id)}`;
  if (cfg.protocol === "kie") return `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(id)}`;
  if (cfg.protocol === "apimart") return `/tasks/${encodeURIComponent(id)}?language=zh`;
  if (cfg.protocol === "gemini") return `/v1beta/${id.replace(/^\/+/, "")}`;
  if (cfg.protocol === "minimax") return `/v2/query/video_generation/${encodeURIComponent(id)}`;
  if (cfg.protocol === "autodl") return `/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(id)}`;
  if (cfg.protocol === "runninghub") return "/task/openapi/outputs";
  return `/videos/${encodeURIComponent(id)}`;
}

function contentPath(cfg: VideoProviderRuntimeConfig, id: string) {
  if (cfg.contentPath) return cfg.contentPath.replace("{id}", encodeURIComponent(id));
  return `/videos/${encodeURIComponent(id)}/content`;
}

function sameOrigin(left: string, right: string): boolean {
  try { return new URL(left).origin === new URL(right).origin; }
  catch { return false; }
}

async function fetchGeminiVideo(cfg: VideoProviderRuntimeConfig, initialUrl: string): Promise<Response> {
  let target = initialUrl;
  let sendApiKey = sameOrigin(target, cfg.baseUrl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetch(target, {
      headers: sendApiKey ? { "x-goog-api-key": cfg.apiKey } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount === 5) throw new TransientPollError("下载 Gemini 视频失败：重定向次数过多");
    const next = new URL(location, target).toString();
    sendApiKey = sendApiKey && sameOrigin(next, cfg.baseUrl);
    target = next;
  }
  throw new TransientPollError("下载 Gemini 视频失败：重定向次数过多");
}

async function jsonResponse(response: Response, label: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = firstString(path(payload, "error.message"), path(payload, "message"), path(payload, "msg"), `${label}(${response.status})`);
    if (response.status >= 500 || response.status === 429) throw new TransientPollError(message);
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object") {
    throw new TransientPollError(`${label}：2xx 响应不是有效 JSON`);
  }
  return payload;
}

export function createDirectVideoAdapter(providerId: string): VideoProviderAdapter | null {
  const cfg = getVideoProviderConfig(providerId);
  if (!cfg || cfg.protocol === "openai-videos") return null;
  const scope=currentModelExecution('video');
  const transport = scope ? modelEndpointFetch(cfg.baseUrl, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }, {...scope.connection,costDisabled:true}) : fetch;
  const submit=supplierCostFetch(transport,scope?{...scope.connection,costScope:scope,phase:'video-generation'}:{providerId:cfg.id,baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,wireModel:cfg.defaultModel,protocol:cfg.protocol,phase:'video-generation'});
  return {
    id: providerId,
    async createCompiled(wire,key){
      if(wire.encoding!=='json'||!wire.body||typeof wire.body!=='object'||Array.isArray(wire.body))throw new PermanentVideoCreateError('direct冻结执行需要JSON字段对象',422);
      const field=cfg.idempotencyStrategy==='body'?cfg.idempotencyBodyField:undefined;
      if(cfg.idempotencyStrategy==='body'&&!field)throw new PermanentVideoCreateError('视频body幂等字段缺失',422);
      if(field&&Object.hasOwn(wire.body,field))throw new PermanentVideoCreateError('幂等字段与冻结请求字段冲突',422);
      const response=await submit(base(cfg,wire.path),{method:'POST',headers:{...headers(cfg,true),...(cfg.idempotencyStrategy==='header'?{'Idempotency-Key':key,'X-Idempotency-Key':key}:{})},body:JSON.stringify({...wire.body,...(field?{[field]:key}:{})}),signal:AbortSignal.timeout(cfg.timeoutMs??120000)});
      if(response.status>=400&&response.status<500&&response.status!==429){const rejected=await response.json().catch(()=>null);throw new PermanentVideoCreateError(firstString(path(rejected,'error.message'),path(rejected,'message'),path(rejected,'msg'),`视频任务创建失败(${response.status})`),response.status);}
      const payload=await jsonResponse(response,'视频任务创建失败');
      if(cfg.protocol==='kie')return decodeKIECreated(payload);if(cfg.protocol==='apimart')return decodeAPIMartCreated(payload);
      const upstreamTaskId=idFrom(payload);if(!upstreamTaskId)throw new Error('视频服务未返回任务ID');
      return {upstreamTaskId,status:status(path(payload,'status')||path(payload,'data.status')||path(payload,'task.status')),rawResponse:payload};
    },
    async create(input) {
      const requestPayload = requestBody(cfg, input);
      if (cfg.idempotencyStrategy === "body") {
        const field = cfg.idempotencyBodyField;
        if (!field) throw new Error("视频供应商 body 幂等策略缺少字段映射");
        (requestPayload as Record<string, unknown>)[field] = input.idempotencyKey;
      }
      const response = await submit(base(cfg, createPath(cfg, input.modelId)), {
        method: "POST",
        headers: {
          ...headers(cfg, true),
          ...(cfg.idempotencyStrategy === "header"
            ? { "Idempotency-Key": input.idempotencyKey, "X-Idempotency-Key": input.idempotencyKey }
            : {}),
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const rejected = await response.json().catch(() => null);
        throw new PermanentVideoCreateError(
          firstString(path(rejected, "error.message"), path(rejected, "message"), path(rejected, "msg"), `视频任务创建失败(${response.status})`),
          response.status
        );
      }
      const responsePayload = await jsonResponse(response, "视频任务创建失败");
      const upstreamTaskId = idFrom(responsePayload);
      if (!upstreamTaskId) throw new Error("视频服务未返回任务 ID");
      return { upstreamTaskId, status: status(path(responsePayload, "status") || path(responsePayload, "data.status")), rawResponse: responsePayload } satisfies VideoProviderCreateResult;
    },
    async poll(task) {
      let response: Response;
      try {
        response = await transport(base(cfg, pollPath(cfg, task.upstreamTaskId)), cfg.protocol === "runninghub"
          ? { method: "POST", headers: headers(cfg, true), body: JSON.stringify({ apiKey: cfg.apiKey, taskId: task.upstreamTaskId }), signal: AbortSignal.timeout(30_000), cache: "no-store" }
          : { headers: headers(cfg), signal: AbortSignal.timeout(30_000), cache: "no-store" });
      }
      catch (error) { throw new TransientPollError("查询视频任务失败", error); }
      const payload = await jsonResponse(response, "查询视频任务失败");
      if (cfg.protocol === "gemini") {
        const done = path(payload, "done");
        if (done === false) {
          return { status: "processing", progress: 0, rawResponse: payload } satisfies VideoProviderPollResult;
        }
        const operationError = record(path(payload, "error"));
        if (done === true && Object.keys(operationError).length > 0) {
          return {
            status: "failed",
            progress: 0,
            errorCode: operationError.code == null ? undefined : String(operationError.code),
            errorMessage: firstString(operationError.message, "Gemini 视频任务失败"),
            errorDetail: operationError,
            rawResponse: payload,
          } satisfies VideoProviderPollResult;
        }
        if (done === true) {
          return decodeGeminiPoll(payload);
        }
        throw new TransientPollError("查询视频任务失败：Gemini operation 响应缺少 done 状态");
      }
      if (cfg.protocol === "minimax") {
        const taskPayload = record(path(payload, "task"));
        const rawStatus = firstString(taskPayload.status);
        if (!isRecognizedStatus(rawStatus)) {
          throw new TransientPollError("查询视频任务失败：MiniMax 响应缺少可识别的 task.status");
        }
        const normalizedStatus = rawStatus.toLowerCase();
        const mappedStatus: VideoTaskStatus = ["queued", "running"].includes(normalizedStatus)
          ? "processing"
          : status(normalizedStatus);
        const resultUrl = firstString(path(taskPayload, "content.url"));
        const taskError = record(taskPayload.error);
        const errorCode = taskError.code == null ? "" : String(taskError.code);
        const errorMessage = firstString(taskError.message);
        if (mappedStatus === "completed" && !/^https?:\/\//i.test(resultUrl)) {
          throw new TransientPollError("查询视频任务失败：MiniMax succeeded 响应缺少 task.content.url");
        }
        return {
          status: mappedStatus,
          progress: mappedStatus === "completed" ? 100 : 0,
          resultUrl: resultUrl || undefined,
          errorCode: errorCode || undefined,
          errorMessage: errorMessage || undefined,
          errorDetail: Object.keys(taskError).length ? taskError : undefined,
          rawResponse: payload,
        } satisfies VideoProviderPollResult;
      }
      let resultPayload: unknown = payload;
      if (cfg.protocol === "kie") {
        const resultJson = path(payload, "data.resultJson");
        if (typeof resultJson === "string" && resultJson.trim()) {
          try {
            resultPayload = JSON.parse(resultJson);
          } catch {
            throw new TransientPollError("查询视频任务失败：Kie resultJson 不是有效 JSON");
          }
        } else if (resultJson && typeof resultJson === "object") {
          resultPayload = resultJson;
        }
      }
      const url = firstUrl(resultPayload) || firstUrl(payload);
      // Kie 顶层 msg 通常只是 "success"，不得当成失败原因。
      const error = cfg.protocol === "kie"
        ? firstString(path(payload, "error.message"), path(payload, "data.error.message"), path(payload, "data.failMsg"))
        : firstString(path(payload, "error.message"), path(payload, "data.error.message"), path(payload, "data.failMsg"), path(payload, "msg"));
      const runningHubCode = cfg.protocol === "runninghub" ? Number(path(payload, "code") ?? path(payload, "data.code")) : NaN;
      const explicitStatus = cfg.protocol === "kie"
        ? path(payload, "data.state") || path(payload, "data.status") || path(payload, "status")
        : path(payload, "status") || path(payload, "state") || path(payload, "data.status");
      const rawStatus = Number.isFinite(runningHubCode)
        ? runningHubCode === 0 && url ? "completed" : [805, 806].includes(runningHubCode) ? "failed" : "processing"
        : explicitStatus || (url ? "completed" : error ? "failed" : "");
      if (!rawStatus || (!Number.isFinite(runningHubCode) && explicitStatus && !isRecognizedStatus(explicitStatus))) {
        throw new TransientPollError("查询视频任务失败：上游 2xx 响应缺少可识别的 status/url/error");
      }
      if (cfg.protocol === "kie" && status(rawStatus) === "completed" && !url) {
        throw new TransientPollError("查询视频任务失败：Kie success 响应缺少 resultUrls");
      }
      return { status: status(rawStatus), progress: Number(path(payload, "progress") || path(payload, "data.progress") || (url ? 100 : 0)), resultUrl: url || undefined, errorMessage: error || undefined, rawResponse: payload } satisfies VideoProviderPollResult;
    },
    async fetchResult(task, result) {
      const url = result.resultUrl || "";
      const target = url || base(cfg, contentPath(cfg, task.upstreamTaskId));
      // 上游返回的签名下载地址可能位于对象存储/CDN，禁止把供应商密钥转发到第三方主机。
      const response = cfg.protocol === "gemini" && url
        ? await fetchGeminiVideo(cfg, target)
        : await (url ? fetch : transport)(target, { headers: url ? {} : headers(cfg), signal: AbortSignal.timeout(180_000) });
      const downloaded = await readLimitedVideoResponse(response);
      return { bytes: downloaded.bytes, mimeType: downloaded.mimeType } satisfies VideoProviderFetchResult;
    },
  };
}
