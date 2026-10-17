BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_upload_sessions (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,identity_hash text NOT NULL,
 order_id uuid NOT NULL,task_id uuid NOT NULL,name text NOT NULL,bytes bigint NOT NULL CHECK(bytes>0),
 manifest jsonb NOT NULL,fingerprint text NOT NULL,state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','completed','cancelled','expired')),
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0),final_sha256 text,reason text,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,completed_at timestamptz,
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS delivery_upload_owner ON enterprise_workflow.delivery_upload_sessions(enterprise_id,team_id,subject,created_at DESC,id);
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_upload_parts (
 enterprise_id uuid NOT NULL,session_id uuid NOT NULL,part integer NOT NULL CHECK(part>=0),sha256 text NOT NULL,bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,session_id,part),
 FOREIGN KEY(enterprise_id,session_id) REFERENCES enterprise_workflow.delivery_upload_sessions(enterprise_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_upload_audit (
 ordinal bigint GENERATED ALWAYS AS IDENTITY,enterprise_id uuid NOT NULL,session_id uuid NOT NULL,subject text NOT NULL,operation text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(enterprise_id,session_id) REFERENCES enterprise_workflow.delivery_upload_sessions(enterprise_id,id)
);
INSERT INTO enterprise_workflow.schema_version VALUES(16) ON CONFLICT DO NOTHING;
COMMIT;
