import "server-only";

import { getVideoProviderConfig, type VideoProviderRuntimeConfig } from "@/lib/video/providers/config";
import { TransientPollError, type VideoGenerationRequest, type VideoProviderAdapter, type VideoProviderCreateResult, type VideoProviderFetchResult, type VideoProviderPollResult, type VideoTaskSnapshot, type VideoTaskStatus } from "@/lib/video/types";

function status(value: unknown): VideoTaskStatus {
  const raw = String(value || "").toLowerCase();
  if (["completed", "complete", "success", "succeeded", "done"].includes(raw)) return "completed";
  if (["failed", "fail", "error", "cancelled", "canceled", "expired"].includes(raw)) return "failed";
  if (raw === "queued") return "queued";
  return "processing";
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
    return { instances: [instance], parameters: { aspectRatio: input.aspectRatio, durationSeconds: input.durationSeconds, resolution: input.resolution } };
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
  if (cfg.protocol === "minimax") return `/v2/query/video_generation?task_id=${encodeURIComponent(id)}`;
  if (cfg.protocol === "autodl") return `/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(id)}`;
  if (cfg.protocol === "runninghub") return "/task/openapi/outputs";
  return `/videos/${encodeURIComponent(id)}`;
}

function contentPath(cfg: VideoProviderRuntimeConfig, id: string) {
  if (cfg.contentPath) return cfg.contentPath.replace("{id}", encodeURIComponent(id));
  return `/videos/${encodeURIComponent(id)}/content`;
}

async function jsonResponse(response: Response, label: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = firstString(path(payload, "error.message"), path(payload, "message"), path(payload, "msg"), `${label}(${response.status})`);
    if (response.status >= 500 || response.status === 429) throw new TransientPollError(message);
    throw new Error(message);
  }
  return payload;
}

export function createDirectVideoAdapter(providerId: string): VideoProviderAdapter | null {
  const cfg = getVideoProviderConfig(providerId);
  if (!cfg || cfg.protocol === "openai-videos") return null;
  return {
    id: providerId,
    async create(input) {
      const response = await fetch(base(cfg, createPath(cfg, input.modelId)), { method: "POST", headers: headers(cfg, true), body: JSON.stringify(requestBody(cfg, input)), signal: AbortSignal.timeout(120_000) });
      const payload = await jsonResponse(response, "视频任务创建失败");
      const upstreamTaskId = idFrom(payload);
      if (!upstreamTaskId) throw new Error("视频服务未返回任务 ID");
      return { upstreamTaskId, status: status(path(payload, "status") || path(payload, "data.status")), rawResponse: payload } satisfies VideoProviderCreateResult;
    },
    async poll(task) {
      let response: Response;
      try {
        response = await fetch(base(cfg, pollPath(cfg, task.upstreamTaskId)), cfg.protocol === "runninghub"
          ? { method: "POST", headers: headers(cfg, true), body: JSON.stringify({ apiKey: cfg.apiKey, taskId: task.upstreamTaskId }), signal: AbortSignal.timeout(30_000), cache: "no-store" }
          : { headers: headers(cfg), signal: AbortSignal.timeout(30_000), cache: "no-store" });
      }
      catch (error) { throw new TransientPollError("查询视频任务失败", error); }
      const payload = await jsonResponse(response, "查询视频任务失败");
      const url = firstUrl(payload);
      const error = firstString(path(payload, "error.message"), path(payload, "data.error.message"), path(payload, "data.failMsg"), path(payload, "msg"));
      const runningHubCode = cfg.protocol === "runninghub" ? Number(path(payload, "code") ?? path(payload, "data.code")) : NaN;
      const rawStatus = Number.isFinite(runningHubCode)
        ? runningHubCode === 0 && url ? "completed" : [805, 806].includes(runningHubCode) ? "failed" : "processing"
        : path(payload, "status") || path(payload, "state") || path(payload, "data.status") || (url ? "completed" : error ? "failed" : "processing");
      return { status: status(rawStatus), progress: Number(path(payload, "progress") || path(payload, "data.progress") || (url ? 100 : 0)), resultUrl: url || undefined, errorMessage: error || undefined, rawResponse: payload } satisfies VideoProviderPollResult;
    },
    async fetchResult(task, result) {
      const url = result.resultUrl || "";
      const target = url || base(cfg, contentPath(cfg, task.upstreamTaskId));
      // 上游返回的签名下载地址可能位于对象存储/CDN，禁止把供应商密钥转发到第三方主机。
      const response = await fetch(target, { headers: url ? {} : headers(cfg), signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`取回视频失败(${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("视频内容为空");
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error("视频超过 200MB 上限");
      return { bytes, mimeType: response.headers.get("content-type")?.split(";")[0] || "video/mp4" } satisfies VideoProviderFetchResult;
    },
  };
}
