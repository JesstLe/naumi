import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureTeamSchema} from "@/lib/teams/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureEnterpriseSchema() {
 const state=databaseSchemaReadiness(getPool(),"enterprise");
  await ensureTeamSchema();
  if (!state.pending) state.pending = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_enterprise_settings(
      team_id uuid PRIMARY KEY REFERENCES app_account_teams(id), enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_enterprise_roles(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), id uuid NOT NULL,
      name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60), level integer NOT NULL CHECK(level BETWEEN 1 AND 998),
      manage_members boolean NOT NULL DEFAULT false, view_records boolean NOT NULL DEFAULT false,
      version integer NOT NULL DEFAULT 0, PRIMARY KEY(enterprise_id,id));
    ALTER TABLE app_enterprise_roles ADD COLUMN IF NOT EXISTS workflow_permissions jsonb NOT NULL DEFAULT '["request","execute"]';
    CREATE TABLE IF NOT EXISTS app_enterprise_members(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), email text NOT NULL REFERENCES app_users(email),
      supervisor_email text NOT NULL REFERENCES app_users(email), role_id uuid,
      employment text NOT NULL CHECK(employment IN ('permanent','intern')), version integer NOT NULL DEFAULT 0,
      PRIMARY KEY(enterprise_id,email), UNIQUE(email), CHECK(email<>supervisor_email),
      FOREIGN KEY(enterprise_id,role_id) REFERENCES app_enterprise_roles(enterprise_id,id));
    CREATE INDEX IF NOT EXISTS app_enterprise_members_supervisor ON app_enterprise_members(enterprise_id,supervisor_email);
    ALTER TABLE app_enterprise_members ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active' CHECK(membership_status IN ('active','suspended'));
    ALTER TABLE app_enterprise_members ADD COLUMN IF NOT EXISTS membership_expires_at timestamptz;
    ALTER TABLE app_enterprise_members ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE app_enterprise_members ADD COLUMN IF NOT EXISTS left_at timestamptz;
    CREATE TABLE IF NOT EXISTS app_tenant_entitlements(
      tenant_id uuid PRIMARY KEY REFERENCES app_account_teams(id),entitlement_name text,
      seat_limit integer CHECK(seat_limit IS NULL OR seat_limit>0),feature_policy jsonb NOT NULL DEFAULT '{}',
      updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_enterprise_audit(
      id uuid PRIMARY KEY, enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), actor text NOT NULL,
      action text NOT NULL, target text NOT NULL DEFAULT '', fingerprint text NOT NULL, result jsonb NOT NULL, changes jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE app_enterprise_audit ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '{}';
  `).then(()=>{}).catch(e=>{state.pending=null;throw e});
  await state.pending;
}
