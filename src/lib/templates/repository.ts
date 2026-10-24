import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {rowToTemplate,type TemplateRow} from "./records";
import type {PromptTemplate} from "@/lib/mock-data";

export async function listTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured, source_image
       FROM app_templates
      ORDER BY sort_index DESC, id ASC`
  );
  return rows.map(rowToTemplate);
}

/** Paged + filterable template list (server-side). Used by /api/templates. */
export async function listTemplatesPaged(opts: {
  category?: string;
  q?: string;
  ids?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ items: TemplateRow[]; total: number }> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.ids && opts.ids.length > 0) {
    params.push(opts.ids);
    where.push(`id = ANY($${params.length})`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`category = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(title) LIKE $${i} OR lower(industry) LIKE $${i} OR lower(id) LIKE $${i} OR EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE lower(t) LIKE $${i}))`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 24));
  const offset = (page - 1) * pageSize;
  const totalRes = await getPool().query<{ n: string }>(
    `SELECT count(*)::int AS n FROM app_templates ${whereSql}`,
    params
  );
  const total = Number(totalRes.rows[0]?.n ?? 0);
  // 省 egress:列表浏览不取 prompt 长文本(16k 模板每页拉一堆全文 → 流量大头);
  // 只有按 ids 精确取详情(预览弹层 / 生成页做同款)才 SELECT prompt。
  const detail = !!(opts.ids && opts.ids.length > 0);
  const promptCol = detail ? "prompt" : "'' AS prompt";
  // source_image(白底原图)同样只在详情(ids,做同款/预览)取,列表浏览不取省流量。
  const sourceCol = detail ? "source_image" : "'' AS source_image";
  const itemsRes = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, ${promptCol}, tags,
            image, gradient, popular, homepage_featured, ${sourceCol}
       FROM app_templates ${whereSql}
      ORDER BY sort_index DESC, id ASC
      LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );
  return { items: itemsRes.rows.map(rowToTemplate), total };
}

/** Templates an admin has manually flagged with the 上首页 toggle — these
 *  are guaranteed to show on the homepage regardless of auto-pool eligibility
 *  (no dim data / unusual aspect / weird tags etc.). */
export async function listHomepageFeaturedTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates
      WHERE homepage_featured = true`
  );
  return rows.map(rowToTemplate);
}

/** Toggle the 上首页 flag on a template (admin action). */
export async function setTemplateHomepageFeatured(
  id: string,
  featured: boolean
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_templates SET homepage_featured = $2 WHERE id = $1`,
    [id, featured]
  );
}

/** Fetch all templates in a given set of categories — used by the homepage
 *  picker (SSR). Returns the same shape as listTemplatesPaged but without
 *  pagination or text search. */
export async function listTemplatesInCategories(
  categories: string[]
): Promise<TemplateRow[]> {
  await ensureSchema();
  if (categories.length === 0) return [];
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates
      WHERE category = ANY($1)`,
    [categories]
  );
  return rows.map(rowToTemplate);
}

/** {category, count} pairs for the templates filter sidebar. */
export async function listTemplateCategories(): Promise<
  { name: string; count: number }[]
> {
  await ensureSchema();
  const { rows } = await getPool().query<{ name: string; count: string }>(
    `SELECT category AS name, count(*)::int AS count
       FROM app_templates
      WHERE category <> ''
      GROUP BY category
      ORDER BY count(*) DESC, category ASC`
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}

export async function getTemplate(
  id: string
): Promise<TemplateRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function updateTemplate(
  id: string,
  patch: Partial<TemplateRow>
): Promise<TemplateRow | null> {
  await ensureSchema();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const cols: Record<string, unknown> = {
    title: patch.title,
    category: patch.category,
    industry: patch.industry,
    description: patch.description,
    prompt: patch.prompt,
    tags: patch.tags,
    image: patch.image,
    gradient: patch.gradient,
    popular: patch.popular,
    homepage_featured: patch.homepageFeatured,
  };
  for (const [k, v] of Object.entries(cols)) {
    if (v !== undefined) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (patch.image !== undefined) {
    sets.push(`image_source = ''`);
    sets.push(`image_cached_at = NULL`);
    sets.push(`image_cache_error = ''`);
    sets.push(`image_cache_attempted_at = NULL`);
  }
  if (sets.length === 0) return getTemplate(id);
  sets.push(`updated_at = now()`);
  vals.push(id);
  const { rows } = await getPool().query<TemplateRow>(
    `UPDATE app_templates SET ${sets.join(", ")}
      WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

/** New templates go on top. Reimporting the same id refreshes content and source
 * image without duplicating the row or replacing its existing sort/tags/flags. */
export async function createTemplate(
  t: Omit<PromptTemplate, "id"> & { id?: string }
): Promise<{ template: TemplateRow; created: boolean }> {
  await ensureSchema();
  const id =
    t.id && t.id.trim()
      ? t.id.trim()
      : `tpl-imp-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const mx = await getPool().query(
    `SELECT COALESCE(MAX(sort_index), 0)::int AS m FROM app_templates`
  );
  const sort = mx.rows[0].m + 1;
  // 重新导入(同 id 冲突)时刷新内容 + 回填白底原图,让「重新导入」名副其实
  //(也给早先导入、还没存原图的旧模板补上 source_image)。created 用 xmax=0 判定。
  const { rows } = await getPool().query<TemplateRow & { created: boolean }>(
    `INSERT INTO app_templates
       (id, title, category, industry, description, prompt, tags,
        image, gradient, popular, sort_index, source_image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        prompt = EXCLUDED.prompt,
        image = EXCLUDED.image,
        gradient = EXCLUDED.gradient,
        source_image = EXCLUDED.source_image
     RETURNING *, (xmax = 0) AS created`,
    [
      id,
      t.title,
      t.category,
      t.industry ?? "",
      t.description ?? "",
      t.prompt,
      t.tags ?? [],
      t.image ?? "",
      t.gradient ?? "from-emerald-100 to-teal-100",
      t.popular === true,
      sort,
      t.sourceImage ?? "",
    ]
  );
  if (rows[0]) return { template: rowToTemplate(rows[0]), created: rows[0].created };
  throw new Error("模板创建失败");
}

// --- User favorites (collections of templates) -----------------------------

/** Return the user's favorite template IDs, newest-favorited first. */
export async function listUserFavs(email: string): Promise<string[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{ template_id: string }>(
    `SELECT template_id FROM app_user_favs
      WHERE email = $1
      ORDER BY created_at DESC`,
    [email]
  );
  return rows.map((r) => r.template_id);
}

/** Idempotent — re-favoriting an id is a no-op (ON CONFLICT DO NOTHING). */
export async function addUserFav(
  email: string,
  templateId: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_user_favs (email, template_id)
     VALUES ($1, $2)
     ON CONFLICT (email, template_id) DO NOTHING`,
    [email, templateId]
  );
}

export async function removeUserFav(
  email: string,
  templateId: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_user_favs WHERE email = $1 AND template_id = $2`,
    [email, templateId]
  );
}
