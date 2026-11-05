import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureExecutionAuditSchema(pool: Pool) {
 const state=databaseSchemaReadiness<unknown>(pool,"execution-audit");
  let p = state.pending;
  if (!p) {
    p = pool.query(`CREATE TABLE IF NOT EXISTS app_model_execution_stages(
      id uuid PRIMARY KEY,operation_id text NOT NULL,feature text NOT NULL,public_model_id text NOT NULL,
      model_version bigint NOT NULL,billing_version bigint NOT NULL,provider_id text NOT NULL,wire_model text NOT NULL,
      matched_rule_id text,phase text NOT NULL,state text NOT NULL,attempt int NOT NULL,status int,
      estimated_cost_cny_micros numeric(30,0),cost_source text,usage jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_model_execution_stages_operation ON app_model_execution_stages(operation_id,created_at);
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS procurement jsonb;
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_cny_micros numeric(30,0);
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'unknown';`).catch(e => { state.pending=undefined; throw e; });
    state.pending=p;
  }
  await p;
}
