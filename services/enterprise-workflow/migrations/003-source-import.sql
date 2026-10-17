BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.import_batches (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,source_hash)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.import_rows (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, row_number integer NOT NULL CHECK(row_number>1),
 document jsonb NOT NULL, version integer NOT NULL DEFAULT 1, resolution jsonb,
 PRIMARY KEY(enterprise_id,source_hash,row_number),
 FOREIGN KEY(enterprise_id,source_hash) REFERENCES enterprise_workflow.import_batches(enterprise_id,source_hash)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.import_assets (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, asset_id text NOT NULL CHECK(asset_id ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL, PRIMARY KEY(enterprise_id,source_hash,asset_id),
 FOREIGN KEY(enterprise_id,source_hash) REFERENCES enterprise_workflow.import_batches(enterprise_id,source_hash)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.import_audit (
 id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, source_hash text NOT NULL, row_number integer,
 subject text NOT NULL, operation text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO enterprise_workflow.schema_version VALUES(3) ON CONFLICT DO NOTHING;
COMMIT;
