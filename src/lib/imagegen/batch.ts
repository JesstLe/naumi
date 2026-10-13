import "server-only";
import {randomUUID} from "node:crypto";
import {getPool} from "../db";
import {imagegenRequestSchema} from "./schema";
import {planImagegen,imagegenFingerprint} from "./plan";
import {submitAcceptedImagegen,getImagegenResult} from "./dispatch";
import {imagegenStepId} from "./generation-core";
import {ensureImagegenBatches,imagegenBatchRow,imagegenBatchItems,type ImagegenBatchItem} from "./batch-repository";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";
import {userFeaturePolicy,FeatureAccessError} from "../feature-access/server";
import {allows} from "../feature-access/catalog";
const terminals=new Set(["succeeded","failed","cancelled","needs_attention"]);
type Confirmation={billingVersion:number;credits:number;confirmed:boolean;modelVersion?:number};
function childRequest(request:ImagegenRequest,key:string,prompt:string,attempt=1):ImagegenRequest{
 const {batch,...base}=request;return {...base,operationId:imagegenStepId(request.operationId,`batch:${key}:${attempt}`),prompt,mode:request.chroma?"postprocess":request.inputs.some(i=>i.role==="edit-target")?"edit":"generate"};
}
async function prepare(raw:ImagegenRequest,owner:string,initialVersions?:{modelVersion:number;billingVersion:number}){
 const request=imagegenRequestSchema.parse(raw);if(request.mode!=="batch"||!request.batch)throw new Error("需要独立提示词批次");
 if(!allows(await userFeaturePolicy(owner),"batchshot"))throw new FeatureAccessError("批次生图功能尚未授权");
 const children:{key:string;request:ImagegenRequest;plan:ImagegenPlan}[]=[];
 let versions=initialVersions;
 for(const item of request.batch.items){const child=childRequest(request,item.key,item.prompt),plan=await planImagegen(child,owner,versions);if(plan.modelVersion)versions={modelVersion:plan.modelVersion,billingVersion:plan.billingVersion};children.push({key:item.key,request:child,plan});}
 const first=children[0].plan;
 const plan:ImagegenPlan={...first,request,fingerprint:imagegenFingerprint(request),steps:children.flatMap(c=>c.plan.steps.map(s=>({...s,key:`${c.key}:${s.key}`}))),totalCredits:children.reduce((n,c)=>n+c.plan.totalCredits,0),confirmationRequired:children.some(c=>c.plan.confirmationRequired)||children.reduce((n,c)=>n+c.plan.totalCredits,0)>=100,warnings:Array.from(new Set(children.flatMap(c=>c.plan.warnings))),children:children.map(c=>({key:c.key,plan:c.plan}))};
 return {request,plan,children};
}
export async function planImagegenBatch(request:ImagegenRequest,owner:string,versions?:{modelVersion:number;billingVersion:number}){return (await prepare(request,owner,versions)).plan;}
export async function submitImagegenBatch(raw:ImagegenRequest,owner:string,confirmation?:Confirmation){
 const request=imagegenRequestSchema.parse(raw),fingerprint=imagegenFingerprint(request);
 await ensureImagegenBatches();const previous=await imagegenBatchRow(request.operationId);
 if(previous){if(previous.owner!==owner.toLowerCase()||previous.fingerprint!==fingerprint)throw new Error("批次编号已用于不同请求");return {id:previous.id,children:(await imagegenBatchItems(previous.id)).map(i=>i.child_operation_id)};}
 const prepared=await prepare(request,owner),plan=prepared.plan;
 if(plan.totalCredits>0&&(!confirmation||confirmation.confirmed!==true||confirmation.credits!==plan.totalCredits||confirmation.billingVersion!==plan.billingVersion||(confirmation.modelVersion!==undefined&&confirmation.modelVersion!==plan.modelVersion)))throw new Error("请确认批次最新报价后提交");
 return submitAcceptedImagegenBatch(plan,owner);
}
/** Only server-owned frozen plans; HTTP accepts requests and confirmation, never this structure. */
export async function submitAcceptedImagegenBatch(plan:ImagegenPlan,owner:string){
 const request=imagegenRequestSchema.parse(plan.request),fingerprint=imagegenFingerprint(request);if(request.mode!=="batch"||!request.batch||plan.children?.length!==request.batch.items.length)throw new Error("批次冻结计划缺少子项");
 await ensureImagegenBatches();const children=plan.children.map((c,i)=>{if(c.key!==request.batch!.items[i].key||c.plan.request.prompt!==request.batch!.items[i].prompt)throw new Error("批次冻结子项与原要求不一致");const child={...c.plan.request,operationId:imagegenStepId(request.operationId,`batch:${c.key}:1`)};return {key:c.key,request:child,plan:{...c.plan,request:child,fingerprint:imagegenFingerprint(child)}};});
 const frozen={...plan,request,fingerprint,children:children.map(c=>({key:c.key,plan:c.plan}))};
 const tx=await getPool().connect();
 try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`imagegen-batch:${request.operationId}`]);
  const prior=(await tx.query("SELECT owner,fingerprint FROM app_imagegen_batches WHERE id=$1",[request.operationId])).rows[0];
  if(prior){if(prior.owner!==owner.toLowerCase()||prior.fingerprint!==fingerprint)throw new Error("批次编号冲突");}
  else{
   await tx.query("INSERT INTO app_imagegen_batches(id,owner,fingerprint,request,plan) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)",[request.operationId,owner.toLowerCase(),fingerprint,JSON.stringify(request),JSON.stringify(frozen)]);
   for(const [ordinal,c] of children.entries())await tx.query("INSERT INTO app_imagegen_batch_items(batch_id,key,ordinal,child_operation_id,request,plan) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",[request.operationId,c.key,ordinal,c.request.operationId,JSON.stringify(c.request),JSON.stringify(c.plan)]);
  }
  await tx.query("COMMIT");
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
 return {id:request.operationId,children:children.map(c=>c.request.operationId)};
}
/** Parent row lock is held through durable child receipt creation: cancel and submit have one order. */
async function submitNext(id:string){
 const tx=await getPool().connect();
 try{await tx.query("BEGIN");const batch=(await tx.query("SELECT * FROM app_imagegen_batches WHERE id=$1 FOR UPDATE SKIP LOCKED",[id])).rows[0];
  if(!batch||batch.state!=="running"){await tx.query("COMMIT");return false;}
  const limit=Math.min(batch.request.batch.concurrency,5,Math.max(1,Number(process.env.GEN_MAX_CONCURRENT)||4));
  const active=(await tx.query("SELECT count(*)::int AS n FROM app_imagegen_batch_items WHERE batch_id=$1 AND state='submitted'",[id])).rows[0].n;
  if(active>=limit){await tx.query("COMMIT");return false;}
  const item=(await tx.query<ImagegenBatchItem>("SELECT * FROM app_imagegen_batch_items WHERE batch_id=$1 AND state='queued' ORDER BY ordinal FOR UPDATE SKIP LOCKED LIMIT 1",[id])).rows[0];
  if(!item){await tx.query("COMMIT");return false;}
  const result=await submitAcceptedImagegen(item.plan,batch.owner,item.plan.fingerprint);
  await tx.query("UPDATE app_imagegen_batch_items SET state='submitted',result=$3::jsonb,lease_token=$4,lease_until=now()+interval '120 seconds',updated_at=now() WHERE batch_id=$1 AND key=$2",[id,item.key,JSON.stringify(result),randomUUID()]);
  await tx.query("COMMIT");return true;
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function runImagegenBatchTick(id:string){
 const batch=await imagegenBatchRow(id);if(!batch||!["running","cancelling"].includes(batch.state))return;
 for(const item of await imagegenBatchItems(id))if(item.state==="submitted"){
  const result=await getImagegenResult(item.child_operation_id,batch.owner);if(!result)continue;
  const tx=await getPool().connect();
  try{await tx.query("BEGIN");const current=(await tx.query("SELECT state FROM app_imagegen_batches WHERE id=$1 FOR UPDATE",[id])).rows[0];
   const locked=(await tx.query<ImagegenBatchItem>("SELECT * FROM app_imagegen_batch_items WHERE batch_id=$1 AND key=$2 FOR UPDATE",[id,item.key])).rows[0];
   if(!locked||locked.state!=="submitted"){await tx.query("COMMIT");continue;}
   const retry=result.status==="failed"&&result.error?.code==="NOT_ACCEPTED"&&result.chargedCredits===0&&!result.artifacts.length&&locked.attempts<batch.request.batch!.maxAttempts&&current.state==="running";
   if(retry){const attempt=locked.attempts+1,request={...locked.plan.request,operationId:imagegenStepId(batch.id,`batch:${item.key}:${attempt}`)},plan={...locked.plan,request,fingerprint:imagegenFingerprint(request)};
    await tx.query("UPDATE app_imagegen_batch_items SET state='queued',attempts=$3,child_operation_id=$4,request=$5::jsonb,plan=$6::jsonb,result=$7::jsonb,lease_token=NULL,lease_until=NULL WHERE batch_id=$1 AND key=$2",[id,item.key,attempt,request.operationId,JSON.stringify(request),JSON.stringify(plan),JSON.stringify(result)]);
   }else{await tx.query("UPDATE app_imagegen_batch_items SET state=$3,result=$4::jsonb,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE batch_id=$1 AND key=$2",[id,item.key,terminals.has(result.status)?result.status:"submitted",JSON.stringify(result)]);
    if(result.status==="failed"&&batch.request.batch!.failFast&&current.state==="running"){
     await tx.query("UPDATE app_imagegen_batch_items SET state='submitted' WHERE batch_id=$1 AND state='queued' AND EXISTS(SELECT 1 FROM app_image_jobs j WHERE j.id='imagegen-'||child_operation_id::text)",[id]);
     await tx.query("UPDATE app_imagegen_batches SET state='cancelling',updated_at=now() WHERE id=$1",[id]);await tx.query("UPDATE app_imagegen_batch_items SET state='cancelled' WHERE batch_id=$1 AND state='queued' AND NOT EXISTS(SELECT 1 FROM app_image_jobs j WHERE j.id='imagegen-'||child_operation_id::text)",[id]);
    }
   }
   await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
 }
 for(let i=0;i<5;i++)if(!await submitNext(id))break;
 const tx=await getPool().connect();
 try{await tx.query("BEGIN");const row=(await tx.query("SELECT state FROM app_imagegen_batches WHERE id=$1 FOR UPDATE",[id])).rows[0],items=await tx.query("SELECT state FROM app_imagegen_batch_items WHERE batch_id=$1",[id]);
  if(row&&items.rows.every(i=>terminals.has(i.state))){const states=items.rows.map(i=>i.state);const status=states.every(s=>s==="succeeded")?"succeeded":states.includes("needs_attention")?"needs_attention":states.includes("succeeded")?"partial":row.state==="cancelling"?"cancelled":"failed";await tx.query("UPDATE app_imagegen_batches SET state=$2,updated_at=now() WHERE id=$1",[id,status]);}
  await tx.query("COMMIT");
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function readImagegenBatch(id:string,owner:string){
 const batch=await imagegenBatchRow(id,owner);if(!batch)return null;
 const rows=await imagegenBatchItems(id);
 return {id,status:batch.state,totalCredits:batch.plan.totalCredits,chargedCredits:rows.reduce((n,i)=>n+(i.result?.chargedCredits||0),0),items:rows.map(i=>({key:i.key,state:i.state,prompt:i.request.prompt,name:batch.request.batch!.items.find(r=>r.key===i.key)!.name,attempts:i.attempts,result:i.result||{operationId:i.child_operation_id,jobId:`imagegen-${i.child_operation_id}`,status:i.state==="cancelled"?"cancelled":"queued",stage:"planning",artifacts:[],chargedCredits:0} as ImagegenResult}))};
}
export async function cancelImagegenBatch(id:string,owner:string){
 await ensureImagegenBatches();const tx=await getPool().connect();
 try{await tx.query("BEGIN");const row=(await tx.query("SELECT state FROM app_imagegen_batches WHERE id=$1 AND owner=$2 FOR UPDATE",[id,owner.toLowerCase()])).rows[0];if(!row)throw new Error("批次不存在或无权访问");
  if(row.state==="running"){
   // A crash may leave a child receipt committed while its association rolled back.
   await tx.query("UPDATE app_imagegen_batch_items SET state='submitted' WHERE batch_id=$1 AND state='queued' AND EXISTS(SELECT 1 FROM app_image_jobs j WHERE j.id='imagegen-'||child_operation_id::text)",[id]);
   await tx.query("UPDATE app_imagegen_batches SET state='cancelling',updated_at=now() WHERE id=$1",[id]);await tx.query("UPDATE app_imagegen_batch_items SET state='cancelled',updated_at=now() WHERE batch_id=$1 AND state='queued'",[id]);
  }await tx.query("COMMIT");
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function recoverImagegenBatches(){
 await ensureImagegenBatches();const ids=(await getPool().query("SELECT id FROM app_imagegen_batches WHERE state IN ('running','cancelling') ORDER BY updated_at LIMIT 20")).rows;
 const origin=process.env.INTERNAL_APP_ORIGIN||"http://127.0.0.1:3000";let count=0;
 for(const row of ids){const response=await fetch(`${origin}/api/imagegen/batches/${row.id}`,{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET||""},body:JSON.stringify({action:"tick"}),signal:AbortSignal.timeout(10000)});if(response.ok)count++;}return count;
}
