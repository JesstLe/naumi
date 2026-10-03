import "server-only";
import {quoteForActor,getBillingRuntime,meteringFor} from "@/lib/billing/server";
import {quote} from "@/lib/billing/quote";
import {assertQuotedVersion,requestQuoteConfirmation} from "@/lib/billing/request";

import {
  addArtworks,
  claimVideoTaskPoll,
  createVideoTaskWithReservation,
  failVideoTask,
  getVideoTask,
  listArtworksByIds,
  listDueVideoTaskRefs,
  listVideoTasks,
  markVideoTaskCreated,
  markVideoTaskCreationUnknown,
  noteVideoTaskResultObserved,
  recordVideoTaskPoll,
  scheduleVideoTaskRetry,
  stageVideoTaskResult,
  touchReservation,
} from "@/lib/db";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { completeVideoTask } from "@/lib/db";
import { PermanentVideoCreateError, TransientPollError } from "@/lib/video/types";
import { getVideoProvider } from "@/lib/video/providers/adapter";
import { readLimitedVideoResponse } from "@/lib/video/result-download";
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

class IdempotencyConfigDriftError extends Error {
  constructor() {
    super("供应商幂等配置已变化，已停止自动重提并等待人工核对");
    this.name = "IdempotencyConfigDriftError";
  }
}

function sanitizeVideoProviderPayload(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch { return value; }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeVideoProviderPayload(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      /token|secret|authorization|api[_-]?key/i.test(key)
        ? "[REDACTED]"
        : sanitizeVideoProviderPayload(child, depth + 1),
    ]));
  }
  return value;
}

function videoExtensionForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/x-matroska") return "mkv";
  if (mime === "video/ogg") return "ogv";
  if (mime === "video/mpeg") return "mpeg";
  if (mime === "application/octet-stream" || mime === "video/mp4") return "mp4";
  throw new Error(`视频结果 MIME 无效：${mime || "unknown"}`);
}

export type CreateVideoInput = {
  billingConfirmation?:{version?:number;credits?:number};
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

export type PublicVideoTaskView = Pick<
  VideoTaskRow,
  | "id"
  | "model"
  | "prompt"
  | "status"
  | "progress"
  | "cost"
  | "artworkId"
  | "videoUrl"
  | "error"
  | "providerId"
  | "source"
  | "sourceId"
  | "seconds"
  | "nextPollAt"
  | "createdAt"
  | "completedAt"
>;

/** Public API projection. Durable provider snapshots and raw responses stay server-only. */
export function publicVideoTaskView(task: VideoTaskRow): PublicVideoTaskView {
  return {
    id: task.id,
    model: task.model,
    prompt: task.prompt,
    status: task.status,
    progress: task.progress,
    cost: task.cost,
    artworkId: task.artworkId,
    videoUrl: task.videoUrl,
    error: task.error,
    providerId: task.providerId,
    source: task.source,
    sourceId: task.sourceId,
    seconds: task.seconds,
    nextPollAt: task.nextPollAt,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  };
}

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
  const key = String(input.idempotencyKey || "").trim().slice(0, 100);
  return createVideoGenerationUnlocked(email, {
    ...input,
    idempotencyKey: key || crypto.randomUUID(),
  });
}

