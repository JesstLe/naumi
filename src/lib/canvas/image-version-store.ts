import "server-only";
import type { PoolClient } from "pg";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import {ensureCanvasSettingsSchema,ensureCanvasImageVersionSchema} from "./storage-schema";
import {assertCreationProjectInput} from "../saas/creation-access";
import {currentCreationContext} from "../saas/creation-scope";
import { ensureCreationSchema } from "../saas/creation-schema";
import type { ImagegenRequest } from "../imagegen/types";
import { CANVAS_IMAGE_VERSION_SOURCE, type CanvasImageVersion, type CanvasImageAttachment } from "./image-versions";

type Row = Record<string, any>;
type Query = Pick<PoolClient, "query">;
export async function ensureCanvasImageVersions() {
  await ensureSchema();await ensureCanvasSettingsSchema();await ensureCreationSchema();await ensureCanvasImageVersionSchema();
}
function snapshot(row: Row): Omit<CanvasImageVersion, "id" | "createdAt"> {
  return { image: row.image_url, prompt: row.prompt || "", width: row.image_width || null, height: row.image_height || null,
    ratio: row.ratio || null, resolution: row.resolution || null, style: row.style || null };
}
const currentAsset = (row: Row) => row.canvas_image_version || { id: "initial", ...snapshot(row) };
/** The document transaction holds the artwork lock and updates its original display version. */
export async function updateLayeredCanvasPreviewTx(tx: PoolClient, owner: string, nodeId: string, image: string) {
  await tx.query(`UPDATE app_artworks SET image_url=$1,canvas_image_version=NULL,canvas_image_revision=canvas_image_revision+1
    WHERE id=$2 AND email=$3 AND source_url='canvas-layered-psd'`,[image,nodeId,owner]);
  await tx.query(`UPDATE app_canvas_image_versions SET asset=jsonb_set(asset,'{image}',to_jsonb($1::text))
    WHERE node_id=$2 AND email=$3 AND version_id='initial'`,[image,nodeId,owner]);
}
async function authorize(owner: string, row: Row, tx: Query, allowDeleted = false) {
  if (!row || row.email !== owner || (!allowDeleted && row.deleted_at) || row.video_url || !row.image_url || row.source_url === CANVAS_IMAGE_VERSION_SOURCE)
    throw new Error("图片节点不存在或无权访问");
  const context = currentCreationContext(), project = context?.parentContext;
  if (context && context.actorEmail !== owner) throw new Error("图片节点不存在或无权访问");
  if (project && project !== `tree:${row.group_id || row.id}` && project !== `batch:${row.batch_id}`)
    throw new Error("图片节点不属于当前画布项目");
  await assertCreationProjectInput(owner, project || `tree:${row.group_id || row.id}`, tx, true);
}
async function locked(tx: Query, owner: string, nodeId: string) {
  return !!(await tx.query("SELECT settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2", [owner, nodeId])).rows[0]?.settings?.locked;
}
/** Runs before a new paid submission, never ahead of an idempotent receipt replay. */
export async function assertCanvasRegeneration(owner: string, request: ImagegenRequest) {
  if (!request.canvasTarget) return;
  await ensureCanvasImageVersions(); owner = owner.toLowerCase();
  const row = (await getPool().query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2", [owner, request.canvasTarget.nodeId])).rows[0];
  await authorize(owner, row, getPool());
  if (await locked(getPool(), owner, row.id)) throw new Error("请先解锁图片节点");
  if (currentAsset(row).image !== request.canvasTarget.expectedImage || Number(row.canvas_image_revision) !== request.canvasTarget.expectedRevision)
    throw new Error("节点图片已更新，请重新选择后生成");
}
async function writeSnapshot(tx: PoolClient, owner: string, nodeId: string, versionId: string, asset: Omit<CanvasImageVersion, "id" | "createdAt">) {
  // Original generation media/provenance is immutable. Only the canvas display changes.
  await tx.query(`UPDATE app_artworks SET canvas_image_version=$3::jsonb,canvas_image_revision=canvas_image_revision+1
    WHERE email=$1 AND id=$2`, [owner, nodeId, JSON.stringify({ ...asset, id: versionId })]);
}
/** Durable imagegen result finalization. Repeating it cannot reset a user's later selection. */
export async function attachCanvasImageVersions(owner: string, request: ImagegenRequest, resultIds: string[], activate = true): Promise<CanvasImageAttachment | undefined> {
  if (!request.canvasTarget || !resultIds.length) return;
  await ensureCanvasImageVersions(); owner = owner.toLowerCase();
  const target = request.canvasTarget, ids = [...new Set(resultIds)], tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [owner]);
    const prior = (await tx.query("SELECT attachment FROM app_canvas_image_versions WHERE email=$1 AND node_id=$2 AND operation_id=$3 LIMIT 1", [owner, target.nodeId, request.operationId])).rows[0];
    if (prior) { await tx.query("COMMIT"); return prior.attachment; }
    const node = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 FOR UPDATE", [owner, target.nodeId])).rows[0];
    const outputs = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE", [owner, ids])).rows;
    if (outputs.length !== ids.length || outputs.some(row => row.video_url || !row.image_url || row.id === target.nodeId))
      throw new Error("生成结果未完整保存，原图保持不变");
    if (!node) {
      // A permanently removed target never resurrects. Its paid outputs remain ordinary recoverable artworks.
      await tx.query("UPDATE app_artworks SET source_url=NULL WHERE email=$1 AND id=ANY($2::text[]) AND source_url=$3", [owner, ids, CANVAS_IMAGE_VERSION_SOURCE]);
      await tx.query("COMMIT");
      return { nodeId: target.nodeId, applied: false, previousVersionId: "initial", previousImage: target.expectedImage, versionId: ids[0], revision: target.expectedRevision, reason: "deleted" };
    }
    await authorize(owner, node, tx, true);
    await tx.query("INSERT INTO app_canvas_image_versions(email,node_id,version_id,asset) VALUES($1,$2,'initial',$3) ON CONFLICT DO NOTHING", [owner, node.id, JSON.stringify(snapshot(node))]);
    const previous = currentAsset(node), revision = Number(node.canvas_image_revision || 0);
    const reason = node.deleted_at ? "deleted" : await locked(tx, owner, node.id) ? "locked" :
      revision !== target.expectedRevision || previous.image !== target.expectedImage ? "changed" : undefined;
    const applied = activate && !reason;
    const attachment: CanvasImageAttachment = { nodeId: node.id, applied, previousVersionId: previous.id, previousImage: previous.image, versionId: ids[0], revision: revision + (applied ? 1 : 0), ...(reason ? { reason } : {}) };
    for (const id of ids) {
      const row = outputs.find(row => row.id === id)!, asset = snapshot(row);
      await tx.query("INSERT INTO app_canvas_image_versions(email,node_id,version_id,operation_id,asset,attachment) VALUES($1,$2,$3,$4,$5,$6)", [owner, node.id, id, request.operationId, JSON.stringify(asset), JSON.stringify(attachment)]);
      await tx.query("UPDATE app_artworks SET source_url=$3 WHERE email=$1 AND id=$2", [owner, id, CANVAS_IMAGE_VERSION_SOURCE]);
      if (applied && id === ids[0]) await writeSnapshot(tx, owner, node.id, id, asset);
    }
    await tx.query("COMMIT"); return attachment;
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
export async function listCanvasImageVersions(owner: string, nodeId: string) {
  await ensureCanvasImageVersions(); owner = owner.toLowerCase();
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const row = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2", [owner, nodeId])).rows[0];
    await authorize(owner, row, tx);
    const versions = (await tx.query("(SELECT version_id,asset,created_at FROM app_canvas_image_versions WHERE email=$1 AND node_id=$2 ORDER BY created_at DESC,version_id LIMIT 200) UNION SELECT version_id,asset,created_at FROM app_canvas_image_versions WHERE email=$1 AND node_id=$2 AND version_id IN ('initial',$3) ORDER BY created_at DESC,version_id", [owner, nodeId, currentAsset(row).id])).rows;
    await tx.query("COMMIT");
    const current = currentAsset(row);
    return { image: current.image, currentVersionId: current.id, revision: Number(row.canvas_image_revision || 0), versions: versions.length ? versions.map(v => ({ id: v.version_id, ...v.asset, createdAt: new Date(v.created_at).toISOString() } as CanvasImageVersion)) : [{ id: "initial", ...snapshot(row), createdAt: new Date(row.created_at).toISOString() }] };
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
/** Shares the existing history transaction and operation identity for select/undo/redo. */
export async function selectCanvasImageVersionTx(tx: PoolClient, owner: string, nodeId: string, versionId: string, expectedImage: string, expectedRevision: number) {
  const row = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 FOR UPDATE", [owner, nodeId])).rows[0];
  await authorize(owner, row, tx);
  if (await locked(tx, owner, nodeId)) throw new Error("请先解锁图片节点");
  const version = (await tx.query("SELECT asset FROM app_canvas_image_versions WHERE email=$1 AND node_id=$2 AND version_id=$3", [owner, nodeId, versionId])).rows[0];
  if (!version) throw new Error("图片版本不存在");
  if (currentAsset(row).image !== expectedImage || Number(row.canvas_image_revision || 0) !== expectedRevision)
    throw new Error("节点版本已改变，请刷新历史后选择");
  await writeSnapshot(tx, owner, nodeId, versionId, version.asset);
}
