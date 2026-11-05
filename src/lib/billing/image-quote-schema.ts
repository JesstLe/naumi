import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {dbEnabled,getPool} from "@/platform/db/pool";

export async function ensureImageBillingQuotes(){
 const state=databaseSchemaReadiness(getPool(),"billing-quotes");
  if(!dbEnabled)return;
  if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`CREATE TABLE IF NOT EXISTS app_image_billing_quotes(
    id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),scope_key text NOT NULL,
    quote jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_image_billing_quotes_expiry ON app_image_billing_quotes(expires_at);`)).then(()=>{}).catch(e=>{state.pending=undefined;throw e;});
  await state.pending;
}
