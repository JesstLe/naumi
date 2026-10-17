BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.delivery_scan_events (
 ordinal bigint GENERATED ALWAYS AS IDENTITY, id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, asset_id uuid NOT NULL,
 sha256 text NOT NULL, bytes bigint NOT NULL, subject text NOT NULL,
 status text NOT NULL CHECK(status IN ('unscanned','clean','infected','error')),
 policy_key text NOT NULL, policy_label text NOT NULL, engine text, signature text, reason text,
 created_at timestamptz NOT NULL, valid_until timestamptz,
 FOREIGN KEY(enterprise_id,asset_id) REFERENCES enterprise_workflow.delivery_assets(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS delivery_scan_asset ON enterprise_workflow.delivery_scan_events(enterprise_id,asset_id,ordinal DESC);
INSERT INTO enterprise_workflow.schema_version VALUES(15) ON CONFLICT DO NOTHING;
COMMIT;
