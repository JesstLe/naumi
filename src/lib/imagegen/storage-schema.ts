import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {dbEnabled,getPool} from "@/platform/db/pool";

export async function ensureImagegenQuotes(){
 const state=databaseSchemaReadiness(getPool(),"imagegen-quotes");
 if(!dbEnabled)return;
 if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`CREATE TABLE IF NOT EXISTS app_imagegen_quotes(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),operation_id uuid NOT NULL,
 fingerprint text NOT NULL,context_key text NOT NULL,request jsonb NOT NULL,plan jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS app_imagegen_quotes_owner ON app_imagegen_quotes(owner,operation_id);
 CREATE INDEX IF NOT EXISTS app_imagegen_quotes_expiry ON app_imagegen_quotes(expires_at);`)).then(()=>{}).catch(e=>{state.pending=undefined;throw e;});
 await state.pending;
}

export async function ensureImagegenBatches(){
 const state=databaseSchemaReadiness(getPool(),"imagegen-batches");
 if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`
 CREATE TABLE IF NOT EXISTS app_imagegen_batches(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),fingerprint text NOT NULL,
 request jsonb NOT NULL,plan jsonb NOT NULL,state text NOT NULL DEFAULT 'running',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS app_imagegen_batch_items(
 batch_id uuid NOT NULL REFERENCES app_imagegen_batches(id),key text NOT NULL,ordinal integer NOT NULL,
 child_operation_id uuid NOT NULL UNIQUE,request jsonb NOT NULL,plan jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 1,
 result jsonb,lease_token uuid,lease_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(batch_id,key));
 CREATE INDEX IF NOT EXISTS app_imagegen_batches_owner ON app_imagegen_batches(owner,created_at DESC);
 CREATE INDEX IF NOT EXISTS app_imagegen_batches_due ON app_imagegen_batches(updated_at) WHERE state IN ('running','cancelling');
 `)).then(()=>{}).catch(e=>{state.pending=undefined;throw e;});return state.pending;
}
