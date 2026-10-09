-- Additive: old draft rows keep NULL and their existing behavior.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS tool_scope jsonb;
COMMIT;
