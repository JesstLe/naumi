-- Run outside a transaction, under the target site's existing deployment lock.
-- Keep the old indexes for rollback; never build these from a web request.
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_effective_status_window
  ON app_image_jobs ((COALESCE(snapshot#>>'{result,status}',snapshot->>'status','unknown')),created_at DESC,id,email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_calls_operation_email
  ON app_bi_model_calls (operation_id,email);
