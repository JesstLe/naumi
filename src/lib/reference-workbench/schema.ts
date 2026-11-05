import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureWorkbench(){
 const state=databaseSchemaReadiness(getPool(),"workbench");if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(WORKBENCH_DDL)).then(()=>{}).catch(e=>{state.pending=undefined;throw e;});await state.pending;}

export const WORKBENCH_DDL=`
 CREATE TABLE IF NOT EXISTS app_reference_documents(
  owner text NOT NULL,kind text NOT NULL,id text NOT NULL,payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner,kind,id));
 CREATE INDEX IF NOT EXISTS app_reference_documents_recent ON app_reference_documents(owner,kind,updated_at DESC) WHERE NOT deleted;
 CREATE TABLE IF NOT EXISTS app_reference_operations(
  id uuid PRIMARY KEY,owner text NOT NULL,kind text NOT NULL,request_id text NOT NULL,
  fingerprint text NOT NULL,body jsonb NOT NULL,plans jsonb NOT NULL,
  state text NOT NULL DEFAULT 'preview',result jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner,kind,request_id));
 CREATE INDEX IF NOT EXISTS app_reference_operations_owner ON app_reference_operations(owner,created_at DESC);
`;
