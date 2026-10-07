-- Additive metadata for the APIMart default image preset and durable call claim.
-- Existing versions, media and credentials are untouched.
CREATE TABLE IF NOT EXISTS app_model_image_presets(
  draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,
  config jsonb NOT NULL
);
ALTER TABLE app_supplier_calls ADD COLUMN IF NOT EXISTS parameters jsonb;
ALTER TABLE app_supplier_calls ADD COLUMN IF NOT EXISTS billing_unit_id text;
CREATE INDEX IF NOT EXISTS app_supplier_calls_billing_unit ON app_supplier_calls(billing_unit_id) WHERE billing_unit_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS app_billing_api_cost_reviews(
  id text PRIMARY KEY,operation_id text NOT NULL REFERENCES app_billing_operations(id),
  before_result jsonb,after_result jsonb NOT NULL,status text NOT NULL,
  refund_credits int NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now()
);
