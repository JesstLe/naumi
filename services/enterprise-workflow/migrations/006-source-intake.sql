BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.order_sources (
 enterprise_id uuid NOT NULL, order_id uuid NOT NULL,
 source_hash text NOT NULL, row_number integer NOT NULL, source_version integer NOT NULL,
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,order_id),
 UNIQUE(enterprise_id,source_hash,row_number),
 FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id),
 FOREIGN KEY(enterprise_id,source_hash,row_number) REFERENCES enterprise_workflow.import_rows(enterprise_id,source_hash,row_number)
);
INSERT INTO enterprise_workflow.schema_version VALUES(6) ON CONFLICT DO NOTHING;
COMMIT;
