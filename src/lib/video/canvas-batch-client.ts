import { browserRandomUUID } from "../browser-crypto";
import type { PublicQuote } from "../billing/client";
import type { CanvasVideoNode } from "../canvas/video-node-schema";

export function videoBatchQuote(quote: PublicQuote | null, count: number): PublicQuote | null {
  return quote ? { ...quote, quantity: count, credits: quote.credits * count, reserveCredits: quote.reserveCredits * count, authorizedCredits: quote.authorizedCredits === undefined ? undefined : quote.authorizedCredits * count } : null;
}
import type {VideoNodeDraft as Draft} from "./canvas-draft";
type BatchRun = { nodes: { id: string; status: string; error?: string | null; taskId?: string | null }[] };
type Receipt = { draft: string; body: { expectedRevision: number; idempotencyKey: string; count: number; billingVersion?: number; billingCredits?: number } };
const fingerprint = (draft: Draft) => JSON.stringify({ title: draft.title, config: draft.config, inputs: draft.inputs });
export function hasCanvasVideoBatch(storage: Pick<Storage, "getItem">, email: string, nodeId: string) { return storage.getItem(`naumi:canvas-video-batch:${email.toLowerCase()}:${nodeId}`) !== null; }
async function json(response: Response) { try { return await response.json(); } catch { throw new Error("批次响应尚未核实，重试将查询原批次"); } }
function confirmedRun(value: unknown): BatchRun {
  const run = value as BatchRun | null;
  if (!run || !Array.isArray(run.nodes) || !run.nodes.length) throw new Error("批次响应尚未核实，操作编号已保留");
  if (run.nodes.some(node => node.status === "pending" || node.status === "processing" && !node.taskId)) throw new Error("批次正在准备，操作编号已保留，请稍后查询原批次");
  return run;
}

export async function generateCanvasVideoBatch(options: {
  email: string; nodeId: string; draft: Draft; count: number; quote: PublicQuote | null;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  submit: (url: string, init: RequestInit, quote: PublicQuote | null, onIdentity: (id: string) => void) => Promise<Response>;
  save: () => Promise<CanvasVideoNode>; onPersisted: (revision: number) => void; assertCurrent: () => void;
}): Promise<BatchRun> {
  const { email, nodeId, draft, count, quote, storage, request, submit, save, onPersisted, assertCurrent } = options;
  const key = `naumi:canvas-video-batch:${email.toLowerCase()}:${nodeId}`, url = `/api/canvas/video-nodes/${encodeURIComponent(nodeId)}/batch`;
  let receipt: Receipt | null = null;
  const cached = storage.getItem(key);
  if (cached) {
    try { receipt = JSON.parse(cached); if (!receipt?.body?.idempotencyKey || ![2, 4].includes(receipt.body.count) || !receipt.draft) throw new Error(); }
    catch { throw new Error("批次记录无法读取，请先核查视频历史，未重新提交"); }
    const response = await request(`${url}?batchId=${encodeURIComponent(receipt.body.idempotencyKey)}`, { cache: "no-store" }), data = await json(response);
    assertCurrent();
    if (response.ok && data.run) { const run = confirmedRun(data.run); storage.removeItem(key); return run; }
    if (!response.ok && response.status !== 404) throw new Error(data.error || "上次批次尚未核实");
    if (receipt.draft !== fingerprint(draft) || receipt.body.count !== count) throw new Error("上次批次尚未核实，请恢复原参数和数量后重试");
  }
  if (!receipt) {
    if (![2, 4].includes(count)) throw new Error("批量视频数量需为2或4");
    const saved = await save(); assertCurrent(); onPersisted(saved.revision);
    receipt = { draft: fingerprint(draft), body: { expectedRevision: saved.revision, idempotencyKey: browserRandomUUID(), count, ...(quote ? { billingVersion: quote.version, billingCredits: quote.mode === "api-cost-plus" ? quote.authorizedCredits ?? quote.reserveCredits : quote.credits } : {}) } };
    storage.setItem(key, JSON.stringify(receipt));
  }
  const init = { method: "POST", headers: { "content-type": "application/json", "x-naumi-canvas": "1", "x-naumi-billing-operation-id": receipt.body.idempotencyKey }, body: JSON.stringify(receipt.body) };
  const response = draft.config.comfyWorkflowId ? await request(url, init) : await submit(url, init, quote, id => { receipt!.body.idempotencyKey = id; storage.setItem(key, JSON.stringify(receipt)); });
  const data = await json(response); assertCurrent();
  if (!response.ok) {
    // Only definite preflight rejection permits a new intent. Unknown/saved batches keep their identity.
    if (["PRICE_CHANGED", "VIDEO_NODE_REVISION_CONFLICT", "VIDEO_NODE_UNAVAILABLE"].includes(data.code)) {
      const check = await request(`${url}?batchId=${encodeURIComponent(receipt.body.idempotencyKey)}`, { cache: "no-store" }); assertCurrent();
      if (check.status === 404) storage.removeItem(key);
    }
    throw new Error(data.error || "批次提交尚未核实，请重试查询原批次");
  }
  const run = confirmedRun(data.run);
  storage.removeItem(key);
  return run;
}
