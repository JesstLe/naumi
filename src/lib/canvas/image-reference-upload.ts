import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { addArtworksTx, getPool } from "../db";
import { originalImageMetadata, saveCanvasOriginal, type BrowserPreviews } from "../canvas-original-upload";
import { adaptiveCanvasImageSize } from "../mock-data";
import { ModelConfigError } from "../model-config/types";
import { bindCreationMedia, currentCreationContext } from "../saas/creation-context";
import { authorizeImagePromptNodeTx } from "./image-prompt-service";
import { ensureImagePromptSchema } from "./image-prompt-repository";

export const imageReferenceUploadSchema = z.strictObject({
  operationId: z.uuid(),
  projectKey: z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/),
  parentId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/),
  title: z.string().trim().min(1).max(200),
});
type Input = z.infer<typeof imageReferenceUploadSchema>;
type Receipt = { id: string; image: string; title: string };
const conflict = () => new ModelConfigError("REFERENCE_UPLOAD_CONFLICT", "上传编号已用于其他图片或画布", 409);

async function transaction<T>(run: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await getPool().connect(); let discard = false;
  try { await tx.query("BEGIN"); const value = await run(tx); await tx.query("COMMIT"); return value; }
  catch (error) { try { await tx.query("ROLLBACK"); } catch { discard = true; } throw error; }
  finally { tx.release(discard); }
}
async function existingReceipt(tx: PoolClient, actor: string, id: string): Promise<Receipt | null> {
  const row = (await tx.query("SELECT id,title,image_url,deleted_at FROM app_artworks WHERE email=$1 AND id=$2", [actor, id])).rows[0];
  if (row?.deleted_at) throw new ModelConfigError("REFERENCE_UPLOAD_DELETED", "已上传的图片已删除，请在回收站恢复", 410);
  return row ? { id: row.id, image: row.image_url, title: row.title } : null;
}

/** Existing local-edit operation ledger reserves immutable identity. Object I/O
 * stays outside both short DB transactions; retries never allocate a new image. */
export async function saveCanvasPromptReferenceUpload(actorRaw: string, raw: unknown, bytes: Buffer, previews?: BrowserPreviews): Promise<Receipt> {
  const input: Input = imageReferenceUploadSchema.parse(raw), actor = actorRaw.toLowerCase();
  const context = currentCreationContext();
  if (!context || context.actorEmail !== actor) throw new ModelConfigError("REFERENCE_UPLOAD_SCOPE", "上传归属无效", 403);
  if (context.parentContext && context.parentContext !== input.projectKey) throw new ModelConfigError("REFERENCE_UPLOAD_SCOPE", "上传项目与当前画布不一致", 403);
  let metadata: Awaited<ReturnType<typeof originalImageMetadata>>;
  try { metadata = await originalImageMetadata(bytes); }
  catch { throw new ModelConfigError("INVALID_REFERENCE_IMAGE", "请选择64MiB、6400万像素以内的静态PNG、JPEG或WebP图片", 422); }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "canvas-prompt-reference-upload-v1", actor, context.scopeKind, context.tenantId,
    input.projectKey, input.parentId, input.title, sha, bytes.length, metadata.mime, metadata.width, metadata.height,
  ])).digest("hex");
  const identity = createHash("sha256").update(`${actor}:${input.operationId}`).digest("hex").slice(0, 40);
  const id = `art-ref-${identity}`, key = `canvas-reference-uploads/${identity}-${sha}.${metadata.extension}`;
  await ensureImagePromptSchema();
  const prior = await transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [actor]);
    await authorizeImagePromptNodeTx(tx, actor, input.projectKey, input.parentId, { write: true });
    const saved = (await tx.query("SELECT fingerprint,artwork_id FROM app_canvas_local_edits WHERE email=$1 AND operation_id=$2", [actor, input.operationId])).rows[0];
    if (saved && (saved.fingerprint !== fingerprint || saved.artwork_id !== id)) throw conflict();
    if (!saved) await tx.query("INSERT INTO app_canvas_local_edits(email,operation_id,fingerprint,artwork_id) VALUES($1,$2,$3,$4)", [actor, input.operationId, fingerprint, id]);
    return existingReceipt(tx, actor, id);
  });
  if (prior) return prior;
  await bindCreationMedia(actor, `/media/${key}`);
  const saved = await saveCanvasOriginal(bytes, key, actor, previews);
  const size = adaptiveCanvasImageSize(saved.width, saved.height);
  return transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [actor]);
    const parent = await authorizeImagePromptNodeTx(tx, actor, input.projectKey, input.parentId, { write: true });
    const operation = (await tx.query("SELECT fingerprint,artwork_id FROM app_canvas_local_edits WHERE email=$1 AND operation_id=$2 FOR UPDATE", [actor, input.operationId])).rows[0];
    if (!operation || operation.fingerprint !== fingerprint || operation.artwork_id !== id) throw conflict();
    const existing = await existingReceipt(tx, actor, id); if (existing) return existing;
    await addArtworksTx(tx, actor, [{ id, title: input.title, category: "main", prompt: "", status: "completed", image: saved.url,
      gradient: "from-slate-100 to-zinc-100", source: "canvas-add", origin: "canvas", parentId: input.parentId,
      groupId: input.projectKey.startsWith("tree:") ? input.projectKey.slice(5) : String(parent.group_id || id),
      batchId: input.projectKey.startsWith("batch:") ? input.projectKey.slice(6) : null,
      width: saved.width, height: saved.height, canvasWidth: size.width, canvasHeight: size.height,
      creationProvenance: { version: 1, operation: "upload", entry: "canvas", ref: input.operationId, evidence: "server-route" },
    }]);
    await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,$3,$4) ON CONFLICT DO NOTHING", [actor, id, context.scopeKind, context.tenantId]);
    return { id, image: saved.url, title: input.title };
  });
}
