import 'server-only';
import {getPool} from '@/platform/db/pool';
import {databaseSchemaReadiness} from '@/platform/db/schema-readiness';
import {withSchemaInitialization} from '@/lib/schema-initialization';

/** Deployment policy storage only. Startup and independently compiled readers
 * share readiness by actual Pool; no policy read, publication or Fleet command. */
export async function ensureSitePolicySchema() {
  const pool=getPool(),state=databaseSchemaReadiness(pool,'site-policy');
  if (!state.pending) state.pending = withSchemaInitialization(pool,async tx=>{await tx.query(`
    CREATE TABLE IF NOT EXISTS app_site_media_audit (
      id bigserial PRIMARY KEY, command_id uuid NOT NULL, actor text NOT NULL,
      creation_id text NOT NULL, asset_id text NOT NULL, original boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_site_policy (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      policy jsonb NOT NULL, updated_by text NOT NULL, command_id uuid NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS app_site_policy_audit (
      command_id uuid PRIMARY KEY, actor text NOT NULL, before_policy jsonb,
      after_policy jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  `);}).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}
