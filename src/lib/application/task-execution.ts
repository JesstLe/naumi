import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {notifyApplicationWork} from './work-signal';
export {APPLICATION_WORK_CHANNEL} from './work-signal';

/** Deployment role, never a request parameter or a new business permission.
 * Existing single-process installations stay local until both roles migrate. */
export function applicationTasksRunHere():boolean{
 const mode=process.env.NAUMI_APPLICATION_TASK_EXECUTION||"local";
 if(!["local","worker"].includes(mode))throw Error("INVALID_APPLICATION_TASK_EXECUTION");
 if(mode==="worker"&&!dbEnabled)throw Error("APPLICATION_WORKER_REQUIRES_DATABASE");
 return mode==="local"||process.env.NAUMI_WORKER_EXECUTION==="direct";
}
/** The original task is already committed. NOTIFY is only a latency hint:
 * unavailable listeners/notifications never reject acceptance or permit replay.
 * The existing periodic scan remains the durable fallback. No IDs or secrets. */
export async function deferApplicationTask():Promise<boolean>{
 if(applicationTasksRunHere())return false;
 await wakeApplicationWorker();return true;
}
export async function wakeApplicationWorker():Promise<void>{
 try{await notifyApplicationWork(getPool());}
 catch{console.error("[application-worker] wakeup unavailable; saved task retained for periodic scan");}
}
