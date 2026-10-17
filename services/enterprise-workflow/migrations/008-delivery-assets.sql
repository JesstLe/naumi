BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_assets (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,order_id uuid NOT NULL,task_id uuid NOT NULL,
 uploader text NOT NULL,name text NOT NULL,bytes bigint NOT NULL CHECK(bytes>0),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL CHECK(revision>0),fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,order_id,task_id,revision),
 FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS delivery_assets_task ON enterprise_workflow.delivery_assets(enterprise_id,order_id,task_id,revision DESC);
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_asset_audit (
 id uuid PRIMARY KEY,enterprise_id uuid NOT NULL,asset_id uuid NOT NULL,subject text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('upload','download')),detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(enterprise_id,asset_id) REFERENCES enterprise_workflow.delivery_assets(enterprise_id,id)
);
INSERT INTO enterprise_workflow.schema_version VALUES(8) ON CONFLICT DO NOTHING;
COMMIT;
