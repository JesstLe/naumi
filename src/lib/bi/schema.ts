import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import {ensureSupplierSchema} from "@/lib/supplier-cost/schema";
import {ensureEnterpriseSchema} from "@/lib/enterprise/schema";

export async function ensureBiSchema() {
 const state=databaseSchemaReadiness(getPool(),"bi");
  if (!state.pending)
    state.pending = (async () => {
      await ensureSchema();
      await ensureEnterpriseSchema();
      await getPool()
        .query(`CREATE TABLE IF NOT EXISTS app_bi_account_profiles (
      email text PRIMARY KEY REFERENCES app_users(email) ON DELETE CASCADE,
      account_type text NOT NULL DEFAULT 'unknown' CHECK(account_type IN ('unknown','personal','enterprise')),
      company text NOT NULL DEFAULT '', agreed_pay_percent numeric(5,2) CHECK(agreed_pay_percent>0 AND agreed_pay_percent<=100),
      note text NOT NULL DEFAULT '', updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_bi_access_log (
      id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target_email text NOT NULL DEFAULT '',
      section text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_bi_access_created ON app_bi_access_log(created_at DESC);`);
      await getPool().query(`CREATE TABLE IF NOT EXISTS app_bi_model_calls (
      id text PRIMARY KEY,email text NOT NULL,operation text NOT NULL,operation_id text NOT NULL DEFAULT '',
      wire_model text NOT NULL,response_model text NOT NULL DEFAULT '',state text NOT NULL,
      duration_ms integer NOT NULL,input_tokens integer,output_tokens integer,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_bi_model_calls_email_created ON app_bi_model_calls(email,created_at DESC);
      CREATE INDEX IF NOT EXISTS app_bi_model_calls_created ON app_bi_model_calls(created_at DESC);`);
      await getPool().query(`ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS frontend_model_id text NOT NULL DEFAULT '';
      ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS frontend_model_label text NOT NULL DEFAULT '';
      ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS public_model_id text NOT NULL DEFAULT '';
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS provider_id text NOT NULL DEFAULT '';
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS model_version bigint;
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS billing_version bigint;
        ALTER TABLE app_bi_model_calls ADD COLUMN IF NOT EXISTS config_digest text NOT NULL DEFAULT '';`);
      await ensureSupplierSchema(getPool());
      await getPool().query(`CREATE TABLE IF NOT EXISTS app_bi_management_log (
        id text PRIMARY KEY,actor text NOT NULL,email text NOT NULL,action text NOT NULL,reason text NOT NULL,
        changes jsonb NOT NULL,request_fingerprint text NOT NULL,ledger_id text,created_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS app_bi_management_created ON app_bi_management_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS app_bi_management_email ON app_bi_management_log(email,created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS app_bi_management_ledger ON app_bi_management_log(ledger_id) WHERE ledger_id IS NOT NULL;`);
    })().catch((error) => {
      state.pending = null;
      throw error;
    });
  return state.pending;
}
