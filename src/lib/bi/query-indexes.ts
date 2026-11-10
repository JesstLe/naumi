/** Additive, concurrently built indexes. Never run from request/schema startup or a DB transaction. */
export const ADMIN_QUERY_INDEXES = [
  {name:"app_bi_jobs_effective_status_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_effective_status_window ON app_image_jobs((COALESCE(snapshot#>>'{result,status}',snapshot->>'status','unknown')),created_at DESC,id,email)`},
  {name:"app_bi_calls_operation_email",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_calls_operation_email ON app_bi_model_calls(operation_id,email)`},
  {name:"app_bi_jobs_failed_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_failed_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status' IN ('error','failed')`},
  {name:"app_bi_jobs_review_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_review_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%'`},
  {name:"app_bi_jobs_status_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_status_window ON app_image_jobs((COALESCE(snapshot->>'status','unknown')),created_at DESC,id,email)`},
  {name:"app_bi_jobs_review_list_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_review_list_window ON app_image_jobs(created_at DESC,id,email) WHERE COALESCE(snapshot->>'status','unknown')='review' OR snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%'`},
] as const;
