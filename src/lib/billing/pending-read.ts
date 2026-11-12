import "server-only";
import { excludeImportedHistory } from "@/lib/staging-history";
import type { PendingItem, PendingOverview, PendingSource, PendingSummary, SourceSummary } from "@/lib/billing/pending-contracts";

const LIST_LIMIT = 100, MERGE_LIMIT = 200;
// The reconcile write stays on POST /api/admin/billing/operations with its own
// audit record; this module is the unified read model across the four sources
// that exposeAbandonedBillingOperations already links by operation id.
const OPERATION_JOIN = (task: string) =>
    `LEFT JOIN app_billing_operations o ON o.id=${task}.id AND o.state IN ('hold','manual')`;

type QueryPool = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
const countQueries = (pool: QueryPool) => [
    pool.query(`SELECT count(*)::int AS n,min(created_at)::text AS oldest FROM app_billing_operations WHERE state IN ('hold','manual') ${excludeImportedHistory("app_billing_operations")}`),
    pool.query(`SELECT count(*)::int AS n,min(updated_at)::text AS oldest FROM app_image_jobs WHERE snapshot->>'status'='needs_attention' ${excludeImportedHistory("app_image_jobs")}`),
    pool.query(`SELECT count(*)::int AS n,min(updated_at)::text AS oldest FROM app_canvas_image_tasks WHERE status='needs_attention' ${excludeImportedHistory("app_canvas_image_tasks")}`),
    pool.query(`SELECT count(*)::int AS n,min(updated_at)::text AS oldest FROM app_video_tasks WHERE status='needs_attention' ${excludeImportedHistory("app_video_tasks")}`),
] as const;

export async function readPendingOverview(pool: QueryPool): Promise<PendingOverview> {
    const [operations, jobs, canvas, video, opCount, jobCount, canvasCount, videoCount] = await Promise.all([
        pool.query(
            `SELECT o.id,o.email,o.feature AS kind,o.state,o.reserved_credits,
                    NULL::text AS error_code,NULL::text AS error,o.created_at,o.updated_at
             FROM app_billing_operations o
             WHERE o.state IN ('hold','manual') ${excludeImportedHistory("app_billing_operations", "o")}
             ORDER BY o.created_at ASC LIMIT ${LIST_LIMIT}`),
        pool.query(
            `SELECT j.id,j.email,j.kind,'needs_attention' AS state,j.reserved_cost,
                    j.snapshot->>'error_code' AS error_code,
                    COALESCE(NULLIF(j.snapshot->>'failureDiagnostic',''),j.snapshot->>'error') AS error,
                    j.created_at,j.updated_at,o.state AS operation_state
             FROM app_image_jobs j ${OPERATION_JOIN("j")}
             WHERE j.snapshot->>'status'='needs_attention' ${excludeImportedHistory("app_image_jobs", "j")}
             ORDER BY j.updated_at ASC LIMIT ${LIST_LIMIT}`),
        pool.query(
            `SELECT c.id,c.email,c.kind,'needs_attention' AS state,c.cost AS reserved_cost,
                    NULL::text AS error_code,NULLIF(c.error,'') AS error,
                    c.created_at,c.updated_at,o.state AS operation_state
             FROM app_canvas_image_tasks c ${OPERATION_JOIN("c")}
             WHERE c.status='needs_attention' ${excludeImportedHistory("app_canvas_image_tasks", "c")}
             ORDER BY c.updated_at ASC LIMIT ${LIST_LIMIT}`),
        pool.query(
            `SELECT v.id,v.email,'video' AS kind,'needs_attention' AS state,v.cost AS reserved_cost,
                    NULLIF(v.error_code,'') AS error_code,NULLIF(v.error,'') AS error,
                    v.created_at,v.updated_at,o.state AS operation_state
             FROM app_video_tasks v ${OPERATION_JOIN("v")}
             WHERE v.status='needs_attention' ${excludeImportedHistory("app_video_tasks", "v")}
             ORDER BY v.updated_at ASC LIMIT ${LIST_LIMIT}`),
        ...countQueries(pool),
    ]);
    const normalize = (source: PendingSource, rows: Record<string, unknown>[]): PendingItem[] =>
        rows.map(row => ({
            source, id: String(row.id), email: String(row.email), kind: String(row.kind ?? ""),
            state: String(row.state), operationState: (row.operation_state as string | null) || null,
            reservedCredits: Number(row.reserved_credits ?? row.reserved_cost ?? 0),
            errorCode: (row.error_code as string | null) || null, error: (row.error as string | null) || null,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date((row.updated_at as string) || (row.created_at as string)).toISOString(),
        }));
    const items: PendingItem[] = [
        ...normalize("billing-operation", operations.rows),
        ...normalize("image-job", jobs.rows),
        ...normalize("canvas-task", canvas.rows),
        ...normalize("video-task", video.rows),
    ]
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, MERGE_LIMIT);
    const summaryOf = (row: { n: number; oldest: string | null }): SourceSummary => ({ count: Number(row.n), oldestAt: row.oldest ? new Date(row.oldest).toISOString() : null });
    const summary = {
        "billing-operation": summaryOf(opCount.rows[0] as unknown as { n: number; oldest: string | null }),
        "image-job": summaryOf(jobCount.rows[0] as unknown as { n: number; oldest: string | null }),
        "canvas-task": summaryOf(canvasCount.rows[0] as unknown as { n: number; oldest: string | null }),
        "video-task": summaryOf(videoCount.rows[0] as unknown as { n: number; oldest: string | null }),
        total: 0,
    };
    summary.total = summary["billing-operation"].count + summary["image-job"].count
        + summary["canvas-task"].count + summary["video-task"].count;
    return { summary, items, generatedAt: new Date().toISOString() };
}

/**
 * Lightweight badge view for the admin shell (polled on the sidebar cadence):
 * counts only — no exposure write side effect and no item lists. A freshly
 * stale reservation therefore stays uncounted until the worker tick or the
 * pending-review console converts it, which matches "needs review backlog".
 */
export async function readPendingSummary(pool: QueryPool): Promise<PendingSummary> {
    const [opCount, jobCount, canvasCount, videoCount] = await Promise.all(countQueries(pool));
    const total = Number(opCount.rows[0].n) + Number(jobCount.rows[0].n)
        + Number(canvasCount.rows[0].n) + Number(videoCount.rows[0].n);
    return { total, generatedAt: new Date().toISOString() };
}
