-- Additive migration after the existing model/billing schema has been initialized.
-- Retain all tables on application rollback; never restore a live wallet database.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-schema-v1',0));
ALTER TABLE app_model_upstreams ADD COLUMN IF NOT EXISTS procurement jsonb;
CREATE TABLE IF NOT EXISTS app_model_business (
  draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,
  config jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS app_model_fixed_costs (
  draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,
  config jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS app_model_execution_stages (
  id uuid PRIMARY KEY, operation_id text NOT NULL, feature text NOT NULL,
  public_model_id text NOT NULL, model_version bigint NOT NULL, billing_version bigint NOT NULL,
  provider_id text NOT NULL, wire_model text NOT NULL, matched_rule_id text,
  phase text NOT NULL, state text NOT NULL, attempt int NOT NULL, status int,
  estimated_cost_cny_micros numeric(30,0), cost_source text, usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_model_execution_stages_operation
  ON app_model_execution_stages(operation_id,created_at);
ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS procurement jsonb;
ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_cny_micros numeric(30,0);
ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'unknown';
CREATE TABLE IF NOT EXISTS app_media_postprocess (
  operation_id text PRIMARY KEY, parent_operation_id text NOT NULL, email text NOT NULL,
  model_version bigint NOT NULL, digest text NOT NULL, policy jsonb NOT NULL,
  base_url text NOT NULL, result_url text, width int, height int,
  state text NOT NULL, attempts int NOT NULL DEFAULT 0, lease_id uuid, lease_until timestamptz,
  error text, processing_kind text NOT NULL, cost_cny_micros numeric(30,0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS processing_kind text;
ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS postprocess_status text;
COMMIT;
