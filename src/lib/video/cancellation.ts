import "server-only";
import type {PoolClient} from "pg";
import {ensureSchema,getPool,getVideoTask,type VideoTaskRow} from "../db";
import {settleTaskBillingTx} from "../billing/task-operation";
import {ModelConfigError} from "../model-config/types";
import {getVideoProvider} from "./providers/adapter";
import type {VideoTaskSnapshot} from "./types";
import {UnsupportedVideoCancellationError} from "./types";
import {creationEvidenceTx,recordSourceOutcomeTx} from '../saas/creation-writer';

async function cancelLocked(client:PoolClient,actor:string,id:string,task:Record<string,any>,reason:string){
  if(["completed","failed","cancelled"].includes(task.status))return;
  if(task.billing_quote)await settleTaskBillingTx(client,id,actor,task.billing_quote,`led-video-${id}`,{state:"failed",items:[]});
  else if(!task.credits_refunded&&Number(task.cost)>0)await client.query("UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1",[actor,Number(task.cost)]);
  await client.query(`UPDATE app_video_tasks SET status='cancelled',error=$3,error_code='cancelled',credits_refunded=true,
    next_poll_at=NULL,poll_lock_until=NULL,completed_at=now(),updated_at=now() WHERE email=$1 AND id=$2`,[actor,id,reason]);
  await client.query("DELETE FROM app_gen_reservations WHERE job_id=$1",[id]);
  if(task.parameters?.creationScope)await creationEvidenceTx(client,()=>recordSourceOutcomeTx(client,'video',id,actor,'cancelled',{summary:reason}));
}
export async function requestVideoCancellation(actorRaw:string,id:string){
  const actor=actorRaw.toLowerCase();await ensureSchema();const client=await getPool().connect();
  try{
    await client.query("BEGIN");const task=(await client.query("SELECT * FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[actor,id])).rows[0];
    if(!task)throw new ModelConfigError("VIDEO_TASK_UNAVAILABLE","视频任务不存在",404);
    if(!["completed","failed","cancelled"].includes(task.status)){
      await client.query("UPDATE app_video_tasks SET cancellation_requested_at=COALESCE(cancellation_requested_at,now()),updated_at=now() WHERE email=$1 AND id=$2",[actor,id]);
      if(task.parameters?.creationScope)await creationEvidenceTx(client,()=>recordSourceOutcomeTx(client,'video',id,actor,'cancel_requested',{eventKey:'cancel-requested',summary:'已申请取消，等待上游确认'}));
      // This durable marker is set immediately before the supplier request, under this same row lock.
      if(task.status==="queued"&&!task.upstream_id&&task.parameters?.version===2&&task.parameters.submissionState==="prepared")
        await cancelLocked(client,actor,id,task,"已取消未提交的视频任务");
    }
    await client.query("COMMIT");const current=await getVideoTask(actor,id);
    return {taskId:id,cancellationRequested:!!current?.cancellationRequestedAt,status:current!.status,supplierCancellationSupported:current?.supplierCancellationSupported??null};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function beginVideoTaskSubmission(actor:string,id:string):Promise<"started"|"cancelled"|"already_started">{
  await ensureSchema();const client=await getPool().connect();
  try{
    await client.query("BEGIN");const task=(await client.query("SELECT * FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[actor,id])).rows[0];
    if(!task)throw new ModelConfigError("VIDEO_TASK_UNAVAILABLE","视频任务不存在",404);
    if(task.status==="cancelled"){await client.query("COMMIT");return "cancelled";}
    if(task.status!=="queued"||task.upstream_id||task.parameters?.version===2&&task.parameters.submissionState!=="prepared"){await client.query("COMMIT");return "already_started";}
    if(task.cancellation_requested_at){
      if(task.parameters?.version===2)await cancelLocked(client,actor,id,task,"已取消未提交的视频任务");
      else await client.query("UPDATE app_video_tasks SET status='needs_attention',error_code='creation_unknown',error='停止请求已保留，需核对旧任务是否已提交',poll_lock_until=NULL WHERE email=$1 AND id=$2",[actor,id]);
      await client.query("COMMIT");return "cancelled";
    }
    await client.query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{submissionState}','\"sending\"'::jsonb),updated_at=now() WHERE email=$1 AND id=$2",[actor,id]);
    await client.query("COMMIT");return "started";
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function confirmVideoTaskCancelled(actor:string,id:string,reason="上游已确认视频任务取消"){
  await ensureSchema();const client=await getPool().connect();
  try{await client.query("BEGIN");const task=(await client.query("SELECT * FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[actor,id])).rows[0];
    if(!task)throw new ModelConfigError("VIDEO_TASK_UNAVAILABLE","视频任务不存在",404);await cancelLocked(client,actor,id,task,reason);await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
/** A successful DELETE acknowledges the stop request; poll must still confirm the terminal state. */
export async function sendPendingVideoCancellation(actor:string,task:VideoTaskRow,snapshot:VideoTaskSnapshot){
  const current=await getVideoTask(actor,task.id);
  if(!current?.cancellationRequestedAt||current.cancellationSentAt||current.supplierCancellationSupported===false||!["queued","processing"].includes(current.status))return;
  const adapter=getVideoProvider(task.providerId);
  if(!adapter?.cancel){await getPool().query("UPDATE app_video_tasks SET cancellation_supported=false WHERE email=$1 AND id=$2",[actor,task.id]);return;}
  try{await adapter.cancel(snapshot);await getPool().query("UPDATE app_video_tasks SET cancellation_supported=true,cancellation_sent_at=now() WHERE email=$1 AND id=$2",[actor,task.id]);}
  catch(error){await getPool().query("UPDATE app_video_tasks SET cancellation_supported=$3 WHERE email=$1 AND id=$2",[actor,task.id,!(error instanceof UnsupportedVideoCancellationError)]);}
}
