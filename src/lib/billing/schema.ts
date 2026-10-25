import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import "server-only";
import type { Pool,PoolClient } from "pg";
import {withSchemaInitialization} from "../schema-initialization";
export function markBillingSchemaReady(pool:Pool){databaseSchemaReadiness(pool,"billing").pending=Promise.resolve();}
export function ensureBillingSchema(pool: Pool): Promise<void> {
    const state=databaseSchemaReadiness(pool,"billing");
    let pending = state.pending;
    if (pending)
        return pending;
    pending = withSchemaInitialization(pool,applyBillingSchema).catch(error => { state.pending=undefined; throw error; });
    state.pending=pending;
    return pending;
}

/** The caller owns the namespace initialization transaction. */
export async function applyBillingSchema(client:PoolClient){await client.query(`
  CREATE TABLE IF NOT EXISTS app_billing_config_versions (
   version bigserial PRIMARY KEY, operation_id text NOT NULL UNIQUE,
   request_fingerprint text NOT NULL,actor text NOT NULL,reason text NOT NULL,
   config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS app_billing_operations (
   id text PRIMARY KEY,email text NOT NULL,feature text NOT NULL,quote jsonb NOT NULL,
   request_fingerprint text NOT NULL,state text NOT NULL,
   reserved_credits integer NOT NULL DEFAULT 0 CHECK(reserved_credits>=0),
   charged_credits integer NOT NULL DEFAULT 0 CHECK(charged_credits>=0),
   ledger_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS app_billing_operations_email_idx ON app_billing_operations(email,created_at DESC);
  ALTER TABLE app_billing_operations ADD COLUMN IF NOT EXISTS result_response jsonb;
  ALTER TABLE app_billing_operations ADD COLUMN IF NOT EXISTS settlement_result jsonb;
  CREATE TABLE IF NOT EXISTS app_billing_intents(id text PRIMARY KEY,email text NOT NULL,path text NOT NULL,request_fingerprint text NOT NULL,response jsonb,response_status integer,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS app_billing_reconciliations(
   id text PRIMARY KEY,operation_id text NOT NULL,email text NOT NULL,actor text NOT NULL,
   request_fingerprint text NOT NULL,reason text NOT NULL,proof text NOT NULL,result jsonb NOT NULL,
   charge integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS app_billing_api_cost_reviews(
    id text PRIMARY KEY,operation_id text NOT NULL REFERENCES app_billing_operations(id),
    before_result jsonb,after_result jsonb NOT NULL,status text NOT NULL,refund_credits int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE app_orders ADD COLUMN IF NOT EXISTS billing_quote jsonb;
  ALTER TABLE app_card_keys ADD COLUMN IF NOT EXISTS billing_grant jsonb;
  ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS billing_quote jsonb;
  ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS billing_request_fingerprint text;
  ALTER TABLE app_canvas_image_tasks ADD COLUMN IF NOT EXISTS billing_quote jsonb;
  ALTER TABLE app_canvas_image_tasks ADD COLUMN IF NOT EXISTS billing_request_fingerprint text;
  ALTER TABLE app_image_cost_audit ADD COLUMN IF NOT EXISTS billing_config_version bigint;
  ALTER TABLE app_image_cost_audit ADD COLUMN IF NOT EXISTS cost_currency text;
  ALTER TABLE app_image_cost_audit ADD COLUMN IF NOT EXISTS cost_amount_micros numeric(30,0);
  ALTER TABLE app_image_cost_audit ADD COLUMN IF NOT EXISTS cost_source text;
  ALTER TABLE app_image_cost_audit ADD COLUMN IF NOT EXISTS cost_actual boolean;
  ALTER TABLE app_image_cost_audit ALTER COLUMN cost_credits DROP NOT NULL;
  ALTER TABLE app_image_cost_audit ALTER COLUMN margin_credits DROP NOT NULL;
 `);}
