import { NextResponse } from "next/server";
import {listTemplatesPaged, syncTemplatesFromCode} from "@/lib/db";
import {dbEnabled} from "@/platform/db/pool";
import { resolveUserEmail } from "@/lib/admin-auth";
import { TEMPLATES as SEED } from "@/lib/templates-data";
import {publishTemplateMedia} from "@/lib/template-published-media";
import { templateImageDeliveryUrl } from "@/lib/template-image-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sync the bundled template list into the DB once per process (i.e. once per
// deploy, since pm2 restart spawns a fresh process). Inserts new templates,
// leaves existing rows untouched. Idempotent + race-safe.
let seedPromise: Promise<void> | null = null;
function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await syncTemplatesFromCode(SEED);
    })().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

// Paged: ?category=&q=&page=1&pageSize=24&ids=a,b,c
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("pageSize") || "24");
  const category = (url.searchParams.get("category") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const idsParam = (url.searchParams.get("ids") || "").trim();
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  // DB off: serve a paged slice of the bundled list (mock mode).
  if (!dbEnabled) {
    const filtered = SEED.filter(
      (t) =>
        (!category || t.category === category) &&
        (!ids || ids.includes(t.id)) &&
        (!q ||
          t.title.toLowerCase().includes(q.toLowerCase()) ||
          t.industry.toLowerCase().includes(q.toLowerCase()) ||
          t.id.toLowerCase().includes(q.toLowerCase()) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q.toLowerCase())))
    );
    const start = (page - 1) * pageSize;
    return NextResponse.json({
      templates: filtered
        .slice(start, start + pageSize)
        .map((t) => ({ ...t, image: templateImageDeliveryUrl(t.id, t.image) })),
      total: filtered.length,
      page,
      pageSize,
      persisted: false,
    });
  }

    // 提示词保护:未登录一律不下发 prompt 全文(列表本就不带;ids 详情也剥掉),
    // 且这类响应禁止 CDN 公共缓存,避免登录用户的完整响应被缓存后泄漏给游客。
    const authed = !dbEnabled || !!(await resolveUserEmail(req));
    const isDetail = !!ids;

    try {
      await ensureSeeded();
      const { items, total } = await listTemplatesPaged({
        category: category || undefined,
        q: q || undefined,
        ids,
        page,
        pageSize,
      });
    const deliveredItems = await Promise.all(items.map(async (row) => {
      const t=await publishTemplateMedia(row);
      return {...t,image:templateImageDeliveryUrl(t.id,t.image)};
    }));
    const safeItems = authed
      ? deliveredItems
      : deliveredItems.map((t) => ({ ...t, prompt: "" }));
    // 无需按 id 拉全文时,模板内容基本不变,让 CDN / 浏览器缓存响应(命中即不再打 DB)。
    // 5 分钟新鲜 + 1 天 stale-while-revalidate;模板上新后最多 5 分钟内可见,可接受。
    return NextResponse.json(
      { templates: safeItems, total, page, pageSize, persisted: true },
      {
        headers: isDetail || !authed
          ? { "Cache-Control": "private, no-store" }
          : {
              "Cache-Control":
                "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
            },
      }
    );
  } catch (e) {
    // 内部 DB 报错只在 server 端 log,前端只回通用文案(不漏表名/连接串等内部细节)
    console.error("[templates] db read failed:", e);
    return NextResponse.json({
      templates: SEED.slice(0, pageSize).map((t) => ({
        ...t,
        image: templateImageDeliveryUrl(t.id, t.image),
      })),
      total: SEED.length,
      page,
      pageSize,
      persisted: false,
      error: "db read failed",
    });
  }
}
