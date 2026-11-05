import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureTeamSchema() {
 const state=databaseSchemaReadiness(getPool(),"teams");
  await ensureSchema();
  if (!state.pending) state.pending = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_account_teams (
      id uuid PRIMARY KEY, name text NOT NULL, owner_email text UNIQUE NOT NULL REFERENCES app_users(email),
      authorized_until timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_account_team_members (
      email text PRIMARY KEY REFERENCES app_users(email), team_id uuid NOT NULL REFERENCES app_account_teams(id),
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_account_team_members_team ON app_account_team_members(team_id);
    CREATE TABLE IF NOT EXISTS app_account_team_audit (
      id uuid PRIMARY KEY, actor text NOT NULL, team_id uuid NOT NULL, target_email text NOT NULL DEFAULT '',
      action text NOT NULL, fingerprint text NOT NULL DEFAULT '', changes jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_account_team_audit_team ON app_account_team_audit(team_id,created_at);

    CREATE TABLE IF NOT EXISTS app_team_access_grants (
      email text PRIMARY KEY REFERENCES app_users(email),scope text NOT NULL CHECK(scope IN ('owned','all')),
      starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,
      enabled boolean NOT NULL DEFAULT true,revoked_at timestamptz,version integer NOT NULL DEFAULT 0,
      created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(expires_at IS NULL OR expires_at>starts_at));
    CREATE TABLE IF NOT EXISTS app_team_access_audit (
      id uuid PRIMARY KEY,actor text NOT NULL,target_email text NOT NULL,action text NOT NULL,
      changes jsonb NOT NULL DEFAULT '{}',fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_team_access_audit_target ON app_team_access_audit(target_email,created_at);
    CREATE TABLE IF NOT EXISTS app_team_access_migrations(id text PRIMARY KEY);
    WITH initial AS (INSERT INTO app_team_access_migrations(id) VALUES('entry-grants-v1') ON CONFLICT DO NOTHING RETURNING id)
    , seeded AS (INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by)
    SELECT u.email,CASE WHEN u.role='admin' THEN 'all' ELSE 'owned' END,
      CASE WHEN u.role='admin' THEN NULL ELSE t.authorized_until END,'system-migration','system-migration'
    FROM app_users u LEFT JOIN app_account_teams t ON t.owner_email=u.email
    WHERE EXISTS(SELECT 1 FROM initial) AND (u.role='admin' OR t.owner_email IS NOT NULL)
      AND NOT u.banned AND (u.role='admin' OR t.authorized_until>now())
    ON CONFLICT DO NOTHING RETURNING *)
    INSERT INTO app_team_access_audit(id,actor,target_email,action,changes,fingerprint)
    SELECT gen_random_uuid(),'system-migration',email,'migration',jsonb_build_object('before',NULL,'after',jsonb_build_object('scope',scope,'starts_at',starts_at,'expires_at',expires_at,'enabled',enabled,'revoked_at',revoked_at,'version',version)),'' FROM seeded;
  `).then(() => {}).catch(error => { state.pending = null; throw error; });
  await state.pending;
}
