import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {getPool} from '@/platform/db/pool';
import {excludeImportedHistory} from '../staging-history';

const reviewBatchSize=100;
// All SQL uses the same internal alias. Imported reserved history is never
// promoted; an already-manual legacy row keeps its original state and rules.
export function abandonedReservationSql(){
 return `o.state='reserved' AND (
   (o.id LIKE 'tool-%' AND o.updated_at < now()-make_interval(mins=>GREATEST(30,COALESCE((o.quote->>'staleReservationMinutes')::int,30))))
   OR EXISTS (SELECT 1 FROM app_canvas_image_tasks c WHERE c.id=o.id AND c.status='needs_attention')
   OR EXISTS (SELECT 1 FROM app_image_jobs j WHERE j.id=o.id AND j.snapshot->>'status'='needs_attention')
   OR EXISTS (SELECT 1 FROM app_video_tasks v WHERE v.id=o.id AND v.status='needs_attention'))
   ${excludeImportedHistory('app_billing_operations','o')}`;
}
export const billingReviewableSql=()=>`(o.state IN ('hold','manual') OR (${abandonedReservationSql()}))`;
export const billingReviewStateSql=`CASE WHEN o.state='reserved' THEN 'manual' ELSE o.state END`;
// A displayed task already proved the needs-attention predicate for its own ID.
export const linkedBillingReviewableSql=()=>`(o.state IN ('hold','manual') OR (o.state='reserved' ${excludeImportedHistory('app_billing_operations','o')}))`;

/** Call after locking the exact operation. Check on a fresh statement so a
 * linked task that recovered during a lock wait is not treated as abandoned. */
export async function lockedReservationNeedsReview(tx:PoolClient,id:string){
 return !!(await tx.query(`SELECT 1 FROM app_billing_operations o WHERE o.id=$1 AND ${abandonedReservationSql()}`,[id])).rowCount;
}

/** Worker-only state classification. Skip in-flight row owners; newer eligible
 * rows can progress and a later tick revisits any skipped reservations. */
export async function exposeAbandonedBillingOperations(pool:Pick<Pool,'query'>=getPool()):Promise<number>{
 const exposed=await pool.query(`WITH due AS MATERIALIZED (
    SELECT o.id FROM app_billing_operations o WHERE ${abandonedReservationSql()}
    ORDER BY o.updated_at,o.id LIMIT ${reviewBatchSize} FOR UPDATE OF o SKIP LOCKED
  ) UPDATE app_billing_operations o SET state='manual' FROM due WHERE o.id=due.id`);
 return exposed.rowCount??0;
}
