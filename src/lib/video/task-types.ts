import "server-only";

// ── 视频生成任务(OpenAI videos 协议,聚合商/官方端点通用) ──────────────────────

export type VideoTaskRow = {
  cursorCreatedAt?:string;
  updatedAt?:string;
  errorCode?: string;
  cancellationRequestedAt?: string;
  cancellationSentAt?: string;
  supplierCancellationSupported?: boolean;
  billingQuote?:import("@/lib/billing/types").BillingQuote;
  id: string;
  upstreamId: string;
  model: string;
  prompt: string;
  status: "queued" | "processing" | "needs_attention" | "completed" | "failed" | "cancelled";
  progress: number;
  cost: number;
  artworkId: string;
  videoUrl: string;
  error: string;
  providerId: string;
  source: string;
  sourceId: string;
  parameters: Record<string, unknown>;
  videoReferences: unknown[];
  capabilitySnapshot: Record<string, unknown>;
  seconds: string;
  pollAttempts: number;
  nextPollAt?: string;
  createdAt: string;
  completedAt?: string;
  providerSnapshot?: Record<string, unknown>;
  responseBody?: string;
  lastResponse?: Record<string, unknown>;
  errorDetail?: Record<string, unknown>;
  resultStorageKey?: string;
  idempotencyKey?: string;
};

export type VideoResultRow = {
  id: string;
  taskId: string;
  artworkId: string;
  providerId: string;
  model: string;
  prompt: string;
  videoUrl: string;
  resultStorageKey: string;
  parameters: Record<string, unknown>;
  references: unknown[];
  createdAt: string;
};

export function mapVideoTask(r: Record<string, unknown>): VideoTaskRow {
  return {
    ...(typeof r.cursor_created_at==="string"?{cursorCreatedAt:r.cursor_created_at}:{}),
    ...(r.updated_at?{updatedAt:new Date(r.updated_at as string).toISOString()}:{}),
    errorCode:String(r.error_code||""),
    cancellationRequestedAt:r.cancellation_requested_at?new Date(r.cancellation_requested_at as string).toISOString():undefined,
    cancellationSentAt:r.cancellation_sent_at?new Date(r.cancellation_sent_at as string).toISOString():undefined,
    supplierCancellationSupported:typeof r.cancellation_supported==="boolean"?r.cancellation_supported:undefined,
    billingQuote:r.billing_quote as import("@/lib/billing/types").BillingQuote|undefined,
    id: String(r.id),
    upstreamId: String(r.upstream_id ?? ""),
    model: String(r.model ?? ""),
    prompt: String(r.prompt ?? ""),
    status: (r.status as VideoTaskRow["status"]) ?? "processing",
    progress: Number(r.progress ?? 0),
    cost: Number(r.cost ?? 0),
    artworkId: String(r.artwork_id ?? ""),
    videoUrl: String(r.video_url ?? ""),
    error: String(r.error ?? ""),
    providerId: String(r.provider_id ?? "openai-videos"),
    source: String(r.source ?? "canvas"),
    sourceId: String(r.source_id ?? ""),
    parameters: (r.parameters ?? {}) as Record<string, unknown>,
    videoReferences: (r.video_references ?? []) as unknown[],
    capabilitySnapshot: (r.capability_snapshot ?? {}) as Record<string, unknown>,
    seconds: String(r.seconds ?? ""),
    pollAttempts: Number(r.poll_attempts ?? 0),
    nextPollAt: r.next_poll_at ? new Date(r.next_poll_at as string).toISOString() : undefined,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : "",
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : undefined,
    providerSnapshot: (r.provider_snapshot ?? {}) as Record<string, unknown>,
    responseBody: String(r.response_body ?? ""),
    lastResponse: (r.last_response ?? {}) as Record<string, unknown>,
    errorDetail: (r.error_detail ?? {}) as Record<string, unknown>,
    resultStorageKey: String(r.result_storage_key ?? ""),
    idempotencyKey: String(r.idempotency_key ?? ""),
  };
}
