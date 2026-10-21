import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { dbEnabled,getPool,listArtworksByIds,addArtworks,getImageJobChargedCredits } from "../db";
import { uploadImage } from "../storage";
import { readCanvasOutput } from "../canvas-image-input";
import { inspectImagegenPixels } from "./postprocess";
import { storedDeliveryCheckpoint } from "./delivery-checkpoint";
import { plainGeneratedOutput } from "./receipt-policy";
import { settleImageJob } from "../image-job-repository";
import { assertMutableStagingTask, excludeImportedHistory } from "../staging-history";
import type { BillingResult } from "../billing/types";
import type { ImagegenPlan } from "./types";
import { selectedBusinessOption } from "../model-config/business";
import { selectedImagePreset } from "../model-config/image-preset";
import { finishStoredImage } from "./finish-stored-image";
import { imageCoordinationPool } from "./coordination-pool";

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
  if(parent.snapshot.status==="done"&&child.snapshot.deliveryRecovery?.ids?.length)return {ok:true,complete:child.snapshot.deliveryRecovery.complete===true,artworkIds:child.snapshot.deliveryRecovery.ids};
  const checkpoint=storedDeliveryCheckpoint(child.snapshot);if(!checkpoint)throw Error("未找到完整的本地原始图片，不会重新生成");
  if(!checkpoint.allDone)throw Error("仍有未确定的上游调用，仅保留已知原结果");
  const plan=parent.payload.plan as ImagegenPlan,p=child.payload.p||{};
  const frozen=child.payload.modelExecutions?.image;
  const version=frozen?(await pool.query("SELECT config FROM app_model_config_versions WHERE version=$1 AND digest=$2",[frozen.modelVersion,frozen.modelDigest])).rows[0]:null;
  // Business options are not embedded in ExecutionModel. Consult the immutable
  // original version, never the active pointer or today's administrator policy.
  const post=version?selectedBusinessOption(version.config,frozen.feature,frozen.publicModelId)?.postprocess:undefined;
  const processingKnown=!frozen||!!version;
  let complete=plainGeneratedOutput(plan)&&checkpoint.allDone&&checkpoint.images.length===plan.request.variants&&processingKnown;
  const warnings=new Set<string>(parent.snapshot.result?.warnings||[]);
  const preset=version?!!selectedImagePreset(version.config,frozen.feature,frozen.publicModelId,frozen.binding):false;
  const ids:string[]=[],artifacts:import("./types").ImagegenResult["artifacts"]=[],images:{id:string;url:string;width:number;height:number;execution?:typeof checkpoint.images[number]["execution"]}[]=[];
  for(const [index,image] of checkpoint.images.entries()){
   let id=`art-${child.id}-${index}`;
   let existing=(await pool.query("SELECT email,deleted_at,image_url FROM app_artworks WHERE id=$1",[id])).rows[0];
   if(existing&&(existing.email!==owner||existing.deleted_at))throw Error("原结果已删除或无权恢复");
   const input=await readCanvasOutput(existing?existing.image_url:image.url,"http://internal",owner);
   let bytes=input.buffer;
   if(processingKnown)try{bytes=await finishStoredImage(bytes,{final:checkpoint.final,post,preset,resolution:p.resolution,targetWidth:p.targetWidth,targetHeight:p.targetHeight,transparent:p.transparent});}
   catch{warnings.add("图片已生成，附加尺寸处理未完成，已保留完整原图");}
   // Old partial recovery may have saved an unprocessed original. Keep that
   // artwork (including edits/coordinates) and create a deterministic derivative.
   if(existing&&!bytes.equals(input.buffer)){
    id+="-delivery";existing=(await pool.query("SELECT email,deleted_at,image_url FROM app_artworks WHERE id=$1",[id])).rows[0];
    if(existing&&(existing.email!==owner||existing.deleted_at))throw Error("原结果已删除或无权恢复");
    if(existing)bytes=(await readCanvasOutput(existing.image_url,"http://internal",owner)).buffer;
   }
   const pixels=await inspectImagegenPixels(bytes),meta=await sharp(bytes).metadata();
   if(!pixels.visiblePixels)throw Error("原结果没有可见图片内容");
   if(plan.intent.background==="transparent"&&!pixels.transparentPixels){complete=false;warnings.add("已保留生成图片，实际图片不是透明背景");}
   if(!processingKnown){complete=false;warnings.add("已保留原图，原处理配置缺失，未按当前配置改写");}
   const mime=meta.format==="jpeg"?"image/jpeg":`image/${meta.format}`,ext=meta.format==="jpeg"?"jpg":meta.format!;
   let url=existing?.image_url as string|undefined;
   if(!existing){
    const digest=createHash("sha256").update(bytes).digest("hex");url=await uploadImage(bytes,mime,`image-delivery-recovery/${child.id}/${digest}.${ext}`,undefined,owner);
    const parentIds=[p.parentId,plan.request.sourceNodeId,...(p.parentIds||[])].filter((v):v is string=>typeof v==="string"&&!!v);
    const parents=await listArtworksByIds(owner,[...new Set(parentIds)]),parentWork=parents[0];
    await addArtworks(owner,[{id,title:(p.userPrompt||plan.request.prompt||"生成图片").slice(0,32),category:p.category||"main",status:"completed",prompt:p.userPrompt||plan.request.prompt,image:url,gradient:"",source:child.snapshot.sourceUrl||undefined,origin:plan.request.entry,parentId:parentWork?.id,parentIds:parents.slice(1).map(a=>a.id),groupId:p.projectGroupId||parentWork?.groupId,ratio:`${pixels.width}:${pixels.height}`,width:pixels.width,height:pixels.height,creationProvenance:{version:1,operation:"generate",entry:plan.request.entry,ref:child.id,evidence:"stored-paid-checkpoint"}}],`b-${child.id}`);
   }
   ids.push(id);
   artifacts.push({artworkId:id,url:url!,mime,...pixels});images.push({id,url:url!,width:pixels.width,height:pixels.height,execution:image.execution});
  }
  if(!child.billing_settled){
   const result={state:"succeeded",items:ids.map((id,index)=>({id,state:"succeeded",executedQuality:checkpoint.images[index].execution?.quality||p.quality||"medium",platformFunded:checkpoint.images[index].execution?.platformFunded}))} as BillingResult;
   await settleImageJob(child.id,child.payload.billingQuote?result:Number(child.payload.cost||0)*ids.length/Math.max(1,Number(p.count||1)),"原生成结果交付恢复",null);
  }
  const chargedCredits=await getImageJobChargedCredits(child.id),recovery={ids,complete,recoveredAt:new Date().toISOString()};
  const billingConfirmed=(await pool.query("SELECT billing_settled FROM app_image_jobs WHERE id=$1",[child.id])).rows[0]?.billing_settled===true;
  const tx=await pool.connect();try{
   await tx.query("BEGIN");
   const lockedRows=await tx.query("SELECT id,lease_token,snapshot->>'status' status FROM app_image_jobs WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",[[parent.id,child.id]]);
   if(lockedRows.rowCount!==2||lockedRows.rows.some(r=>r.lease_token||!["done","error","needs_attention"].includes(r.status)))throw Error("原任务仍在收尾");
   await tx.query("UPDATE app_image_jobs SET snapshot=(snapshot-'error') || $3::jsonb,updated_at=now() WHERE id=$1 AND email=$2",[child.id,owner,JSON.stringify({deliveryRecovery:recovery,images,status:"done",creditsUsed:chargedCredits,persisted:true,...(warnings.size?{imagegenOutputWarning:[...warnings].join("；")}:{} )})]);
   const result={...parent.snapshot.result,status:complete?"succeeded":"partial",stage:"done",artifacts,chargedCredits,billingStatus:billingConfirmed?"confirmed":"unavailable",recoveryAvailable:false,warnings:[...warnings]};delete result.error;
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
 const pool=getPool();
 const rows=(await pool.query(`SELECT id,email FROM app_image_jobs WHERE kind='imagegen'
  AND snapshot->>'status' IN ('error','needs_attention') AND lease_token IS NULL
  AND created_at>now()-interval '7 days' AND updated_at<now()-interval '20 seconds'
  AND COALESCE((snapshot->>'deliveryRecoveryAttempts')::int,0)<5
  AND EXISTS(SELECT 1 FROM jsonb_each(COALESCE(snapshot->'children','{}'::jsonb)) edge
   JOIN app_image_jobs child ON child.id=edge.value->>'jobId' AND child.email=app_image_jobs.email
   WHERE child.kind='generate' AND child.lease_token IS NULL
    AND COALESCE((child.snapshot->>'deliveryAttempts')::int,0)>=3
    AND child.snapshot->>'status' IN ('error','needs_attention','done')
    AND (child.snapshot->'paidOperations' @? '$.* ? (@.state == "done")' OR jsonb_typeof(child.snapshot->'images')='array'))
  ${excludeImportedHistory("app_image_jobs")}
  ORDER BY updated_at,id LIMIT 8`)).rows;
 let completed=0;
 for(const row of rows){
  const state=await storedDeliveryState(row.id,row.email);if(!state?.available&&!state?.ids)continue;
  try{await recoverStoredDelivery(row.id,row.email);completed++;}
  catch{await pool.query(`UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{deliveryRecoveryAttempts}',to_jsonb(COALESCE((snapshot->>'deliveryRecoveryAttempts')::int,0)+1)),updated_at=now() WHERE id=$1 AND lease_token IS NULL AND snapshot->>'status' IN ('error','needs_attention')`,[row.id]);}
  if(completed>=2)break;
 }
 return completed;
}
