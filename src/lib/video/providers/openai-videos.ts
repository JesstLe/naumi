import "server-only";

import {
  PermanentVideoCreateError,
  TransientPollError,
  type VideoGenerationRequest,
  type VideoProviderAdapter,
  type VideoProviderCreateResult,
  type VideoProviderFetchResult,
  type VideoProviderPollResult,
  type VideoTaskSnapshot,
  type VideoTaskStatus,
} from "@/lib/video/types";
import { readLimitedVideoResponse } from "@/lib/video/result-download";

// ---------------------------------------------------------------------------
// OpenAI Videos 协议适配器(§4.3 Phase 3 第 1 个):吸收原 client.ts。
// 协议:POST {base}/v1/videos → GET /v1/videos/{id} → GET /v1/videos/{id}/content。
// 图生视频走 multipart(input_reference);纯文生走 JSON。
// 配置:VIDEO_API_BASE_URL / VIDEO_API_KEY / VIDEO_API_MODEL(env,站级)。
// ---------------------------------------------------------------------------

export function resolveOpenAiVideosConfig() {
  const baseUrl = (process.env.VIDEO_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.VIDEO_API_KEY || "").trim();
  const model = (process.env.VIDEO_API_MODEL || "").trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

function authHeaders(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

function mapStatus(raw: string): VideoTaskStatus {
  const v = (raw || "").toLowerCase();
  if (v === "completed") return "completed";
  if (v === "failed") return "failed";
  if (v === "queued") return "queued";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "processing";
}

export const openAiVideosAdapter: VideoProviderAdapter = {
  id: "openai-videos",

  async create(input: VideoGenerationRequest): Promise<VideoProviderCreateResult> {
    const cfg = resolveOpenAiVideosConfig();
    if (!cfg) throw new Error("视频服务未配置(需在服务器设置 VIDEO_API_BASE_URL/KEY/MODEL)");
    const seconds = String(input.durationSeconds);
    const size =
      input.width && input.height
        ? `${input.width}x${input.height}`
        : input.resolution || input.aspectRatio || "1280x720";
    const imageRef = input.references.find(
      (r) => r.kind === "image" && (r.role === "first_frame" || r.role === "reference")
    );
    // OpenAI-compatible endpoints commonly implement request deduplication via
    // this header. It is stable across worker recovery/restarts.
    const idempotencyHeaders = { "Idempotency-Key": input.idempotencyKey };

    let res: Response;
    if (imageRef?.url) {
      const imgRes = await fetch(imageRef.url, { signal: AbortSignal.timeout(60_000) });
      if (!imgRes.ok) throw new Error("读取参考图失败");
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const form = new FormData();
      form.append("model", input.modelId || cfg.model);
      form.append("prompt", input.prompt);
      form.append("seconds", seconds);
      form.append("size", size);
      form.append("input_reference", new Blob([bytes], { type: imageRef.mimeType || "image/png" }), "reference.png");
      res = await fetch(`${cfg.baseUrl}/v1/videos`, {
        method: "POST",
        headers: { ...authHeaders(cfg.apiKey), ...idempotencyHeaders },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } else {
      res = await fetch(`${cfg.baseUrl}/v1/videos`, {
        method: "POST",
        headers: { ...authHeaders(cfg.apiKey), ...idempotencyHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          model: input.modelId || cfg.model,
          prompt: input.prompt,
          seconds,
          size,
          ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
          ...(input.generateAudio !== undefined ? { generate_audio: input.generateAudio } : {}),
          ...(input.watermark !== undefined ? { watermark: input.watermark } : {}),
          ...(input.providerOptions || {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = detail?.error?.message || `视频服务创建任务失败(${res.status})`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new PermanentVideoCreateError(message, res.status);
      }
      throw new Error(message);
    }
    const data = (await res.json()) as { id?: string; status?: string; progress?: number };
    if (!data?.id) throw new Error("视频服务未返回任务 ID");
    const result: VideoProviderCreateResult = {
      upstreamTaskId: data.id,
      status: mapStatus(data.status ?? "queued"),
      progress: data.progress,
      rawResponse: data,
    };
    return result;
  },

  async poll(task: VideoTaskSnapshot): Promise<VideoProviderPollResult> {
    const cfg = resolveOpenAiVideosConfig();
    if (!cfg) throw new TransientPollError("视频服务未配置");
    let res: Response;
    try {
      res = await fetch(
        `${cfg.baseUrl}/v1/videos/${encodeURIComponent(task.upstreamTaskId)}`,
        { headers: authHeaders(cfg.apiKey), signal: AbortSignal.timeout(20_000), cache: "no-store" }
      );
    } catch (error) {
      // 网络瞬时错误:调用方安排重试,不终止任务
      throw new TransientPollError("查询上游任务失败", error);
    }
    if (res.status >= 500 || res.status === 429) {
      throw new TransientPollError(`上游暂时不可用(${res.status})`);
    }
    if (!res.ok) throw new Error(`查询视频任务失败(${res.status})`);
    const data = (await res.json().catch(() => null)) as
      | { status?: string; progress?: number; video_url?: string; error?: { message?: string } | string }
      | null;
    if (!data) throw new TransientPollError("上游响应解析失败");
    const errText =
      typeof data.error === "string" ? data.error : data.error?.message || undefined;
    return {
      status: mapStatus(data.status ?? ""),
      progress: Number(data.progress ?? 0),
      // 部分聚合商直接给签名下载地址;仅作提示,取字节仍走统一 /content
      resultUrl: data.video_url || undefined,
      errorMessage: errText,
      rawResponse: data,
    };
  },

  async fetchResult(
    task: VideoTaskSnapshot
  ): Promise<VideoProviderFetchResult> {
    const cfg = resolveOpenAiVideosConfig();
    if (!cfg) throw new Error("视频服务未配置");
    const res = await fetch(
      `${cfg.baseUrl}/v1/videos/${encodeURIComponent(task.upstreamTaskId)}/content`,
      { headers: authHeaders(cfg.apiKey), signal: AbortSignal.timeout(180_000) }
    );
    const downloaded = await readLimitedVideoResponse(res);
    return { bytes: downloaded.bytes, mimeType: downloaded.mimeType };
  },
};
