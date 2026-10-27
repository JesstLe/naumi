import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {ArtworkRecord} from "./types";
import {rowToArtwork,type ArtworkRow} from "./row";
export {rowToArtwork} from "./row";

/** Workbench needs eight previews and counts, not prompts/source/canvas metadata. */
export async function getWorkbenchArtworks(emailRaw: string, dayStart: Date, dayEnd: Date) {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const filter = "email = $1 AND deleted_at IS NULL AND image_url <> '' AND status <> 'failed'";
  const [recent, counts] = await Promise.all([
    getPool().query(`SELECT id, title, image_url, status, gradient, created_at FROM app_artworks
      WHERE ${filter} ORDER BY created_at DESC, id DESC LIMIT 8`, [email]),
    getPool().query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::int AS today
      FROM app_artworks WHERE ${filter}`, [email, dayStart, dayEnd]),
  ]);
  return {
    artworks: recent.rows.map(r => ({id:r.id, title:r.title, image:r.image_url, status:r.status,
      gradient:r.gradient, createdAt:new Date(r.created_at).toISOString()})),
    stats: counts.rows[0] as {total:number; today:number},
  };
}

export async function listArtworks(
  emailRaw: string
): Promise<ArtworkRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().query<ArtworkRow>(
    `SELECT id, title, category, prompt, status, image_url, gradient,
            style, ratio, resolution, source_url, batch_id, parent_id, template_id,
            parent_ids, canvas_x, canvas_y, image_width, image_height, processing_kind, postprocess_status, canvas_width, canvas_height, group_id, canvas_group_id, origin, marked, video_url, creation_provenance, created_at
       FROM app_artworks
      WHERE email = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1000`,
    [emailRaw.toLowerCase()]
  );
  return rows.map(rowToArtwork);
}

// 只取指定 id 的几行作品(email 限定)。用于画布"创建/连线"后只补这几行,
// 而不是整表重拉 —— 大幅减少数据库出站流量(Supabase egress)。
export async function listArtworksByIds(
  emailRaw: string,
  ids: string[]
): Promise<ArtworkRecord[]> {
  await ensureSchema();
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return [];
  const { rows } = await getPool().query<ArtworkRow>(
    `SELECT id, title, category, prompt, status, image_url, gradient,
            style, ratio, resolution, source_url, batch_id, parent_id, template_id,
            parent_ids, canvas_x, canvas_y, image_width, image_height, processing_kind, postprocess_status, canvas_width, canvas_height, group_id, canvas_group_id, origin, marked, video_url, creation_provenance, created_at
       FROM app_artworks
      WHERE email = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), clean]
  );
  return rows.map(rowToArtwork);
}

// 画布用:记录图片真实像素尺寸。旧数据在浏览器首次加载原图后自动回填。
export async function setArtworkDimensions(
  emailRaw: string,
  id: string,
  width: number,
  height: number
): Promise<boolean> {
  await ensureSchema();
  const w = Math.round(width);
  const h = Math.round(height);
  if (!id || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 8192 || h > 8192) return false;
  const result = await getPool().query(
    `UPDATE app_artworks
        SET image_width = $3, image_height = $4
      WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), id, w, h]
  );
  return (result.rowCount ?? 0) > 0;
}

// Compatibility name; mutation belongs to the Canvas metadata writer.
export {renameArtwork} from "../canvas/artwork-repository";

// 画布用:软删除某用户名下指定的一批作品(标记 deleted_at,进回收站,不真删)。
// email 限定,防越权。返回受影响条数。
export async function deleteArtworksByIds(
  emailRaw: string,
  ids: string[]
): Promise<number> {
  await ensureSchema();
  if (!ids || ids.length === 0) return 0;
  const r = await getPool().query(
    `UPDATE app_artworks SET deleted_at = now()
       WHERE email = $1 AND id = ANY($2) AND deleted_at IS NULL`,
    [emailRaw.toLowerCase(), ids]
  );
  return r.rowCount ?? 0;
}

// 回收站:取消软删除(恢复)。返回恢复条数。
export async function undeleteArtworksByIds(
  emailRaw: string,
  ids: string[]
): Promise<number> {
  await ensureSchema();
  if (!ids || ids.length === 0) return 0;
  const r = await getPool().query(
    `UPDATE app_artworks SET deleted_at = NULL
       WHERE email = $1 AND id = ANY($2) AND deleted_at IS NOT NULL`,
    [emailRaw.toLowerCase(), ids]
  );
  return r.rowCount ?? 0;
}

// 回收站:彻底删除(真删 DB 行,仅限已在回收站的)。返回删除条数。
export async function purgeArtworksByIds(
  emailRaw: string,
  ids: string[]
): Promise<number> {
  await ensureSchema();
  if (!ids || ids.length === 0) return 0;
  const r = await getPool().query(
    `DELETE FROM app_artworks
       WHERE email = $1 AND id = ANY($2) AND deleted_at IS NOT NULL`,
    [emailRaw.toLowerCase(), ids]
  );
  return r.rowCount ?? 0;
}

// 回收站列表(已软删除的),顺手把超过保留期(默认 180 天)的真删掉。
export async function listDeletedArtworks(
  emailRaw: string,
  retentionDays = 180
): Promise<ArtworkRecord[]> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  // 懒清理:打开回收站时顺手真删过期的
  await getPool()
    .query(
      `DELETE FROM app_artworks
         WHERE email = $1 AND deleted_at IS NOT NULL
           AND deleted_at < now() - ($2 || ' days')::interval`,
      [email, String(retentionDays)]
    )
    .catch(() => {});
  const { rows } = await getPool().query<ArtworkRow>(
    `SELECT id, title, category, prompt, status, image_url, gradient,
            style, ratio, resolution, source_url, batch_id, parent_id, template_id,
            parent_ids, canvas_x, canvas_y, image_width, image_height, processing_kind, postprocess_status, canvas_width, canvas_height, group_id, canvas_group_id, origin, marked, video_url, creation_provenance, created_at, deleted_at
       FROM app_artworks
      WHERE email = $1 AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC LIMIT 200`,
    [email]
  );
  return rows.map(rowToArtwork);
}

/** 将既有作品显式加入画布；不改变作品内容与血缘。 */
export async function setArtworkOrigin(email: string, id: string, origin: string | null): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_artworks SET origin = $3 WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [email.toLowerCase(), id, origin]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Resolve explicit owned historical media; never infer a result from prose. */
export async function knownAgentMedia(email: string, urls: string[]): Promise<string[]> {
  const paths = [...new Set(urls)].filter(url => /^\/media\/[\w./%-]+$/.test(url)).slice(-100);
  if (!paths.length) return [];
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT image_url AS url FROM app_artworks WHERE email=$1 AND image_url=ANY($2::text[]) AND deleted_at IS NULL
    UNION SELECT video_url AS url FROM app_artworks WHERE email=$1 AND video_url=ANY($2::text[]) AND deleted_at IS NULL`, [email.toLowerCase(), paths]);
  return rows.map(row => row.url as string);
}
