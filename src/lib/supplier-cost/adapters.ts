import { createHash } from "node:crypto";
import { abs, decimalMicros } from "./money";
import type { CostReceipt } from "./types";
import type { Procurement } from "../model-config/business-schema";
import { usageAmount } from "../billing/money";

export const validTaskId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const number = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d{1,15}$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
const stamp = (v: unknown) => { const n = number(v); return n != null && n > 0 && n < 4102444800 ? new Date(n * 1000).toISOString() : undefined; };
const outputHash=(v:unknown)=>typeof v==='string'?createHash('sha256').update(v).digest('hex'):undefined;

/** Only explicitly whitelisted scalar identifiers/accounting facts persist. No URLs, prompts or headers. */
export function safeUsage(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const k of ["prompt_tokens", "completion_tokens", "input_tokens", "output_tokens", "total_tokens", "seconds", "images", "cached_tokens"]) { const n = number(raw[k]); if (n != null) out[k] = n; }
  for (const k of ["prompt_tokens_details", "input_tokens_details", "completion_tokens_details", "output_tokens_details"]) {
    const part: Record<string, unknown> = {};
    for (const d of ["cached_tokens", "image_tokens", "text_tokens", "audio_tokens", "reasoning_tokens"]) { const n = number(raw[k]?.[d]); if (n != null) part[d] = n; }
    if (Object.keys(part).length) out[k] = part;
  }
  return Object.keys(out).length ? out : null;
}
export function evidence(raw: unknown, source: string) { return { source, sha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex") }; }
export function submittedAPIMartTask(raw: any): string | null {
  const d = raw?.data;
  if (Array.isArray(d) && d.length !== 1) throw new Error("APIMart batch submission needs explicit child mapping");
  const row = Array.isArray(d) ? d[0] : d, id = row?.id ?? row?.task_id;
  return validTaskId(id) ? id : null;
}
/** Poll and webhook use DIFFERENT envelopes. Untrusted webhooks are never applied directly. */
export function apimartTask(raw: any, taskId: string, envelope: "poll" | "webhook" = "poll"): CostReceipt {
  const d = envelope === "poll" ? raw?.data : raw;
  if (!d || Array.isArray(d) || !validTaskId(d.id) || d.id !== taskId || typeof d.status !== "string") throw new Error("APIMart task receipt identity/schema mismatch");
  const amount = decimalMicros(d.cost), credits = decimalMicros(d.credits_cost);
  const done = stamp(d.completed);
  const delivered = Array.isArray(d.result?.images) ? d.result.images.reduce((sum: number, g: any) => sum + (Array.isArray(g.url) ? g.url.length : 0), 0) : undefined;
  const outputs=Array.isArray(d.result?.images)?d.result.images.flatMap((g:any)=>Array.isArray(g.url)?g.url:[]).map((url:unknown,index:number)=>({index,supplierRefHash:outputHash(url),state:'delivered'})):undefined;
  return { taskId, state: d.status, actualModel:typeof d.model==='string'?d.model.slice(0,200):undefined,amountMicros: amount, currency: "USD", creditsMicros: credits, usage: safeUsage(d.usage ?? d.result?.usage), status: amount != null ? "reported" : "pending", completedAt: done, postingTimeKnown: !!done, delivered, outputs,source: "apimart-task-query", evidence: { ...evidence(d, `apimart-${envelope}`), schema: "2026-10-07", costPresent: amount != null, creditsPresent: credits != null } };
}
export function genericReceipt(raw: any, state: string, procurement?: Procurement): CostReceipt {
  const usage = safeUsage(raw?.usage ?? raw?.data?.usage);
  const paidState = raw?.status || state;
  const requestId=[raw?.id,raw?.task_id,raw?.request_id,raw?.data?.id,raw?.data?.task_id,raw?.data?.taskId,raw?.name].find(v=>typeof v==='string'&&v.length<=200);
  const r: CostReceipt = { state: paidState, requestId, actualModel: typeof raw?.model === "string" ? raw.model.slice(0, 200) : undefined, usage, status: "pending", source: "supplier-response", evidence: evidence({ id: requestId, status: paidState, usage }, "usage") };
  if(['response-received','stream-completed','completed','succeeded','failed','cancelled','canceled'].includes(paidState))r.completedAt=new Date().toISOString();
  // Local completion is useful operationally, but is NOT a verified supplier posting time.
  // OpenAI-compatible usage does not standardize a 'cost' field: do not infer USD from arbitrary extra fields.
  const delivered = Array.isArray(raw?.data) ? raw.data.length : undefined;
  r.delivered = delivered;
  if(Array.isArray(raw?.data))r.outputs=raw.data.map((o:any,index:number)=>({index,supplierRefHash:outputHash(o?.id||o?.url),state:'delivered'}));
  if (raw?.billing_status === "not_charged" || raw?.error?.billing_status === "not_charged") return { ...r, status: "reported", amountMicros: "0", currency: procurement?.currency || "CNY", source: "explicit-not-charged" };
  if (!procurement || procurement.confirmed === false || !["completed", "succeeded", "response-received", "stream-completed"].includes(paidState)) return r;
  if (procurement.basis === "tokens") {
    const details = (usage?.prompt_tokens_details || usage?.input_tokens_details || {}) as any;
    if (!usage || procurement.cachedInputMicrosPerMillion !== undefined && details.cached_tokens === undefined || procurement.imageInputMicrosPerMillion !== undefined && details.image_tokens === undefined) return r;
    const input=(usage.prompt_tokens??usage.input_tokens) as number,output=(usage.completion_tokens??usage.output_tokens) as number;
    if(!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||!procurement.inputMicrosPerMillion||!procurement.outputMicrosPerMillion||(details.cached_tokens||0)+(details.image_tokens||0)>input)return r;
    const amount = usageAmount({ inputMicrosPerMillion: procurement.inputMicrosPerMillion, outputMicrosPerMillion: procurement.outputMicrosPerMillion, cachedInputMicrosPerMillion: procurement.cachedInputMicrosPerMillion, imageInputMicrosPerMillion: procurement.imageInputMicrosPerMillion }, { inputTokens: input, outputTokens: output, cachedInputTokens: details.cached_tokens, imageInputTokens: details.image_tokens });
    if (amount != null) Object.assign(r, { amountMicros: amount.toString(), currency: procurement.currency, status: "estimated", source: "usage-price-snapshot" });
  } else if (procurement.amountMicros !== undefined && (procurement.basis === "task" || delivered !== undefined)) Object.assign(r, { amountMicros: (BigInt(procurement.amountMicros) * BigInt(procurement.basis === "task" ? 1 : delivered!)).toString(), currency: procurement.currency, status: "estimated", source: "output-price-snapshot" });
  return r;
}

export type UsageItem = { model: string; date: string; amountMicros: string; creditsMicros: string; requests: number };
export function apimartUsage(raw: any, expected: { start: string; end: string; timezone: string }): { items: UsageItem[]; total: { amountMicros: string; creditsMicros: string; requests: number } } {
  const d = raw?.data;
  if (raw?.success !== true || d?.scope !== "key" || d?.group_by !== "model,date" || d?.tz !== expected.timezone || String(d.start) !== String(Date.parse(expected.start) / 1000) || String(d.end) !== String(Date.parse(expected.end) / 1000) || !Array.isArray(d.items)) throw new Error("APIMart usage receipt schema/scope mismatch");
  const summary = (v: any) => { const amount = decimalMicros(v?.amount_usd), credits = decimalMicros(v?.credits), requests = number(v?.requests); if (amount == null || credits == null || requests == null) throw new Error("APIMart usage omitted accounting fields"); return { amountMicros: amount, creditsMicros: credits, requests }; };
  const seen = new Set<string>();
  const items = d.items.map((v: any) => { if (typeof v.model !== "string" || v.model.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw new Error("APIMart usage grouping missing"); const key = v.model.toLowerCase() + ":" + v.date; if (seen.has(key)) throw new Error("duplicate usage bucket"); seen.add(key); return { model: v.model, date: v.date, ...summary(v) }; });
  const total = summary(d.total);
  // Individually rounded 6-decimal buckets may differ from an independently rounded grand total.
  const allowance=BigInt(items.length+1);
  if (abs(items.reduce((s: bigint, i: UsageItem) => s + BigInt(i.amountMicros), BigInt(0))-BigInt(total.amountMicros))>allowance || abs(items.reduce((s: bigint, i: UsageItem) => s + BigInt(i.creditsMicros), BigInt(0))-BigInt(total.creditsMicros))>allowance*BigInt(10) || items.reduce((s:number,i:UsageItem)=>s+i.requests,0)!==total.requests) throw new Error("APIMart usage total/group mismatch");
  return { items, total };
}
