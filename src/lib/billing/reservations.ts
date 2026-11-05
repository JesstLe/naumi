import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {refreshBalance} from "./wallet-balance";
import {excludeImportedHistory} from "@/lib/staging-history";

// --- Generation credit reservations (auto-refund safety net) --------------
// A row is written when a generation reserves credits, and deleted when the
// job settles (success or handled failure). If the process is killed mid-job
// (e.g. a deploy), the row is orphaned; sweepStaleReservations refunds those.

export async function addReservation(
  jobId: string,
  emailRaw: string,
  cost: number
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_gen_reservations (job_id, email, cost)
       VALUES ($1, $2, $3) ON CONFLICT (job_id) DO NOTHING`,
    [jobId, emailRaw.toLowerCase(), cost]
  );
}

export async function settleReservation(jobId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_gen_reservations WHERE job_id = $1`,
    [jobId]
  );
}

/** Keep a legitimately long-running generation from being reclaimed as stale. */
export async function touchReservation(jobId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_gen_reservations SET created_at = now() WHERE job_id = $1`,
    [jobId]
  );
}

/** Refund + clear reservations older than the cutoff (orphaned by a crash /
 *  restart). Atomic claim via DELETE … RETURNING so concurrent sweeps never
 *  double-refund. Returns how many were refunded. */
export async function sweepStaleReservations(
  olderThanMin?:number
): Promise<number> {
  await ensureSchema();
  if(olderThanMin===undefined){const {currentSynchronousBilling}=await import("@/lib/billing/synchronous-operation");olderThanMin=currentSynchronousBilling()?.snapshot?.config.credits.staleReservationMinutes;}
  if(olderThanMin===undefined){const {getBillingRuntime} = await import("@/lib/billing/runtime");olderThanMin=(await(await getBillingRuntime()).config.current()).config.credits.staleReservationMinutes;}
  const client = await getPool().connect();
  let rows: Array<{ email: string; cost: number }> = [];
  try {
    await client.query("BEGIN");
    const deleted = await client.query<{ email: string; cost: number }>(
      `DELETE FROM app_gen_reservations
       WHERE created_at < now() - ($1 || ' minutes')::interval
         ${excludeImportedHistory("app_gen_reservations")}
         AND NOT EXISTS (
           SELECT 1 FROM app_video_tasks v
            WHERE v.id = app_gen_reservations.job_id
              AND v.status IN ('queued','processing','needs_attention')
         )
         AND NOT EXISTS (
           SELECT 1 FROM app_canvas_image_tasks c
            WHERE c.id = app_gen_reservations.job_id
              AND c.status IN ('queued','processing','needs_attention')
         )
         AND NOT EXISTS (
           SELECT 1 FROM app_image_jobs j
            WHERE j.id = app_gen_reservations.job_id AND NOT j.billing_settled
         )
         AND NOT EXISTS (
           SELECT 1 FROM app_billing_operations b WHERE b.id=app_gen_reservations.job_id AND b.state IN ('reserved','hold','manual')
         )
     RETURNING email, cost`,
      [String(olderThanMin)]
    );
    rows = deleted.rows;
    {
      for (const row of rows) {
        await client.query(
          `UPDATE app_users SET credits_used = GREATEST(credits_used - $2, 0)
            WHERE email = $1`,
          [row.email, row.cost]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  {
    for (const email of Array.from(new Set(rows.map((row) => row.email)))) {
      await refreshBalance(email).catch(() => {});
    }
  }
  return rows.length;
}
