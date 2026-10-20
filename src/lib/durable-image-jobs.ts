import { withBackgroundActivity, detachBackgroundActivity, bindBackgroundClaim } from "@/lib/release-runtime/background-activity";
import { releaseRuntimeEnabled } from "@/lib/release-runtime/identity";
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { dbEnabled, getPool } from "@/lib/db";
import { assertMutableStagingTask } from "./staging-history";
import { uploadImage, readManagedObject } from "@/lib/storage";
import { workerSecret } from "@/lib/settings-secret";
import * as repository from "@/lib/image-job-repository";
import { ImageOperationPending, ImageOperationReview, isImageGatewayModel, withImageOperation } from "@/lib/image-gateway";
import { IMAGE_REVIEW_MESSAGE } from "./image-job-review";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { withBiModelContext } from "@/lib/bi/model-observer";
import type {BillingQuote,BillingResult} from "@/lib/billing/types";
import { currentExecutionBundle, currentModelExecution, runLegacyModelExecution, type ExecutionBundle } from "@/lib/model-config/context";
import { withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { recoverableChannelIdentity } from "@/lib/model-config/channel-availability";
import { hasUnreplayableImageAttempt, imageJobHasResults, IMAGE_JOB_RELEASED_MESSAGE, IMAGE_JOB_REVIEW_MESSAGE } from "./image-job-failure";

type Execution = { id: string; token: string; queue: Promise<unknown> };
const execution = new AsyncLocalStorage<Execution>();
const uploaded = new WeakMap<Buffer, string>();

async function encode(value: unknown, id: string): Promise<unknown> {
  if (Buffer.isBuffer(value)) {
    let url = uploaded.get(value);
    if (!url) {
      const hash = createHash("sha256").update(value).digest("hex");
      url = await uploadImage(value, "application/octet-stream", `image-job-inputs/${id}/${hash}.bin`);
      uploaded.set(value, url);
    }
    return { $imageJobBuffer: url };
  }
  if (Array.isArray(value)) return Promise.all(value.map((entry) => encode(entry, id)));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encode(entry, id)])));
  }
  return value;
}

async function decode(value: unknown): Promise<unknown> {
  if (value && typeof value === "object" && "$imageJobBuffer" in value) {
    const url = String((value as Record<string, unknown>).$imageJobBuffer);
    const buffer = (await readManagedObject(url, 64 * 1024 * 1024)).bytes;
    uploaded.set(buffer, url);
    return buffer;
  }
  if (Array.isArray(value)) return Promise.all(value.map(decode));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await decode(entry)])));
  return value;
}

export function imageWorkerAuthorized(request: Request): boolean {
  let configured: string;
  try { configured=workerSecret(); } catch { return false; }
  const supplied = request.headers.get("x-video-worker-secret") || "";
  const a=Buffer.from(configured), b=Buffer.from(supplied);
  return configured.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}

