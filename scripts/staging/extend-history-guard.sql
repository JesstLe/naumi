-- Existing staging copy only; provenance is read from the immutable reference DB.
-- Run once, before starting app/worker. Does not rebase the original manifest.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'naumi_staging' THEN RAISE EXCEPTION 'STAGING_DATABASE_NAME_REQUIRED'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key,snapshot_sha256)
SELECT 'app_media_postprocess','operation_id',r.id,
 '4e95627f2a4b65b0089e9f1ab13e1ad7190460d422a61bd2f6953fae6e4e007d'
FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',
 'SELECT operation_id FROM app_media_postprocess') AS r(id text)
ON CONFLICT(table_name,row_key) DO NOTHING;
DROP TRIGGER IF EXISTS naumi_staging_history_freeze ON app_media_postprocess;
CREATE TRIGGER naumi_staging_history_freeze BEFORE UPDATE OR DELETE ON app_media_postprocess
 FOR EACH ROW EXECUTE FUNCTION naumi_staging_guard.freeze_imported_row('operation_id');
COMMIT;
SELECT 'HISTORY_POSTPROCESS_GUARD=PASS';
