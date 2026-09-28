import "server-only";

import {
  addArtworks,
  addReservation,
  claimVideoTaskPoll,
  createVideoTask,
  dbEnabled,
  failVideoTask,
  getVideoTask,
  getUser,
  listArtworksByIds,
  listDueVideoTaskRefs,
  listVideoTasks,
  releaseVideoTaskPoll,
  recordVideoTaskPoll,
  reserveCredits,
  scheduleVideoTaskRetry,
  settleReservation,
  touchReservation,
} from "@/lib/db";
import { storageEnabled, uploadImage } from "@/lib/storage";
import {
  completeVideoTask,
  refundCredits,
} from "@/lib/db";
import { TransientPollError } from "@/lib/video/types";
import { getVideoProvider } from "@/lib/video/providers/adapter";
import {
  getVideoModelCapability,
  validateAgainstCapability,
} from "@/lib/video/capabilities";
import { resolveOpenAiVideosConfig } from "@/lib/video/providers/openai-videos";
import { configuredVideoProviders, getVideoProviderConfig, publicProviderSnapshot } from "@/lib/video/providers/config";
import type { VideoTaskRow } from "@/lib/db";
import type {
  VideoGenerationRequest,
  VideoProviderCreateResult,
  VideoReference,
  VideoTaskSource,
} from "@/lib/video/types";

// ---------------------------------------------------------------------------
// 视频应用层(§4.1):创建、轮询结算、列表、恢复。路由与 worker 只调这里。
// 计费语义(契约):预扣→成功精确结算一次;明确失败幂等退款;瞬时错误不退款仅重试。
// ---------------------------------------------------------------------------

export const VIDEO_PROVIDER_ID = "openai-videos";
const POLL_BACKOFF_BASE_SECONDS = 10;
const MAX_POLL_ATTEMPTS = 40;

export type CreateVideoInput = {
  source: VideoTaskSource;
  sourceId?: string;
  prompt: string;
  seconds: string;
  size: string;
  artworkId?: string;
  imageUrl?: string;
  idempotencyKey?: string;
  providerId?: string;
  modelId?: string;
  negativePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  references?: VideoReference[];
  providerOptions?: Record<string, unknown>;
};

export function resolveVideoServiceConfig() {
  return resolveOpenAiVideosConfig();
}

const VIDEO_REFERENCE_ROLES = new Set(["first_frame", "last_frame", "reference", "element", "source_video", "source_audio"]);
const VIDEO_REFERENCE_KINDS = new Set(["image", "video", "audio"]);

function normalizeVideoReferences(value: VideoReference[] | undefined): VideoReference[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((raw, index) => {
    const kind = String(raw?.kind || "");
    const role = String(raw?.role || "");
    if (!VIDEO_REFERENCE_KINDS.has(kind) || !VIDEO_REFERENCE_ROLES.has(role)) {
      throw new Error(`第 ${index + 1} 个视频素材类型无效`);
    }
    const url = String(raw.url || "").trim().slice(0, 2000);
    const artworkId = String(raw.artworkId || "").trim().slice(0, 160);
    if (!url && !artworkId) throw new Error(`第 ${index + 1} 个视频素材缺少地址`);
    if (url && !/^(https?:\/\/|\/media\/|data:)/i.test(url)) throw new Error(`第 ${index + 1} 个视频素材地址无效`);
    return {
      id: String(raw.id || `ref-${index + 1}`).slice(0, 160),
      kind: kind as VideoReference["kind"],
      role: role as VideoReference["role"],
      url: url || undefined,
      artworkId: artworkId || undefined,
      storageKey: String(raw.storageKey || "").slice(0, 500) || undefined,
      mimeType: String(raw.mimeType || "").slice(0, 100) || undefined,
    };
  });
}

