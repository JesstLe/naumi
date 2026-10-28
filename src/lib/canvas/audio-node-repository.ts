import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../db";
import { canonicalConfig } from "../model-config/repository";
import { ModelConfigError } from "../model-config/types";
import { newAudioProject } from "../audio/project";
import { ensureVideoNodeSchema } from "./video-node-repository";
import type { CanvasAudioNode, AudioNodeWrite } from "./audio-node-schema";

let ready: Promise<void> | undefined;
export async function ensureAudioNodeSchema() {
  ready ||= ensureVideoNodeSchema().then(() => getPool().query(`
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
  `)).then(() => undefined).catch(error => { ready = undefined; throw error; });
  await ready;
}
export function mapAudioNode(row: Record<string, any>): CanvasAudioNode {
  return {
    id: String(row.id), projectKey: String(row.project_key), revision: Number(row.revision), title: String(row.title),
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), audio: row.audio,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function getAudioNode(actor: string, id: string, includeDeleted = false) {
  await ensureAudioNodeSchema();
  const row = (await getPool().query("SELECT * FROM app_canvas_audio_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)", [actor.toLowerCase(), id, includeDeleted])).rows[0];
  return row ? mapAudioNode(row) : null;
}
export async function listAudioNodes(actor: string, includeDeleted = false) {
  await ensureAudioNodeSchema();
  return (await getPool().query("SELECT * FROM app_canvas_audio_nodes WHERE email=$1 AND ($2 OR deleted_at IS NULL) ORDER BY created_at,id", [actor.toLowerCase(), includeDeleted])).rows.map(mapAudioNode);
}
export function audioOperationDigest(input: unknown) {
  return createHash("sha256").update(canonicalConfig(input)).digest("hex");
}
export async function findAudioOperation(actor: string, operationId: string, input: unknown) {
  await ensureAudioNodeSchema();
  const previous = (await getPool().query("SELECT input_digest,result FROM app_canvas_audio_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== audioOperationDigest(input)) throw new ModelConfigError("AUDIO_OPERATION_CONFLICT", "操作编号已用于另一项音频修改", 409);
  return previous?.result as CanvasAudioNode | undefined;
}
export async function findAudioRenderIntent(actor: string, operationId: string) {
  await ensureAudioNodeSchema();
  const saved = (await getPool().query("SELECT result FROM app_canvas_audio_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0]?.result as CanvasAudioNode | undefined;
  return saved?.audio.render?.operationId === operationId ? saved : undefined;
}
export async function replayAudioOperation(client: PoolClient, actor: string, operationId: string, input: unknown) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
  const digest = audioOperationDigest(input);
  const previous = (await client.query("SELECT input_digest,result FROM app_canvas_audio_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== digest) throw new ModelConfigError("AUDIO_OPERATION_CONFLICT", "操作编号已用于另一项音频修改", 409);
  return { digest, result: previous?.result as CanvasAudioNode | undefined };
}
/** Caller owns the graph transaction, permissions and reference validation. */
export async function saveAudioNodeTx(client: PoolClient, actor: string, input: AudioNodeWrite, projectKey: string): Promise<CanvasAudioNode> {
  const operation = await replayAudioOperation(client, actor, input.operationId, { input, projectKey });
  if (operation.result) return operation.result;
  const old = (await client.query("SELECT * FROM app_canvas_audio_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, input.id])).rows[0];
  if (old ? Number(old.revision) !== input.expectedRevision : input.expectedRevision !== 0) throw new ModelConfigError("AUDIO_REVISION_CONFLICT", "音频已更新，请读取最新版本后保存", 409);
  if (old && old.project_key !== projectKey) throw new ModelConfigError("AUDIO_PROJECT_CONFLICT", "请复制音频到目标画布", 409);
  const project = (await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2", [actor, projectKey])).rows[0];
  if (project?.deleted_at) throw new ModelConfigError("AUDIO_PROJECT_UNAVAILABLE", "画布项目已删除", 409);
  await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING", [actor, projectKey]);
  const audio = input.audio ?? old?.audio ?? newAudioProject();
  const row = (await client.query(`
    INSERT INTO app_canvas_audio_nodes(email,id,project_key,title,x,y,width,height,audio,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,CASE WHEN $10 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,
      audio=EXCLUDED.audio,deleted_at=EXCLUDED.deleted_at,revision=app_canvas_audio_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor, input.id, projectKey, input.title ?? old?.title ?? "音频", input.x ?? old?.x ?? 0, input.y ?? old?.y ?? 0,
      input.width ?? old?.width ?? 360, input.height ?? old?.height ?? 200, JSON.stringify(audio), input.deleted === undefined ? !!old?.deleted_at : input.deleted])).rows[0];
  const result = mapAudioNode(row);
  await client.query("INSERT INTO app_canvas_audio_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)", [actor, input.operationId, operation.digest, JSON.stringify(result)]);
  return result;
}
