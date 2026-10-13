import {materializeVideoReferences} from "./reference-materialization";
import {createHash} from "node:crypto";
import {createValidatedVideo,videoCreationInputDigest} from "./submission";
import {videoSubmissionSchema} from "./submission-schema";
import {VideoContractError} from "./contract";
import {beginVideoTaskSubmission,confirmVideoTaskCancelled,sendPendingVideoCancellation} from "./cancellation";
import {currentPrivateVideoContext} from "./providers/private-context";
import {decryptAtRest} from "../settings";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import "server-only";
import { BillingError } from "@/lib/billing/types";
import { currentModelExecution, runLegacyModelExecution } from "@/lib/model-config/context";
import type { ExecutionBundle } from "@/lib/model-config/context";
import { getModelExecutor, withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { modelConfigurationEnabled } from "@/lib/model-config/requests";
import { getModelAdministration } from "@/lib/model-config/server";
import { ModelConfigError } from "@/lib/model-config/types";
import {getBillingRuntime,meteringFor} from "@/lib/billing/server";
import {quote} from "@/lib/billing/quote";

import {
  claimVideoTaskPoll,
  failVideoTask,
  getVideoTask,
  getVideoTaskByIdempotencyKey,
  listArtworksByIds,
  listDueVideoTaskRefs,
  listVideoTasks,
  markVideoTaskCreated,
  markVideoTaskCreationUnknown,
  markVideoTaskAttention,
  noteVideoTaskResultObserved,
  recordVideoTaskPoll,
  scheduleVideoTaskRetry,
  touchReservation,
} from "@/lib/db";

import {completeVideoResultSet} from "./result-completion";
import {mediaExtension} from "./media-formats";


import { getPool } from "@/lib/db";
import { isImportedHistory } from "@/lib/staging-history";
import { PermanentVideoCreateError, TransientPollError } from "@/lib/video/types";
import { getVideoProvider } from "@/lib/video/providers/adapter";

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

export type CreateVideoInput = {
  billingConfirmation?:{version?:number;credits?:number};
  source: VideoTaskSource;
  sourceId?: string;
  projectKey?:string;
  nodeId?:string;
  nodeRevision?:number;
  mode?:VideoGenerationRequest["mode"];
  orderedInputs?:VideoGenerationRequest["orderedInputs"];
  shots?:VideoGenerationRequest["shots"];
  elements?:VideoGenerationRequest["elements"];
  camera?:import("zod").infer<typeof import("./submission-schema").videoCameraSchema>;
  workflowManifest?:VideoGenerationRequest["workflowManifest"];
  workflowTaskId?:string;
  retryOf?:string;
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
  | "cancellationRequestedAt"
  | "cancellationSentAt"
  | "supplierCancellationSupported"
  | "errorCode"
>&{updatedAt?:string;retryOf?:string|null;projectKey?:string|null;resultAssets:import("./result-assets").SavedVideoResultAsset[];resultMetadataWarnings:Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>};

/** Public API projection. Durable provider snapshots and raw responses stay server-only. */
export function publicVideoTaskView(task: VideoTaskRow): PublicVideoTaskView {
  const managed = (task.parameters.modelExecutions as ExecutionBundle | undefined)?.video;
  return {
    id: task.id,
    model: managed?.publicModelId || task.model,
    prompt: task.prompt,
    status: task.status,
    progress: task.progress,
    cost: task.cost,
    artworkId: task.artworkId,
    videoUrl: task.videoUrl,
    error: task.error,
    providerId: managed ? "managed-video" : task.providerId,
    source: task.source,
    sourceId: task.sourceId,
    seconds: task.seconds,
    nextPollAt: task.nextPollAt,
    createdAt: task.createdAt,
    updatedAt:task.updatedAt,
    projectKey:typeof task.parameters.projectKey==="string"?task.parameters.projectKey:null,
    retryOf:typeof task.parameters.retryOf==="string"?task.parameters.retryOf:null,
    completedAt: task.completedAt,
    cancellationRequestedAt:task.cancellationRequestedAt,
    cancellationSentAt:task.cancellationSentAt,
    supplierCancellationSupported:task.supplierCancellationSupported,
    errorCode:task.errorCode,
    resultAssets:task.status==="completed"&&Array.isArray(task.parameters.resultAssets)?task.parameters.resultAssets as import("./result-assets").SavedVideoResultAsset[]:[],
    resultMetadataWarnings:task.status==="completed"&&Array.isArray(task.parameters.resultMetadataWarnings)?task.parameters.resultMetadataWarnings as Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>:[],
  };
}

export function resolveVideoServiceConfig() {
  return resolveOpenAiVideosConfig();
}

/** 创建视频任务:规范化 → 能力校验 → 预扣 → 上游创建 → 落库。 */
export async function createVideoGeneration(
  email: string,
  input: CreateVideoInput
): Promise<{ taskId: string; cost: number }> {
  email=email.toLowerCase();
  const parsed=videoSubmissionSchema.safeParse(input);
  if(!parsed.success)throw new VideoContractError("INVALID_VIDEO_SUBMISSION","视频提交字段无效",parsed.error.issues.map(issue=>issue.path.join(".")));
  if(input.workflowTaskId){
    if(input.workflowManifest)throw new VideoContractError("WORKFLOW_SOURCE_CONFLICT","请选择一个工作流来源");
    const {readOwnedVideoWorkflow}=await import("./workflow-source"),old=await readOwnedVideoWorkflow(email,input.workflowTaskId);
    if(old.publicModelId!==input.modelId)throw new ModelConfigError("VIDEO_WORKFLOW_MODEL_CONFLICT","历史工作流与当前模型不一致，请重新选择模型",409);
    const {workflowTaskId:_source,...settings}=input;input={...settings,workflowManifest:old.manifest};
  }
  const key = String(input.idempotencyKey || "").trim();
  if (key) {
    const existing = await getVideoTaskByIdempotencyKey(email, key);
    if (existing?.parameters?.creationInputDigest) {
      if (existing.parameters.creationInputDigest !== videoInputDigest(input)) throw new BillingError("OPERATION_CONFLICT", "操作编号已用于不同视频任务", 409);
      return { taskId: existing.id, cost: existing.cost };
    }
  }
  if (!currentModelExecution("video") && await modelConfigurationEnabled()) {
    const admin = await getModelAdministration();
    const [snapshot, billing] = await Promise.all([admin.repo.current(), admin.billing.current()]);
    const executor = await getModelExecutor();
    const video = await executor.resolve({ feature:"video.generate", binding: "video.generate", requestedModelId: input.modelId || undefined, snapshot, billing });
    return executor.runBundle({ modelVersion: snapshot.version, billingVersion: billing.version, primary: "video", video }, billing, () => createVideoGeneration(email, input));
  }
  return createVideoGenerationUnlocked(email, {
    ...input,
    idempotencyKey: key || crypto.randomUUID(),
  });
}

const videoInputDigest=videoCreationInputDigest;
async function createVideoGenerationUnlocked(email:string,input:CreateVideoInput):Promise<{taskId:string;cost:number}>{
  return createValidatedVideo(email,input,{submit:(actor,task,request)=>submitQueuedVideoTask(actor,task,request,undefined,false),creationError:scheduleCreationRetry});
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

export function requestFromQueuedTask(task: VideoTaskRow): VideoGenerationRequest {
  const parameters = task.parameters ?? {};
  if(parameters.version===2&&parameters.request){
    const request=structuredClone(parameters.request) as VideoGenerationRequest;
    if(typeof parameters.workflowManifestEnc==="string"){
      const text=decryptAtRest(parameters.workflowManifestEnc);if(!text)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","工作流映射快照不可用",503);
      request.workflowManifest=videoWorkflowManifestSchema.parse(JSON.parse(text));
    }return request;
  }
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
    generateAudio: typeof parameters.generateAudio==="boolean"?parameters.generateAudio:undefined,
    watermark: typeof parameters.watermark==="boolean"?parameters.watermark:undefined,
    references: (task.videoReferences ?? []) as VideoReference[],
    providerOptions: (parameters.providerOptions ?? {}) as Record<string, unknown>,
    idempotencyKey: task.idempotencyKey || String(parameters.idempotencyKey || "") || task.id,
  };
}

function videoCreationRetryConfigMatches(task: VideoTaskRow): boolean {
  if(task.parameters?.version===2)return task.parameters.submissionState==="prepared";
  // A declared idempotency header is not proof that a paid POST was deduplicated.
  // Versioned tasks without an accepted upstream ID require reconciliation before resubmission.
  if (task.parameters?.modelExecutions) return false;
  const snapshotStrategy = String(task.providerSnapshot?.idempotencyStrategy || "");
  if (!["header", "body"].includes(snapshotStrategy)) return false;
  const current = getVideoProviderConfig(task.providerId || VIDEO_PROVIDER_ID);
  if (!current || current.idempotencyStrategy !== snapshotStrategy) return false;
  const currentSnapshot = publicProviderSnapshot(current);
  for (const field of [
    "protocol",
    "baseUrl",
    "createPath",
    "videoProfile",
    "pollPath",
    "contentPath",
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
  request: VideoGenerationRequest,
  email: string
): Promise<{ bytes: Buffer; mime: string; filename: string } | undefined> {
  if (getVideoProviderConfig(task.providerId)?.protocol !== "openai-videos") return undefined;
  const reference = request.references.find((item) => item.kind === "image" && (item.url || item.artworkId));
  if (!reference) return undefined;
  const { readCanvasImage } = await import("@/lib/canvas-image-input");
  const image = await readCanvasImage(reference.url || reference.artworkId || "", "http://localhost/", email);
  if(reference.sha256&&createHash("sha256").update(image.buffer).digest("hex")!==reference.sha256)throw new VideoContractError("REFERENCE_UNAVAILABLE","已冻结图片字节已改变",["references"]);
  return { bytes: image.buffer, mime: image.mimeType, filename: `naumi-ref-${task.id}.${mediaExtension(image.mimeType)}` };
}

export async function submitQueuedVideoTask(
  email: string,
  task: VideoTaskRow,
  preparedRequest?: VideoGenerationRequest,
  preparedImage?: { bytes: Buffer; mime: string; filename: string },
  isRecoveryRetry = true
): Promise<void> {
  if (isRecoveryRetry && !videoCreationRetryConfigMatches(task)) throw new IdempotencyConfigDriftError();
  const adapter = getVideoProvider(task.providerId || VIDEO_PROVIDER_ID);
  if (!adapter) throw new Error(`视频适配器 ${task.providerId} 未注册`);
  const persistedRequest = preparedRequest ?? requestFromQueuedTask(task);
  if(task.parameters.byocSnapshot){const context=currentPrivateVideoContext();if(!context)throw new Error("自备视频执行配置缺失");persistedRequest.workflowManifest=context.manifest;}
  const cfg=getVideoProviderConfig(task.providerId);
  const multipart=cfg?.protocol==="openai-videos"&&!cfg.videoProfile||["openai-videos","comfyui","runninghub"].includes(cfg?.videoProfile||"");
  const inlineImages=cfg?.videoProfile==="openai-videos"||cfg?.videoProfile==="gemini"||cfg?.videoProfile==="cogvideox3"||cfg?.videoProfile==="grok2api"||cfg?.videoProfile==="agnes"||cfg?.videoProfile==="compshare-hailuo";
  const request=await materializeVideoReferences(email,persistedRequest,{multipart,inlineImages});
  const image=preparedImage??await imageForQueuedTask(task,request,email);
  const submission=await beginVideoTaskSubmission(email,task.id);
  if(submission==="cancelled")return;
  if(submission!=="started")throw new IdempotencyConfigDriftError();
  const {withBiModelContext}=await import("@/lib/bi/model-observer");
  const created = await withBiModelContext(email,'video.generate',task.id,()=>createWithLocalImage(adapter, request, image));
  await markVideoTaskCreated({
    email,
    id: task.id,
    upstreamId: created.upstreamTaskId,
    responseBody: JSON.stringify(sanitizeVideoProviderPayload(created.rawResponse ?? {})),
  });
  const {videoSupplierReceipt}=await import("@/lib/supplier-cost/video");
  await videoSupplierReceipt(task.id,created.upstreamTaskId,created.status,created.rawResponse).catch(()=>{});
}

async function scheduleCreationRetry(
  email: string,
  task: VideoTaskRow,
  error: unknown
): Promise<void> {
  task=await getVideoTask(email,task.id)||task;
  if(["completed","failed","cancelled"].includes(task.status)||task.upstreamId)return;
  const nextAttempt = Number(task.pollAttempts ?? 0) + 1;
  const message = error instanceof Error ? error.message : "视频上游创建暂时失败";
  if (error instanceof PermanentVideoCreateError || error instanceof ModelConfigError && error.code === "PROVIDER_BUSY" || error instanceof VideoContractError&&task.parameters?.submissionState==="prepared") {
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
export const handleVideoCreationError=scheduleCreationRetry;

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
    await markVideoTaskAttention(email,task.id,"poll_unknown","上游结果长时间无法核对，预扣保持，等待人工核查");
    return (await getVideoTask(email,task.id))||task;
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
  if (await isImportedHistory(getPool(), "app_video_tasks", id)) return task;
  if(task.parameters.byocSnapshot){const {withByocVideoTask}=await import("./byoc");return withByocVideoTask(email,task,()=>pollAndSettleTask(email,id,task));}
  if (task.parameters?.modelExecutions) return withFrozenExecutionBundle(task.parameters.modelExecutions as import("@/lib/model-config/context").ExecutionBundle, () => pollAndSettleTask(email, id, task));
  return runLegacyModelExecution(() => pollAndSettleTask(email, id, task));
}
async function pollAndSettleTask(email: string, id: string, task: VideoTaskRow): Promise<VideoTaskRow | null> {
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
  await sendPendingVideoCancellation(email,task,snapshot);
  let pollSucceeded = false;
  let completionObserved = false;
  try {
    const result = await adapter.poll(snapshot);
    const {videoSupplierReceipt}=await import("@/lib/supplier-cost/video");
    await videoSupplierReceipt(task.id,task.upstreamId,result.status,result.rawResponse);
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
      await completeVideoResultSet(email,task,snapshot,adapter,result,sanitizedPollResponse);
      return getVideoTask(email,id);
    }
    if (result.status === "cancelled") {
      await confirmVideoTaskCancelled(email,id);return getVideoTask(email,id);
    }
    if (result.status === "failed") {
      const message = result.errorMessage || "上游生成失败";
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
          ? "视频结果落地暂时失败，预扣保持"
          : "上游结果暂时无法核对，预扣保持",
        completionObserved,
        pollSucceeded && !completionObserved
      );
    }
    const message = error instanceof Error ? error.message : "视频任务处理失败";
    await markVideoTaskAttention(email,id,"poll_unknown",message);
    return getVideoTask(email,id);
  }
}

/** 任务列表(工作台/恢复)。 */
export async function listVideoTaskViews(
  email: string,
  opts: { status?: string; source?: string; sourceIds?: string[]; projectKey?: string; nodeId?: string; limit?: number;cursor?:{createdAt:string;id:string};pendingOnly?:boolean } = {}
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
