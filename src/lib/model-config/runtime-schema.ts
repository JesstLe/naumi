import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import "server-only";
import type { Pool } from "pg";
export async function ensureModelRuntimeSchema(pool: Pool) {
 const state=databaseSchemaReadiness(pool,"model-runtime");
  let pending = state.pending;
  if (!pending) {
    pending = (async () => {
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN"); await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-model-runtime-schema'))");
        await tx.query(`
          ALTER TABLE app_model_publications ADD COLUMN IF NOT EXISTS billing_version bigint;
          ALTER TABLE app_model_publications ADD COLUMN IF NOT EXISTS router_digest text;
          ALTER TABLE app_model_publications ADD COLUMN IF NOT EXISTS expected_router_digest text;
          CREATE TABLE IF NOT EXISTS app_model_router_projections(model_version bigint NOT NULL REFERENCES app_model_config_versions(version),billing_version bigint NOT NULL,digest text NOT NULL,phase text NOT NULL,payload jsonb NOT NULL,lease_id uuid,lease_until timestamptz,PRIMARY KEY(model_version,billing_version),UNIQUE(digest));
        `); await tx.query("COMMIT");
      } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
    })().catch(error => { state.pending=undefined; throw error; });
    state.pending=pending;
  }
  return pending;
}
