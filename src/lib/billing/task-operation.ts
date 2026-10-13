import "server-only";
import { createBillingService } from "./service";
import type { BillingQuote, BillingResult, Tx } from "./types";
import { fingerprint } from "./fingerprint";
const service = createBillingService();
export function taskOperation(id: string, email: string, quote: BillingQuote, ledgerId: string, reason: string) { return { id, email, quote, ledgerId, reason, fingerprint: id }; }
export async function reserveTaskBillingTx(tx: Tx, id: string, email: string, quote: BillingQuote, ledgerId: string) { return service.reserveTx(tx, taskOperation(id, email, quote, ledgerId, "任务预占")); }
export async function settleTaskBillingTx(tx: Tx, id: string, email: string, quote: BillingQuote, ledgerId: string, result: BillingResult) { return service.settleTx(tx, taskOperation(id, email, quote, ledgerId, result.state === "failed" ? "任务失败" : "任务完成"), result); }
function userParameters(value: unknown) { return Object.fromEntries(Object.entries((value ?? {}) as Record<string, unknown>).filter(([key]) => !["providerSnapshot", "qualityAudit", "billingResolution", "paidOperationVersion", "upstreamStarted", "upstreamResult", "workflowManifestEnc"].includes(key))); }
export function videoRequestFingerprint(input: {
    email: string;
    model: string;
    prompt: string;
    size: string;
    seconds: string;
    providerId?: string;
    source?: string;
    sourceId?: string;
    parameters?: unknown;
    videoReferences?: unknown;
}) {
    return fingerprint({ email: input.email.toLowerCase(), model: input.model, prompt: input.prompt, size: input.size, seconds: input.seconds, providerId: input.providerId, source: input.source, sourceId: input.sourceId, parameters: userParameters(input.parameters), references: input.videoReferences ?? [] });
}
export function canvasRequestFingerprint(input: {
    email: string;
    sourceArtworkId: string;
    parameters: unknown;
}) { return fingerprint({ email: input.email.toLowerCase(), sourceArtworkId: input.sourceArtworkId, parameters: userParameters(input.parameters) }); }
