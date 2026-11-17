import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';

export function withBillingAdminRead<T>(pool:Pool,signal:AbortSignal,read:(sql:PoolClient)=>Promise<T>){
 return withOwnedReportClient(pool,async tx=>{
  await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
  const value=await read(tx);await tx.query('COMMIT');return value;
 },signal);
}
