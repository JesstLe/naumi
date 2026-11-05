import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import {ensureEnterpriseSchema} from "@/lib/enterprise/schema";

export async function ensureImageSkills() {
 const state=databaseSchemaReadiness(getPool(),"image-skills");
  if (!state.pending) state.pending = ensureSchema().then(ensureEnterpriseSchema).then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_image_skills (
      id text PRIMARY KEY, email text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 1, definition jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    ALTER TABLE app_image_skills ADD COLUMN IF NOT EXISTS enterprise_id uuid REFERENCES app_enterprise_settings(team_id);
    CREATE INDEX IF NOT EXISTS app_image_skills_email_idx ON app_image_skills(email,updated_at DESC);
    CREATE INDEX IF NOT EXISTS app_image_skills_enterprise_idx ON app_image_skills(enterprise_id,updated_at DESC) WHERE deleted_at IS NULL AND enterprise_id IS NOT NULL;
  `)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}
