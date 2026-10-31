import 'server-only';
import {randomUUID} from 'node:crypto';
import {getPool} from '@/platform/db/pool';
import {ensureSchema} from '@/lib/persistence/schema';
import {IMAGE_JOB_KINDS,imageJobConcurrency} from '../image-job-queue';
import {IMAGE_JOB_LEASE_MS} from '../image-job-lease';
import {isImportedHistory,excludeImportedHistory} from '../staging-history';
import type {ImageJobKind,ImageJobRow} from './types';

/** Single writer for image scheduling:lane admission,expiry and due candidates.
 * Paid checkpoints,heartbeat fencing,results and wallet settlement retain their
 * original owners. Only proven unsent deferrals skip the recovery cooldown. */
export async function claimImageJob(id: string, kind: ImageJobKind): Promise<ImageJobRow | null> {
  await ensureSchema();
  if (await isImportedHistory(getPool(), "app_image_jobs", id)) return null;
  const tx=await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["naumi-image-job-queue:"+kind]);
    const {rows}=await tx.query(`UPDATE app_image_jobs SET lease_token=$3,lease_until=clock_timestamp()+$5*interval '1 millisecond'
      WHERE id=$1 AND kind=$2 AND (lease_until IS NULL OR lease_until<clock_timestamp())
      AND snapshot->>'status' NOT IN ('done','error','needs_attention')
      AND (SELECT count(*) FROM app_image_jobs active WHERE active.kind=$2 AND active.lease_token IS NOT NULL
        AND active.lease_until>clock_timestamp())<$4 RETURNING *`,[id,kind,randomUUID(),imageJobConcurrency(kind),IMAGE_JOB_LEASE_MS]);
    await tx.query("COMMIT");return rows[0]||null;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}

export async function releaseImageJob(id: string, token: string) {
  await getPool().query(`UPDATE app_image_jobs SET lease_token=NULL,updated_at=now(),
    lease_until=CASE WHEN snapshot->>'status'='pending'
      AND NOT COALESCE(snapshot->>'queueState'='execution' AND snapshot->'paidOperationVersion'='1'::jsonb
        AND NOT jsonb_path_exists(snapshot,'$.paidOperations.** ? (@.state == "started")'),false)
      THEN clock_timestamp()+interval '10 seconds' ELSE NULL END
    WHERE id=$1 AND lease_token=$2`, [id,token]);
}

export async function dueImageJobs() {
  await ensureSchema();
  const { rows } = await getPool().query(`WITH waiting AS (SELECT id,kind,updated_at,
    row_number() OVER(PARTITION BY kind ORDER BY updated_at,id) AS lane_rank FROM app_image_jobs WHERE (lease_until IS NULL OR lease_until<now())
    AND (snapshot->>'status'='pending' OR (kind='imagegen' AND snapshot->>'status'='running') OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb)
    ${excludeImportedHistory("app_image_jobs")}), budgets AS (SELECT * FROM unnest($1::text[],$2::int[]) v(kind,capacity)),
    active AS (SELECT kind,count(*)::int n FROM app_image_jobs WHERE lease_token IS NOT NULL AND lease_until>now() GROUP BY kind)
    SELECT w.id,w.kind FROM waiting w JOIN budgets b ON b.kind=w.kind LEFT JOIN active a ON a.kind=w.kind
    WHERE w.lane_rank<=LEAST(32,GREATEST(0,b.capacity-COALESCE(a.n,0))) ORDER BY w.lane_rank,w.updated_at,w.id`,
    [IMAGE_JOB_KINDS,IMAGE_JOB_KINDS.map(imageJobConcurrency)]);
  return rows as {id:string;kind:ImageJobKind}[];
}

