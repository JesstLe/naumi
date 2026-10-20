import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { dbEnabled,getPool,listArtworksByIds,addArtworks } from "../db";
import { uploadImage } from "../storage";
import { readCanvasOutput } from "../canvas-image-input";
import { inspectImagegenPixels } from "./postprocess";
import { storedDeliveryCheckpoint } from "./delivery-checkpoint";
import { plainGeneratedOutput } from "./receipt-policy";
import { settleImageJob } from "../image-job-repository";
import { assertMutableStagingTask } from "../staging-history";
import type { BillingResult } from "../billing/types";
import type { ImagegenPlan } from "./types";
import { selectedBusinessOption } from "../model-config/business";

async function deliverySource(parentId:string,owner:string){
 const parent=(await getPool().query("SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[parentId,owner.toLowerCase()])).rows[0];
 if(!parent||!["error","needs_attention"].includes(parent.snapshot.status))return null;
 const children=Object.values(parent.snapshot.children||{}) as {jobId?:string}[];
 if(children.length!==1||!children[0].jobId)return null;
 const child=(await getPool().query("SELECT * FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate'",[children[0].jobId,owner.toLowerCase()])).rows[0];
 return child&&["done","error","needs_attention"].includes(child.snapshot.status)?{parent,child}:null;
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
 owner=owner.toLowerCase();const pool=getPool(),lock=await pool.connect();let key="",locked=false;
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
  if(child.snapshot.deliveryRecovery?.ids?.length)return {ok:true,complete:child.snapshot.deliveryRecovery.complete===true};
  const checkpoint=storedDeliveryCheckpoint(child.snapshot);if(!checkpoint)throw Error("未找到完整的本地原始图片，不会重新生成");
  const plan=parent.payload.plan as ImagegenPlan,p=child.payload.p||{};
  const frozen=child.payload.modelExecutions?.image;
  const version=frozen?(await pool.query("SELECT config FROM app_model_config_versions WHERE version=$1 AND digest=$2",[frozen.modelVersion,frozen.modelDigest])).rows[0]:null;
  // Business options are not embedded in ExecutionModel. Consult the immutable
  // original version, never the active pointer or today's administrator policy.
  const post=version?selectedBusinessOption(version.config,frozen.feature,frozen.publicModelId)?.postprocess:undefined;
  const processingKnown=!frozen||!!version;
  const complete=plainGeneratedOutput(plan)&&checkpoint.allDone&&checkpoint.images.length===plan.request.variants&&
   !child.snapshot.imagegenOutputError&&(checkpoint.final||(processingKnown&&!post?.enabled&&!p.targetWidth&&!p.targetHeight&&(!p.resolution||p.resolution==="1K")));
  const ids:string[]=[];
  for(const [index,image] of checkpoint.images.entries()){
   const id=`art-${child.id}-${index}`;
   const existing=(await pool.query("SELECT email,deleted_at,image_url FROM app_artworks WHERE id=$1",[id])).rows[0];
   if(existing&&(existing.email!==owner||existing.deleted_at))throw Error("原结果已删除或无权恢复");
   const input=await readCanvasOutput(existing?existing.image_url:image.url,"http://internal",owner),pixels=await inspectImagegenPixels(input.buffer),meta=await sharp(input.buffer).metadata();
   if(plan.intent.background==="transparent"&&(!pixels.transparentPixels||!pixels.visiblePixels))throw Error("保存的原图没有有效透明主体，请核查原任务");
   if(!existing){
    const mime=meta.format==="jpeg"?"image/jpeg":`image/${meta.format}`,ext=meta.format==="jpeg"?"jpg":meta.format!;
    const digest=createHash("sha256").update(input.buffer).digest("hex"),url=await uploadImage(input.buffer,mime,`image-delivery-recovery/${child.id}/${digest}.${ext}`,undefined,owner);
    const parentWork=plan.request.sourceNodeId?(await listArtworksByIds(owner,[plan.request.sourceNodeId]))[0]:undefined;
    await addArtworks(owner,[{id,title:"恢复的生成图片",category:p.category||"main",status:"completed",prompt:plan.request.prompt,image:url,gradient:"",origin:plan.request.entry,parentId:parentWork?.id,groupId:parentWork?.groupId,ratio:`${pixels.width}:${pixels.height}`,width:pixels.width,height:pixels.height,creationProvenance:{version:1,operation:"generate",entry:plan.request.entry,ref:child.id,evidence:"stored-paid-checkpoint"}}]);
   }
   ids.push(id);
  }
  if(complete&&!child.billing_settled){
   const result={state:"succeeded",items:ids.map((id,index)=>({id,state:"succeeded",executedQuality:checkpoint.images[index].execution?.quality||p.quality||"medium",platformFunded:checkpoint.images[index].execution?.platformFunded}))} as BillingResult;
   await settleImageJob(child.id,child.payload.billingQuote?result:Number(child.payload.cost||0)*ids.length/Math.max(1,Number(p.count||1)),"原生成结果交付恢复",null);
  }
  const recovery={ids,complete,recoveredAt:new Date().toISOString()};
  const updated=await pool.query("UPDATE app_image_jobs SET snapshot=snapshot || jsonb_build_object('deliveryRecovery',$3::jsonb),updated_at=now() WHERE id=$1 AND email=$2 AND kind='generate' AND lease_token IS NULL AND snapshot->>'status' IN ('done','error','needs_attention')",[child.id,owner,JSON.stringify(recovery)]);
  if(!updated.rowCount)throw Error("原任务状态已变化，请重新检查");
  return {ok:true,complete,artworkIds:ids};
 }finally{if(locked)await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[key]);lock.release();}
}
