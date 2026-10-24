import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {getTemplateImageCacheStats, listTemplateImageCacheCandidates, resetTemplateImageCacheFailures, setTemplateImageCacheFailure, setTemplateImageCacheSuccess, type TemplateImageCacheCandidate} from "@/lib/templates/cache-repository";
import {dbEnabled} from "@/platform/db/pool";
import { persistTemplateImage } from "@/lib/template-image-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(req: Request): Promise<NextResponse | null> {
  if (!dbEnabled) {
    return NextResponse.json({ error: "未配置数据库" }, { status: 503 });
  }
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  return NextResponse.json({ ok: true, ...(await getTemplateImageCacheStats()) });
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  let body: { limit?: number; retryFailures?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* 空请求体按默认批次处理 */
  }
  if (body.retryFailures) await resetTemplateImageCacheFailures();

  const limit = Math.min(24, Math.max(1, Math.floor(Number(body.limit) || 12)));
  const candidates = await listTemplateImageCacheCandidates(limit);
  let cursor = 0;
  let cached = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  async function cacheOne(item: TemplateImageCacheCandidate) {
    try {
      const result = await persistTemplateImage(item.source);
      const updated = await setTemplateImageCacheSuccess(
        item.id,
        item.image,
        item.source,
        result.cachedUrl
      );
      if (updated) cached++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "缓存失败";
      failed++;
      errors.push({ id: item.id, error: message });
      await setTemplateImageCacheFailure(
        item.id,
        item.image,
        item.source,
        message
      ).catch(() => false);
    }
  }

  // 单批最多 4 路并发，避免集中打满外部图床与本机连接池。
  async function worker() {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      await cacheOne(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, () => worker())
  );

  const stats = await getTemplateImageCacheStats();
  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    batchCached: cached,
    batchFailed: failed,
    errors: errors.slice(0, 5),
    ...stats,
    done: stats.remaining === 0 || candidates.length === 0,
  });
}
