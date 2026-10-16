-- Apply explicitly to the enterprise-workflow database only. No legacy app_* writes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS enterprise_workflow;
CREATE TABLE IF NOT EXISTS enterprise_workflow.orders (
  enterprise_id uuid NOT NULL, id uuid NOT NULL, version integer NOT NULL CHECK(version > 0),
  document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(enterprise_id,id),
  CHECK((document->>'enterpriseId'=enterprise_id::text) IS TRUE), CHECK((document->>'id'=id::text) IS TRUE),
  CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.commands (
  enterprise_id uuid NOT NULL, id uuid NOT NULL, subject text NOT NULL, order_id uuid NOT NULL,
  fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enterprise_id,id), FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
-- Immutable event log + transactional outbox. Delivery metadata will live in a separate table.
CREATE TABLE IF NOT EXISTS enterprise_workflow.events (
  enterprise_id uuid NOT NULL, id text NOT NULL, order_id uuid NOT NULL, aggregate_version integer NOT NULL,
  event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(enterprise_id,id),
  UNIQUE(enterprise_id,order_id,aggregate_version),
  FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS workflow_events_order ON enterprise_workflow.events(enterprise_id,order_id,aggregate_version);
CREATE INDEX IF NOT EXISTS workflow_orders_updated ON enterprise_workflow.orders(enterprise_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS enterprise_workflow.schema_version (version integer PRIMARY KEY);
INSERT INTO enterprise_workflow.schema_version VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
