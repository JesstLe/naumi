import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { dbEnabled } from "@/lib/db";
import { uploadImage, readManagedObject } from "@/lib/storage";
import { workerSecret } from "@/lib/settings-secret";
import * as repository from "@/lib/image-job-repository";
import { ImageOperationPending, isImageGatewayModel, withImageOperation } from "@/lib/image-gateway";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { withBiModelContext } from "@/lib/bi/model-observer";
import type {BillingQuote,BillingResult} from "@/lib/billing/types";

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
  /** Persist intent before paid work. Only a durable Router operation may replay. */
  async paidOperation<R>(id: string, model: string, operation: Parameters<typeof withImageOperation>[1], run: () => Promise<R>): Promise<R> {
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
    const previous = saved?.paidOperations?.[operation.id];
    if (previous?.state === "done") return previous.result as R;
    const replayable = operation.managedGateway !== false && isImageGatewayModel(model);
    const gatewayIdentity = replayable ? createHash("sha256").update(JSON.stringify([
      (await getOpenAIBaseUrl()) || "https://api.openai.com/v1", (await getOpenAISettings()).apiKey,
      process.env.NAUMI_ROUTER_STATE_DOMAIN || "",
    ])).digest("hex") : undefined;
    if (previous?.state === "started" && (!previous.replayable || previous.model !== model || previous.gatewayIdentity !== gatewayIdentity)) {
      await repository.holdImageJobBilling(id);
      throw new ImageOperationPending(operation.id, new Error("上游提交需要人工核查"));
    }
    const attempt: Attempt = { model, replayable, gatewayIdentity, state: "started" };
    await update((current) => {
      const active = current.paidOperations?.[operation.id];
      if (active?.state === "done" || (active?.state === "started" && (!active.replayable || active.model !== model || active.gatewayIdentity !== gatewayIdentity))) {
        throw new ImageOperationPending(operation.id, new Error("上游提交需要核查或读取已存结果"));
      }
      return { ...current, paidOperations: { ...current.paidOperations, [operation.id]: attempt } };
    });
    try {
      const result = await withImageOperation(model, { ...operation, durable: true }, run);
      await update((current) => ({ ...current, paidOperations: { ...current.paidOperations, [operation.id]: { ...attempt, state: "done", result } } }));
      return result;
    } catch (error) {
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
    const row = await repository.claimImageJob(id, this.kind);
    if (!row) return;
    const token = row.lease_token!;
    const context: Execution = { id, token, queue: Promise.resolve() };
    void execution.run(context, async () => {
      const heartbeat = setInterval(() => {
        void repository.heartbeatImageJob(id, token).catch(() => { clearInterval(heartbeat); });
      }, 25_000);
      heartbeat.unref?.();
      try {
        // Pre-upgrade jobs have no evidence that a paid request was never sent.
        if (row.snapshot.paidOperationVersion !== 1) {
          await this.patch(id, { error: "旧版本图片任务需要核查，已暂停自动提交，请联系管理员" } as unknown as Partial<T>);
          return;
        }
        await withBiModelContext(row.email,this.kind,id,async()=>run(await decode(row.payload) as Record<string, unknown>,await decode(row.snapshot) as T));
      }
      catch (error) { console.error(`[image-job] ${id}:`, error instanceof Error ? error.message : error); }
      finally {
        clearInterval(heartbeat);
        await context.queue.catch(() => {});
        await repository.releaseImageJob(id, token).catch(() => {});
      }
    });
  }
}

/** Dispatch recoverable work through the existing authenticated worker channel. */
export async function recoverDurableImageJobs(): Promise<number> {
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
  return count;
}
