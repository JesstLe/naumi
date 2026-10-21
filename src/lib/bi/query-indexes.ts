/** Additive, concurrently built indexes. Never run from request/schema startup or a DB transaction. */
export const ADMIN_QUERY_INDEXES = [
  {name:"app_bi_jobs_failed_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_failed_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status' IN ('error','failed')`},
  {name:"app_bi_jobs_review_window",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_review_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%'`},
] as const;
