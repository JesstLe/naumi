-- STAGING ONLY. Requires psql -v NAUMI_STAGING=1. Never run on production.
\if :NAUMI_STAGING
\else
\quit 9
\endif
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'naumi_staging' THEN
    RAISE EXCEPTION 'STAGING_DATABASE_NAME_REQUIRED';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS naumi_staging_guard;
CREATE TABLE IF NOT EXISTS naumi_staging_guard.origin_rows (
  table_name text NOT NULL,
  key_column text NOT NULL,
  row_key text NOT NULL,
  snapshot_sha256 text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(table_name,row_key)
);
CREATE OR REPLACE FUNCTION naumi_staging_guard.freeze_imported_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,naumi_staging_guard AS $$
DECLARE old_key text;
BEGIN
  old_key := to_jsonb(OLD)->>TG_ARGV[0];
  IF EXISTS (SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name=TG_TABLE_NAME AND row_key=old_key) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='STAGING_IMPORTED_HISTORY_READ_ONLY';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE item record;
BEGIN
  IF EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows) THEN
    RAISE EXCEPTION 'ORIGIN_MANIFEST_ALREADY_EXISTS_NO_REBASE';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('app_image_jobs','id'),('app_canvas_image_tasks','id'),('app_video_tasks','id'),
    ('app_billing_operations','id'),('app_gen_reservations','job_id'),
    ('app_ledger','id'),('app_supplier_calls','id'),('app_supplier_cost_jobs','key'),
    ('app_media_postprocess','operation_id')
  ) AS tables(table_name,key_column) LOOP
    IF to_regclass('public.' || item.table_name) IS NOT NULL THEN
      EXECUTE format('INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key,snapshot_sha256) SELECT %L,%L,%I::text,%L FROM public.%I',
        item.table_name,item.key_column,item.key_column,'4e95627f2a4b65b0089e9f1ab13e1ad7190460d422a61bd2f6953fae6e4e007d',item.table_name);
      EXECUTE format('CREATE TRIGGER naumi_staging_history_freeze BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION naumi_staging_guard.freeze_imported_row(%L)',item.table_name,item.key_column);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA naumi_staging_guard FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA naumi_staging_guard FROM PUBLIC;
COMMIT;
SELECT 'STAGING_ORIGIN=' || table_name || ':' || count(*) FROM naumi_staging_guard.origin_rows GROUP BY table_name ORDER BY table_name;
