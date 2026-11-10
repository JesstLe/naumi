import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureModelSchema(pool: Pool): Promise<void> {
 const state=databaseSchemaReadiness(pool,"models");
  let pending = state.pending;
  if (!pending) {
    pending = (async () => {
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN");
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-schema-v1',0))");
        await tx.query(`
      CREATE TABLE IF NOT EXISTS app_model_credentials(id uuid PRIMARY KEY,provider_id text NOT NULL,key_enc text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_provider_budgets(identity text PRIMARY KEY,max_concurrent int NOT NULL CHECK(max_concurrent>0));
      CREATE TABLE IF NOT EXISTS app_model_capacity_accounts(alias text PRIMARY KEY,identity text NOT NULL REFERENCES app_model_provider_budgets(identity));
      CREATE TABLE IF NOT EXISTS app_model_provider_leases(identity text NOT NULL REFERENCES app_model_provider_budgets(identity),token uuid PRIMARY KEY,expires_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS app_model_provider_leases_identity ON app_model_provider_leases(identity,expires_at);
      CREATE TABLE IF NOT EXISTS app_model_config_versions(version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation_id uuid UNIQUE NOT NULL,actor text NOT NULL,reason text NOT NULL,config jsonb NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_config_state(singleton boolean PRIMARY KEY CHECK(singleton),active_version bigint REFERENCES app_model_config_versions(version));
      CREATE TABLE IF NOT EXISTS app_model_publications(id uuid PRIMARY KEY,version bigint NOT NULL REFERENCES app_model_config_versions(version),expected_version bigint NOT NULL,request_fingerprint text NOT NULL,phase text NOT NULL CHECK(phase IN ('staged','preparing','activating','applied','failed','unknown')),error_code text,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_bi_access_log(id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target_email text NOT NULL DEFAULT '',section text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_drafts(id uuid PRIMARY KEY,revision bigint NOT NULL,based_on_version bigint NOT NULL REFERENCES app_model_config_versions(version),actor text NOT NULL UNIQUE,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_providers(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,name text NOT NULL,protocol text NOT NULL,base_url text NOT NULL,credential_ref uuid REFERENCES app_model_credentials(id),enabled boolean NOT NULL,timeout_ms int NOT NULL,max_concurrent int NOT NULL,options jsonb,PRIMARY KEY(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_upstreams(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,provider_id text NOT NULL,model text NOT NULL,label text NOT NULL,modality text NOT NULL,enabled boolean NOT NULL,capabilities jsonb NOT NULL,parameter_map jsonb NOT NULL,cost_ref text,PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,provider_id) REFERENCES app_model_providers(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_pools(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,modality text NOT NULL CHECK(modality='image'),strategy text NOT NULL,PRIMARY KEY(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_candidates(draft_id uuid NOT NULL,pool_id text NOT NULL,upstream_id text NOT NULL,position int NOT NULL,PRIMARY KEY(draft_id,pool_id,upstream_id),FOREIGN KEY(draft_id,pool_id) REFERENCES app_model_pools(draft_id,id) ON DELETE CASCADE,FOREIGN KEY(draft_id,upstream_id) REFERENCES app_model_upstreams(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_rules(draft_id uuid NOT NULL,pool_id text NOT NULL,id text NOT NULL,position int NOT NULL,priority int NOT NULL,conditions jsonb NOT NULL,requirements jsonb NOT NULL,PRIMARY KEY(draft_id,pool_id,id),FOREIGN KEY(draft_id,pool_id) REFERENCES app_model_pools(draft_id,id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS app_model_public_models(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,label text NOT NULL,modality text NOT NULL,enabled boolean NOT NULL,visible boolean NOT NULL,upstream_target text,pool_target text,CHECK((upstream_target IS NULL)<>(pool_target IS NULL)),PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,upstream_target) REFERENCES app_model_upstreams(draft_id,id),FOREIGN KEY(draft_id,pool_target) REFERENCES app_model_pools(draft_id,id));
      ALTER TABLE app_model_upstreams ADD COLUMN IF NOT EXISTS procurement jsonb;
      CREATE TABLE IF NOT EXISTS app_model_business(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS previous_ids jsonb;
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS tool_scope jsonb;
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS display_resolutions jsonb;
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS supplier_routing jsonb;
      CREATE TABLE IF NOT EXISTS app_model_channel_balances(schedule_key text NOT NULL,channel_key text NOT NULL,served bigint NOT NULL DEFAULT 0,PRIMARY KEY(schedule_key,channel_key));
      CREATE TABLE IF NOT EXISTS app_model_channel_health(key text PRIMARY KEY,failures int NOT NULL DEFAULT 0,open_until timestamptz,probe_until timestamptz,last_status int,last_success_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE app_model_channel_health ADD COLUMN IF NOT EXISTS last_failure_kind text;
      ALTER TABLE app_model_channel_health ADD COLUMN IF NOT EXISTS last_failure_at timestamptz;
      ALTER TABLE app_model_channel_health ADD COLUMN IF NOT EXISTS probe_token uuid;
      CREATE TABLE IF NOT EXISTS app_model_channel_operations(operation_key text PRIMARY KEY,upstream_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_image_presets(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_model_fixed_costs(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_model_bindings(draft_id uuid NOT NULL,id text NOT NULL,public_model_id text NOT NULL,PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,public_model_id) REFERENCES app_model_public_models(draft_id,id) ON DELETE CASCADE);
        `);
        await tx.query("COMMIT");
      } catch (error) { await tx.query("ROLLBACK"); throw error; }
      finally { tx.release(); }
    })().catch(error => { state.pending=undefined; throw error; });
    state.pending=pending;
  }
  return pending;
}
