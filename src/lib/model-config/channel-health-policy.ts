export type ChannelFailureKind = "auth" | "rate-limit" | "timeout" | "unavailable" | "invalid-output" | "transport";
export type ChannelFailure = { kind?: ChannelFailureKind; retryAfterMs?: number };

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const n = Number(value), ms = /^\d+(?:\.\d+)?$/.test(value.trim()) ? n * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(900000, Math.max(1000, Math.ceil(ms))) : undefined;
}

/** Request validation and caller cancellation are NOT supplier outages. */
export function channelFailurePolicy(status?: number, detail: ChannelFailure = {}) {
  const kind = detail.kind || (status === 401 || status === 403 ? "auth" : status === 429 ? "rate-limit" : status === 408 || status === 504 ? "timeout"
    : status !== undefined && status >= 500 ? "unavailable" : status !== undefined && status >= 200 && status < 300 ? "invalid-output" : status === undefined ? "transport" : undefined);
  if (!kind) return undefined;
  return { kind, threshold: kind === "auth" || kind === "rate-limit" ? 1 : 2,
    baseMs: kind === "auth" ? 300000 : 30000,
    retryAfterMs: Math.min(900000, Math.max(0, detail.retryAfterMs || 0)) };
}
