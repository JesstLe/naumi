import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';
import {billingReviewableSql,billingReviewStateSql} from './review-state';

export function withBillingReviewRead<T>(pool:Pool,signal:AbortSignal,read:(sql:PoolClient)=>Promise<T>){
 return withOwnedReportClient(pool,async tx=>{
  await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
  const value=await read(tx);await tx.query('COMMIT');return value;
 },signal);
}
export async function readBillingReviewOperation(sql:Pick<Pool,'query'>,id:string){
 return (await sql.query(`SELECT o.id,o.email,o.feature,${billingReviewStateSql} AS state,o.quote
  FROM app_billing_operations o WHERE o.id=$1 AND ${billingReviewableSql()}`,[id])).rows[0];
}
export async function readBillingReviewOperations(sql:Pick<Pool,'query'>){
 return (await sql.query(`SELECT o.id,o.email,o.feature,${billingReviewStateSql} AS state,o.reserved_credits,o.created_at,
  o.quote->'facts' AS facts,o.quote->>'configVersion' AS version
  FROM app_billing_operations o WHERE ${billingReviewableSql()} ORDER BY o.created_at,o.id LIMIT 100`)).rows;
}
