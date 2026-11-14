import "server-only";
import {withBackgroundActivity,detachBackgroundActivity,bindBackgroundClaim} from "../release-runtime/background-activity";
import {deferApplicationTask,applicationTasksRunHere,wakeApplicationWorker} from "../application/task-execution";
import {materializeVideoReferences} from "./reference-materialization";
import {createHash} from "node:crypto";
import {VideoContractError} from "./contract";
import {beginVideoTaskSubmission,confirmVideoTaskCancelled,sendPendingVideoCancellation} from "./cancellation";
import {currentPrivateVideoContext} from "./providers/private-context";
import {withByocVideoTask} from "./byoc-context";
import {decryptAtRest} from "../settings";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import {withFrozenCreation,frozenCreationScope} from "../saas/creation-scope";
import {runLegacyModelExecution,type ExecutionBundle} from "../model-config/context";
import {withFrozenExecutionBundle} from "../model-config/execution";
import {ModelConfigError} from "../model-config/types";
import {claimVideoTaskPoll,listDueVideoTaskRefs,noteVideoTaskResultObserved,recordVideoTaskPoll,scheduleVideoTaskRetry} from "./task-polling";
import {failVideoTask,markVideoTaskCreated,markVideoTaskCreationUnknown,markVideoTaskAttention} from "./task-transitions";
import {getVideoTask} from "./task-repository";
import {touchReservation} from "../billing/reservations";
import {completeVideoResultSet} from "./result-completion";
import {mediaExtension} from "./media-formats";
import {getPool} from "@/platform/db/pool";
import {isImportedHistory} from "../staging-history";
import {PermanentVideoCreateError,TransientPollError,type VideoGenerationRequest,type VideoProviderCreateResult,type VideoReference,type VideoTaskSource} from "./types";
import {getVideoProvider} from "./providers/adapter";
import {getVideoProviderConfig,publicProviderSnapshot} from "./providers/config";
import type {VideoTaskRow} from "./task-types";
import {compiledVideoRequest,readTaskCompiledVideoPlan} from './compiled-task';
import {hasVersionedVideoSubmission,videoRecoveryAdmission} from './submission-state';
import {materializeCompiledVideoTask} from './compiled-materialization';

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
  if(parameters.version===3){
    const plan=readTaskCompiledVideoPlan(String((parameters.creationScope as {actorEmail?:string}|undefined)?.actorEmail||''),task);
    return {...compiledVideoRequest(plan,task.source as VideoTaskSource,task.idempotencyKey||task.id,task.sourceId),canvasNodeId:typeof parameters.nodeId==='string'?parameters.nodeId:undefined,nodeRevision:typeof parameters.nodeRevision==='number'?parameters.nodeRevision:undefined};
  }
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
  if(hasVersionedVideoSubmission(task.parameters))return task.parameters.submissionState==="prepared";
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
  const config=getVideoProviderConfig(task.providerId);
  // Profile codecs consume the authorized materialized references themselves.
  // The legacy image reader cannot read a supplier's signed object URL.
  if (config?.protocol !== "openai-videos" || config.videoProfile) return undefined;
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
  if(!applicationTasksRunHere()){await wakeApplicationWorker();return;}
  if (isRecoveryRetry && !videoCreationRetryConfigMatches(task)) throw new IdempotencyConfigDriftError();
  const adapter = getVideoProvider(task.providerId || VIDEO_PROVIDER_ID);
  if (!adapter) throw new Error(`视频适配器 ${task.providerId} 未注册`);
  if(task.parameters.version===3){
    if((await getVideoTask(email,task.id))?.status==='cancelled')return;
    if(!adapter.createCompiled)throw new VideoContractError('VIDEO_COMPILED_TRANSPORT_UNAVAILABLE','冻结视频传输尚未配置');
    const wire=await materializeCompiledVideoTask(email,task);
    const submission=await beginVideoTaskSubmission(email,task.id);
    if(submission==='cancelled')return;
    if(submission!=='started')throw new IdempotencyConfigDriftError();
    const {withBiModelContext}=await import('@/lib/bi/context');
    const created=await withBiModelContext(email,'video.generate',task.id,()=>adapter.createCompiled!(wire,task.idempotencyKey||task.id));
    await markVideoTaskCreated({email,id:task.id,upstreamId:created.upstreamTaskId,responseBody:JSON.stringify(sanitizeVideoProviderPayload(created.rawResponse??{}))});
    const {videoSupplierReceipt}=await import('@/lib/supplier-cost/video');
    await videoSupplierReceipt(task.id,created.upstreamTaskId,created.status,created.rawResponse).catch(()=>{});
    return;
  }
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
  const {withBiModelContext} = await import("@/lib/bi/context");
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

