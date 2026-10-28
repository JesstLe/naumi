import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../db";
import { canonicalConfig } from "../model-config/repository";
import { ModelConfigError } from "../model-config/types";
import { newDirectorProject } from "../director/project";
import { ensureVideoNodeSchema } from "./video-node-repository";
import type { CanvasDirectorNode, DirectorNodeWrite } from "./director-node-schema";

let ready: Promise<void> | undefined;
export async function ensureDirectorNodeSchema() {
  if (!ready) ready = ensureVideoNodeSchema().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_director_nodes(email text NOT NULL,id text NOT NULL,project_key text NOT NULL,
      revision bigint NOT NULL DEFAULT 1,title text NOT NULL DEFAULT '3D 导演台',x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 420,height double precision NOT NULL DEFAULT 280,project jsonb NOT NULL,outputs jsonb NOT NULL DEFAULT '[]',
      deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
    CREATE INDEX IF NOT EXISTS app_canvas_director_nodes_project_idx ON app_canvas_director_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_director_operations(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  `)).then(() => undefined).catch(error => { ready = undefined; throw error; });
  await ready;
}
export function mapDirectorNode(row: Record<string, any>): CanvasDirectorNode {
  return { id: String(row.id), projectKey: String(row.project_key), revision: Number(row.revision), title: String(row.title), x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height),
    project: row.project, outputs: row.outputs || [], deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
export async function getDirectorNode(actor: string, id: string, includeDeleted = false) {
  await ensureDirectorNodeSchema(); const row = (await getPool().query("SELECT * FROM app_canvas_director_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)", [actor, id, includeDeleted])).rows[0]; return row ? mapDirectorNode(row) : null;
}
export async function listDirectorNodes(actor: string, includeDeleted = false) {
  await ensureDirectorNodeSchema(); return (await getPool().query("SELECT * FROM app_canvas_director_nodes WHERE email=$1 AND ($2 OR deleted_at IS NULL) ORDER BY created_at,id", [actor, includeDeleted])).rows.map(mapDirectorNode);
}
export async function findDirectorOperation(actor: string, operationId: string, input: unknown) {
  await ensureDirectorNodeSchema();
  const digest = createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const row = (await getPool().query("SELECT input_digest,result FROM app_canvas_director_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (row && row.input_digest !== digest) throw new ModelConfigError("DIRECTOR_OPERATION_CONFLICT", "操作编号已用于另一项修改", 409);
  return row?.result as CanvasDirectorNode | undefined;
}
export async function directorOperationTx(client: PoolClient, actor: string, operationId: string, input: unknown) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
  const digest = createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const replay = (await client.query("SELECT input_digest,result FROM app_canvas_director_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (replay && replay.input_digest !== digest) throw new ModelConfigError("DIRECTOR_OPERATION_CONFLICT", "操作编号已用于另一项修改", 409);
  return { digest, replay: replay?.result as CanvasDirectorNode | undefined };
}
/** Caller owns the transaction. Shared graph lock composes with mixed copy/delete/history. */
export async function saveDirectorNodeTx(client: PoolClient, actor: string, input: DirectorNodeWrite, projectKey: string, originalIntent?: unknown): Promise<CanvasDirectorNode> {
  const operation = await directorOperationTx(client, actor, input.operationId, originalIntent ?? { action: "save", input, projectKey }); if (operation.replay) return operation.replay;
  const old = (await client.query("SELECT * FROM app_canvas_director_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, input.id])).rows[0];
  if (old ? Number(old.revision) !== input.expectedRevision : input.expectedRevision !== 0) throw new ModelConfigError("DIRECTOR_REVISION_CONFLICT", "导演工程已更新，草稿已保留，请重新读取后保存", 409);
  if (old && old.project_key !== projectKey) throw new ModelConfigError("DIRECTOR_PROJECT_CONFLICT", "请复制导演节点到目标项目", 409);
  const project = (await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2", [actor, projectKey])).rows[0];
  if (project?.deleted_at) throw new ModelConfigError("DIRECTOR_PROJECT_UNAVAILABLE", "画布项目已删除", 409);
  await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING", [actor, projectKey]);
  const row = (await client.query(`INSERT INTO app_canvas_director_nodes(email,id,project_key,title,x,y,width,height,project,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,CASE WHEN $10 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,project=EXCLUDED.project,
      deleted_at=EXCLUDED.deleted_at,revision=app_canvas_director_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor, input.id, projectKey, input.title ?? old?.title ?? "3D 导演台", input.x ?? old?.x ?? 0, input.y ?? old?.y ?? 0, input.width ?? old?.width ?? 420, input.height ?? old?.height ?? 280,
      JSON.stringify(input.project ?? old?.project ?? newDirectorProject()), input.deleted === undefined ? !!old?.deleted_at : input.deleted])).rows[0];
  const result = mapDirectorNode(row); await client.query("INSERT INTO app_canvas_director_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)", [actor, input.operationId, operation.digest, JSON.stringify(result)]); return result;
}
