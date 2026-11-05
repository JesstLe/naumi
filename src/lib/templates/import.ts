import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {PromptTemplate} from "@/lib/mock-data";

/** Seeds the templates table from the bundled static list if it's empty.
 *  Idempotent thanks to ON CONFLICT DO NOTHING. */
// Sync the bundled template list (templates-data.ts) into this instance's DB.
// `templates-data.ts` is the single source of truth for bulk templates: each
// deploy runs this once, inserting any NEW templates (by id). Existing rows are
// left untouched (ON CONFLICT DO NOTHING) so admin-panel edits/additions are
// never clobbered. Because both the 海外 and 国内 instances share this code and
// both redeploy on a template change, a scraped batch lands on both sites
// automatically — no separate DB-to-DB sync needed.
export async function syncTemplatesFromCode(
  seed: PromptTemplate[]
): Promise<{ inserted: number; total: number; skipped?: boolean }> {
  await ensureSchema();

  // Fast-path: if the DB already has at least as many rows as the seed,
  // every seed id is either already inserted or has been deleted on purpose
  // — either way, running 6000+ no-op INSERTs over the pooler is the wrong
  // thing to do (it was making the first /api/templates request after every
  // pm2 restart block 30-60s). Skip entirely. Cold starts and template-batch
  // additions fall through to the batched insert below.
  const cnt = await getPool().query<{ n: string }>(
    `SELECT count(*)::int AS n FROM app_templates`
  );
  const have = Number(cnt.rows[0]?.n ?? 0);
  if (have >= seed.length) {
    return { inserted: 0, total: seed.length, skipped: true };
  }

  // Cold path: batched multi-row INSERT (≈500 rows per statement, ~13 round
  // trips for 6500 templates vs 6500 individual statements).
  const COLS = 11;
  const BATCH = 500;
  const client = await getPool().connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    for (let start = 0; start < seed.length; start += BATCH) {
      const slice = seed.slice(start, start + BATCH);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      slice.forEach((t, j) => {
        const base = j * COLS;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${
            base + 6
          },$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`
        );
        values.push(
          t.id,
          t.title,
          t.category,
          t.industry ?? "",
          t.description ?? "",
          t.prompt,
          t.tags ?? [],
          t.image ?? "",
          t.gradient ?? "from-emerald-100 to-teal-100",
          t.popular === true,
          seed.length - (start + j) // newest (index 0) gets the highest sort_index
        );
      });
      const r = await client.query(
        `INSERT INTO app_templates
           (id, title, category, industry, description, prompt, tags,
            image, gradient, popular, sort_index)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO NOTHING`,
        values
      );
      inserted += r.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { inserted, total: seed.length };
}

/**
 * 导入一批模板(买家实例「同步官方模板库」用):ON CONFLICT DO NOTHING,
 * 不覆盖站长本地改动。sort_index 按官方全库位置倒排(offset 越小 = 越新 = 越大),
 * 与官方站展示顺序一致。
 */
export async function importTemplates(
  items: Array<{
    id: string;
    title: string;
    category: string;
    industry?: string;
    description?: string;
    prompt?: string;
    tags?: string[];
    image?: string;
    gradient?: string;
    popular?: boolean;
  }>,
  totalCount: number,
  offset: number
): Promise<number> {
  await ensureSchema();
  if (items.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const COLS = 11;
  items.forEach((t, j) => {
    const base = j * COLS;
    placeholders.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${
        base + 6
      },$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`
    );
    values.push(
      t.id,
      t.title,
      t.category ?? "",
      t.industry ?? "",
      t.description ?? "",
      t.prompt ?? "",
      t.tags ?? [],
      t.image ?? "",
      t.gradient ?? "from-emerald-100 to-teal-100",
      t.popular === true,
      Math.max(0, totalCount - (offset + j))
    );
  });
  const r = await getPool().query(
    `INSERT INTO app_templates
       (id, title, category, industry, description, prompt, tags,
        image, gradient, popular, sort_index)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (id) DO NOTHING`,
    values
  );
  return r.rowCount ?? 0;
}
