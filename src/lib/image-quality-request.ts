import "server-only";
import { dbEnabled, creditMeteringEnabled, addLedgerEntry, recordImageCostAudit } from "@/lib/db";
import { imageBillCredits, qualityCostAudit } from "@/lib/mock-data";
import { randomUUID } from "node:crypto";
import { getOpenAISettings } from "@/lib/settings";
import { resolveImageQuality, isQualityUnsupportedError, type ResolvedImageQuality, type ExecutedQuality } from "@/lib/image-quality";

/** Body parameters take precedence over the shared browser/agent preference. */
export function requestImageQuality(request: Request, explicit?: unknown): ResolvedImageQuality {
  return resolveImageQuality(explicit ?? request.headers.get("x-naumi-image-quality") ?? "medium");
}

export async function imageRequestBilling(request: Request, explicit?: unknown, resolution = "1K") {
  const quality = requestImageQuality(request, explicit);
  return { quality, cost: await imageQualityCost(quality, resolution) };
}

export async function imageQualityCost(quality: ResolvedImageQuality, resolution = "1K") {
  const metered = !dbEnabled || await creditMeteringEnabled();
  return metered ? imageBillCredits(quality.requested, resolution) : 0;
}

/** Retry only a confirmed unsupported-parameter rejection, never a timeout or unclear result. */
export async function withQualityFallback<T>(quality: ResolvedImageQuality, run: (executed: ExecutedQuality) => Promise<T>): Promise<T> {
  try { return await run(quality.executed); }
  catch (error) {
    const fallback = resolveImageQuality("").executed;
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
  if (cost > 0) await addLedgerEntry(email, -cost, `${reason} · ${quality.requested || "medium"}`);
  await auditSettledImage(email, cost, quality, imageId, imageId, resolution);
}

export async function auditSettledImage(email: string, cost: number, quality: ResolvedImageQuality, jobId: string, imageId: string, resolution = "1K") {
  if (!dbEnabled) return;
  try {
  const { model } = await getOpenAISettings();
  await recordImageCostAudit({ jobId, email, imageId,
    ...qualityCostAudit({ requested: quality.requested || "medium", executed: quality.executed,
      upstream: `default:${model}`, images: 1, reason: quality.fallbackReason || "generated",
      billedCredits: cost, platformFunded: true, resolution }) });
  } catch { /* Audit enrichment must not undo a committed credit transaction. */ }
}
