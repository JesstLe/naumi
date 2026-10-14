import 'server-only';
import { getPool } from '../db';

// Pending/expired fences remain observable: elapsed lease time is NOT evidence
// that an old process stopped its provider request. Never clear them here.
const sources = [
  ['imageJobs', 'app_image_jobs', "lease_token IS NOT NULL AND snapshot->>'status' NOT IN ('done','error','needs_attention')"],
  ['canvasImages', 'app_canvas_image_tasks', "lease_until IS NOT NULL AND status IN ('queued','processing')"],
  ['videoPolls', 'app_video_tasks', "poll_lock_until IS NOT NULL AND status IN ('queued','processing')"],
  ['supplierCosts', 'app_supplier_cost_jobs', 'lease_id IS NOT NULL'],
  ['imagegenItems', 'app_imagegen_batch_items', "lease_token IS NOT NULL AND state IN ('queued','submitted','processing')"],
] as const;

/** Aggregate-only, read-only shared-DB gate. It does not claim process-specific
 * Agent/SSE state, nor prove provider completion from an expired timestamp. */
export async function readWorkerDrainStatus() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3s'");
    const counts: Record<string, number> = {}, absentTables: string[] = [];
    for (const [key, table, condition] of sources) {
      const exists = (await client.query('SELECT to_regclass($1) AS name', [table])).rows[0]?.name;
      if (!exists) { absentTables.push(table); counts[key] = 0; continue; }
      counts[key] = Number((await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${condition}`)).rows[0].count);
    }
    // Media mirrors keep a transaction open across the object write, and media
    // jobs/workflows use advisory locks. Include these independent executors.
    const locks = (await client.query(`SELECT
      (SELECT count(*)::int FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND pid<>pg_backend_pid() AND xact_start IS NOT NULL AND state<>'idle') AS transactions,
      (SELECT count(*)::int FROM pg_locks l JOIN pg_stat_activity a USING(pid)
        WHERE l.locktype='advisory' AND l.granted AND a.datname=current_database() AND l.pid<>pg_backend_pid()) AS advisory`)).rows[0];
    await client.query('COMMIT');
    const activeFences = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const activeTransactions = Number(locks.transactions), advisoryLocks = Number(locks.advisory);
    return { schema: 1, scope: 'shared-database', counts, absentTables, activeFences, activeTransactions, advisoryLocks,
      drained: activeFences === 0 && activeTransactions === 0 && advisoryLocks === 0 };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
