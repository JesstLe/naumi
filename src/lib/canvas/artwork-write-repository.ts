import "server-only";
import type {Artwork} from "../mock-data";
import type {PoolClient} from "pg";
import {rowToArtwork} from "../artworks/row";
import {getPool} from "@/platform/db/pool";
import {withTransaction} from "@/platform/db/transaction";
import {ensureSchema} from "../persistence/schema";
import {assertCanvasArtworkVersion,mergeCanvasArtworkWrite,CanvasArtworkWriteConflict,type CanvasArtworkFields,type CanvasArtworkReceipt} from "./artwork-write";
/** Same existing owner lock/transaction as history. No independent task/receipt store. */
export async function writeCanvasArtworkTx(tx:PoolClient,email:string,id:string,desired:Partial<CanvasArtworkFields>,base?:Partial<CanvasArtworkFields>,allowHidden=false,initializePosition=false){
 const row=(await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 FOR UPDATE",[email,id])).rows[0];
 const current:CanvasArtworkReceipt|null=row?{node:rowToArtwork(row) as Artwork,visible:!row.deleted_at}:null;
 if(!current)throw new CanvasArtworkWriteConflict(id,["deleted"],null);
 if(!current.visible&&desired.visible!==true&&!allowHidden)throw new CanvasArtworkWriteConflict(id,["visible"],current);
 if(desired.visible===false&&base)assertCanvasArtworkVersion(id,current,base);
 if(initializePosition&&(current.node.canvasX!=null||current.node.canvasY!=null))return current;
 const next=mergeCanvasArtworkWrite(id,current,desired,base);
 if(next.canvasGroupId&&Object.hasOwn(desired,"canvasGroupId")){
  // A NULL group_id names this standalone root, not a shared NULL project.
  const other=await tx.query("SELECT 1 FROM app_artworks WHERE email=$1 AND canvas_group_id=$2 AND COALESCE(NULLIF(group_id,''),id) IS DISTINCT FROM $3 AND deleted_at IS NULL",[email,next.canvasGroupId,row.group_id||row.id]);if(other.rows.length)throw new Error("不能跨项目成组");
 }
 const result=(await tx.query(`UPDATE app_artworks SET title=$3,canvas_x=$4,canvas_y=$5,canvas_width=$6,canvas_height=$7,marked=$8,canvas_group_id=$9,deleted_at=CASE WHEN $10 THEN NULL ELSE COALESCE(deleted_at,now()) END WHERE email=$1 AND id=$2 RETURNING *`,[email,id,next.title,next.canvasX,next.canvasY,next.canvasWidth,next.canvasHeight,next.marked,next.canvasGroupId,next.visible])).rows[0];
 return {node:rowToArtwork(result) as Artwork,visible:!result.deleted_at};
}
/** Entry for original metadata endpoints and internal placement. History already
 * owns this same account lock/transaction and calls writeCanvasArtworkTx above.
 * No extra history record, task identity or replay policy is introduced here. */
export async function writeCanvasArtworks(emailRaw:string,writes:readonly {id:string;fields:Partial<CanvasArtworkFields>;base?:Partial<CanvasArtworkFields>;allowHidden?:boolean;initializePosition?:boolean}[]){
 await ensureSchema();const email=emailRaw.toLowerCase();
 return withTransaction(getPool(),async tx=>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
  // A legacy group request validates its whole original assignment before any
  // row changes, including a group being removed earlier in that same batch.
  const groups=writes.filter(w=>w.fields.canvasGroupId);
  if(groups.length){
   const rows=(await tx.query("SELECT id,group_id,canvas_group_id FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND (id=ANY($2::text[]) OR canvas_group_id=ANY($3::text[])) FOR UPDATE",[email,groups.map(w=>w.id),groups.map(w=>w.fields.canvasGroupId)])).rows;
   const projects=new Map<string,string>();
   for(const write of groups){
    const row=rows.find(r=>r.id===write.id);if(!row)throw new CanvasArtworkWriteConflict(write.id,["deleted"],null);
    const project=row.group_id||row.id,group=write.fields.canvasGroupId!;
    if(projects.has(group)&&projects.get(group)!==project||rows.some(r=>r.canvas_group_id===group&&(r.group_id||r.id)!==project))throw new Error("不能跨项目成组");
    projects.set(group,project);
   }
  }
  const result:CanvasArtworkReceipt[]=[];
  for(const write of writes)result.push(await writeCanvasArtworkTx(tx,email,write.id,write.fields,write.base,write.allowHidden,write.initializePosition));
  return result;
 });
}
export async function readCanvasArtworkReceiptTx(tx:PoolClient,email:string,ids:string[]):Promise<CanvasArtworkReceipt[]>{
 return ids.length?(await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=ANY($2::text[])",[email,ids])).rows.map(row=>({node:rowToArtwork(row) as Artwork,visible:!row.deleted_at})):[];
}
