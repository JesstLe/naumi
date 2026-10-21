-- Run ONLY within the operator's existing three-lock host transaction, psql -v ON_ERROR_STOP=1.
-- Deliberately no BEGIN: concurrent indexes must not run inside a SQL transaction.
SET lock_timeout='3s';
SET statement_timeout='120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_failed_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status' IN ('error','failed');
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_review_window ON app_image_jobs(created_at,email) WHERE snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%';
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_index WHERE indexrelid IN(to_regclass('app_bi_jobs_failed_window'),to_regclass('app_bi_jobs_review_window')) AND indisvalid AND indisready)<>2 THEN
  RAISE EXCEPTION 'ADMIN_QUERY_INDEXES_INVALID';
 END IF;
END $$;
SELECT indexrelid::regclass AS name,indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid IN(to_regclass('app_bi_jobs_failed_window'),to_regclass('app_bi_jobs_review_window'));
-- Program rollback retains these compatible indexes; no business state/row rollback.