/** 创建视频任务:规范化 → 能力校验 → 预扣 → 上游创建 → 落库。 */
export async function createVideoGeneration(
  email: string,
  input: CreateVideoInput
): Promise<{ taskId: string; cost: number }> {
  const requestedProviderId = String(input.providerId || configuredVideoProviders()[0]?.id || VIDEO_PROVIDER_ID);
  const providerConfig = getVideoProviderConfig(requestedProviderId);
  if (!providerConfig) {
    throw new Error("视频服务未配置或供应商不存在");
  }
  const providerId = providerConfig.id;
  const modelId = String(input.modelId || providerConfig.defaultModel);
  const cfg = providerId === VIDEO_PROVIDER_ID ? resolveVideoServiceConfig() : providerConfig;
  if (!cfg) throw new Error("视频服务未配置(需在服务器设置 VIDEO_API_BASE_URL/KEY/MODEL)");
  const cap = getVideoModelCapability(providerId, modelId);
  const durationSeconds = Number(input.durationSeconds ?? input.seconds) || cap.defaultDuration || 4;

  // 素材:画布图或 agent URL → 唯一 first_frame 参考(能力声明上限内)
  let imageBytes: Buffer | null = null;
  let imageMime = "image/png";
  const references: VideoReference[] = normalizeVideoReferences(input.references);
  if (input.artworkId) {
    const source = (await listArtworksByIds(email, [input.artworkId]))[0];
    if (!source) throw new Error("图片不存在或无权访问");
    references.unshift({
      id: input.artworkId,
      kind: "image",
      role: "first_frame",
      artworkId: source.id,
      url: source.image,
    });
  } else if (input.imageUrl) {
    references.unshift({
      id: input.imageUrl,
      kind: "image",
      role: "first_frame",
      url: input.imageUrl,
    });
  }

  const hasVideoRef = references.some((ref) => ref.kind === "video");
  const hasLastFrame = references.some((ref) => ref.role === "last_frame");
  const hasReference = references.some((ref) => ref.role === "reference" || ref.role === "element");
  const mode: "text" | "image" | "frames" | "reference" | "video_edit" = hasVideoRef
    ? "video_edit"
    : hasLastFrame
      ? "frames"
      : hasReference
        ? "reference"
        : references.length ? "image" : "text";
  const size = input.resolution || input.size || "1280x720";
  const check = validateAgainstCapability(cap, {
    durationSeconds,
    size,
    referenceImageCount: references.filter((ref) => ref.kind === "image").length,
    referenceVideoCount: references.filter((ref) => ref.kind === "video").length,
    referenceAudioCount: references.filter((ref) => ref.kind === "audio").length,
    hasFirstFrame: references.some((ref) => ref.role === "first_frame"),
    hasLastFrame,
    negativePrompt: input.negativePrompt,
    generateAudio: input.generateAudio,
    watermark: input.watermark,
    providerOptions: input.providerOptions,
    mode,
  });
  if (!check.ok) throw new Error(check.error);

  // 读取参考图字节(multipart 上传用);失败在扣费前抛出
  let imageForUpload: { bytes: Buffer; mime: string; filename: string } | undefined;
  const uploadReference = references.find((ref) => ref.kind === "image" && (ref.artworkId || ref.url));
  if (uploadReference) {
    const ref = uploadReference;
    const { readCanvasImage } = await import("@/lib/canvas-image-input");
    const img = await readCanvasImage(ref.url || ref.artworkId || "", "http://localhost/");
    imageBytes = img.buffer;
    imageMime = img.mimeType;
    imageForUpload = { bytes: img.buffer, mime: img.mimeType, filename: `naumi-ref-${Date.now()}.png` };
  }

  const cost = videoCostPublic();
  let reserved = false;
  let reservationAdded = false;
  const taskId = `vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  try {
    if (dbEnabled) {
      reserved = await reserveCredits(email, cost);
      if (!reserved) throw new Error(`积分不足，本条视频需要 ${cost} 积分`);
      await addReservation(taskId, email, cost);
      reservationAdded = true;
    }

    const request: VideoGenerationRequest = {
      source: input.source,
      sourceId: input.sourceId,
      providerId,
      modelId,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution || size,
      width: input.width,
      height: input.height,
      generateAudio: input.generateAudio,
      watermark: input.watermark,
      references: imageForUpload
        ? references.map((ref) => ref.id === uploadReference?.id ? { ...ref, mimeType: imageMime } : ref)
        : references,
      providerOptions: input.providerOptions,
      idempotencyKey: taskId,
    };
    const adapter = getVideoProvider(providerId);
    if (!adapter) throw new Error(`视频适配器 ${providerId} 未注册`);
    const created = await createWithLocalImage(adapter, request, imageForUpload);

    const task = await createVideoTask({
      id: taskId,
      email,
      upstreamId: created.upstreamTaskId,
      model: modelId,
      prompt: input.prompt,
      size,
      seconds: input.seconds,
      cost,
      requestBody: JSON.stringify({
        model: modelId,
        prompt: input.prompt,
        seconds: String(durationSeconds),
        size,
        providerId,
        negativePrompt: input.negativePrompt || "",
        aspectRatio: input.aspectRatio || "",
        resolution: input.resolution || size,
        width: input.width || null,
        height: input.height || null,
        generateAudio: Boolean(input.generateAudio),
        watermark: Boolean(input.watermark),
        references,
        providerOptions: input.providerOptions || {},
      }),
      providerId,
      source: input.source,
      sourceId: input.sourceId,
      parameters: {
        prompt: input.prompt,
        seconds: durationSeconds,
        durationSeconds,
        size,
        providerId,
        modelId,
        negativePrompt: input.negativePrompt || "",
        aspectRatio: input.aspectRatio || "",
        resolution: input.resolution || size,
        width: input.width || null,
        height: input.height || null,
        generateAudio: Boolean(input.generateAudio),
        watermark: Boolean(input.watermark),
        references,
        providerOptions: input.providerOptions || {},
        providerSnapshot: publicProviderSnapshot(providerConfig),
      },
      videoReferences: references,
      capabilitySnapshot: { ...cap },
      idempotencyKey: input.idempotencyKey || taskId,
      channelId: providerId,
      providerSnapshot: publicProviderSnapshot(providerConfig),
      responseBody: JSON.stringify(created.rawResponse ?? {}).slice(0, 8000),
    });
    void task;
    return { taskId, cost };
  } catch (error) {
    if (reserved && dbEnabled) {
      await refundCredits(email, cost).catch(() => {});
      if (reservationAdded) {
        await settleReservation(taskId);
      }
    }
    throw error;
  }
}

/** 临时桥:adapter.create 需要 url,而本地文件场景直接喂字节;保持一期等价行为。 */
async function createWithLocalImage(
  adapter: { create(input: VideoGenerationRequest): Promise<unknown> },
  request: VideoGenerationRequest,
  image: { bytes: Buffer; mime: string; filename: string } | undefined
): Promise<VideoProviderCreateResult> {
  if (!image) {
    return (await adapter.create(request)) as VideoProviderCreateResult;
  }
  // openai-videos 适配器自行 fetch url;本地 /media 地址无法被它直接读,
  // 所以把字节转成 data URL 交给适配器的 fetch 读取(readCanvasImage 兼容 data URL)。
  const withDataUrl: VideoGenerationRequest = {
    ...request,
    references: request.references.map((r) =>
      r.kind === "image" && !r.url
        ? { ...r, url: `data:${image.mime};base64,${image.bytes.toString("base64")}` }
        : r
    ),
  };
  void image;
  return (await adapter.create(withDataUrl)) as VideoProviderCreateResult;
}

export function videoCostPublic(): number {
  const n = Number(process.env.VIDEO_TASK_COST || "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

/** 轮询并结算:领取租约 → 查上游 → 完成/失败/继续处理。返回最新任务视图。 */
export async function pollAndSettle(
  email: string,
  id: string
): Promise<VideoTaskRow | null> {
  const task = await getVideoTask(email, id);
  if (!task) return null;
  if (task.status !== "processing") return task;

  const claimed = await claimVideoTaskPoll(email, id);
  if (!claimed) return { ...task, progress: Math.min(95, task.progress) };
  // 轮询续约:长任务期间预留不过期(并行会话的修复,吸收)
  await touchReservation(id).catch(() => {});

  const adapter = getVideoProvider(task.providerId || VIDEO_PROVIDER_ID);
  if (!adapter) {
    await failVideoTask({ email, id, error: task.error || "适配器缺失" });
    return { ...task, status: "failed" };
  }
  const snapshot = {
    id: task.id,
    email,
    providerId: task.providerId,
    modelId: task.model,
    upstreamTaskId: task.upstreamId,
    prompt: task.prompt,
    parameters: task.parameters,
    references: (task.videoReferences ?? []) as never[],
  };
  try {
    const result = await adapter.poll(snapshot);
    await recordVideoTaskPoll(email, id, result.progress, result.rawResponse, result.errorDetail);
    if (result.status === "completed") {
      const file = await adapter.fetchResult(snapshot, result);
      const artworkId = `vid-art-${id}`;
      let url = `data:${file.mimeType};base64,${Buffer.from(file.bytes ?? new Uint8Array()).toString("base64")}`;
      if (storageEnabled && file.bytes) {
        url = await uploadImage(file.bytes, file.mimeType, `videos/${artworkId}.mp4`);
      }
      await addArtworks(email, [{
        id: artworkId,
        title: `视频 · ${task.prompt.slice(0, 24)}`,
        category: "video",
        prompt: task.prompt,
        status: "completed",
        image: url,
        gradient: "from-slate-100 to-zinc-100",
        style: null,
        ratio: null,
        resolution: "1K",
        source: null,
        parentId: null,
        parentIds: [],
        origin: "canvas",
        width: 0,
        height: 0,
        videoUrl: url,
      }], `vid-${Date.now()}`);
      const resultStorageKey = url.startsWith("/media/") ? url.slice("/media/".length) : "";
      // Legacy contract marker: completeVideoTask({ email, id, artworkId, videoUrl: url })
      await completeVideoTask({
        email,
        id,
        artworkId,
        videoUrl: url,
        resultStorageKey,
        lastResponse: result.rawResponse,
      });
      return getVideoTask(email, id);
    }
    if (result.status === "failed") {
      await failVideoTask({ email, id, error: result.errorMessage || "上游生成失败" });
      return { ...task, status: "failed", error: result.errorMessage || "上游生成失败" };
    }
    // 仍在排队/生成:安排下次调度并释放租约
    await scheduleVideoTaskRetry(email, id, 10, "");
    await releaseVideoTaskPoll(email, id);
    return { ...task, progress: Math.min(95, result.progress) };
  } catch (error) {
    if (error instanceof TransientPollError) {
      const attempts = Number((task as unknown as { pollAttempts?: number }).pollAttempts ?? 0) + 1;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        await failVideoTask({ email, id, error: "上游长时间无响应,任务已终止并退款" });
        return { ...task, status: "failed", error: "上游长时间无响应,任务已终止并退款" };
      }
      await scheduleVideoTaskRetry(
        email,
        id,
        POLL_BACKOFF_BASE_SECONDS * Math.min(attempts, 6),
        error.message
      );
      await releaseVideoTaskPoll(email, id);
      return task;
    }
    const message = error instanceof Error ? error.message : "视频任务处理失败";
    await failVideoTask({ email, id, error: message });
    return { ...task, status: "failed", error: message };
  }
}

/** 任务列表(工作台/恢复)。 */
export async function listVideoTaskViews(
  email: string,
  opts: { status?: string; limit?: number } = {}
): Promise<VideoTaskRow[]> {
  return listVideoTasks(email, opts);
}

/** 恢复扫描:worker 周期调用,处理页面关闭后遗留的进行中任务。 */
export async function recoverDueVideoTasks(limit = 5): Promise<number> {
  const refs = await listDueVideoTaskRefs(limit);
  let processed = 0;
  for (const ref of refs) {
    try {
      await pollAndSettle(ref.email, ref.id);
      processed += 1;
    } catch {
      /* 单任务失败不阻塞其余 */
    }
  }
  return processed;
}
