import "server-only";

type Queryable = { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }> };
type HistoryTable = "app_image_jobs" | "app_canvas_image_tasks" | "app_video_tasks" | "app_billing_operations" | "app_supplier_calls" | "app_supplier_cost_jobs" | "app_gen_reservations" | "app_media_postprocess" | "app_imagegen_batches" | "app_reference_operations";
const KEY: Record<HistoryTable, string> = {
  app_image_jobs: "id", app_canvas_image_tasks: "id", app_video_tasks: "id",
  app_billing_operations: "id", app_supplier_calls: "id", app_supplier_cost_jobs: "key",
  app_gen_reservations: "job_id", app_media_postprocess: "operation_id",
  app_imagegen_batches: "id", app_reference_operations: "id",
};

export function stagingHistoryGuardEnabled(): boolean {
  if (process.env.NAUMI_STAGING_HISTORY_GUARD !== "1") return false;
  if (process.env.NAUMI_ENVIRONMENT !== "staging") throw new Error("预发布历史隔离配置错误");
  return true;
}

/** Stage-only predicate. Missing provenance schema fails the query closed. */
export function excludeImportedHistory(table: HistoryTable, alias: string = table): string {
  if (!stagingHistoryGuardEnabled()) return "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error("Invalid history alias");
  return ` AND NOT EXISTS (SELECT 1 FROM naumi_staging_guard.origin_rows _history WHERE _history.table_name='${table}' AND _history.row_key=${alias}.${KEY[table]}::text)`;
}

export async function isImportedHistory(db: Queryable, table: HistoryTable, id: string): Promise<boolean> {
  if (!stagingHistoryGuardEnabled()) return false;
  const result = await db.query("SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name=$1 AND row_key=$2", [table, id]);
  return (result.rowCount || 0) > 0;
}

export async function assertMutableStagingTask(db: Queryable, table: HistoryTable, id: string): Promise<void> {
  if (await isImportedHistory(db, table, id)) throw new Error("复制的历史任务仅供核验，请新建测试任务");
}
