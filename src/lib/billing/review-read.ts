import 'server-only';
import type {Pool} from 'pg';
import {billingReviewableSql,billingReviewStateSql} from './review-state';
export async function readBillingReviewOperation(sql:Pick<Pool,'query'>,id:string){
 return (await sql.query(`SELECT o.id,o.email,o.feature,${billingReviewStateSql} AS state,o.quote
  FROM app_billing_operations o WHERE o.id=$1 AND ${billingReviewableSql()}`,[id])).rows[0];
}
export async function readBillingReviewOperations(sql:Pick<Pool,'query'>){
 return (await sql.query(`SELECT o.id,o.email,o.feature,${billingReviewStateSql} AS state,o.reserved_credits,o.created_at,
  o.quote->'facts' AS facts,o.quote->>'configVersion' AS version
  FROM app_billing_operations o WHERE ${billingReviewableSql()} ORDER BY o.created_at,o.id LIMIT 100`)).rows;
}
