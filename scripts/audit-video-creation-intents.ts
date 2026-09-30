import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{
      strategy: string;
      queued: number;
      needs_attention: number;
    }>(
      `SELECT
         COALESCE(NULLIF(provider_snapshot->>'idempotencyStrategy',''), 'missing') AS strategy,
         count(*) FILTER (WHERE status = 'queued' AND upstream_id = '')::int AS queued,
         count(*) FILTER (WHERE status = 'needs_attention')::int AS needs_attention
       FROM app_video_tasks
       WHERE (status = 'queued' AND upstream_id = '') OR status = 'needs_attention'
       GROUP BY 1 ORDER BY 1`
    );
    const unsafeQueued = rows.reduce(
      (sum, row) => sum + (!["header", "body"].includes(row.strategy) ? Number(row.queued) : 0),
      0
    );
    console.log(`VIDEO_CREATION_INTENT_AUDIT=${unsafeQueued ? "NEEDS_ATTENTION" : "PASS"} unsafe_queued=${unsafeQueued} rows=${JSON.stringify(rows)}`);
    if (unsafeQueued) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
