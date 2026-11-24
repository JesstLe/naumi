import 'server-only';
import {reportAccountVisibleSql,reportOperationVisibleSql} from '../accounts/creation-policy';
import type {PoolClient} from 'pg';

/** Cost workers keep their raw outbox. Only the ordinary admin read uses this join. */
export const reportCostJobSource=`app_supplier_cost_jobs j
 LEFT JOIN app_supplier_calls job_call ON job_call.id=CASE WHEN j.payload->>'callId' ~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' THEN (j.payload->>'callId')::uuid END
 LEFT JOIN LATERAL (SELECT COALESCE(job_call.user_email,j.payload->'context'->>'userEmail') AS email,
   COALESCE(job_call.operation_id,j.payload->'context'->>'operationId',j.payload->>'operation') AS operation) job_owner ON true`;
export const reportCostJobVisibleSql=`${reportAccountVisibleSql('job_owner.email')} AND (job_owner.operation IS NULL OR ${reportOperationVisibleSql('job_owner.operation',true)})`;
export async function reportCostJobReadable(tx:Pick<PoolClient,'query'>,key:string){
 return !!(await tx.query(`SELECT j.key FROM ${reportCostJobSource} WHERE j.key=$1 AND ${reportCostJobVisibleSql}`,[key])).rowCount;
}
