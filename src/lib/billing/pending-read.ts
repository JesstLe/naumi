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
// A badge request should borrow one pool connection, not one per source.
const pendingCounts = [
    `SELECT 'billing-operation' AS source,count(*)::int AS n,min(created_at)::text AS oldest FROM app_billing_operations WHERE state IN ('hold','manual') ${excludeImportedHistory("app_billing_operations")}`,
    `SELECT 'image-job' AS source,count(*)::int AS n,min(updated_at)::text AS oldest FROM app_image_jobs WHERE snapshot->>'status'='needs_attention' ${excludeImportedHistory("app_image_jobs")}`,
    `SELECT 'canvas-task' AS source,count(*)::int AS n,min(updated_at)::text AS oldest FROM app_canvas_image_tasks WHERE status='needs_attention' ${excludeImportedHistory("app_canvas_image_tasks")}`,
    `SELECT 'video-task' AS source,count(*)::int AS n,min(updated_at)::text AS oldest FROM app_video_tasks WHERE status='needs_attention' ${excludeImportedHistory("app_video_tasks")}`,
].join("\nUNION ALL\n");

function summary(rows: Record<string, unknown>[]) {
    const value = (source: PendingSource): SourceSummary => {
        const row = rows.find(row => row.source === source)!;
        return { count: Number(row.n), oldestAt: row.oldest ? new Date(String(row.oldest)).toISOString() : null };
    };
    return {
        "billing-operation": value("billing-operation"),
        "image-job": value("image-job"),
        "canvas-task": value("canvas-task"),
        "video-task": value("video-task"),
        total: rows.reduce((total, row) => total + Number(row.n), 0),
    };
}

export async function readPendingOverview(pool: QueryPool): Promise<PendingOverview> {
    const rows = await pool.query([
            `(SELECT 'billing-operation' AS source,o.id,o.email,o.feature AS kind,o.state,o.reserved_credits,
                    NULL::text AS operation_state,
                    NULL::text AS error_code,NULL::text AS error,o.created_at,o.updated_at
             FROM app_billing_operations o
             WHERE o.state IN ('hold','manual') ${excludeImportedHistory("app_billing_operations", "o")}
             ORDER BY o.created_at ASC,o.id ASC LIMIT ${LIST_LIMIT})`,
            `(SELECT 'image-job' AS source,j.id,j.email,j.kind,'needs_attention' AS state,j.reserved_cost,o.state,
                    j.snapshot->>'error_code' AS error_code,
                    COALESCE(NULLIF(j.snapshot->>'failureDiagnostic',''),j.snapshot->>'error') AS error,
                    j.created_at,j.updated_at
             FROM app_image_jobs j ${OPERATION_JOIN("j")}
             WHERE j.snapshot->>'status'='needs_attention' ${excludeImportedHistory("app_image_jobs", "j")}
             ORDER BY j.updated_at ASC,j.id ASC LIMIT ${LIST_LIMIT})`,
            `(SELECT 'canvas-task' AS source,c.id,c.email,c.kind,'needs_attention' AS state,c.cost,o.state,
                    NULL::text AS error_code,NULLIF(c.error,'') AS error,
                    c.created_at,c.updated_at
             FROM app_canvas_image_tasks c ${OPERATION_JOIN("c")}
             WHERE c.status='needs_attention' ${excludeImportedHistory("app_canvas_image_tasks", "c")}
             ORDER BY c.updated_at ASC,c.id ASC LIMIT ${LIST_LIMIT})`,
            `(SELECT 'video-task' AS source,v.id,v.email,'video' AS kind,'needs_attention' AS state,v.cost,o.state,
                    NULLIF(v.error_code,'') AS error_code,NULLIF(v.error,'') AS error,
                    v.created_at,v.updated_at
             FROM app_video_tasks v ${OPERATION_JOIN("v")}
             WHERE v.status='needs_attention' ${excludeImportedHistory("app_video_tasks", "v")}
             ORDER BY v.updated_at ASC,v.id ASC LIMIT ${LIST_LIMIT})`,
    ].join("\nUNION ALL\n") + `\nORDER BY updated_at ASC,source,id LIMIT ${MERGE_LIMIT}`);
    const counts = await pool.query(pendingCounts);
    const items: PendingItem[] = rows.rows.map(row => ({
            source: row.source as PendingSource, id: String(row.id), email: String(row.email), kind: String(row.kind ?? ""),
            state: String(row.state), operationState: (row.operation_state as string | null) || null,
            reservedCredits: Number(row.reserved_credits ?? row.reserved_cost ?? 0),
            errorCode: (row.error_code as string | null) || null, error: (row.error as string | null) || null,
            createdAt: new Date(row.created_at as string).toISOString(),
            updatedAt: new Date((row.updated_at as string) || (row.created_at as string)).toISOString(),
        }));
    return { summary: summary(counts.rows), items, generatedAt: new Date().toISOString() };
}

/**
 * Lightweight badge view for the admin shell (polled on the sidebar cadence):
 * counts only — no exposure write side effect and no item lists. A freshly
 * stale reservation therefore stays uncounted until the worker tick or the
 * pending-review console converts it, which matches "needs review backlog".
 */
export async function readPendingSummary(pool: QueryPool): Promise<PendingSummary> {
    const total = (await pool.query(pendingCounts)).rows.reduce((total, row) => total + Number(row.n), 0);
    return { total, generatedAt: new Date().toISOString() };
}
