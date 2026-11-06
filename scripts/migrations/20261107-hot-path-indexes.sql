-- Run ONLY within the operator's existing three-lock host transaction, psql -v ON_ERROR_STOP=1.
-- Deliberately no BEGIN: concurrent indexes must not run inside a SQL transaction.
-- Generated from src/lib/persistence/hot-path-indexes.ts; scripts/ops/hot-path-indexes.ts is the preferred runner.
SET lock_timeout='3s';
SET statement_timeout='900s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_activities_open ON app_release_activities(instance_id,activity_kind,work_scope) WHERE state<>'finished';
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_background_open ON app_release_activities(work_scope,admission_key) WHERE activity_kind='accepted-work' AND state IN ('active','unknown');
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_activities_finished_kind ON app_release_activities(activity_kind,finished_at) WHERE state='finished';
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_ledger_email_created ON app_ledger(email,created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_creation_link_target_id ON app_creation_links(target_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_due_v2 ON app_image_jobs(kind,updated_at,id) WHERE snapshot->>'status'='pending' OR (kind='imagegen' AND snapshot->>'status'='running') OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb;
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_imagegen_failed ON app_image_jobs(updated_at DESC,id) WHERE kind='imagegen' AND snapshot->>'status' IN ('error','needs_attention') AND lease_token IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_imagegen_open ON app_image_jobs(id) WHERE kind='imagegen' AND snapshot->>'status' IN ('pending','running');
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_index WHERE indexrelid IN(to_regclass('app_release_activities_open'),to_regclass('app_release_background_open'),to_regclass('app_release_activities_finished_kind'),to_regclass('app_ledger_email_created'),to_regclass('app_creation_link_target_id'),to_regclass('app_image_jobs_due_v2'),to_regclass('app_image_jobs_imagegen_failed'),to_regclass('app_image_jobs_imagegen_open')) AND indisvalid AND indisready)<>8 THEN
  RAISE EXCEPTION 'HOT_PATH_INDEXES_INVALID';
 END IF;
END $$;
SELECT indexrelid::regclass AS name,indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid IN(to_regclass('app_release_activities_open'),to_regclass('app_release_background_open'),to_regclass('app_release_activities_finished_kind'),to_regclass('app_ledger_email_created'),to_regclass('app_creation_link_target_id'),to_regclass('app_image_jobs_due_v2'),to_regclass('app_image_jobs_imagegen_failed'),to_regclass('app_image_jobs_imagegen_open'));
