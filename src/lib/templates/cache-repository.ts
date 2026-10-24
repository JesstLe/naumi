import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {remoteTemplateImageSource} from "./image-source";

export type TemplateImageCacheCandidate = {
  id: string;
  image: string;
  source: string;
};

export type TemplateImageCacheStats = {
  total: number;
  cached: number;
  remaining: number;
  failed: number;
};

export type TemplateImageCacheState = {
  image: string;
  imageSource: string;
};

/** 返回尚未处理的远程模板封面；失败项默认留待下次人工重试。 */
export async function listTemplateImageCacheCandidates(
  limit = 12
): Promise<TemplateImageCacheCandidate[]> {
  await ensureSchema();
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const { rows } = await getPool().query<{ id: string; image: string }>(
    `SELECT id, image
       FROM app_templates
      WHERE (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
        AND image_cached_at IS NULL
        AND image_cache_error = ''
      ORDER BY sort_index DESC, id ASC
      LIMIT $1`,
    [safeLimit]
  );
  return rows.flatMap((row) => {
    const source = remoteTemplateImageSource(row.image);
    return source ? [{ ...row, source }] : [];
  });
}

export async function getTemplateImageCacheState(
  id: string
): Promise<TemplateImageCacheState | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    image: string;
    image_source: string;
  }>(
    `SELECT image, image_source FROM app_templates WHERE id = $1`,
    [id]
  );
  return rows[0]
    ? { image: rows[0].image, imageSource: rows[0].image_source || "" }
    : null;
}

/** 懒缓存/批量缓存成功后，仅在图片仍为预期值时回写，避免覆盖管理员并发编辑。 */
export async function setTemplateImageCacheSuccess(
  id: string,
  expectedImage: string,
  source: string,
  cachedUrl: string
): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_templates
        SET image = $4,
            image_source = $3,
            image_cached_at = now(),
            image_cache_error = '',
            image_cache_attempted_at = now(),
            updated_at = now()
      WHERE id = $1 AND image = $2`,
    [id, expectedImage, source, cachedUrl]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setTemplateImageCacheFailure(
  id: string,
  expectedImage: string,
  source: string,
  error: string
): Promise<boolean> {
  await ensureSchema();
  const message = error.trim().slice(0, 500) || "模板图片缓存失败";
  const result = await getPool().query(
    `UPDATE app_templates
        SET image_source = CASE WHEN image_source = '' THEN $3 ELSE image_source END,
            image_cache_error = $4,
            image_cache_attempted_at = now()
      WHERE id = $1 AND image = $2`,
    [id, expectedImage, source, message]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function resetTemplateImageCacheFailures(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_templates
        SET image_cache_error = '', image_cache_attempted_at = NULL
      WHERE image_cache_error <> ''
        AND image_cached_at IS NULL
        AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')`
  );
  return result.rowCount ?? 0;
}

export async function getTemplateImageCacheStats(): Promise<TemplateImageCacheStats> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    total: string;
    cached: string;
    remaining: string;
    failed: string;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (
              WHERE image_cached_at IS NOT NULL OR image LIKE '/media/%'
            )::int AS cached,
            count(*) FILTER (
              WHERE image_cached_at IS NULL
                AND image_cache_error = ''
                AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
            )::int AS remaining,
            count(*) FILTER (
              WHERE image_cached_at IS NULL
                AND image_cache_error <> ''
                AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
            )::int AS failed
       FROM app_templates`
  );
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    cached: Number(row?.cached ?? 0),
    remaining: Number(row?.remaining ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}
