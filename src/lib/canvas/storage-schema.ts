import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureCanvasSettingsSchema() {
 const state=databaseSchemaReadiness(getPool(),"canvas-settings");
  await ensureSchema();
  if (!state.pending) state.pending = getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_node_settings (
    email text NOT NULL, node_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('text','image')),
    settings jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(email,node_id));
    CREATE TABLE IF NOT EXISTS app_canvas_local_edits (
      email text NOT NULL, operation_id uuid NOT NULL, fingerprint text NOT NULL, artwork_id text NOT NULL,
      PRIMARY KEY(email,operation_id));`).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}

export async function ensureWorkflowImportSchema() {
 const state=databaseSchemaReadiness(getPool(),"canvas-workflow-import");
  await ensureCanvasSettingsSchema();
  if (!state.pending) state.pending = getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_workflow_imports (
    email text NOT NULL, operation_id uuid NOT NULL, fingerprint text NOT NULL,
    project_key text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(email,operation_id));
    CREATE INDEX IF NOT EXISTS app_canvas_workflow_imports_project_idx ON app_canvas_workflow_imports(email,project_key);
    CREATE TABLE IF NOT EXISTS app_canvas_workflow_asset_ops (
      email text NOT NULL, id uuid NOT NULL, node_id text NOT NULL, fingerprint text NOT NULL,
      before_asset jsonb NOT NULL, after_asset jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(email,id));`)
    .then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}

