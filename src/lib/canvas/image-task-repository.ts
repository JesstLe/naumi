import type {PoolClient} from "pg";
import {withTransaction} from "@/platform/db/transaction";
import {holdTaskBillingTx} from "../billing/task-settlement";
import "server-only";
import {getPool,dbEnabled} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {mapCanvasImageTask,type CanvasImageTaskRow} from "./image-task-records";
import {excludeImportedHistory} from "@/lib/staging-history";
import {touchReservation} from "@/lib/billing/reservations";

export async function createCanvasImageTask(input: {
  id: string;
  email: string;
  sourceArtworkId: string;
  parameters: unknown;
  cost: number;
}): Promise<CanvasImageTaskRow> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `INSERT INTO app_canvas_image_tasks
       (id, email, kind, source_artwork_id, parameters, cost)
     VALUES ($1,$2,'text-edit',$3,$4::jsonb,$5)
     RETURNING *`,
    [input.id, input.email.toLowerCase(), input.sourceArtworkId, JSON.stringify(input.parameters ?? {}), input.cost]
  );
  return mapCanvasImageTask(rows[0] as Record<string, unknown>);
}

export async function getCanvasImageTask(email: string, id: string): Promise<CanvasImageTaskRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM app_canvas_image_tasks WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  return rows[0] ? mapCanvasImageTask(rows[0] as Record<string, unknown>) : null;
}

export async function listCanvasImageTasks(email: string, limit = 50, sourceArtworkIds: string[] = []): Promise<CanvasImageTaskRow[]> {
  await ensureSchema();
  const sourceIds = Array.from(new Set(sourceArtworkIds.filter(Boolean))).slice(0, 500);
  const { rows } = await getPool().query(
    `SELECT * FROM app_canvas_image_tasks
      WHERE email = $1
        AND ($3::text[] = '{}'::text[] OR source_artwork_id = ANY($3::text[]))
      ORDER BY created_at DESC LIMIT $2`,
    [email.toLowerCase(), Math.min(Math.max(limit, 1), 500), sourceIds]
  );
  return rows.map((row) => mapCanvasImageTask(row as Record<string, unknown>));
}

/** Atomically leases one queued/recoverable edit. A crashed worker can be reclaimed. */
export async function claimNextCanvasImageTask(leaseSeconds = 330): Promise<CanvasImageTaskRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `WITH candidate AS (
       SELECT id FROM app_canvas_image_tasks
        WHERE status IN ('queued','processing')
          AND (lease_until IS NULL OR lease_until < now())
          AND attempts < 3
          ${excludeImportedHistory("app_canvas_image_tasks")}
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE app_canvas_image_tasks task
        SET status = 'processing', progress = GREATEST(progress, 5),
            attempts = attempts + 1,
            lease_until = now() + ($1 || ' seconds')::interval,
            error = '', updated_at = now()
       FROM candidate
      WHERE task.id = candidate.id
     RETURNING task.*`,
    [Math.max(30, Math.trunc(leaseSeconds))]
  );
  return rows[0] ? mapCanvasImageTask(rows[0] as Record<string, unknown>) : null;
}

export async function updateCanvasImageTaskProgress(id: string, progress: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_canvas_image_tasks
        SET progress = $2, lease_until = now() + interval '330 seconds', updated_at = now()
      WHERE id = $1 AND status = 'processing'`,
    [id, Math.max(0, Math.min(95, Math.trunc(progress)))]
  );
  await touchReservation(id).catch(() => {});
}

/** Atomic submission guard survives worker crashes and model configuration changes. */
export async function beginCanvasImageTaskSubmission(id: string): Promise<boolean> {
  if (!dbEnabled) return false;
  await ensureSchema();
  const { rows } = await getPool().query(
    `UPDATE app_canvas_image_tasks SET parameters = parameters || '{"upstreamStarted":true}'::jsonb,
      updated_at=now() WHERE id=$1 AND status='processing'
      AND NOT parameters @> '{"upstreamStarted":true}'::jsonb RETURNING id`, [id]);
  return rows.length === 1;
}

export async function saveCanvasImageTaskProviderResult(id: string, url: string, quality?: unknown): Promise<void> {
  await ensureSchema();
  await getPool().query(`UPDATE app_canvas_image_tasks SET parameters=parameters || jsonb_build_object('upstreamResult',$2::text) || CASE WHEN $3::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('qualityAudit',$3::jsonb) END,
    updated_at=now() WHERE id=$1 AND status='processing'`, [id,url,quality ? JSON.stringify(quality) : null]);
}

export async function holdCanvasImageTask(id: string, error: string): Promise<void> {
  await ensureSchema();
  await withTransaction(getPool(),async tx=>{
    const held=await tx.query("UPDATE app_canvas_image_tasks SET status='needs_attention',error=$2,lease_until=NULL,updated_at=now() WHERE id=$1 AND status IN ('queued','processing') RETURNING id",[id,error]);
    if(held.rowCount)await holdTaskBillingTx(tx,id,"manual");
  });
}

export async function retryCanvasImageTask(input: { id: string; email: string; error: string; delaySeconds?: number }): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_canvas_image_tasks
        SET status = 'queued', progress = LEAST(progress, 20), error = $3,
            lease_until = now() + ($4 || ' seconds')::interval, updated_at = now()
      WHERE email = $1 AND id = $2 AND status = 'processing'`,
    [input.email.toLowerCase(), input.id, input.error.slice(0, 1000), Math.max(2, input.delaySeconds ?? 8)]
  );
  await touchReservation(input.id).catch(() => {});
}

/** Resume only stored output processing, never authorize a supplier submission. */
export async function requeueStoredCanvasImageTaskTx(tx:PoolClient,id:string,email:string){
 await tx.query("UPDATE app_canvas_image_tasks SET status='queued',attempts=0,lease_until=NULL,error='',updated_at=now() WHERE id=$1 AND email=$2 AND status='needs_attention' AND parameters->>'upstreamResult' IS NOT NULL",[id,email]);
}
