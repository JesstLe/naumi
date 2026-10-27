import {taskFailureDiagnostic} from "./imagegen/task-diagnostics";
import {withFrozenCreation,type CreationContext} from "./saas/creation-context";
import { withBackgroundActivity, detachBackgroundActivity, bindBackgroundClaim } from "@/lib/release-runtime/background-activity";
import { releaseRuntimeEnabled } from "@/lib/release-runtime/identity";
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { dbEnabled, getPool } from "@/lib/db";
import { assertMutableStagingTask } from "./staging-history";
import { uploadImage, readManagedObject } from "@/lib/storage";
import { workerSecret } from "@/lib/settings-secret";
import * as repository from "@/lib/image-job-repository";
import { ImageOperationPending, ImageOperationDeferred, isImageGatewayModel, withImageOperation, withImageIndexCheckpoint, type ImageIndexCheckpoint } from "@/lib/image-gateway";
import {dispatchImageQueue} from "./image-job-queue";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { withBiModelContext } from "@/lib/bi/model-observer";
import type {BillingQuote,BillingResult} from "@/lib/billing/types";
import { currentExecutionBundle, currentModelExecution, runLegacyModelExecution, type ExecutionBundle } from "@/lib/model-config/context";
import { withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { acceptedImageOperationIdentities, withAcceptedImageRead } from "@/lib/model-config/channel-availability";
import { IMAGE_JOB_RELEASED_MESSAGE } from "./image-job-failure";

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
  if (value && typeof value === "object" && "$imageJobBase64" in value)
    return ((await decode((value as Record<string, unknown>).$imageJobBase64)) as Buffer).toString("base64");
  if (value && typeof value === "object" && "$imageJobDataURL" in value) {
    const stored = value as { $imageJobDataURL: string; bytes: unknown };
    return stored.$imageJobDataURL + ((await decode(stored.bytes)) as Buffer).toString("base64");
  }
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

/** Child checkpoints keep pixels in managed storage, not a second DB copy of
 * the root's data URLs. The normal snapshot decoder restores the SDK shape. */
async function encodeImageIndexResult(value: unknown, id: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(entry => encodeImageIndexResult(entry, id)));
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => {
      if (key === "b64_json" && typeof entry === "string")
        return [key, { $imageJobBase64: await encode(Buffer.from(entry, "base64"), id) }];
      if (key === "url" && typeof entry === "string" && /^data:image\/[^;,]+;base64,/.test(entry)) {
        const comma = entry.indexOf(",");
        return [key, { $imageJobDataURL: entry.slice(0, comma + 1), bytes: await encode(Buffer.from(entry.slice(comma + 1), "base64"), id) }];
      }
      return [key, await encodeImageIndexResult(entry, id)];
    })));
  }
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
    snapshot = { ...snapshot, paidOperationVersion: 1,...(this.kind==="generate"?{queueState:"execution"}:{}) };
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
    // Return this failure to its caller, but do not poison subsequent checkpoint
    // writes (including the delivery retry and its final receipt).
    context.queue = next.catch(() => {});
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
  /** A confirmed asynchronous task is queried by its frozen ID, not resubmitted.
   * Unknown acceptance is never converted into permission for another paid POST. */
  async handlePending(id: string, error: ImageOperationPending) {
    const saved = await this.get(id, false) as (T & Record<string, any>) | undefined;
    if (!saved || ["done", "error"].includes(saved.status)) return;
    if (error instanceof ImageOperationDeferred) {
      // paidOperation already atomically restored this NEW, unsent attempt
      // under the job lease. Keep its reservation and use the existing 10s scan.
      const attempt = saved.paidOperations?.[error.operationId];
      if (attempt?.state === "queued" && attempt.attemptToken && saved.queueState === "execution") return;
    }
    if(dbEnabled&&currentModelExecution("image")&&Number(saved.supplierQueryResumes||0)<3&&Date.now()-Number(saved.createdAt||0)<600_000){
      const root = Object.keys(saved.paidOperations || {}).find(key => key === error.operationId ||
        error.operationId.startsWith(`${key}:image:`) && /^(0|[1-9]\d*)$/.test(error.operationId.slice(key.length + 7)));
      const accepted = root ? await acceptedImageOperationIdentities(getPool(),currentModelExecution("image"),id,root) : {};
      const attempt = root ? saved.paidOperations[root] : undefined;
      const known = accepted[error.operationId] || error.operationId === root && Object.keys(accepted).some(unit =>
        attempt?.children?.[unit]?.state === "started");
      if(known){
        await this.patch(id,{status:"pending",error:undefined,supplierQueryResumes:Number(saved.supplierQueryResumes||0)+1} as unknown as Partial<T>);return;
      }
    }
    if (dbEnabled && await repository.failUndeliveredImageJob(id, execution.getStore()?.token || null, "image-result-unavailable")) return;
    await this.patch(id, {status:"error",error:"本次未取得完整图片，请重试"} as unknown as Partial<T>);
  }
  /** Persist intent before paid work. Only a durable Router operation may replay. */
  async paidOperation<R>(id: string, model: string, operation: Parameters<typeof withImageOperation>[1], run: () => Promise<R>): Promise<R> {
    if (dbEnabled) await assertMutableStagingTask(getPool(), "app_image_jobs", id);
    type Attempt = { model: string; replayable: boolean; gatewayIdentity?: string; attemptToken?: string; state: "queued" | "started" | "done" | "rejected"; result?: unknown;
      children?: Record<string, Attempt>; legacyIndexedRecovery?: boolean; failureStatus?: number };
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
    const saved = await this.get(id, false) as Snapshot | undefined;
    if (!saved || ["done", "error", "needs_attention"].includes(saved.status)) throw new Error("图片任务已结束或暂停，不能重新提交");
    const previous = saved?.paidOperations?.[operation.id];
    if (previous?.state === "done") return (dbEnabled ? await decode(previous.result) : previous.result) as R;
    const indexedId = (unit: string) => unit.startsWith(`${operation.id}:image:`) && /^(0|[1-9]\d*)$/.test(unit.slice(operation.id.length + 7));
    const accepted = previous?.state === "started" && dbEnabled ? await acceptedImageOperationIdentities(getPool(),currentModelExecution("image"),id,operation.id) : {};
    const pinnedRecovery = accepted[operation.id];
    const acceptedChildren = Object.keys(accepted).filter(indexedId);
    const scope = currentModelExecution("image");
    // Queryable adapters also satisfy isImageGatewayModel, but only Router has
    // the old paid-POST replay contract. Adapter recovery needs a real task ID.
    const routerScope = !scope || !scope.supplierRouting && scope.connection.protocol === "router-images";
    const replayable = operation.managedGateway !== false && routerScope && isImageGatewayModel(model);
    const routerIdentity = async () => createHash("sha256").update(JSON.stringify([
      (await getOpenAIBaseUrl()) || "https://api.openai.com/v1", (await getOpenAISettings()).apiKey,
      process.env.NAUMI_ROUTER_STATE_DOMAIN || "",
      ...(currentModelExecution("image")?.frozen.routerDigest ? [currentModelExecution("image")!.frozen.routerDigest] : []),
    ])).digest("hex");
    const gatewayIdentity = replayable ? await routerIdentity() : undefined;
    const routerRecovery = (active: Attempt) => replayable && active.replayable && active.gatewayIdentity === gatewayIdentity;
    const canResume = (active: Attempt) => active.model === model &&
      (!!pinnedRecovery || active.children !== undefined || acceptedChildren.length > 0 || routerRecovery(active));
    if (previous?.state === "started" && !canResume(previous)) {
      await repository.holdImageJobBilling(id);
      throw new ImageOperationPending(operation.id, new Error("上游提交需要人工核查"));
    }
    const legacyIndexedRecovery = previous?.legacyIndexedRecovery ||
      previous?.state === "started" && previous.children === undefined && acceptedChildren.length > 0 && !pinnedRecovery && !routerRecovery(previous);
    const attempt: Attempt = { ...previous, model, replayable: !!pinnedRecovery || replayable, gatewayIdentity: pinnedRecovery || gatewayIdentity,
      ...(legacyIndexedRecovery ? { legacyIndexedRecovery: true } : {}), attemptToken: randomUUID(), state: "started" };
    // A prior started checkpoint is already possible dispatch evidence, even if
    // this recovery has not POSTed yet. Never erase it because capacity is busy.
    const dispatchState = { attempted: Object.values(saved.paidOperations || {}).some(active => active.state === "started") };
    await update((current) => {
      const active = current.paidOperations?.[operation.id];
      if (active?.attemptToken !== previous?.attemptToken || active?.state !== previous?.state ||
        active?.state === "done" || (active?.state === "started" && !canResume(active))) {
        throw new ImageOperationPending(operation.id, new Error("上游提交需要核查或读取已存结果"));
      }
      return { ...current, paidOperations: { ...current.paidOperations, [operation.id]: attempt } };
    });
    // Children live beneath the root, not beside it: top-level paidOperations
    // remains the existing delivery/settlement contract. Missing checkpoints in
    // an old root are UNKNOWN, while missing children in a new root are unsent.
    const checkpoint: ImageIndexCheckpoint = async <Child>(childModel: string, childOperation: Parameters<typeof withImageOperation>[1], childRun: () => Promise<Child>): Promise<Child> => {
      if (!indexedId(childOperation.id)) throw new ImageOperationPending(childOperation.id, new Error("image-index-root-mismatch"));
      const current = await this.get(id, false) as Snapshot | undefined;
      const root = current?.paidOperations?.[operation.id];
      if (!root || root.attemptToken !== attempt.attemptToken) throw new ImageOperationPending(childOperation.id, new Error("image-index-root-checkpoint-changed"));
      const prior = root.children?.[childOperation.id];
      if (prior && prior.model !== childModel) throw new ImageOperationPending(childOperation.id, new Error("image-index-model-mismatch"));
      if (prior?.state === "done") return (dbEnabled ? await decode(prior.result) : prior.result) as Child;
      if (prior?.state === "rejected") {
        const rejected = new Error("image-index-original-rejection") as Error & { status?: number };
        rejected.status = prior.failureStatus;
        throw rejected;
      }
      const proof = dbEnabled && (prior?.state === "started" || root.legacyIndexedRecovery)
        ? await acceptedImageOperationIdentities(getPool(),currentModelExecution("image"),id,operation.id) : accepted;
      const identity = proof[childOperation.id];
      const childReplayable = childOperation.managedGateway !== false && routerScope && isImageGatewayModel(childModel);
      const childGatewayIdentity = childReplayable ? await routerIdentity() : undefined;
      const routerChild = childReplayable && prior?.replayable && prior.gatewayIdentity === childGatewayIdentity;
      if ((root.legacyIndexedRecovery && !prior || prior?.state === "started") && !identity && !routerChild) {
        throw new ImageOperationPending(childOperation.id, new Error("image-index-original-acceptance-unconfirmed"));
      }
      const child: Attempt = { model: childModel, state: "started", replayable: !!identity || childReplayable,
        gatewayIdentity: identity || childGatewayIdentity, attemptToken: randomUUID() };
      let childSaved = false;
      const saveChild = async (value: Attempt) => {
        await update(snapshot => {
          const active = snapshot.paidOperations?.[operation.id];
          if (!active || active.attemptToken !== attempt.attemptToken) throw new ImageOperationPending(childOperation.id, new Error("image-index-root-checkpoint-changed"));
          const expected = childSaved ? child : prior, stored = active.children?.[childOperation.id];
          if (stored?.attemptToken !== expected?.attemptToken || stored?.state !== expected?.state)
            throw new ImageOperationPending(childOperation.id, new Error("image-index-checkpoint-changed"));
          return { ...snapshot, paidOperations: { ...snapshot.paidOperations, [operation.id]: {
            ...active, children: { ...active.children, [childOperation.id]: value },
          } } };
        });
        childSaved = true;
      };
      await saveChild(child);
      try {
        const result = await (identity ? withAcceptedImageRead(childOperation.id, childRun) : childRun());
        await saveChild({ ...child, state: "done", result: dbEnabled ? await encodeImageIndexResult(result, id) : result });
        return result;
      } catch (error) {
        if (error instanceof ImageOperationDeferred && !dispatchState.attempted && prior?.state !== "started") {
          await saveChild({ ...child, state: "queued" });
          throw error;
        }
        if (error instanceof ImageOperationPending && dbEnabled) {
          try {
            const acceptedChild = (await acceptedImageOperationIdentities(getPool(),currentModelExecution("image"),id,operation.id))[childOperation.id];
            if (acceptedChild) await saveChild({ ...child, replayable: true, gatewayIdentity: acceptedChild });
          } catch { /* Optional proof enrichment must not replace the original unknown supplier outcome. */ }
        }
        const status = (error as { status?: number } | null)?.status;
        if ([400, 401, 403, 404, 422, 429].includes(status || 0))
          await saveChild({ ...child, state: "rejected", failureStatus: status });
        throw error instanceof ImageOperationPending || status != null ? error : new ImageOperationPending(childOperation.id, error);
      }
    };
    try {
      const runCheckpointed = () => withImageIndexCheckpoint(checkpoint, run);
      const readOnlyRoot = !!pinnedRecovery || previous?.state === "started" && !routerRecovery(previous) && (previous.children !== undefined || acceptedChildren.length > 0);
      const result = await withImageOperation(model, { ...operation, durable: true, dispatchState },
        () => readOnlyRoot ? withAcceptedImageRead(operation.id, runCheckpointed) : runCheckpointed());
      await update(current => {
        const active = current.paidOperations?.[operation.id];
        if (!active || active.attemptToken !== attempt.attemptToken || active.state !== "started")
          throw new ImageOperationPending(operation.id, new Error("image-root-checkpoint-changed"));
        return { ...current, paidOperations: { ...current.paidOperations, [operation.id]: { ...active, state: "done", result } } };
      });
      return result;
    } catch (error) {
      if (error instanceof ImageOperationDeferred && !dispatchState.attempted && previous?.state !== "started") {
        if (dbEnabled && execution.getStore()?.id !== id) throw new ImageOperationPending(operation.id,error);
        await update(current => {
          const active = current.paidOperations?.[operation.id];
          if (active?.state !== "started" || active.attemptToken !== attempt.attemptToken) throw new ImageOperationPending(operation.id,error);
          return {...current,status:"pending",queueState:"execution",paidOperations:{...current.paidOperations,[operation.id]:{...active,state:"queued"}}};
        });
        throw new ImageOperationDeferred(operation.id);
      }
      if (error instanceof ImageOperationPending && dbEnabled) {
        try {
        const proof=await acceptedImageOperationIdentities(getPool(),currentModelExecution("image"),id,operation.id);
        if(Object.keys(proof).length)await update(current=>{
          const active=current.paidOperations![operation.id];
          if(active?.attemptToken!==attempt.attemptToken || active.state!=="started")throw new ImageOperationPending(operation.id,new Error("image-root-checkpoint-changed"));
          const children={...active.children};
          for(const [unit,identity] of Object.entries(proof).filter(([unit])=>indexedId(unit))){
            const child=children[unit];
            // Proof enriches only an unresolved child. Never restore a stale
            // attempt over a sibling's pixels, rejection, or current token.
            if(!child || child.state==="started")children[unit]={...(child||{model,state:"started" as const}),replayable:true,gatewayIdentity:identity};
          }
          return {...current,paidOperations:{...current.paidOperations,[operation.id]:{...active,
            ...(proof[operation.id]?{replayable:true,gatewayIdentity:proof[operation.id]}:{}),
            ...(Object.keys(children).length?{children,...(active.children===undefined?{legacyIndexedRecovery:true}:{})}:{}),
          }}};
        });
        } catch { /* Keep the original Pending and its cause; a proof outage grants no retry permission. */ }
      }
      const status = (error as { status?: number } | null)?.status;
      if ([400, 401, 403, 404, 422, 429].includes(status || 0)) {
        await update(current => {
          const active = current.paidOperations?.[operation.id];
          if (!active || active.attemptToken !== attempt.attemptToken || active.state !== "started")
            throw new ImageOperationPending(operation.id, new Error("image-root-checkpoint-changed"));
          return { ...current, paidOperations: { ...current.paidOperations, [operation.id]: { ...active, state: "rejected" } } };
        });
        throw error;
      }
      await repository.holdImageJobBilling(id);
      throw error instanceof ImageOperationPending ? error : new ImageOperationPending(operation.id, error);
    }
  }
  async reserveReviewed(id: string) { if (dbEnabled) await repository.reserveReviewedImageJob(id); }
  async reviewSource(id: string, index: number, redo: boolean, feedback="") { return repository.reviewImageSource(id,index,redo,feedback); }
  async active(email: string) { return dbEnabled ? repository.listActiveImageJobs(email, this.kind) : []; }
  async kick(id: string, run: (payload: Record<string, unknown>, snapshot: T) => Promise<void>, recheckEmptyClaim = true) {
    if (!dbEnabled) {
      const row = this.memory.get(id);
      if (row) void run(row.payload as Record<string, unknown>, row.snapshot).catch(console.error);
      return;
    }
    // A normal empty claim may briefly block a child wake with its activity.
    // Recheck once after finish; notification-origin empty claims never recurse.
    let notifyAfterRelease = this.kind === "imagegen" && recheckEmptyClaim;
    const notifyReleased = async () => {
      if (!notifyAfterRelease) return;
      const kind = this.kind as "generate" | "imagegen";
      try {
        await execution.exit(async () => {
          const { notifyImagegenJobReleased } = await import("./imagegen/dispatch");
          await notifyImagegenJobReleased(id, kind);
        });
      } catch {
        // Notification must not reverse a saved child result. The existing
        // durable worker scan remains the fallback after an unavailable wake.
        console.error(`[image-job] ${id}: parent notification failed; retained for worker recovery`);
      }
    };
    const executeClaimed = async (row: repository.ImageJobRow) => {
    const token = row.lease_token!;
    try { await bindBackgroundClaim(`${this.kind}:${id}`, token); }
    catch (error) {
      // No user execution has started. Release only the lease this call just
      // acquired; keep the activity error/UNKNOWN and original paid checkpoints.
      await repository.releaseImageJob(id, token).catch(() => {});
      throw error;
    }
    const context: Execution = { id, token, queue: Promise.resolve() };
    let failed = false;
    await execution.run(context, async () => {
      const heartbeat = setInterval(() => {
        void repository.heartbeatImageJob(id, token).catch(() => { clearInterval(heartbeat); });
      }, 25_000);
      heartbeat.unref?.();
      try {
        // Pre-upgrade jobs have no evidence that a paid request was never sent.
        if (row.snapshot.paidOperationVersion !== 1) {
          if (!(await repository.failUndeliveredImageJob(id, token, "legacy-unknown-submission")))
            await this.patch(id, { status: "error", error: "本次未取得图片，请重试" } as unknown as Partial<T>);
          return;
        }
        const payload = await decode(row.payload) as Record<string, unknown>, snapshot = await decode(row.snapshot) as T;
        if((snapshot as Record<string,unknown>).queueState){delete (snapshot as Record<string,unknown>).queueState;await this.set(id,snapshot);}
        const resume = () => withFrozenCreation(payload.creationScope as CreationContext|undefined,()=>withBiModelContext(row.email,this.kind,id,async()=>run(payload,snapshot)));
        if (payload.modelExecutions) await withFrozenExecutionBundle(payload.modelExecutions as ExecutionBundle, resume);
        else if(this.kind==="imagegen") await resume();
        else await runLegacyModelExecution(resume);
      }
      catch (error) {
        failed = true;
        console.error(`[image-job] ${id}:`, error instanceof Error ? error.message : error);
        try {
          if (error instanceof ImageOperationPending) await this.handlePending(id, error);
          else if (!(await repository.failUndeliveredImageJob(id, token, "image-worker-failed", taskFailureDiagnostic(error,"execute"))))
            await this.patch(id, { status: "error", error: "本次未取得图片，请重试", failureDiagnostic:taskFailureDiagnostic(error,"execute") } as unknown as Partial<T>);
        } catch (failure) { console.error(`[image-job] ${id}: unable to stop task`, failure instanceof Error ? failure.message : "unknown"); }
      }
      finally {
        clearInterval(heartbeat);
        await context.queue.catch(() => {});
        await repository.releaseImageJob(id, token).catch(() => {});
      }
    });
    // Recheck both sides of the lost-wake race, but do not hot-loop a failed
    // parent. The callback also waits for its same-key release activity to finish.
    notifyAfterRelease = this.kind === "generate" || this.kind === "imagegen" && !failed;
    };
    if(!releaseRuntimeEnabled()) {
      const row=await repository.claimImageJob(id,this.kind);
      if(row)void executeClaimed(row).then(notifyReleased).catch(console.error);
      else await notifyReleased();
      return;
    }
    await detachBackgroundActivity("durable-image", `${this.kind}:${id}`, "claim", async () => {
      const row=await repository.claimImageJob(id,this.kind);
      if(row)await executeClaimed(row);
    }, notifyReleased);
  }
}

