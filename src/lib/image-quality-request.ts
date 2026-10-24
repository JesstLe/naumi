import { resolveConfiguredImageQuality } from "@/lib/model-config/image-quality";
import { currentModelExecution } from "./model-config/context";
import "server-only";
import { creditMeteringEnabled, addLedgerEntry, recordImageCostAudit } from "@/lib/db";
import { imageBillCredits, qualityCostAudit } from "@/lib/billing/legacy";
import seed from "@/lib/billing/bootstrap.json";
import type {BillingConfig} from "@/lib/billing/types";
import { randomUUID } from "node:crypto";
import { resolveImageQuality, isQualityUnsupportedError, type ResolvedImageQuality, type ExecutedQuality } from "@/lib/image-quality";
import {synchronousCost,settleSynchronous,currentSynchronousBilling} from "@/lib/billing/synchronous";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {frozenCostAudit} from "@/lib/billing/audit";
import type {BillingQuote,BillingResult} from "@/lib/billing/types";

/** Body parameters take precedence over the shared browser/agent preference. */
export function requestImageQuality(request: Request, explicit?: unknown): ResolvedImageQuality {
  return resolveConfiguredImageQuality(explicit ?? request.headers.get("x-naumi-image-quality") ?? "medium");
}

export async function imageRequestBilling(request: Request, explicit?: unknown, resolution = "1K") {
  const quality = requestImageQuality(request, explicit);
  // Durable routes quote their full quantity after validation. Only synchronous
  // tool contexts reserve here; avoid an extra, incomplete config lookup.
  return { quality, cost: dbEnabled&&!currentSynchronousBilling()?0:await imageQualityCost(quality, resolution) };
}

export async function imageQualityCost(quality: ResolvedImageQuality, resolution = "1K") {
  const configured=await synchronousCost(quality,resolution);
  if(configured!==null)return configured;
  const metered = !dbEnabled || await creditMeteringEnabled();
  return metered ? imageBillCredits(seed as BillingConfig,quality.requested, resolution) : 0;
}

/** Managed calls keep their published tier; legacy calls retain their compatibility fallback. */
const executionModels = new WeakMap<ResolvedImageQuality,string>();
export function recordImageExecutionModel(quality: ResolvedImageQuality, model: string) { executionModels.set(quality,model); }
export async function withQualityFallback<T>(quality: ResolvedImageQuality, run: (executed: ExecutedQuality) => Promise<T>, executionModel?: string): Promise<T> {
  if (executionModel) executionModels.set(quality, executionModel);
  try { return await run(quality.executed); }
  catch (error) {
    if(currentModelExecution("image")) throw error;
    const fallback = resolveConfiguredImageQuality("").executed;
    if (quality.executed === fallback || !isQualityUnsupportedError(error)) throw error;
    quality.executed = fallback;
    quality.fallbackReason = "upstream-unsupported";
    return run(fallback);
  }
}

/** SDK typings lag behind the configured upstream's xhigh/max values; preserve the wire value. */
export function sdkImageQuality(quality: ExecutedQuality): "low" | "medium" | "high" | "auto" {
  return quality as "low" | "medium" | "high" | "auto";
}

/** Audit only after the credit transaction has actually committed. */
export async function settleToolImage(email: string, cost: number, reason: string, quality: ResolvedImageQuality, imageId = `tool-${randomUUID()}`, resolution = "1K") {
  if (!dbEnabled) return;
  const configured=await settleSynchronous(`${reason} · ${quality.requested || "medium"}`,quality);
  if(configured===null&&cost > 0) await addLedgerEntry(email, -cost, `${reason} · ${quality.requested || "medium"}`);
  await auditSettledImage(email, configured??cost, quality, imageId, imageId, resolution);
}

export async function auditSettledImage(email: string, cost: number, quality: ResolvedImageQuality, jobId: string, imageId: string, resolution = "1K",execution?:{upstream:string;reason:string;platformFunded:boolean}) {
  if (!dbEnabled) return;
  try {
  const model = executionModels.get(quality);
  const operationId=currentSynchronousBilling()?.operation?.id||jobId;
  const operation=(await getPool().query("SELECT o.quote,o.state,o.settlement_result,COALESCE((SELECT -sum(delta) FROM app_ledger WHERE id=o.ledger_id AND kind='consume'),0) AS charge FROM app_billing_operations o WHERE id=$1 AND email=$2",[operationId,email.toLowerCase()])).rows[0];
  if(operation?.quote?.schemaVersion===1){
    if(operation.state!=="settled")return;
    const q=operation.quote as BillingQuote,result=operation.settlement_result as BillingResult|undefined,success=result?.items.filter(i=>i.state==="succeeded")||[];
    if(!success.length)return;
    const billed=Number(operation.charge)/success.length,wire=execution?.upstream|| (model?`default:${model}`:"unrecorded"),item=success.find(i=>i.id===imageId);
    const platformFunded=execution?.platformFunded??item?.platformFunded??!q.facts.byok;
    const fields=frozenCostAudit(q,{id:imageId,quality:quality.executed,platformFunded,...(wire.startsWith("default:")?{providerId:"openai-images",modelId:wire.slice(8)}:{})},billed,success.length);
    const mappedReason = quality.upstreamValue !== undefined ? `${quality.fallbackReason || "configured-passthrough"}:${quality.requested}→${quality.upstreamValue ?? "omitted"}` : undefined;
    await recordImageCostAudit({jobId,email,imageId,requestedQuality:quality.requested||q.facts.quality,executedQuality:quality.executed,upstream:wire,images:1,billedCredits:billed,reason:execution?.reason||mappedReason||quality.fallbackReason||"generated",...fields});
    return;
  }
  await recordImageCostAudit({ jobId, email, imageId,
    ...qualityCostAudit(seed as BillingConfig,{ requested: quality.requested || "medium", executed: quality.executed,
      upstream: model ? `default:${model}` : "unrecorded", images: 1, reason: quality.fallbackReason || "generated",
      billedCredits: cost, platformFunded: true, resolution }) });
  } catch { /* Audit enrichment must not undo a committed credit transaction. */ }
}
