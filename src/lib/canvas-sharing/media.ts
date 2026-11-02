import "server-only";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { readManagedObject, writeStoredObject, deleteImageByUrl, storageDriver, storageKeyFromManagedUrl, privateMedia } from "../storage";
import { mediaExtension } from "../video/media-formats";
import { getPool } from "../db";
import type { FrozenMedia, ShareSnapshot } from "./snapshot";
import { fail } from "./domain";

export type CopiedMedia = FrozenMedia & { targetKey: string; remoteReady: boolean };
export type StagedMedia = { attemptId: string; media: CopiedMedia[] };
export type DiagramPreview = { diagram: true; tiles: Array<{ title: string; kind: string; x: number; y: number; width: number; height: number }> };
export type SharePreview = FrozenMedia | DiagramPreview;
const objectLimit = () => Math.min(250 * 1024 * 1024, Math.max(1024, Number(process.env.CANVAS_SHARE_OBJECT_BYTES) || 64 * 1024 * 1024));
const totalLimit = () => Math.min(1024 * 1024 * 1024, Math.max(1024, Number(process.env.CANVAS_SHARE_TOTAL_BYTES) || 256 * 1024 * 1024));

/** Journaling precedes the first storage write. Unique keys belong to one attempt, never a supplier identity. */
export async function prepareMediaStaging(shareId: string, snapshot: ShareSnapshot): Promise<StagedMedia> {
  if (snapshot.media.length && !privateMedia) fail("SHARE_PRIVATE_STORAGE_REQUIRED", "授权副本需要启用现有私有媒体存储", 503);
  await cleanupExpiredShareMedia(2).catch(() => { console.warn("CANVAS_SHARE_CLEANUP_PENDING"); });
  if (snapshot.media.some(m => m.bytes < 1 || m.bytes > objectLimit()) || snapshot.media.reduce((n, m) => n + m.bytes, 0) > totalLimit())
    fail("SHARE_MEDIA_TOO_LARGE", "分享素材超过当前复制大小配置", 413);
  const attemptId = randomUUID(), media = snapshot.media.map(m => ({ ...m, targetKey: `canvas-shares/${attemptId}/${randomUUID()}.${mediaExtension(m.mime)}`, remoteReady: false }));
  await getPool().query("INSERT INTO app_canvas_share_media_staging(attempt_id,share_id,keys,state) VALUES($1,$2,$3::jsonb,'staging')", [attemptId, shareId, JSON.stringify(media.map(m => m.targetKey))]);
  return { attemptId, media };
}
export async function copyStagedMedia(stage: StagedMedia) {
  // Sequential bounded copies, no DB connection held during storage I/O; no arbitrary-URL fetch.
  for (const media of stage.media) {
    const lease = await getPool().query("UPDATE app_canvas_share_media_staging SET expires_at=now()+interval '1 day',updated_at=now() WHERE attempt_id=$1 AND state='staging' AND expires_at>now() RETURNING attempt_id", [stage.attemptId]);
    if (!lease.rowCount) fail("SHARE_STAGE_EXPIRED", "素材复制已过期，请重新批准");
    const object = await readManagedObject(`/media/${media.key}`, objectLimit());
    if (object.bytes.length !== media.bytes || createHash("sha256").update(object.bytes).digest("hex") !== media.sha256)
      fail("SHARE_MEDIA_CHANGED", "源素材已改变，请重新批准");
    const result = await writeStoredObject(object.bytes, media.mime, media.targetKey); media.remoteReady = result.remoteReady;
  }
}
/** Commit-unknown is checked against the durable journal before deleting anything. Failure leaves a retryable journal. */
export async function cleanupStagedMedia(attemptId: string, expiredOnly = false): Promise<boolean> {
  const pool = getPool(), tx = await pool.connect(); let keys: string[] = [];
  try {
    await tx.query("BEGIN");
    const row = (await tx.query("SELECT * FROM app_canvas_share_media_staging WHERE attempt_id=$1 FOR UPDATE", [attemptId])).rows[0];
    if (!row || row.state === "committed" || row.state === "cleaned" || expiredOnly && new Date(row.expires_at).getTime() > Date.now()) { await tx.query("COMMIT"); return false; }
    keys = row.keys;
    if (keys.some(key => !key.startsWith(`canvas-shares/${attemptId}/`) || !storageKeyFromManagedUrl(`/media/${key}`))) fail("SHARE_CLEANUP_IDENTITY", "分享清理身份不一致");
    // Check ALL targets before first deletion, including catalogs written by a committed copy.
    if ((await tx.query("SELECT 1 FROM app_media_assets WHERE key=ANY($1::text[]) LIMIT 1", [keys])).rowCount) { await tx.query("COMMIT"); return false; }
    await tx.query("UPDATE app_canvas_share_media_staging SET state='cleanup_pending',updated_at=now() WHERE attempt_id=$1", [attemptId]); await tx.query("COMMIT");
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
  for (const key of keys) await deleteImageByUrl(`/media/${key}`);
  await pool.query("UPDATE app_canvas_share_media_staging SET state='cleaned',updated_at=now() WHERE attempt_id=$1 AND state='cleanup_pending'", [attemptId]); return true;
}
export async function cleanupExpiredShareMedia(limit = 5) {
  const rows = (await getPool().query("SELECT attempt_id FROM app_canvas_share_media_staging WHERE state IN ('staging','cleanup_pending') AND expires_at<now() ORDER BY expires_at LIMIT $1", [Math.max(1, Math.min(20, limit))])).rows;
  let cleaned = 0; for (const row of rows) if (await cleanupStagedMedia(row.attempt_id, true)) cleaned++; return cleaned;
}
export async function previewBytes(media: FrozenMedia) {
  if (!media.mime.startsWith("image/") || media.bytes > objectLimit()) fail("SHARE_PREVIEW_UNAVAILABLE", "预览不可用", 404);
  const object = await readManagedObject(`/media/${media.key}`, objectLimit());
  if (object.bytes.length !== media.bytes || createHash("sha256").update(object.bytes).digest("hex") !== media.sha256) fail("SHARE_PREVIEW_CHANGED", "预览已改变，请作者重新分享", 409);
  // Decode and re-encode: strip EXIF/prompt metadata, never return SVG/HTML or signed source URLs.
  return sharp(object.bytes, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}
export async function renderSharePreview(preview: SharePreview) {
  if (!("diagram" in preview)) return previewBytes(preview);
  const tiles = preview.tiles;
  if (!tiles.length || tiles.length > 200) fail("SHARE_PREVIEW_UNAVAILABLE", "预览不可用", 404);
  const left = Math.min(...tiles.map(t => t.x)), top = Math.min(...tiles.map(t => t.y));
  const width = Math.max(...tiles.map(t => t.x + t.width)) - left, height = Math.max(...tiles.map(t => t.y + t.height)) - top;
  const scale = Math.min(1152 / Math.max(width, 1), 592 / Math.max(height, 1), 1.5);
  const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const shapes = tiles.map(t => {
    const x = 64 + (t.x - left) * scale, y = 64 + (t.y - top) * scale, w = Math.max(4, t.width * scale), h = Math.max(4, t.height * scale);
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(12, w / 4)}" fill="white" stroke="#dce3ed"/><rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, Math.min(5, w - 2))}" height="${Math.max(1, h - 2)}" fill="#9eb6d7"/>${w > 35 && h > 20 ? `<text x="${x + 12}" y="${y + Math.min(28, h - 5)}" font-size="${Math.min(17, h / 3)}" font-family="sans-serif" fill="#273750">${escape(t.title.slice(0, Math.max(1, Math.min(32, Math.floor(w / 18)))))}</text>` : ""}</g>`;
  }).join("");
  // Generated SVG contains only escaped titles/numeric geometry; pixels are the only response representation.
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#f5f7fb"/>${shapes}</svg>`)).png().toBuffer();
}
export { storageDriver };