export async function ensureVideoNodeSchema(){
 const state=databaseSchemaReadiness(getPool(),"canvas-video-nodes");
  if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_video_projects(email text NOT NULL,project_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,project_key));
    ALTER TABLE app_canvas_video_projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    CREATE TABLE IF NOT EXISTS app_canvas_video_nodes(email text NOT NULL,id text NOT NULL,project_key text NOT NULL,revision bigint NOT NULL DEFAULT 1,
      title text NOT NULL DEFAULT '视频',x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 384,height double precision NOT NULL DEFAULT 320,config jsonb NOT NULL DEFAULT '{}',inputs jsonb NOT NULL DEFAULT '[]',
      last_task_id text,last_result_id text,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
    CREATE INDEX IF NOT EXISTS app_canvas_video_nodes_project_idx ON app_canvas_video_nodes(email,project_key,updated_at DESC);
    ALTER TABLE app_canvas_video_nodes ADD COLUMN IF NOT EXISTS display_result_id text;
    CREATE TABLE IF NOT EXISTS app_canvas_video_task_sends(email text NOT NULL,task_id text NOT NULL,project_key text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,task_id,project_key));
    CREATE TABLE IF NOT EXISTS app_canvas_video_workflow_sources(email text NOT NULL,task_id text NOT NULL,public_model_id text NOT NULL,manifest_enc text NOT NULL,digest text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,task_id));
    CREATE TABLE IF NOT EXISTS app_canvas_video_node_operations(email text NOT NULL,operation_id uuid NOT NULL,node_id text NOT NULL,
      input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
    CREATE TABLE IF NOT EXISTS app_canvas_video_node_copies(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,
      result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  `)).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;
}

export async function ensureCanvasNodeCopySchema(){
 const state=databaseSchemaReadiness(getPool(),"canvas-node-copy");
 if(!state.pending)state.pending=getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_node_copies(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id))`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
 await state.pending;
}

export async function ensureDirectorNodeSchema() {
  const state=databaseSchemaReadiness(getPool(),"canvas-director-nodes");
  if (!state.pending) state.pending = ensureVideoNodeSchema().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_director_nodes(email text NOT NULL,id text NOT NULL,project_key text NOT NULL,
      revision bigint NOT NULL DEFAULT 1,title text NOT NULL DEFAULT '3D 导演台',x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 420,height double precision NOT NULL DEFAULT 280,project jsonb NOT NULL,outputs jsonb NOT NULL DEFAULT '[]',
      deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
    CREATE INDEX IF NOT EXISTS app_canvas_director_nodes_project_idx ON app_canvas_director_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_director_operations(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  `)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}

export async function ensureCharacterNodeSchema() {
  const state=databaseSchemaReadiness(getPool(),"canvas-character-nodes");
  state.pending ||= ensureVideoNodeSchema().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_character_nodes (
      email text NOT NULL, id text NOT NULL, project_key text NOT NULL,
      revision bigint NOT NULL DEFAULT 1, title text NOT NULL DEFAULT '角色',
      x double precision NOT NULL DEFAULT 0, y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 320, height double precision NOT NULL DEFAULT 300,
      character jsonb NOT NULL, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(email,id)
    );
    CREATE INDEX IF NOT EXISTS app_canvas_character_nodes_project_idx
      ON app_canvas_character_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_character_operations (
      email text NOT NULL, operation_id uuid NOT NULL, input_digest text NOT NULL,
      result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,operation_id)
    );
  `)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}

export async function ensureSceneNodeSchema() {
  const state=databaseSchemaReadiness(getPool(),"canvas-scene-nodes");
  state.pending ||= ensureVideoNodeSchema().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_scene_nodes (
      email text NOT NULL, id text NOT NULL, project_key text NOT NULL,
      revision bigint NOT NULL DEFAULT 1, title text NOT NULL DEFAULT '场景',
      x double precision NOT NULL DEFAULT 0, y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 360, height double precision NOT NULL DEFAULT 260,
      scene jsonb NOT NULL, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(email,id)
    );
    CREATE INDEX IF NOT EXISTS app_canvas_scene_nodes_project_idx
      ON app_canvas_scene_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_scene_operations (
      email text NOT NULL, operation_id uuid NOT NULL, input_digest text NOT NULL,
      result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,operation_id)
    );
  `)).then(() => undefined).catch(error => { state.pending = undefined; throw error; });
  await state.pending;
}

export async function ensureCanvasImageVersionSchema(){
 const state=databaseSchemaReadiness(getPool(),"canvas-image-versions");await ensureSchema();
 state.pending ||= getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_image_versions (
    email text NOT NULL, node_id text NOT NULL, version_id text NOT NULL, operation_id uuid,
    asset jsonb NOT NULL, attachment jsonb, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(email,node_id,version_id));
    CREATE INDEX IF NOT EXISTS canvas_image_version_operation ON app_canvas_image_versions(email,operation_id);
    CREATE INDEX IF NOT EXISTS canvas_image_version_node ON app_canvas_image_versions(email,node_id,created_at);`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
 await state.pending;
}

export async function ensureAudioNodeSchema(){
 await ensureVideoNodeSchema();const state=databaseSchemaReadiness(getPool(),"canvas-audio-nodes");
 if(!state.pending)state.pending=getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_audio_nodes (
      email text NOT NULL, id text NOT NULL, project_key text NOT NULL,
      revision bigint NOT NULL DEFAULT 1, title text NOT NULL DEFAULT '音频',
      x double precision NOT NULL DEFAULT 0, y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 360, height double precision NOT NULL DEFAULT 200,
      audio jsonb NOT NULL, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(email,id)
    );
    CREATE INDEX IF NOT EXISTS app_canvas_audio_nodes_project_idx
      ON app_canvas_audio_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_audio_operations (
      email text NOT NULL, operation_id uuid NOT NULL, input_digest text NOT NULL,
      result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,operation_id)
    );
  `).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
 await state.pending;
}

export async function ensureTimelineNodeSchema(){
 await ensureVideoNodeSchema();const state=databaseSchemaReadiness(getPool(),"canvas-timeline-nodes");
 if(!state.pending)state.pending=getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_timeline_nodes (
      email text NOT NULL,id text NOT NULL,project_key text NOT NULL,revision bigint NOT NULL DEFAULT 1,title text NOT NULL DEFAULT '多轨',
      x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,width double precision NOT NULL DEFAULT 400,height double precision NOT NULL DEFAULT 280,
      timeline jsonb NOT NULL,adopted jsonb,render jsonb,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id)
    );
    CREATE INDEX IF NOT EXISTS app_canvas_timeline_nodes_project_idx ON app_canvas_timeline_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_timeline_operations(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  `).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
 await state.pending;
}

export async function ensureComfyNodeSchema(){
 await ensureVideoNodeSchema();const state=databaseSchemaReadiness(getPool(),"canvas-comfy-nodes");
 if(!state.pending)state.pending=getPool().query(`
 CREATE TABLE IF NOT EXISTS app_canvas_comfy_nodes (
 email text NOT NULL,id text NOT NULL,project_key text NOT NULL,revision integer NOT NULL DEFAULT 1,
 title text NOT NULL DEFAULT 'ComfyUI 工作流',x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,
 width double precision NOT NULL DEFAULT 380,height double precision NOT NULL DEFAULT 180,workflow jsonb NOT NULL,
 deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
 CREATE INDEX IF NOT EXISTS app_canvas_comfy_project ON app_canvas_comfy_nodes(email,project_key);
 CREATE TABLE IF NOT EXISTS app_canvas_comfy_operations(email text NOT NULL,operation_id text NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
 `).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;
}
