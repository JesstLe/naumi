BEGIN;
-- Editable working copies. import_rows/import_assets remain the original evidence.
CREATE TABLE enterprise_workflow.source_worksheets (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL,
 version integer NOT NULL CHECK(version>0), document jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,source_hash),
 FOREIGN KEY(enterprise_id,source_hash) REFERENCES enterprise_workflow.import_batches(enterprise_id,source_hash)
);
CREATE TABLE enterprise_workflow.source_worksheet_commands (
 enterprise_id uuid NOT NULL, command_id uuid NOT NULL, source_hash text NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL, subject text NOT NULL,
 PRIMARY KEY(enterprise_id,command_id)
);
CREATE TABLE enterprise_workflow.source_worksheet_audit (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, version integer NOT NULL,
 subject text NOT NULL, command_id uuid NOT NULL, operation text NOT NULL,
 detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,source_hash,version)
);
CREATE TABLE enterprise_workflow.source_worksheet_files (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, id text NOT NULL,
 name text NOT NULL, mime text NOT NULL, bytes integer NOT NULL CHECK(bytes>0 AND bytes<=4194304),
 content bytea NOT NULL, subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,source_hash,id),
 FOREIGN KEY(enterprise_id,source_hash) REFERENCES enterprise_workflow.import_batches(enterprise_id,source_hash)
);
INSERT INTO enterprise_workflow.schema_version VALUES(37);
COMMIT;