async function pollAndSettleLocal(
  email: string,
  id: string
): Promise<VideoTaskRow | null> {
  const task = await getVideoTask(email, id);
  if (!task) return null;
  if (await isImportedHistory(getPool(), "app_video_tasks", id)) return task;
  return withFrozenCreation(frozenCreationScope(task.parameters.creationScope,email),async()=>{
   if(task.parameters.byocSnapshot){return withByocVideoTask(email,task,()=>pollAndSettleTask(email,id,task));}
   if (task.parameters?.modelExecutions) return withFrozenExecutionBundle(task.parameters.modelExecutions as import("@/lib/model-config/context").ExecutionBundle, () => pollAndSettleTask(email, id, task));
   return runLegacyModelExecution(() => pollAndSettleTask(email, id, task));
  });
}

async function pollAndSettleTask(email: string, id: string, task: VideoTaskRow): Promise<VideoTaskRow | null> {
  if (task.status !== "queued" && task.status !== "processing") return task;

  const claimed = await claimVideoTaskPoll(email, id);
  if (!claimed) return { ...task, progress: Math.min(95, task.progress) };
  await bindBackgroundClaim(id);
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

// A process owns callbacks, not another queue. Retain the original scan width
// across wakeups; durable task leases still arbitrate between processes.
const recoveringVideoTasks=new Set<string>();
export async function recoverDueVideoTasks(limit = 5): Promise<number> {
  if(await deferApplicationTask())return 0;
  const direct=process.env.NAUMI_APPLICATION_TASK_EXECUTION==="worker";
  const available=direct?Math.max(0,limit-recoveringVideoTasks.size):limit;
  if(!available)return 0;
  const refs = await listDueVideoTaskRefs(available);
  let processed = 0;
  for (const ref of refs) {
    try {
      if(direct){
        if(recoveringVideoTasks.has(ref.id)||recoveringVideoTasks.size>=limit)continue;
        recoveringVideoTasks.add(ref.id);
        try{
          const task=await getVideoTask(ref.email,ref.id);
          if(!task){recoveringVideoTasks.delete(ref.id);continue;}
          const admission=videoRecoveryAdmission(task);
          const admitted=await detachBackgroundActivity("video-poll",ref.id,admission,async()=>{
            try{await pollAndSettleLocal(ref.email,ref.id);}finally{
              recoveringVideoTasks.delete(ref.id);
            }
          },wakeApplicationWorker);
          if(admitted)processed++;else recoveringVideoTasks.delete(ref.id);
        }catch(error){recoveringVideoTasks.delete(ref.id);throw error;}
        continue;
      }
      await pollAndSettle(ref.email, ref.id);
      processed += 1;
    } catch {
      /* 单任务失败不阻塞其余 */
    }
  }
  return processed;
}

export async function pollAndSettle(email:string,id:string):Promise<VideoTaskRow|null> {
  const task=await getVideoTask(email,id);
  if(!task)return null;
  if(await deferApplicationTask())return task;
  // Existing upstream tasks remain GET-only poll/settlement during drain. A
  // queued creation intent is a new local claim and waits for the open slot.
  const admission=videoRecoveryAdmission(task);
  return withBackgroundActivity("video-poll", id, admission, () => pollAndSettleLocal(email,id), () => getVideoTask(email,id));
}