/** Dispatch recoverable work through the existing authenticated worker channel. */
async function recoverDurableImageJobsLocal(): Promise<number> {
  if (!dbEnabled) return 0;
  const jobs = await repository.dueImageJobs();
  const origin = process.env.INTERNAL_APP_ORIGIN || "http://127.0.0.1:3000";
  const count = await dispatchImageQueue(jobs,async job=>{
    const route = job.kind === "generate" ? "generate-image" : job.kind;
    const result = await fetch(`${origin}/api/${route}`, { method: "POST", headers: {
      "content-type": "application/json", "x-video-worker-secret": process.env.VIDEO_WORKER_SECRET || "",
    }, body: JSON.stringify({ workerJobId: job.id }), signal: AbortSignal.timeout(10_000) });
    return result.ok;
  },()=>console.error("[image-queue] worker dispatch failed; retained for next scan"));
  const {recoverImagegenBatches}=await import("./imagegen/batch");
  const {recoverStoredDeliveries}=await import("./imagegen/stored-delivery");
  return count+await recoverImagegenBatches()+await recoverStoredDeliveries();
}

let recoveryScan:Promise<number>|undefined;
export async function recoverDurableImageJobs():Promise<number> {
  // A scan is a new coordinator observation, not the identity of a paid job.
  // Keep an earlier failed scan UNKNOWN, but do not let its fixed key disable
  // every future tick. Each child's original claim/UNKNOWN checks still apply.
  if(!recoveryScan)recoveryScan=withBackgroundActivity("durable-image", `recovery-dispatch-scan:${randomUUID()}`, "claim",
    () => recoverDurableImageJobsLocal(), () => 0).finally(()=>{recoveryScan=undefined;});
  return recoveryScan;
}