async function createVideoGenerationUnlocked(
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

  // 远程供应商必须能访问引用素材。本地 /media 地址仅本站可见；部署时可通过
  // VIDEO_REFERENCE_PUBLIC_BASE_URL 指向对外可访问的 Naumi 站点，或直接使用 R2。
  if (providerId !== VIDEO_PROVIDER_ID) {
    const publicBase = String(process.env.VIDEO_REFERENCE_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
    for (const reference of references) {
      if (!reference.url?.startsWith("/media/")) continue;
      if (!publicBase) {
        throw new Error("远程视频供应商无法读取本地素材，请配置 R2 或 VIDEO_REFERENCE_PUBLIC_BASE_URL");
      }
      reference.url = `${publicBase}${reference.url}`;
    }
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
  const uploadReference = providerId === VIDEO_PROVIDER_ID
    ? references.find((ref) => ref.kind === "image" && (ref.artworkId || ref.url))
    : undefined;
  if (uploadReference) {
    const ref = uploadReference;
    const { readCanvasImage } = await import("@/lib/canvas-image-input");
    const img = await readCanvasImage(ref.url || ref.artworkId || "", "http://localhost/");
    imageBytes = img.buffer;
    imageMime = img.mimeType;
    imageForUpload = { bytes: img.buffer, mime: img.mimeType, filename: `naumi-ref-${Date.now()}.png` };
  }

  const billingQuote=await quoteForActor(email,{feature:"video.generate",quantity:1,modelId,providerId,resolution:input.resolution||size});
  if(input.billingConfirmation)assertQuotedVersion(input.billingConfirmation,billingQuote);
  const cost = billingQuote.requestedCredits;
  const taskId = `vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const idempotencyKey = input.idempotencyKey || taskId;
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
      idempotencyKey,
  };
  if (!getVideoProvider(providerId)) throw new Error(`视频适配器 ${providerId} 未注册`);
  const parameters = {
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
    idempotencyKey,
  };
  const claimed = await createVideoTaskWithReservation({
      billingQuote,
      id: taskId,
      email,
      model: modelId,
      prompt: input.prompt,
      size,
      seconds: input.seconds,
      cost,
      requestBody: JSON.stringify(parameters),
      providerId,
      source: input.source,
      sourceId: input.sourceId,
      parameters,
      videoReferences: references,
      capabilitySnapshot: { ...cap },
      idempotencyKey,
      channelId: providerId,
      providerSnapshot: publicProviderSnapshot(providerConfig),
  });
  if (!claimed.created) return { taskId: claimed.task.id, cost: claimed.task.cost };
  try {
    await submitQueuedVideoTask(email, claimed.task, request, imageForUpload, false);
  } catch (error) {
    await scheduleCreationRetry(email, claimed.task, error);
  }
  return { taskId: claimed.task.id, cost: claimed.task.cost };
}

/** 临时桥:adapter.create 需要 url,而本地文件场景直接喂字节;保持一期等价行为。 */
async function createWithLocalImage(
  adapter: { id?: string; create(input: VideoGenerationRequest): Promise<unknown> },
  request: VideoGenerationRequest,
  image: { bytes: Buffer; mime: string; filename: string } | undefined
): Promise<VideoProviderCreateResult> {
  if (!image || adapter.id !== VIDEO_PROVIDER_ID) {
    return (await adapter.create(request)) as VideoProviderCreateResult;
  }
  // openai-videos 适配器自行 fetch url;本地 /media 地址无法被它直接读,
  // 所以把字节转成 data URL 交给适配器的 fetch 读取(readCanvasImage 兼容 data URL)。
  const withDataUrl: VideoGenerationRequest = {
    ...request,
    references: request.references.map((r) =>
      r.kind === "image" && r.id === request.references.find((item) => item.kind === "image")?.id
        ? { ...r, url: `data:${image.mime};base64,${image.bytes.toString("base64")}` }
        : r
    ),
  };
  void image;
  return (await adapter.create(withDataUrl)) as VideoProviderCreateResult;
}

function requestFromQueuedTask(task: VideoTaskRow): VideoGenerationRequest {
  const parameters = task.parameters ?? {};
  return {
    source: task.source as VideoTaskSource,
    sourceId: task.sourceId || undefined,
    providerId: task.providerId,
    modelId: task.model,
    prompt: task.prompt,
    negativePrompt: String(parameters.negativePrompt || "") || undefined,
    durationSeconds: Number(parameters.durationSeconds ?? parameters.seconds ?? task.seconds) || 4,
    aspectRatio: String(parameters.aspectRatio || "") || undefined,
    resolution: String(parameters.resolution || parameters.size || "") || undefined,
    width: Number(parameters.width) || undefined,
    height: Number(parameters.height) || undefined,
    generateAudio: parameters.generateAudio === true,
    watermark: parameters.watermark === true,
    references: (task.videoReferences ?? []) as VideoReference[],
    providerOptions: (parameters.providerOptions ?? {}) as Record<string, unknown>,
    idempotencyKey: task.idempotencyKey || String(parameters.idempotencyKey || "") || task.id,
  };
}

function videoCreationRetryConfigMatches(task: VideoTaskRow): boolean {
  const snapshotStrategy = String(task.providerSnapshot?.idempotencyStrategy || "");
  if (!["header", "body"].includes(snapshotStrategy)) return false;
  const current = getVideoProviderConfig(task.providerId || VIDEO_PROVIDER_ID);
  if (!current || current.idempotencyStrategy !== snapshotStrategy) return false;
  const currentSnapshot = publicProviderSnapshot(current);
  for (const field of [
    "protocol",
    "baseUrl",
    "createPath",
    "workflowId",
    "defaultModel",
    "credentialFingerprint",
  ] as const) {
    if (String(task.providerSnapshot?.[field] || "") !== String(currentSnapshot[field] || "")) return false;
  }
  if (snapshotStrategy === "body") {
    return String(task.providerSnapshot?.idempotencyBodyField || "") === String(current.idempotencyBodyField || "")
      && Boolean(current.idempotencyBodyField);
  }
  return true;
}

async function imageForQueuedTask(
  task: VideoTaskRow,
  request: VideoGenerationRequest
): Promise<{ bytes: Buffer; mime: string; filename: string } | undefined> {
  if (task.providerId !== VIDEO_PROVIDER_ID) return undefined;
  const reference = request.references.find((item) => item.kind === "image" && (item.url || item.artworkId));
  if (!reference) return undefined;
  const { readCanvasImage } = await import("@/lib/canvas-image-input");
  const image = await readCanvasImage(reference.url || reference.artworkId || "", "http://localhost/");
  return { bytes: image.buffer, mime: image.mimeType, filename: `naumi-ref-${task.id}.png` };
}

async function submitQueuedVideoTask(
  email: string,
  task: VideoTaskRow,
  preparedRequest?: VideoGenerationRequest,
  preparedImage?: { bytes: Buffer; mime: string; filename: string },
  isRecoveryRetry = true
): Promise<void> {
  if (isRecoveryRetry && !videoCreationRetryConfigMatches(task)) throw new IdempotencyConfigDriftError();
  const adapter = getVideoProvider(task.providerId || VIDEO_PROVIDER_ID);
  if (!adapter) throw new Error(`视频适配器 ${task.providerId} 未注册`);
  const request = preparedRequest ?? requestFromQueuedTask(task);
  const image = preparedImage ?? await imageForQueuedTask(task, request);
  const created = await createWithLocalImage(adapter, request, image);
  await markVideoTaskCreated({
    email,
    id: task.id,
    upstreamId: created.upstreamTaskId,
    responseBody: JSON.stringify(sanitizeVideoProviderPayload(created.rawResponse ?? {})),
  });
}

async function scheduleCreationRetry(
  email: string,
  task: VideoTaskRow,
  error: unknown
): Promise<void> {
  const nextAttempt = Number(task.pollAttempts ?? 0) + 1;
  const message = error instanceof Error ? error.message : "视频上游创建暂时失败";
  if (error instanceof PermanentVideoCreateError) {
    await failVideoTask({ email, id: task.id, error: message });
    return;
  }
  if (error instanceof IdempotencyConfigDriftError || !videoCreationRetryConfigMatches(task)) {
    await markVideoTaskCreationUnknown({
      email,
      id: task.id,
      error: `creation_unknown：供应商幂等能力未声明或与任务快照不一致，已停止自动重提；${message}`,
    });
    return;
  }
  const attempts = await scheduleVideoTaskRetry(
    email,
    task.id,
    POLL_BACKOFF_BASE_SECONDS * Math.min(nextAttempt, 6),
    message,
    true
  );
  if (attempts >= MAX_POLL_ATTEMPTS) {
    await failVideoTask({ email, id: task.id, error: "视频上游创建连续失败，任务已终止并退款" });
  }
}

async function scheduleTransientTaskRetry(
  email: string,
  task: VideoTaskRow,
  error: unknown,
  terminalMessage: string,
  completionPhase = false,
  successfulPollPhase = false
): Promise<VideoTaskRow> {
  const nextAttempt = Number(task.pollAttempts ?? 0) + 1;
  const message = error instanceof Error ? error.message : "视频任务处理暂时失败";
  const delaySeconds = POLL_BACKOFF_BASE_SECONDS * Math.min(nextAttempt, completionPhase ? 90 : 6);
  const attempts = await scheduleVideoTaskRetry(
    email,
    task.id,
    delaySeconds,
    message,
    true,
    completionPhase,
    successfulPollPhase
  );
  if (attempts >= MAX_POLL_ATTEMPTS) {
    if (completionPhase) {
      return { ...task, error: `${terminalMessage}；系统将低频持续重试`, pollAttempts: attempts };
    }
    await failVideoTask({ email, id: task.id, error: terminalMessage });
    return { ...task, status: "failed", error: terminalMessage };
  }
  return { ...task, error: message, pollAttempts: attempts };
}

export async function videoCostPublic(): Promise<number> {
  const snapshot=await(await getBillingRuntime()).config.current();
  return quote(snapshot,{feature:"video.generate",quantity:1,quality:"medium",resolution:"1K",metered:await meteringFor(snapshot),byok:false,paidFen:0,userGroup:"default"}).requestedCredits;
}

/** 轮询并结算:领取租约 → 查上游 → 完成/失败/继续处理。返回最新任务视图。 */
export async function pollAndSettle(
  email: string,
  id: string
): Promise<VideoTaskRow | null> {
  const task = await getVideoTask(email, id);
  if (!task) return null;
  if (task.status !== "queued" && task.status !== "processing") return task;

  const claimed = await claimVideoTaskPoll(email, id);
  if (!claimed) return { ...task, progress: Math.min(95, task.progress) };
  // 轮询续约:长任务期间预留不过期(并行会话的修复,吸收)
  await touchReservation(id).catch(() => {});

  // 进程可能在上游接单后、回写 upstream_id 前退出。queued intent 由
  // worker 使用相同幂等键重新提交，供应商返回原任务后再转 processing。
  if (task.status === "queued" || !task.upstreamId) {
    if (!videoCreationRetryConfigMatches(task)) {
      await markVideoTaskCreationUnknown({
        email,
        id,
        error: "creation_unknown：供应商幂等能力未声明或与任务快照不一致，需人工向上游核对任务",
      });
      return getVideoTask(email, id);
    }
    try {
      await submitQueuedVideoTask(email, task);
      return getVideoTask(email, id);
    } catch (error) {
      await scheduleCreationRetry(email, task, error);
      return getVideoTask(email, id);
    }
  }

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
  let pollSucceeded = false;
  let completionObserved = false;
  try {
    const result = await adapter.poll(snapshot);
    pollSucceeded = true;
    completionObserved = result.status === "completed";
    if (completionObserved) {
      await noteVideoTaskResultObserved(email, id);
    }
    const sanitizedPollResponse = sanitizeVideoProviderPayload(result.rawResponse);
    await recordVideoTaskPoll(
      email,
      id,
      result.progress,
      sanitizedPollResponse,
      sanitizeVideoProviderPayload(result.errorDetail)
    );
    if (result.status === "completed") {
      const artworkId = `vid-art-${id}`;
      let url = task.videoUrl;
      let resultStorageKey = task.resultStorageKey || "";
      if (!url) {
        const file = await adapter.fetchResult(snapshot, result);
        let bytes = file.bytes;
        let mimeType = file.mimeType;
        if ((!bytes || bytes.byteLength === 0) && file.url) {
          const response = await fetch(file.url, { signal: AbortSignal.timeout(120_000) });
          const downloaded = await readLimitedVideoResponse(response);
          bytes = downloaded.bytes;
          mimeType = downloaded.mimeType;
        }
        if (!bytes || bytes.byteLength === 0) throw new Error("视频供应商返回了空结果");
        const extension = videoExtensionForMime(mimeType);
        if (storageEnabled) {
          // Never construct a base64 copy for persisted videos: a 150MiB file
          // would otherwise allocate another ~200MiB string before upload.
          url = await uploadImage(bytes, mimeType, `videos/${artworkId}.${extension}`);
        } else {
          if (bytes.byteLength > 8 * 1024 * 1024) {
            throw new Error("视频结果超过 8MB，必须配置媒体存储后再落库");
          }
          url = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
        }
        resultStorageKey = url.startsWith("/media/") ? url.slice("/media/".length) : "";
        await stageVideoTaskResult({ email, id, videoUrl: url, resultStorageKey });
      }
      const referenceArtworkIds = (task.videoReferences ?? [])
        .map((reference) => String((reference as { artworkId?: string }).artworkId || ""))
        .filter(Boolean);
      const candidateParentIds = Array.from(new Set([
        ...(task.source === "canvas" && task.sourceId ? [task.sourceId] : []),
        ...referenceArtworkIds,
      ])).filter((parentId) => parentId !== artworkId);
      const ownedParents = candidateParentIds.length
        ? await listArtworksByIds(email, candidateParentIds)
        : [];
      const ownedParentIds = new Set(ownedParents.map((artwork) => artwork.id));
      const parentIds = candidateParentIds.filter((parentId) => ownedParentIds.has(parentId));
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
        parentId: parentIds[0] || null,
        parentIds: parentIds.slice(1),
        origin: task.source === "canvas" ? "canvas" : null,
        width: 0,
        height: 0,
        videoUrl: url,
      }], `vid-${Date.now()}`);
      // Legacy contract marker: completeVideoTask({ email, id, artworkId, videoUrl: url })
      await completeVideoTask({
        email,
        id,
        artworkId,
        videoUrl: url,
        resultStorageKey,
        lastResponse: sanitizedPollResponse,
      });
      return getVideoTask(email, id);
    }
    if (result.status === "failed" || result.status === "cancelled") {
      const message = result.errorMessage || (result.status === "cancelled" ? "上游任务已取消" : "上游生成失败");
      await failVideoTask({ email, id, error: message });
      return { ...task, status: "failed", error: message };
    }
    // 仍在排队/生成:安排下次调度并释放租约
    await scheduleVideoTaskRetry(email, id, 10, "", false);
    return { ...task, progress: Math.min(95, result.progress) };
  } catch (error) {
    if (pollSucceeded || error instanceof TransientPollError) {
      return scheduleTransientTaskRetry(
        email,
        task,
        error,
        completionObserved
          ? "视频结果连续落地失败，任务已终止并退款"
          : "上游长时间无响应,任务已终止并退款",
        completionObserved,
        pollSucceeded && !completionObserved
      );
    }
    const message = error instanceof Error ? error.message : "视频任务处理失败";
    await failVideoTask({ email, id, error: message });
    return { ...task, status: "failed", error: message };
  }
}

/** 任务列表(工作台/恢复)。 */
export async function listVideoTaskViews(
  email: string,
  opts: { status?: string; source?: string; sourceIds?: string[]; limit?: number } = {}
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
