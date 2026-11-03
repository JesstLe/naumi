import "server-only";

const marker = "synchronous-failure-v1";
type Failure = { receipt: typeof marker; httpStatus: number; error: string; code?: string };

/** Store only the already-public error, never an arbitrary response body,
 * supplier payload, request data or image bytes. */
export function synchronousFailureCheckpoint(status: number, body: unknown): Failure {
  const value = body as { error?: unknown; code?: unknown } | null;
  return {
    receipt: marker,
    httpStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    error: typeof value?.error === "string" && value.error.trim() ? value.error.slice(0, 1200) : "工具执行失败，原操作已记录",
    ...(typeof value?.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code) ? { code: value.code } : {}),
  };
}
export function isSynchronousFailureCheckpoint(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { receipt?: unknown }).receipt === marker;
}

/** Billing settled means financially finalized, not that the action succeeded or
 * that a positive charge occurred. A zero amount alone proves neither result. */
export function settledSynchronousFailure(operation: {
  id: string; state: unknown; charged_credits: unknown; settlement_result?: unknown; result_response?: unknown;
}) {
  const result = operation.settlement_result as { state?: unknown; items?: unknown } | null;
  const charged = Number(operation.charged_credits);
  if (operation.state !== "settled" || result?.state !== "failed" || !Array.isArray(result.items) ||
      result.items.some(item => !item || typeof item !== "object" || item.state !== "failed") ||
      !Number.isSafeInteger(charged) || charged < 0) return null;
  const stored = isSynchronousFailureCheckpoint(operation.result_response) ? operation.result_response as Partial<Failure> : null;
  const valid = stored && Number.isInteger(stored.httpStatus) && stored.httpStatus! >= 400 && stored.httpStatus! <= 599 &&
    typeof stored.error === "string" && stored.error.length > 0 && stored.error.length <= 1200;
  return {
    httpStatus: valid ? stored.httpStatus! : 409,
    body: {
      ok: false, status: "failed", terminal: true, operationId: operation.id,
      code: valid && typeof stored.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(stored.code) ? stored.code : "OPERATION_FAILED",
      error: valid ? stored.error : charged === 0 ? "原工具执行失败，未扣积分；历史失败原因未留存，原操作不会重新执行" : "原工具执行失败，历史失败原因未留存；账务以原记录为准",
      creditsUsed: charged, chargedCredits: charged, billingStatus: "confirmed",
      billingOutcome: charged === 0 ? "not_charged" : "charged",
    },
  };
}
