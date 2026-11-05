import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {withTransaction} from "@/platform/db/transaction";
import {rowToArtwork} from "../artworks/row";
import {assertCreationProjectInput} from "../saas/creation-access";
import {editCanvasPixels} from "../canvas-local-image-edit";
import {uploadImage} from "../media-upload";
import {deleteImageByUrl} from "../object-storage/runtime";
import {ensureWorkflowImportSchema} from "./storage-schema";

const validate=(id:string,operationId:string)=>{z.uuid().parse(operationId);z.string().min(1).max(200).parse(id);};
async function ownedNodeTx(tx:PoolClient,email:string,id:string){
  const row=(await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",[email,id])).rows[0];
  if(!row)throw new Error("待补图片不存在或无权访问");
  const project=row.batch_id?`batch:${row.batch_id}`:`tree:${row.group_id||row.id}`;
  await assertCreationProjectInput(email,project,tx,true);return row;
}
async function receiptTx(tx:PoolClient,email:string,id:string,operationId:string,fingerprint?:string){
  const prior=(await tx.query("SELECT fingerprint,node_id,before_asset,after_asset FROM app_canvas_workflow_asset_ops WHERE email=$1 AND id=$2",[email,operationId])).rows[0];
  if(!prior)return null;
  if(prior.node_id!==id||fingerprint&&prior.fingerprint!==fingerprint)throw new Error("补图编号已使用");
  const row=await ownedNodeTx(tx,email,id),node=rowToArtwork(row);
  // Read current layout/content on replays. History swaps only the persisted
  // pixel pair and never substitutes a stale full-node snapshot.
  return {node,assetOperationId:operationId,beforeAsset:prior.before_asset,afterAsset:prior.after_asset};
}
async function checkPlaceholderTx(tx:PoolClient,email:string,id:string){
  const row=await ownedNodeTx(tx,email,id);
  if(row.source_url!=="workflow-placeholder")throw new Error("待补图片不存在或无权访问");
  const locked=await tx.query("SELECT settings->>'locked' AS locked FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2 FOR SHARE",[email,id]);
  if(locked.rows[0]?.locked==="true")throw new Error("请先解锁节点");return row;
}
export async function readWorkflowAssetFill(emailRaw:string,id:string,operationId:string){
  validate(id,operationId);await ensureWorkflowImportSchema();const email=emailRaw.toLowerCase();
  return withTransaction(getPool(),async tx=>{await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);return receiptTx(tx,email,id,operationId);});
}
/** Exact original operation and pixel pair; no paid work. Decode/upload owns no
 * database connection. Publication rechecks placeholder, scope and live lock,
 * uses an attempt-unique media key, and atomically persists row plus receipt. */
export async function fillWorkflowAsset(emailRaw:string,id:string,operationId:string,bytes:Buffer,options:{prepare?:typeof editCanvasPixels}={}){
  validate(id,operationId);await ensureWorkflowImportSchema();const email=emailRaw.toLowerCase();
  const fingerprint=createHash("sha256").update(id).update(bytes).digest("hex");
  const prior=await withTransaction(getPool(),async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    const saved=await receiptTx(tx,email,id,operationId,fingerprint);if(saved)return saved;
    await checkPlaceholderTx(tx,email,id);return null;
  });
  if(prior)return prior;
  const pixels=await (options.prepare||editCanvasPixels)(bytes);
  if(pixels.bytes.length>12*1024*1024)throw new Error("图片超过12MB");
  const uploaded=await uploadImage(pixels.bytes,"image/png",`canvas-import-fills/${operationId}/${randomUUID()}/${id}.png`);
  let keep=false;
  try{return await withTransaction(getPool(),async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    const winner=await receiptTx(tx,email,id,operationId,fingerprint);if(winner)return winner;
    const row=await checkPlaceholderTx(tx,email,id);
    const origin=await tx.query("SELECT result->'manifest'->'decorations' AS decorations FROM app_canvas_workflow_imports WHERE email=$1 AND operation_id=$2",[email,row.creation_provenance.ref]);
    const decoration=(origin.rows[0]?.decorations||[]).some((d:{id:string})=>d.id===id);
    const before={image:row.image_url,source:row.source_url,width:row.image_width,height:row.image_height};
    const after={image:uploaded,source:decoration?"workflow-decoration":"workflow-import",width:pixels.width,height:pixels.height};
    await tx.query("UPDATE app_artworks SET image_url=$3,source_url=$4,image_width=$5,image_height=$6 WHERE email=$1 AND id=$2",[email,id,after.image,after.source,after.width,after.height]);
    await tx.query("INSERT INTO app_canvas_workflow_asset_ops(email,id,node_id,fingerprint,before_asset,after_asset) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",[email,operationId,id,fingerprint,JSON.stringify(before),JSON.stringify(after)]);
    const result=(await receiptTx(tx,email,id,operationId,fingerprint))!;
    keep=true;return result;
  });}finally{
    // keep includes a possibly committed-but-unacknowledged publication. Only
    // a definite losing/prepublication attempt cleans its own unique object.
    if(!keep)await deleteImageByUrl(uploaded).catch(()=>console.warn("STORAGE_CLEANUP_PENDING operation=workflow-fill"));
  }
}
