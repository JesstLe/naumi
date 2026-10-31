import 'server-only';
import type {Pool} from 'pg';

/** A schema-scoped latency hint,not a task,receipt or permission to replay.
 * Kept independent of role policy,scanners and domain tables so both committed
 * work and released resource capacity can signal the same existing listener. */
export const APPLICATION_WORK_CHANNEL='naumi_application_work';
export async function notifyApplicationWork(sql:Pick<Pool,'query'>):Promise<void>{
 const query={text:'SELECT pg_notify($1,current_schema())',values:[APPLICATION_WORK_CHANNEL],query_timeout:1000};
 try{await sql.query(query);}
 catch{console.error('[application-worker] wakeup unavailable; saved task retained for periodic scan');}
}
