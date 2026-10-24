import 'server-only';
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import {ensureBillingSchema} from '@/lib/billing/schema';
let ready:Promise<void>|null=null;
export async function ensureCreationSchema(){
 await ensureSchema();
 await ensureBillingSchema(getPool());
 if(!ready)ready=getPool().query(`
 CREATE TABLE IF NOT EXISTS app_creation_records(
  id text PRIMARY KEY,schema_version integer NOT NULL DEFAULT 1,actor_email text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind IN ('personal','tenant','legacy_unconfirmed')),tenant_id uuid,
  payer_account_id text,source_kind text NOT NULL,source_id text NOT NULL,parent_id text REFERENCES app_creation_records(id),
  status text NOT NULL DEFAULT 'queued',request_snapshot jsonb NOT NULL DEFAULT '{}',parameters_snapshot jsonb NOT NULL DEFAULT '{}',
  model_snapshot jsonb NOT NULL DEFAULT '{}',accepted_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((scope_kind='tenant')=(tenant_id IS NOT NULL)),UNIQUE(source_kind,source_id,actor_email));
 CREATE INDEX IF NOT EXISTS app_creation_tenant_time ON app_creation_records(tenant_id,accepted_at DESC,id DESC);
 CREATE INDEX IF NOT EXISTS app_creation_actor_time ON app_creation_records(actor_email,accepted_at DESC,id DESC);
 CREATE INDEX IF NOT EXISTS app_creation_parent ON app_creation_records(parent_id);
 CREATE TABLE IF NOT EXISTS app_creation_assets(
  id text PRIMARY KEY,creation_id text NOT NULL REFERENCES app_creation_records(id),direction text NOT NULL CHECK(direction IN ('input','output')),
  role text NOT NULL,position integer NOT NULL DEFAULT 0,variant text NOT NULL DEFAULT 'original',storage_ref text NOT NULL DEFAULT '',
  actor_email text NOT NULL,mime text,byte_size bigint,hash text,availability text NOT NULL DEFAULT 'recorded',media_type text NOT NULL DEFAULT 'image',text_content text,
  UNIQUE(creation_id,direction,role,position,variant));
 CREATE INDEX IF NOT EXISTS app_creation_asset_record ON app_creation_assets(creation_id);
 ALTER TABLE app_creation_assets ADD COLUMN IF NOT EXISTS input_position integer;
 ALTER TABLE app_creation_assets ADD COLUMN IF NOT EXISTS execution_ref text;
 CREATE TABLE IF NOT EXISTS app_creation_events(
  id text PRIMARY KEY,creation_id text NOT NULL REFERENCES app_creation_records(id),event_key text NOT NULL,type text NOT NULL,
  status text NOT NULL,summary text NOT NULL DEFAULT '',occurred_at timestamptz NOT NULL DEFAULT now(),observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(creation_id,event_key));
 CREATE INDEX IF NOT EXISTS app_creation_event_record ON app_creation_events(creation_id,occurred_at,id);
 CREATE TABLE IF NOT EXISTS app_creation_links(
  creation_id text NOT NULL REFERENCES app_creation_records(id),target_type text NOT NULL,target_id text NOT NULL,
  actor_email text NOT NULL,relation text NOT NULL DEFAULT 'execution',PRIMARY KEY(creation_id,target_type,target_id));
 CREATE INDEX IF NOT EXISTS app_creation_link_target ON app_creation_links(target_type,target_id,actor_email);
 ALTER TABLE app_creation_links ADD COLUMN IF NOT EXISTS reserved_credits integer;
 ALTER TABLE app_creation_links ADD COLUMN IF NOT EXISTS released_credits integer;
 CREATE TABLE IF NOT EXISTS app_creation_contexts(
  actor_email text NOT NULL,context_kind text NOT NULL,context_id text NOT NULL,scope_kind text NOT NULL,tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_email,context_kind,context_id));
 `).then(()=>{}).catch(e=>{ready=null;throw e});await ready;
}
