import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import { storedDeliveryCheckpoint } from "./delivery-checkpoint";
import { plainGeneratedOutput } from "./receipt-policy";
import { assertMutableStagingTask, excludeImportedHistory } from "../staging-history";
import type { ImagegenPlan } from "./types";
import { selectedBusinessOption } from "../model-config/business";
import { selectedImagePreset } from "../model-config/image-preset";
import { imageCoordinationPool } from "./coordination-pool";
import {completeImageDelivery} from "./complete-image-delivery";
import {applicationTasksRunHere,wakeApplicationWorker,deferApplicationTask} from "../application/task-execution";
import { imageFailureEvidence, imageFailureFrames } from "./failure-evidence";

async function deliverySource(parentId:string,owner:string){
 const parent=(await getPool().query("SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[parentId,owner.toLowerCase()])).rows[0];
 if(!parent||!["done","error","needs_attention"].includes(parent.snapshot.status))return null;
 const children=Object.values(parent.snapshot.children||{}) as {jobId?:string}[];
 if(children.length!==1||!children[0].jobId)return null;
 const child=(await getPool().query("SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate'",[children[0].jobId,owner.toLowerCase()])).rows[0];
 return child&&["done","error","needs_attention"].includes(child.snapshot.status)&&(parent.snapshot.status!=="done"||child.snapshot.deliveryRecovery)?{parent,child}:null;
}
/** Only lightweight proof/metadata is exposed. Never return a raw paid checkpoint. */
export async function storedDeliveryState(parentId:string,owner:string):Promise<{available:boolean;ids?:string[];complete?:boolean}|null>{
 if(!dbEnabled)return null;
 const parent=(await getPool().query("SELECT snapshot->'children' AS children FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen' AND snapshot->>'status' IN ('error','needs_attention')",[parentId,owner.toLowerCase()])).rows[0];
 const children=Object.values(parent?.children||{}) as {jobId?:string}[];if(children.length!==1||!children[0].jobId)return null;
 const row=(await getPool().query(`SELECT snapshot->'deliveryRecovery' AS recovered,
  EXISTS(SELECT 1 FROM (
   SELECT snapshot->'images' AS images WHERE snapshot->>'status'<>'done'
   UNION ALL SELECT a.value->'result' FROM jsonb_each(COALESCE(snapshot->'paidOperations','{}'::jsonb)) a WHERE a.value->>'state'='done'
     AND (snapshot->>'status'<>'done' OR jsonb_array_length(CASE WHEN jsonb_typeof(snapshot->'images')='array' THEN snapshot->'images' ELSE '[]'::jsonb END)=0)
  ) candidates WHERE jsonb_array_length(CASE WHEN jsonb_typeof(images)='array' THEN images ELSE '[]'::jsonb END) BETWEEN 1 AND 4
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(images)='array' THEN images ELSE '[]'::jsonb END) i
      WHERE COALESCE(i->>'url','') !~ '^(data:image/|/media/)')) AS proof
  FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate' AND snapshot->>'status' IN ('done','error','needs_attention')`,[children[0].jobId,owner.toLowerCase()])).rows[0];
 const recovered=row?.recovered;
 if(Array.isArray(recovered?.ids)&&recovered.ids.length>0&&recovered.ids.length<=4&&recovered.ids.every((id:unknown)=>typeof id==="string"))return {available:false,ids:recovered.ids,complete:recovered.complete===true};
 return row?.proof?{available:true}:null;
}

/** Explicit owner action. Reads only stored bytes, saves deterministic immutable
 * artifacts, and reuses the original settlement ID. No SDK, plan, supplier POST
 * or supplier query is imported or invoked. Historical settled bills stay intact. */
export async function recoverStoredDelivery(parentId:string,owner:string){
 owner=owner.toLowerCase();const pool=getPool(),lock=await imageCoordinationPool().connect();let key="",locked=false;
 try{
  const initial=await deliverySource(parentId,owner);if(!initial)throw Error("任务没有可恢复的已保存结果");
  // Different parent receipts can refer to the same child. Serialize by child,
  // not parent, so neither artifact recovery nor settlement races across them.
  key=`image-delivery-recovery:${initial.child.id}`;
  locked=(await lock.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok",[key])).rows[0].ok;
  if(!locked)throw Error("原结果正在恢复，请稍后检查");
  const source=await deliverySource(parentId,owner);if(!source)throw Error("任务没有可恢复的已保存结果");
  const {parent,child}=source;
  if(child.id!==initial.child.id)throw Error("原任务关联已变化，请重新检查");
  await assertMutableStagingTask(pool,"app_image_jobs",parent.id);await assertMutableStagingTask(pool,"app_image_jobs",child.id);
  if(child.lease_token||parent.lease_token)throw Error("原任务仍在收尾，请稍后检查");
  if(parent.snapshot.status==="done"&&child.snapshot.deliveryRecovery?.complete===true&&child.snapshot.deliveryRecovery?.ids?.length)return {ok:true,complete:child.snapshot.deliveryRecovery.complete===true,artworkIds:child.snapshot.deliveryRecovery.ids};
  const checkpoint=storedDeliveryCheckpoint(child.snapshot);if(!checkpoint)throw Error("未找到完整的本地原始图片，不会重新生成");
  if(!checkpoint.allDone)throw Error("仍有未确定的上游调用，仅保留已知原结果");
  if(!applicationTasksRunHere()){
   // The original owner/history/lease/checkpoint checks above still govern.
   // Only the processing/settlement owner changes; no second task is created.
   const changed=await pool.query(`UPDATE app_image_jobs SET snapshot=snapshot||'{"deliveryRecoveryRequested":true}'::jsonb
    WHERE id=$1 AND email=$2 AND COALESCE(snapshot->>'deliveryRecoveryRequested','false')<>'true'`,[parent.id,owner]);
   if(changed.rowCount)await wakeApplicationWorker();
   return {ok:true,complete:false,artworkIds:child.snapshot.deliveryRecovery?.ids||[],queued:true};
  }
  await pool.query("UPDATE app_image_jobs SET snapshot=snapshot-'deliveryRecoveryRequested' WHERE id=$1 AND email=$2",[parent.id,owner]);
  const plan=parent.payload.plan as ImagegenPlan,p=child.payload.p||{};
  const frozen=child.payload.modelExecutions?.image;
  const version=frozen?(await pool.query("SELECT config FROM app_model_config_versions WHERE version=$1 AND digest=$2",[frozen.modelVersion,frozen.modelDigest])).rows[0]:null;
  // Business options are not embedded in ExecutionModel. Consult the immutable
  // original version, never the active pointer or today's administrator policy.
  const post=version?selectedBusinessOption(version.config,frozen.feature,frozen.publicModelId)?.postprocess:undefined;
  const processingKnown=!frozen||!!version;
  const preset=version?!!selectedImagePreset(version.config,frozen.feature,frozen.publicModelId,frozen.binding):false;
  const delivery=await completeImageDelivery({jobId:child.id,owner,params:{...p,email:owner,userPrompt:p.userPrompt||plan.request.prompt},images:checkpoint.images,final:checkpoint.final,
    policy:{known:processingKnown,modelVersion:frozen?.modelVersion,imageParameterPlanVersion:frozen?.imageParameterPlanVersion,post,preset},useDb:true,legacyCost:Number(child.payload.cost||0),recovery:true,
    sourceNodeId:plan.request.sourceNodeId,entry:plan.request.entry,transparent:plan.intent.background==="transparent",stage:()=>{},
  });
  const {images,artifacts,billing}=delivery,ids=images.map(image=>image.id);
  const complete=plainGeneratedOutput(plan)&&checkpoint.allDone&&images.length===plan.request.variants&&processingKnown&&delivery.complete;
  const warnings=new Set<string>(parent.snapshot.result?.warnings||[]);
  if(delivery.imagegenOutputWarning)warnings.add(delivery.imagegenOutputWarning);
  if(delivery.imagegenOutputError)warnings.add(delivery.imagegenOutputError);
  const chargedCredits=billing.chargedCredits,recovery={ids,complete,recoveredAt:new Date().toISOString()};
  const tx=await pool.connect();try{
   await tx.query("BEGIN");
   const lockedRows=await tx.query("SELECT id,lease_token,snapshot->>'status' status FROM app_image_jobs WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",[[parent.id,child.id]]);
   if(lockedRows.rowCount!==2||lockedRows.rows.some(r=>r.lease_token||!["done","error","needs_attention"].includes(r.status)))throw Error("原任务仍在收尾");
   await tx.query("UPDATE app_image_jobs SET snapshot=(snapshot-'error') || $3::jsonb,updated_at=now() WHERE id=$1 AND email=$2",[child.id,owner,JSON.stringify({deliveryRecovery:recovery,images,status:"done",creditsUsed:chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable",persisted:true,...(warnings.size?{imagegenOutputWarning:[...warnings].join("；")}:{} )})]);
   const result={...parent.snapshot.result,status:complete?"succeeded":"partial",stage:"done",artifacts,chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable",recoveryAvailable:false,warnings:[...warnings]};delete result.error;
   const children=Object.fromEntries(Object.entries(parent.snapshot.children).map(([k,v])=>[k,{...(v as object),state:"done",ids}]));
   await tx.query("UPDATE app_image_jobs SET snapshot=snapshot || $3::jsonb,updated_at=now() WHERE id=$1 AND email=$2",[parent.id,owner,JSON.stringify({status:"done",result,children})]);
   await tx.query("COMMIT");
  }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
  return {ok:true,complete,artworkIds:ids};
 }finally{if(locked)await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[key]);lock.release();}
}

/** Worker sweep: small serial batch of terminal jobs with local paid bytes.
 * The original task never re-enters the supplier executor. Unknown submissions,
 * imported history, cancelled jobs and active leases are not selected. */
export async function recoverStoredDeliveries(){
 if(!dbEnabled)return 0;
 if(await deferApplicationTask())return 0;
 const pool=getPool();
 // Materialize a small parent page before inspecting any large child checkpoint.
 // A correlated JSONB join made PostgreSQL repeatedly scan/toast multi-MB images.
 const scan=await pool.connect();let rows:{id:string;email:string;requested:boolean;children:Record<string,{jobId?:string}>}[];
 try{await scan.query("BEGIN;SET LOCAL statement_timeout='1500ms'");
  rows=(await scan.query(`SELECT id,email,snapshot->'children' children,snapshot->>'deliveryRecoveryRequested'='true' AS requested FROM app_image_jobs WHERE kind='imagegen'
   AND snapshot->>'status' IN ('error','needs_attention') AND lease_token IS NULL
   AND (snapshot->>'deliveryRecoveryRequested'='true' OR (created_at>now()-interval '7 days' AND updated_at<now()-interval '20 seconds'
   AND COALESCE((snapshot->>'deliveryRecoveryAttempts')::int,0)<5))
   ${excludeImportedHistory("app_image_jobs")}
   ORDER BY updated_at DESC,id LIMIT 16`)).rows;
  await scan.query("COMMIT");
 }catch{await scan.query("ROLLBACK");return 0;}finally{scan.release();}
 let completed=0;
 for(const row of rows){
  const children=Object.values(row.children||{});if(children.length!==1||!children[0].jobId)continue;
  const retry=(await pool.query("SELECT (snapshot->>'deliveryAttempts')::int n FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate' AND lease_token IS NULL",[children[0].jobId,row.email])).rows[0];
  if(!(retry?.n>=3)&&!row.requested)continue;
  const state=await storedDeliveryState(row.id,row.email);if(!state?.available&&!state?.ids)continue;
  try{await recoverStoredDelivery(row.id,row.email);completed++;}
  catch(error){console.error("[imagegen] stored delivery failed",JSON.stringify({jobId:row.id,...imageFailureEvidence(error),frames:imageFailureFrames(error)}));await pool.query(`UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{deliveryRecoveryAttempts}',to_jsonb(COALESCE((snapshot->>'deliveryRecoveryAttempts')::int,0)+1)),updated_at=now() WHERE id=$1 AND lease_token IS NULL AND snapshot->>'status' IN ('error','needs_attention')`,[row.id]);}
  if(completed>=2)break;
 }
 return completed;
}
