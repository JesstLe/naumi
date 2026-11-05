import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureCompetitorSchema() {
 const state=databaseSchemaReadiness(getPool(),"competitor");
  await ensureSchema();
  if (!state.pending) state.pending = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_competitor_items (
      id uuid PRIMARY KEY, email text NOT NULL, batch_id uuid NOT NULL,
      path text NOT NULL, state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
      job_id uuid, busy_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(email, batch_id, path)
    );
    CREATE INDEX IF NOT EXISTS app_competitor_owner_idx ON app_competitor_items(email, created_at);
  `).then(() => {}).catch(e => { state.pending = null; throw e; });
  await state.pending;
}