/** Memory fallback is only for the database-free demonstration mode. */
export class DurableImageJobs<T extends { status: string }> {
  private memory = new Map<string, { snapshot: T; payload: unknown; email: string }>();
  constructor(readonly kind: repository.ImageJobKind) {}
  async create(id: string, email: string, snapshot: T, payload: unknown, cost: number, reserve: boolean,billingQuote?:BillingQuote) {
    const models = currentExecutionBundle();
    if (models && payload && typeof payload === "object") payload = { ...payload, modelExecutions: structuredClone(models) };
    snapshot = { ...snapshot, paidOperationVersion: 1 };
    if (!dbEnabled) { this.memory.set(id, { snapshot, payload, email }); return; }
    await repository.createImageJob(id, email, this.kind, await encode(snapshot, id), await encode(payload, id), cost, reserve,billingQuote);
  }
  async get(id: string, hydrate = true): Promise<T | undefined> {
    if (!dbEnabled) return this.memory.get(id)?.snapshot;
    const row = await repository.getImageJob(id, this.kind);
    if (!row) return undefined;
    return (hydrate ? await decode(row.snapshot) : row.snapshot) as T;
  }
  async owner(id: string): Promise<string | undefined> {
    return dbEnabled ? (await repository.getImageJob(id, this.kind))?.email : this.memory.get(id)?.email;
  }
  async set(id: string, snapshot: T) {
    if (!dbEnabled) { const row = this.memory.get(id); if (row) row.snapshot = snapshot; return; }
    await repository.saveImageJob(id, await encode(snapshot, id), execution.getStore()?.token || null);
  }
  async patch(id: string, patch: Partial<T>) {
    const context = execution.getStore();
    const update = async () => {
      const current = await this.get(id, false);
      if (current) await this.set(id, { ...current, ...patch });
    };
    if (!context) return update();
    const next = context.queue.then(update);
    context.queue = next;
    await next;
  }
  async settle(id: string, cost: number|BillingResult, reason: string) {
    if (dbEnabled) await repository.settleImageJob(id, cost, reason, execution.getStore()?.token || null);
  }
  async settleResults(id:string,legacyCost:number,reason:string,result:BillingResult){
    if(!dbEnabled)return;
    const row=await repository.getImageJob(id,this.kind);
    await this.settle(id,row?.payload.billingQuote?result:legacyCost,reason);
  }
  /** Keep only genuinely replayable supplier tasks running; direct calls have
   * no query/replay contract and must not trap customers in an endless hold. */
  async handlePending(id: string, error: ImageOperationPending) {
    const saved = await this.get(id, false) as (T & Record<string, any>) | undefined;
    if (!saved || ["done", "error"].includes(saved.status)) return;
    if(error instanceof ImageOperationReview){
      await this.patch(id,{status:"needs_attention",error:IMAGE_REVIEW_MESSAGE,reviewCode:error.reviewCode} as unknown as Partial<T>);return;
    }
    if (!hasUnreplayableImageAttempt(saved)) {
      await this.patch(id, { status: "pending", error: error.message } as unknown as Partial<T>); return;
    }
    if (dbEnabled) {
      if (await repository.failUndeliveredImageJob(id, execution.getStore()?.token || null, "unrecoverable-upstream-result")) return;
    } else if (!imageJobHasResults(saved)) {
      await this.patch(id, { status: "error", error: IMAGE_JOB_RELEASED_MESSAGE, customerBilling: "released", supplierCostStatus: "pending" } as unknown as Partial<T>); return;
    }
    await this.patch(id, { status: "needs_attention", error: IMAGE_JOB_REVIEW_MESSAGE } as unknown as Partial<T>);
  }
  /** Persist intent before paid work. Only a durable Router operation may replay. */
  async paidOperation<R>(id: string, model: string, operation: Parameters<typeof withImageOperation>[1], run: () => Promise<R>): Promise<R> {
    if (dbEnabled) await assertMutableStagingTask(getPool(), "app_image_jobs", id);
    type Attempt = { model: string; replayable: boolean; gatewayIdentity?: string; state: "started" | "done" | "rejected"; result?: R };
    type Snapshot = T & { paidOperations?: Record<string, Attempt> };
    const update = async (change: (current: Snapshot) => Snapshot) => {
      const work = async () => {
        const current = await this.get(id, false) as Snapshot | undefined;
        if (!current) throw new Error("图片任务不存在");
        await this.set(id, change(current));
      };
      const context = execution.getStore();
      if (!context) return work();
      const next = context.queue.then(work);
      context.queue = next.catch(() => {});
      await next;
    };
    const saved = await this.get(id) as Snapshot | undefined;
    if (!saved || ["done", "error", "needs_attention"].includes(saved.status)) throw new Error("图片任务已结束或暂停，不能重新提交");
    const previous = saved?.paidOperations?.[operation.id];
    if (previous?.state === "done") return previous.result as R;
    const pinnedRecovery = previous?.state === "started" && dbEnabled ? await recoverableChannelIdentity(getPool(),currentModelExecution("image"),operation.id) : undefined;
    const replayable = operation.managedGateway !== false && isImageGatewayModel(model);
    const gatewayIdentity = replayable ? createHash("sha256").update(JSON.stringify([
      (await getOpenAIBaseUrl()) || "https://api.openai.com/v1", (await getOpenAISettings()).apiKey,
      process.env.NAUMI_ROUTER_STATE_DOMAIN || "",
      ...(currentModelExecution("image")?.frozen.routerDigest ? [currentModelExecution("image")!.frozen.routerDigest] : []),
    ])).digest("hex") : undefined;
    if (previous?.state === "started" && (!pinnedRecovery || previous.model !== model) && (!previous.replayable || previous.model !== model || previous.gatewayIdentity !== gatewayIdentity)) {
      await repository.holdImageJobBilling(id);
      throw new ImageOperationPending(operation.id, new Error("上游提交需要人工核查"));
    }
    const attempt: Attempt = { model, replayable: !!pinnedRecovery || replayable, gatewayIdentity: pinnedRecovery || gatewayIdentity, state: "started" };
    await update((current) => {
      const active = current.paidOperations?.[operation.id];
      if (active?.state === "done" || (active?.state === "started" && (!pinnedRecovery || active.model !== model) && (!active.replayable || active.model !== model || active.gatewayIdentity !== gatewayIdentity))) {
        throw new ImageOperationPending(operation.id, new Error("上游提交需要核查或读取已存结果"));
      }
      return { ...current, paidOperations: { ...current.paidOperations, [operation.id]: attempt } };
    });
    try {
      const result = await withImageOperation(model, { ...operation, durable: true }, run);
      await update((current) => ({ ...current, paidOperations: { ...current.paidOperations, [operation.id]: { ...attempt, state: "done", result } } }));
      return result;
    } catch (error) {
      if (error instanceof ImageOperationPending && dbEnabled) {
        const identity=await recoverableChannelIdentity(getPool(),currentModelExecution("image"),operation.id);
        if(identity)await update(current=>({...current,paidOperations:{...current.paidOperations,[operation.id]:{...attempt,replayable:true,gatewayIdentity:identity}}}));
      }
      const status = (error as { status?: number } | null)?.status;
      if ([400, 401, 403, 404, 422, 429].includes(status || 0)) {
        await update((current) => ({ ...current, paidOperations: { ...current.paidOperations, [operation.id]: { ...attempt, state: "rejected" } } }));
        throw error;
      }
      await repository.holdImageJobBilling(id);
      throw error instanceof ImageOperationPending ? error : new ImageOperationPending(operation.id, error);
    }
  }
  async reserveReviewed(id: string) { if (dbEnabled) await repository.reserveReviewedImageJob(id); }
  async reviewSource(id: string, index: number, redo: boolean, feedback="") { return repository.reviewImageSource(id,index,redo,feedback); }
  async active(email: string) { return dbEnabled ? repository.listActiveImageJobs(email, this.kind) : []; }
  async kick(id: string, run: (payload: Record<string, unknown>, snapshot: T) => Promise<void>) {
    if (!dbEnabled) {
      const row = this.memory.get(id);
      if (row) void run(row.payload as Record<string, unknown>, row.snapshot).catch(console.error);
      return;
    }
    const executeClaimed = async (row: repository.ImageJobRow) => {
    const token = row.lease_token!;
    await bindBackgroundClaim(`${this.kind}:${id}`, token);
    const context: Execution = { id, token, queue: Promise.resolve() };
    await execution.run(context, async () => {
      const heartbeat = setInterval(() => {
        void repository.heartbeatImageJob(id, token).catch(() => { clearInterval(heartbeat); });
      }, 25_000);
      heartbeat.unref?.();
      try {
        // Pre-upgrade jobs have no evidence that a paid request was never sent.
        if (row.snapshot.paidOperationVersion !== 1) {
          if (!(await repository.failUndeliveredImageJob(id, token, "legacy-unknown-submission")))
            await this.patch(id, { status: "needs_attention", error: IMAGE_JOB_REVIEW_MESSAGE } as unknown as Partial<T>);
          return;
        }
        const payload = await decode(row.payload) as Record<string, unknown>, snapshot = await decode(row.snapshot) as T;
        const resume = () => withBiModelContext(row.email,this.kind,id,async()=>run(payload,snapshot));
        if (payload.modelExecutions) await withFrozenExecutionBundle(payload.modelExecutions as ExecutionBundle, resume);
        else if(this.kind==="imagegen") await resume();
        else await runLegacyModelExecution(resume);
      }
      catch (error) {
        console.error(`[image-job] ${id}:`, error instanceof Error ? error.message : error);
        try {
          if (error instanceof ImageOperationPending) await this.handlePending(id, error);
          else if (!(await repository.failUndeliveredImageJob(id, token, "image-worker-failed")))
            await this.patch(id, { status: "needs_attention", error: IMAGE_JOB_REVIEW_MESSAGE } as unknown as Partial<T>);
        } catch (failure) { console.error(`[image-job] ${id}: unable to stop task`, failure instanceof Error ? failure.message : "unknown"); }
      }
      finally {
        clearInterval(heartbeat);
        await context.queue.catch(() => {});
        await repository.releaseImageJob(id, token).catch(() => {});
      }
    });
    };
    if(!releaseRuntimeEnabled()) {
      const row=await repository.claimImageJob(id,this.kind);
      if(row)void executeClaimed(row).catch(console.error);
      return;
    }
    await detachBackgroundActivity("durable-image", `${this.kind}:${id}`, "claim", async () => {
      const row=await repository.claimImageJob(id,this.kind);
      if(row)await executeClaimed(row);
    });
  }
}

/** Dispatch recoverable work through the existing authenticated worker channel. */
async function recoverDurableImageJobsLocal(): Promise<number> {
  if (!dbEnabled) return 0;
  const jobs = await repository.dueImageJobs();
  const origin = process.env.INTERNAL_APP_ORIGIN || "http://127.0.0.1:3000";
  let count = 0;
  for (const job of jobs) {
    const route = job.kind === "generate" ? "generate-image" : job.kind;
    const result = await fetch(`${origin}/api/${route}`, { method: "POST", headers: {
      "content-type": "application/json", "x-video-worker-secret": process.env.VIDEO_WORKER_SECRET || "",
    }, body: JSON.stringify({ workerJobId: job.id }), signal: AbortSignal.timeout(10_000) });
    if (result.ok) count++;
  }
  const {recoverImagegenBatches}=await import("./imagegen/batch");
  return count+await recoverImagegenBatches();
}

export async function recoverDurableImageJobs():Promise<number> {
  return withBackgroundActivity("durable-image", "recovery-dispatch-scan", "claim", () => recoverDurableImageJobsLocal(), () => 0);
}
