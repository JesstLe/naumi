BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.demand_assets (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,order_id uuid NOT NULL,
 uploader text NOT NULL,name text NOT NULL,bytes bigint NOT NULL CHECK(bytes>0),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL CHECK(revision>0),fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,order_id,revision),
 FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS demand_assets_task ON enterprise_workflow.demand_assets(enterprise_id,order_id,revision DESC);
CREATE TABLE IF NOT EXISTS enterprise_workflow.demand_asset_audit (
 id uuid PRIMARY KEY,enterprise_id uuid NOT NULL,asset_id uuid NOT NULL,subject text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('upload','download')),detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(enterprise_id,asset_id) REFERENCES enterprise_workflow.demand_assets(enterprise_id,id)
);

CREATE TABLE IF NOT EXISTS enterprise_workflow.demand_scan_events (
 ordinal bigint GENERATED ALWAYS AS IDENTITY, id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, asset_id uuid NOT NULL,
 sha256 text NOT NULL, bytes bigint NOT NULL, subject text NOT NULL,
 status text NOT NULL CHECK(status IN ('unscanned','clean','infected','error')),
 policy_key text NOT NULL, policy_label text NOT NULL, engine text, signature text, reason text,
 created_at timestamptz NOT NULL, valid_until timestamptz,
 FOREIGN KEY(enterprise_id,asset_id) REFERENCES enterprise_workflow.demand_assets(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS demand_scan_asset ON enterprise_workflow.demand_scan_events(enterprise_id,asset_id,ordinal DESC);

ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN forms_enabled boolean NOT NULL DEFAULT false;
UPDATE enterprise_workflow.runtime_installation SET forms_enabled=(minimum_reader>=20);
INSERT INTO enterprise_workflow.schema_version VALUES(22);
COMMIT;
