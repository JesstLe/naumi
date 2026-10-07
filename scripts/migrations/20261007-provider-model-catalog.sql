-- Additive catalog cache only. Does not alter active execution, billing or media.
BEGIN;
CREATE TABLE IF NOT EXISTS app_model_provider_catalog(
 fingerprint text PRIMARY KEY,provider_id text NOT NULL,result jsonb NOT NULL,last_success_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
