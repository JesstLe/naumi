-- Additive follow-up for the UNCHANGED operations-list SQL. Existing blue/green
-- application is COMPLETE. Run under all three locks, never inside SQL BEGIN.
SET lock_timeout='3s';
SET statement_timeout='120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_status_window ON app_image_jobs((COALESCE(snapshot->>'status','unknown')),created_at DESC,id,email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_bi_jobs_review_list_window ON app_image_jobs(created_at DESC,id,email) WHERE COALESCE(snapshot->>'status','unknown')='review' OR snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%';
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_index WHERE indexrelid IN(to_regclass('app_bi_jobs_status_window'),to_regclass('app_bi_jobs_review_list_window')) AND indisvalid AND indisready)<>2 THEN
  RAISE EXCEPTION 'ADMIN_QUERY_FILTER_INDEXES_INVALID';
 END IF;
END $$;
SELECT indexrelid::regclass AS name,indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid IN(to_regclass('app_bi_jobs_status_window'),to_regclass('app_bi_jobs_review_list_window'));
