import "server-only";

// ── 画布图片编辑后台任务 ──────────────────────────────────────────────────

export type CanvasImageTaskRow = {
  billingQuote?:import("@/lib/billing/types").BillingQuote;
  id: string;
  email: string;
  kind: "text-edit";
  sourceArtworkId: string;
  parameters: Record<string, unknown>;
  status: "queued" | "processing" | "needs_attention" | "completed" | "failed";
  progress: number;
  cost: number;
  resultArtworkId: string;
  error: string;
  attempts: number;
  createdAt: string;
  completedAt?: string;
};

export function mapCanvasImageTask(r: Record<string, unknown>): CanvasImageTaskRow {
  return {
    billingQuote:r.billing_quote as import("@/lib/billing/types").BillingQuote|undefined,
    id: String(r.id),
    email: String(r.email),
    kind: "text-edit",
    sourceArtworkId: String(r.source_artwork_id),
    parameters: (r.parameters ?? {}) as Record<string, unknown>,
    status: (r.status as CanvasImageTaskRow["status"]) || "queued",
    progress: Number(r.progress || 0),
    cost: Number(r.cost || 0),
    resultArtworkId: String(r.result_artwork_id || ""),
    error: String(r.error || ""),
    attempts: Number(r.attempts || 0),
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : "",
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : undefined,
  };
}
