import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/platform/db/pool";
import { canonicalConfig } from "../model-config/snapshot-value";
import { ModelConfigError } from "../model-config/types";
import { projectComfyGraph } from "../comfyui/document";
import type { CanvasComfyNode, ComfyNodeWrite } from "./comfy-node-schema";

import {ensureComfyNodeSchema} from "./storage-schema";
export {ensureComfyNodeSchema};
export function mapComfyNode(row: Record<string, any>): CanvasComfyNode {
  return {
    id: String(row.id), projectKey: String(row.project_key), revision: Number(row.revision), title: String(row.title),
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), workflow: row.workflow,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function getComfyNode(actor: string, id: string, includeDeleted = false, tx?:Pick<PoolClient,"query">) {
  await ensureComfyNodeSchema();
  const row = (await (tx||getPool()).query("SELECT * FROM app_canvas_comfy_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)", [actor.toLowerCase(), id, includeDeleted])).rows[0];
  return row ? mapComfyNode(row) : null;
}
export async function listComfyNodes(actor: string, includeDeleted = false) {
  await ensureComfyNodeSchema();
  return (await getPool().query("SELECT * FROM app_canvas_comfy_nodes WHERE email=$1 AND ($2 OR deleted_at IS NULL) ORDER BY created_at,id", [actor.toLowerCase(), includeDeleted])).rows.map(mapComfyNode);
}
export function comfyOperationDigest(input: unknown) {
  return createHash("sha256").update(canonicalConfig(input)).digest("hex");
}
export async function findComfyOperation(actor: string, operationId: string, input: unknown) {
  await ensureComfyNodeSchema();
  const previous = (await getPool().query("SELECT input_digest,result FROM app_canvas_comfy_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== comfyOperationDigest(input)) throw new ModelConfigError("COMFY_OPERATION_CONFLICT", "操作编号已用于另一项工作流修改", 409);
  return previous?.result as CanvasComfyNode | undefined;
}
export async function replayComfyOperation(client: PoolClient, actor: string, operationId: string, input: unknown) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
  const digest = comfyOperationDigest(input);
  const previous = (await client.query("SELECT input_digest,result FROM app_canvas_comfy_operations WHERE email=$1 AND operation_id=$2", [actor, operationId])).rows[0];
  if (previous && previous.input_digest !== digest) throw new ModelConfigError("COMFY_OPERATION_CONFLICT", "操作编号已用于另一项工作流修改", 409);
  return { digest, result: previous?.result as CanvasComfyNode | undefined };
}
/** Caller owns the graph transaction, permissions and reference validation. */
export async function saveComfyNodeTx(client: PoolClient, actor: string, input: ComfyNodeWrite, projectKey: string): Promise<CanvasComfyNode> {
  const operation = await replayComfyOperation(client, actor, input.operationId, { input, projectKey });
  if (operation.result) return operation.result;
  const old = (await client.query("SELECT * FROM app_canvas_comfy_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, input.id])).rows[0];
  if (old ? Number(old.revision) !== input.expectedRevision : input.expectedRevision !== 0) throw new ModelConfigError("COMFY_REVISION_CONFLICT", "工作流已更新，请读取最新版本后保存", 409);
  if (old && old.project_key !== projectKey) throw new ModelConfigError("COMFY_PROJECT_CONFLICT", "请复制工作流到目标画布", 409);
  const project = (await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2", [actor, projectKey])).rows[0];
  if (project?.deleted_at) throw new ModelConfigError("COMFY_PROJECT_UNAVAILABLE", "画布项目已删除", 409);
  await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING", [actor, projectKey]);
  const workflow = input.workflow ?? old?.workflow;
  if(!workflow)throw new ModelConfigError("INVALID_COMFY_DOCUMENT","请导入工作流",422);
  const graph=projectComfyGraph(workflow);
  const row = (await client.query(`
    INSERT INTO app_canvas_comfy_nodes(email,id,project_key,title,x,y,width,height,workflow,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,CASE WHEN $10 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,
      workflow=EXCLUDED.workflow,deleted_at=EXCLUDED.deleted_at,revision=app_canvas_comfy_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor, input.id, projectKey, input.title ?? old?.title ?? "ComfyUI 工作流", input.x ?? old?.x ?? 0, input.y ?? old?.y ?? 0,
      workflow.collapsed ? 380 : graph.width, workflow.collapsed ? 100 : graph.height + 52, JSON.stringify(workflow), input.deleted === undefined ? !!old?.deleted_at : input.deleted])).rows[0];
  const result = mapComfyNode(row);
  await client.query("INSERT INTO app_canvas_comfy_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)", [actor, input.operationId, operation.digest, JSON.stringify(result)]);
  return result;
}
