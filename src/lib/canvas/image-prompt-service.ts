import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/platform/db/pool";
import {currentCreationContext,withFrozenCreation,type CreationContext} from "../saas/creation-scope";
import {bindActualCreationProject} from "../saas/creation-access";
import { canonicalConfig } from "../model-config/snapshot-value";
import { ModelConfigError } from "../model-config/types";
import { imagePromptReadSchema, imagePromptWriteSchema, type ImagePromptState } from "./image-prompt-schema";
import { ensureImagePromptSchema, readImagePromptTx } from "./image-prompt-repository";

type Row = Record<string, any>;
const fail = (code: string, message: string, status = 409): never => { throw new ModelConfigError(code, message, status); };
function actorScope(actor: string): CreationContext {
  const scope = currentCreationContext();
  if (!scope || scope.actorEmail !== actor) fail("IMAGE_PROMPT_SCOPE_REQUIRED", "画布身份已变化，请重新打开", 403);
  return scope!;
}
/** Physical project identities cannot be replaced with a client-supplied artwork-id alias. */
async function actualProjectKeys(tx: PoolClient, actor: string, row: Row) {
  const chain = (await tx.query(`WITH RECURSIVE ancestry AS (
    SELECT id,parent_id,group_id,batch_id,ARRAY[id] AS seen,0 AS depth FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL
    UNION ALL SELECT p.id,p.parent_id,p.group_id,p.batch_id,a.seen||p.id,a.depth+1 FROM ancestry a
      JOIN app_artworks p ON p.id=a.parent_id AND p.email=$1 AND p.deleted_at IS NULL WHERE a.depth<200 AND NOT p.id=ANY(a.seen)
    ) SELECT * FROM ancestry ORDER BY depth`, [actor, row.id])).rows;
  if (!chain.length) fail("IMAGE_PROMPT_NODE_UNAVAILABLE", "图片节点不存在或无权访问", 404);
  const last = chain[chain.length - 1];
  if (last.parent_id && (last.depth >= 200 || last.seen.includes(last.parent_id))) fail("IMAGE_PROMPT_PROJECT_AMBIGUOUS", "图片项目关系异常，请重新整理");
  const locked = (await tx.query("SELECT id,parent_id,group_id,batch_id FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE", [actor, chain.map(r => r.id)])).rows;
  const byId = new Map(locked.map(r => [r.id, r]));
  if (chain.some(r => !byId.has(r.id) || ["parent_id", "group_id", "batch_id"].some(k => byId.get(r.id)![k] !== r[k]))) fail("IMAGE_PROMPT_SOURCE_CHANGED", "图片来源已变化，请重试");
  const keys = new Set<string>([`tree:${row.group_id || last.id}`]);
  for (const r of chain) { if (r.group_id) keys.add(`tree:${r.group_id}`); if (typeof r.batch_id === "string" && r.batch_id.startsWith("suite-")) keys.add(`batch:${r.batch_id}`); }
  return [...keys];
}
async function assertScopeTx(tx: PoolClient, actor: string, row: Row, keys: string[], target: boolean) {
  const scope = actorScope(actor);
  const contexts = (await tx.query(`SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND
    ((context_kind='project' AND context_id=ANY($2::text[])) OR (context_kind='media' AND context_id=$3)) FOR SHARE`, [actor, keys, row.id])).rows;
  const outputs = (await tx.query(`SELECT DISTINCT c.scope_kind,c.tenant_id,c.actor_email FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
    WHERE l.target_id=$1 AND l.target_type='artwork' AND l.relation='output'`, [row.id])).rows;
  if (contexts.some(r => r.scope_kind === "legacy_unconfirmed" || r.scope_kind === "tenant" && r.tenant_id !== scope.tenantId) ||
    outputs.some(r => r.actor_email !== actor || r.scope_kind === "legacy_unconfirmed" || r.scope_kind === "tenant" && r.tenant_id !== scope.tenantId))
    fail("IMAGE_PROMPT_SCOPE_MISMATCH", "图片不属于当前工作空间", 403);
  if (target) {
    const evidence = [...contexts, ...outputs];
    if (evidence.some(r => r.scope_kind !== scope.scopeKind || r.tenant_id !== scope.tenantId) || !evidence.length && scope.scopeKind === "tenant")
      fail("IMAGE_PROMPT_SCOPE_MISMATCH", "图片不属于当前工作空间", 403);
  }
}
/** Public authorization port for image prompt writes and original-reference uploads. Caller initializes schema before BEGIN. */
export async function authorizeImagePromptNodeTx(tx: PoolClient, actorRaw: string, projectKey: string, nodeId: string, options: { write?: boolean } = {}): Promise<Row> {
  const actor = actorRaw.toLowerCase(); actorScope(actor);
  const row = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE", [actor, nodeId])).rows[0];
  if (!row || row.video_url || !row.image_url) fail("IMAGE_PROMPT_NODE_UNAVAILABLE", "图片节点不存在或无权访问", 404);
  const keys = await actualProjectKeys(tx, actor, row);
  if (!keys.includes(projectKey)) fail("IMAGE_PROMPT_PROJECT_MISMATCH", "图片不属于当前画布", 403);
  await withFrozenCreation({ ...actorScope(actor), workspaceExplicit: true }, () => bindActualCreationProject(actor, projectKey, { tx, receipt: true }));
  await assertScopeTx(tx, actor, row, keys, true);
  if (options.write) {
    const setting = (await tx.query("SELECT settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2 FOR SHARE", [actor, nodeId])).rows[0];
    if (setting?.settings?.locked === true) fail("IMAGE_PROMPT_NODE_LOCKED", "请先解锁图片节点", 409);
  }
  return row;
}
async function transaction<T>(run: (tx: PoolClient) => Promise<T>) {
  await ensureImagePromptSchema(); const tx = await getPool().connect(); let discard = false;
  try { await tx.query("BEGIN"); const value = await run(tx); await tx.query("COMMIT"); return value; }
  catch (error) { try { await tx.query("ROLLBACK"); } catch { discard = true; } throw error; }
  finally { tx.release(discard); }
}
export async function getImagePrompt(actorRaw: string, raw: unknown): Promise<ImagePromptState> {
  const parsed = imagePromptReadSchema.safeParse(raw); if (!parsed.success) fail("IMAGE_PROMPT_INVALID", "图片提示词字段无效", 422);
  const actor = actorRaw.toLowerCase(), input = parsed.data!;
  return transaction(async tx => {
    await authorizeImagePromptNodeTx(tx, actor, input.projectKey, input.nodeId);
    const record = (await tx.query("SELECT project_key,scope_kind,tenant_id FROM app_canvas_image_prompts WHERE email=$1 AND node_id=$2 FOR SHARE", [actor, input.nodeId])).rows[0];
    const scope = actorScope(actor);
    if (record && (record.project_key !== input.projectKey || record.scope_kind !== scope.scopeKind || record.tenant_id !== scope.tenantId)) fail("IMAGE_PROMPT_SCOPE_MISMATCH", "提示词不属于当前画布", 403);
    return readImagePromptTx(tx, actor, input.nodeId);
  });
}
export async function saveImagePrompt(actorRaw: string, raw: unknown): Promise<ImagePromptState> {
  const parsed = imagePromptWriteSchema.safeParse(raw); if (!parsed.success) fail("IMAGE_PROMPT_INVALID", "图片提示词字段无效", 422);
  const actor = actorRaw.toLowerCase(), input = parsed.data!, digest = createHash("sha256").update(canonicalConfig(input)).digest("hex");
  return transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [actor]);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    await authorizeImagePromptNodeTx(tx, actor, input.projectKey, input.nodeId, { write: true });
    const scope = actorScope(actor);
    const previous = (await tx.query("SELECT fingerprint,result FROM app_canvas_image_prompt_operations WHERE email=$1 AND operation_id=$2", [actor, input.operationId])).rows[0];
    if (previous) { if (previous.fingerprint !== digest) fail("IMAGE_PROMPT_OPERATION_CONFLICT", "保存操作已用于另一份内容"); return {document:input.document,revision:Number(previous.result.revision)}; }
    // Separate authorization statement after locks: do not reuse stale JOIN members or source rows.
    for (const key of input.document.activeKeys) {
      const row = (await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE", [actor, key.slice(5)])).rows[0];
      if (!row || row.video_url || !row.image_url) fail("IMAGE_PROMPT_REFERENCE_UNAVAILABLE", "引用图片已移除，请重新选择", 409);
      await assertScopeTx(tx, actor, row, await actualProjectKeys(tx, actor, row), false);
    }
    const current = (await tx.query("SELECT revision,project_key,scope_kind,tenant_id FROM app_canvas_image_prompts WHERE email=$1 AND node_id=$2 FOR UPDATE", [actor, input.nodeId])).rows[0];
    if (current && (current.project_key !== input.projectKey || current.scope_kind !== scope.scopeKind || current.tenant_id !== scope.tenantId)) fail("IMAGE_PROMPT_SCOPE_MISMATCH", "提示词不属于当前画布", 403);
    if (Number(current?.revision || 0) !== input.expectedRevision) fail("IMAGE_PROMPT_REVISION_CONFLICT", "提示词已在另一处更新，请重新打开后合并");
    const result = { document: input.document, revision: input.expectedRevision + 1 };
    await tx.query(`INSERT INTO app_canvas_image_prompts(email,node_id,project_key,document,revision,scope_kind,tenant_id)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(email,node_id) DO UPDATE SET document=EXCLUDED.document,revision=EXCLUDED.revision,updated_at=now()`,
      [actor, input.nodeId, input.projectKey, JSON.stringify(input.document), result.revision, scope.scopeKind, scope.tenantId]);
    await tx.query("INSERT INTO app_canvas_image_prompt_operations(email,operation_id,node_id,fingerprint,result) VALUES($1,$2,$3,$4,$5::jsonb)", [actor, input.operationId, input.nodeId, digest, JSON.stringify({revision:result.revision})]);
    // Autosave receipt lookback is bounded per node. A pruned old retry still
    // carries its old expectedRevision and fails CAS instead of rewriting history.
    await tx.query(`WITH expired AS (
      SELECT operation_id FROM app_canvas_image_prompt_operations WHERE email=$1 AND node_id=$2
      ORDER BY created_at DESC,operation_id DESC OFFSET 64 LIMIT 64
    ) DELETE FROM app_canvas_image_prompt_operations o USING expired e
      WHERE o.email=$1 AND o.operation_id=e.operation_id`, [actor,input.nodeId]);
    return result;
  });
}
