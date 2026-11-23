import "server-only";
import { readSynchronousReceipt } from "../billing/receipt-reader";
import { settledSynchronousFailure } from "../billing/synchronous-failure-receipt";
/** Receipt-first lookup: no supplier call, no current configuration and no cross-workspace result. */
export async function readCanvasTextContinuation(actor: string, operationId: string, projectKey: string) {
  const receipt = await readSynchronousReceipt(actor, operationId, "canvas.text-generate");
  if (!receipt || receipt.outcome !== "failed" || receipt.chargedCredits < 0) return null;
  const raw = receipt.body as { textProject?: unknown } | null;
  if (!raw || raw.textProject !== projectKey) return null;
  const failure = settledSynchronousFailure({ id: `tool-${operationId}`, state: receipt.state, charged_credits: receipt.chargedCredits,
    settlement_result: { state: receipt.outcome, items: [] }, result_response: receipt.body });
  const body = failure?.body;
  return body?.code === "TEXT_OUTPUT_LIMIT" && body.finishReason === "length" && typeof body.partialText === "string" && body.partialText.trim() ? body.partialText : null;
}
