import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensurePackagingSchema() {
 const state=databaseSchemaReadiness(getPool(),"packaging");
  state.pending ||= ensureSchema().then(() => getPool().query(`CREATE TABLE IF NOT EXISTS app_packaging_projects (
    id uuid PRIMARY KEY, email text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
    title text NOT NULL, brief jsonb NOT NULL, result jsonb, answers text NOT NULL DEFAULT '',
    revision integer NOT NULL DEFAULT 1, run_id uuid, run_until timestamptz,
    skill_id text NOT NULL DEFAULT 'official:brand-packaging-strategy', skill_revision integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS app_packaging_projects_owner ON app_packaging_projects(email, updated_at DESC);`)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}
