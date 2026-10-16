import type { HealthResult } from "./contracts";
/** Only controlled categories escape this boundary; never persist supplier text or URLs. */
export function classifyHealthFailure(error: unknown, status: number | null = null, latencyMs: number | null = null): HealthResult {
  const e = error as { name?: string; message?: string; status?: number; code?: string; cause?: unknown } | null;
  status ??= typeof e?.status === "number" ? e.status : null;
  const message = e?.message || "";
  const reason = e?.name === "ImageOperationPending" ? "acceptance-unknown"
    : status === 401 || status === 403 ? "authentication"
    : status === 402 ? "quota" : status === 429 ? "rate-limited"
    : /download|artifact-unavailable|图片下载/.test(message) ? "image-download"
    : e?.code === "SUPPLIER_TEXT_INVALID" || /image-|output|JSON|Unexpected token|Input buffer|unsupported image|图片|未返回有效/i.test(message) ? "invalid-output"
    : e?.name === "TimeoutError" || /timeout|timed out/i.test(message) ? "timeout"
    : e?.code && ["CREDENTIAL_UNAVAILABLE", "INVALID_ENDPOINT", "UNSUPPORTED_PROTOCOL", "MODEL_INCOMPATIBLE", "INVALID_REQUEST"].includes(e.code) ? "configuration"
    : status && status >= 400 ? "upstream-error" : "network";
  return { success: false, reason, status, latencyMs, uncertain: reason === "acceptance-unknown" || !status && ["network", "timeout"].includes(reason) || !!status && (status >= 500 || status === 408 || status === 409) };
}
