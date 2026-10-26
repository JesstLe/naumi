import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import {ensureVideoNodeSchema} from "@/lib/canvas/storage-schema";

export async function ensureVideoAssetSchema(){
 const state=databaseSchemaReadiness(getPool(),"video-assets");if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_asset_imports(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id))")).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;}

export async function ensureMediaInspectionSchema(){
 const state=databaseSchemaReadiness(getPool(),"media-inspection");
  if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_media_probes(storage_key text NOT NULL,sha256 text NOT NULL,probe jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(storage_key,sha256)); ALTER TABLE app_video_media_probes ADD COLUMN IF NOT EXISTS decoder_version integer NOT NULL DEFAULT 0")).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;
}

export async function ensureMediaJobSchema(){
 const state=databaseSchemaReadiness(getPool(),"media-jobs");
  if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_video_media_jobs(id uuid PRIMARY KEY,email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,
      request jsonb NOT NULL,inputs jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',processed_seconds double precision NOT NULL DEFAULT 0,
      outputs jsonb NOT NULL DEFAULT '[]',query_result text,error text,cancellation_requested_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(email,operation_id));
    CREATE INDEX IF NOT EXISTS app_video_media_jobs_pending_idx ON app_video_media_jobs(updated_at) WHERE status IN ('queued','processing');
    CREATE INDEX IF NOT EXISTS app_video_media_jobs_owner_history_idx ON app_video_media_jobs(email,created_at DESC,id DESC);
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS billing_quote jsonb;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS auxiliary_files_enc text;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS cleanup_completed_at timestamptz;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS output_manifest jsonb;
    CREATE TABLE IF NOT EXISTS app_video_media_probes(storage_key text NOT NULL,sha256 text NOT NULL,probe jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(storage_key,sha256));
  `)).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;
}

export async function ensureVideoScriptSchema(){
 const state=databaseSchemaReadiness(getPool(),"script-assets");
  await ensureSchema();await ensureVideoNodeSchema();
  state.pending??=getPool().query(`CREATE TABLE IF NOT EXISTS app_video_script_operations (
    email text NOT NULL,operation_id uuid NOT NULL,request_fingerprint text NOT NULL,node_id text NOT NULL,
    source_node_id text,source_sha256 text,source_start integer,source_end integer,created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(email,operation_id),UNIQUE(node_id))`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
  await state.pending;
}

export async function ensureVideoReferenceUploadSchema(){
 const state=databaseSchemaReadiness(getPool(),"reference-upload");if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_reference_uploads(email text NOT NULL,operation_id uuid NOT NULL,storage_key text NOT NULL,sha256 text NOT NULL,mime_type text NOT NULL,bytes bigint NOT NULL,status text NOT NULL DEFAULT 'reserved',claim_token uuid NOT NULL,lease_expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id))")).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;}

export async function ensureVideoWorkflowSchema(){
 const state=databaseSchemaReadiness(getPool(),"video-workflows");if(!state.pending)state.pending=getPool().query(`
 CREATE TABLE IF NOT EXISTS app_video_workflow_runs(id uuid PRIMARY KEY,email text NOT NULL,project_key text NOT NULL,plan jsonb NOT NULL,plan_digest text NOT NULL,
   cancellation_requested_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS app_video_workflow_runs_owner_idx ON app_video_workflow_runs(email,project_key,created_at DESC);
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS confirmations jsonb NOT NULL DEFAULT '{}'::jsonb;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS input_digest text;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS canvas_intent_digest text;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS frozen_nodes_enc text;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS creation_scope jsonb;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS creation_evidence_pending boolean NOT NULL DEFAULT false;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS public_frozen_nodes jsonb NOT NULL DEFAULT '{}'::jsonb;
 CREATE TABLE IF NOT EXISTS app_video_workflow_run_nodes(run_id uuid NOT NULL REFERENCES app_video_workflow_runs(id),node_id text NOT NULL,status text NOT NULL DEFAULT 'pending',
   task_id text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,node_id));
 ALTER TABLE app_video_workflow_run_nodes ADD COLUMN IF NOT EXISTS result_assets jsonb NOT NULL DEFAULT '[]'::jsonb;
`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;}

export async function ensureVideoBatchSchema() {
 const state=databaseSchemaReadiness(getPool(),"video-canvas-batches");
  if (!state.pending) state.pending = Promise.all([ensureVideoNodeSchema(), ensureVideoWorkflowSchema()]).then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_video_batches (
      id uuid PRIMARY KEY, email text NOT NULL, node_id text NOT NULL, input_digest text NOT NULL,
      prepared_enc text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    ); ALTER TABLE app_canvas_video_batches ADD COLUMN IF NOT EXISTS creation_scope jsonb
  `)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}
