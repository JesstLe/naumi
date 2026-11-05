import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureEnterpriseSchema} from "@/lib/enterprise/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureTenantSchema() {
 const state=databaseSchemaReadiness(getPool(),"tenants");
  await ensureEnterpriseSchema();
  if (!state.pending) state.pending = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_tenant_entitlements(
      tenant_id uuid PRIMARY KEY REFERENCES app_account_teams(id),
      entitlement_name text, seat_limit integer CHECK(seat_limit IS NULL OR seat_limit>0),
      feature_policy jsonb NOT NULL DEFAULT '{}', updated_by text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_tenant_commands(
      command_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES app_account_teams(id),
      actor text NOT NULL, fingerprint text NOT NULL, action text NOT NULL,
      result jsonb NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_tenant_commands_tenant ON app_tenant_commands(tenant_id,created_at DESC);
    ALTER TABLE app_account_teams ALTER COLUMN authorized_until DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS app_account_teams_name ON app_account_teams(lower(name),id);
  `).then(()=>{}).catch(e=>{state.pending=null;throw e;});
  await state.pending;
}
