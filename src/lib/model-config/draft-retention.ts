import "server-only";
import type { Pool } from "pg";

/** Per-operation drafts written by the model management page use the actor
 * "<admin>#mvp:<operation uuid>:<fingerprint>". Once that operation's
 * publication is applied, replays answer from the immutable version and
 * receipt, so the draft (and its cascaded rows) is no longer read. Drafts of
 * staged/unknown/failed operations and every ordinary admin draft are kept.
 * The age guard leaves room for the publish that just applied. */
export async function pruneAppliedOperationDrafts(pool: Pool, limit = 25, minAgeSeconds = 600): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM app_model_drafts WHERE id IN (
       SELECT d.id FROM app_model_drafts d
       JOIN app_model_publications p ON p.id::text = lower(substring(d.actor from '#mvp:([0-9a-fA-F-]{36}):'))
       WHERE p.phase = 'applied' AND d.updated_at < now() - make_interval(secs => $2)
       ORDER BY d.updated_at LIMIT $1 FOR UPDATE OF d SKIP LOCKED)`,
    [limit, minAgeSeconds],
  );
  return rowCount ?? 0;
}
