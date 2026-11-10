import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/platform/db/pool";
import { canonicalConfig } from "../model-config/snapshot-value";
import { ModelConfigError } from "../model-config/types";
import { newSceneProject } from "../scene/project";
import type { CanvasSceneNode, SceneNodeWrite } from "./scene-node-schema";

import {ensureSceneNodeSchema} from "./storage-schema";
export {ensureSceneNodeSchema};
export function mapSceneNode(row: Record<string, any>): CanvasSceneNode {
  return {
    id: String(row.id), projectKey: String(row.project_key), revision: Number(row.revision), title: String(row.title),
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), scene: row.scene,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function getSceneNode(actor: string, id: string, includeDeleted = false, tx?:Pick<PoolClient,"query">) {
  await ensureSceneNodeSchema();
  const row = (await (tx||getPool()).query("SELECT * FROM app_canvas_scene_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)", [actor.toLowerCase(), id, includeDeleted])).rows[0];
  return row ? mapSceneNode(row) : null;
}
export async function listSceneNodes(actor: string, includeDeleted = false) {
  await ensureSceneNodeSchema();
  return (await getPool().query("SELECT * FROM app_canvas_scene_nodes WHERE email=$1 AND ($2 OR deleted_at IS NULL) ORDER BY created_at,id", [actor.toLowerCase(), includeDeleted])).rows.map(mapSceneNode);
}
export function sceneOperationDigest(input: unknown) {
  return createHash("sha256").update(canonicalConfig(input)).digest("hex");
}
export async function findSceneOperation(actor: string, operationId: string, input: unknown) {
  await ensureSceneNodeSchema();
  const previous = (await getPool().query("SELECT input_digest,result FROM app_canvas_scene_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== sceneOperationDigest(input)) throw new ModelConfigError("SCENE_OPERATION_CONFLICT", "操作编号已用于另一项场景修改", 409);
  return previous?.result as CanvasSceneNode | undefined;
}
export async function replaySceneOperation(client: PoolClient, actor: string, operationId: string, input: unknown) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
  const digest = sceneOperationDigest(input);
  const previous = (await client.query("SELECT input_digest,result FROM app_canvas_scene_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== digest) throw new ModelConfigError("SCENE_OPERATION_CONFLICT", "操作编号已用于另一项场景修改", 409);
  return { digest, result: previous?.result as CanvasSceneNode | undefined };
}
/** Caller owns the graph transaction, permissions and reference validation. */
export async function saveSceneNodeTx(client: PoolClient, actor: string, input: SceneNodeWrite, projectKey: string): Promise<CanvasSceneNode> {
  const operation = await replaySceneOperation(client, actor, input.operationId, { input, projectKey });
  if (operation.result) return operation.result;
  const old = (await client.query("SELECT * FROM app_canvas_scene_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, input.id])).rows[0];
  if (old ? Number(old.revision) !== input.expectedRevision : input.expectedRevision !== 0) throw new ModelConfigError("SCENE_REVISION_CONFLICT", "场景已更新，请读取最新版本后保存", 409);
  if (old && old.project_key !== projectKey) throw new ModelConfigError("SCENE_PROJECT_CONFLICT", "请复制场景到目标画布", 409);
  const project = (await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2", [actor, projectKey])).rows[0];
  if (project?.deleted_at) throw new ModelConfigError("SCENE_PROJECT_UNAVAILABLE", "画布项目已删除", 409);
  await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING", [actor, projectKey]);
  const scene = input.scene ?? old?.scene ?? newSceneProject();
  const row = (await client.query(`
    INSERT INTO app_canvas_scene_nodes(email,id,project_key,title,x,y,width,height,scene,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,CASE WHEN $10 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,
      scene=EXCLUDED.scene,deleted_at=EXCLUDED.deleted_at,revision=app_canvas_scene_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor, input.id, projectKey, input.title ?? (input.scene ? scene.name : old?.title ?? scene.name), input.x ?? old?.x ?? 0, input.y ?? old?.y ?? 0,
      input.width ?? old?.width ?? 360, input.height ?? old?.height ?? 260, JSON.stringify(scene), input.deleted === undefined ? !!old?.deleted_at : input.deleted])).rows[0];
  const result = mapSceneNode(row);
  await client.query("INSERT INTO app_canvas_scene_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)", [actor, input.operationId, operation.digest, JSON.stringify(result)]);
  return result;
}
