import "server-only";
import type {Artwork} from "../mock-data";
import type {PoolClient} from "pg";
import {rowToArtwork} from "../artworks/repository";
import {assertCanvasArtworkVersion,mergeCanvasArtworkWrite,CanvasArtworkWriteConflict,type CanvasArtworkFields,type CanvasArtworkReceipt} from "./artwork-write";
/** Same existing owner lock/transaction as history. No independent task/receipt store. */
export async function writeCanvasArtworkTx(tx:PoolClient,email:string,id:string,desired:Partial<CanvasArtworkFields>,base?:Partial<CanvasArtworkFields>){
 const row=(await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 FOR UPDATE",[email,id])).rows[0];
 const current:CanvasArtworkReceipt|null=row?{node:rowToArtwork(row) as Artwork,visible:!row.deleted_at}:null;
 if(!current)throw new CanvasArtworkWriteConflict(id,["deleted"],null);
 if(!current.visible&&desired.visible!==true)throw new CanvasArtworkWriteConflict(id,["visible"],current);
 if(desired.visible===false&&base)assertCanvasArtworkVersion(id,current,base);
 const next=mergeCanvasArtworkWrite(id,current,desired,base);
 if(next.canvasGroupId&&Object.hasOwn(desired,"canvasGroupId")){
  const other=await tx.query("SELECT 1 FROM app_artworks WHERE email=$1 AND canvas_group_id=$2 AND group_id IS DISTINCT FROM $3 AND deleted_at IS NULL",[email,next.canvasGroupId,row.group_id]);if(other.rows.length)throw new Error("不能跨项目成组");
 }
 const result=(await tx.query(`UPDATE app_artworks SET title=$3,canvas_x=$4,canvas_y=$5,canvas_width=$6,canvas_height=$7,marked=$8,canvas_group_id=$9,deleted_at=CASE WHEN $10 THEN NULL ELSE COALESCE(deleted_at,now()) END WHERE email=$1 AND id=$2 RETURNING *`,[email,id,next.title,next.canvasX,next.canvasY,next.canvasWidth,next.canvasHeight,next.marked,next.canvasGroupId,next.visible])).rows[0];
 return {node:rowToArtwork(result) as Artwork,visible:!result.deleted_at};
}
export async function readCanvasArtworkReceiptTx(tx:PoolClient,email:string,ids:string[]):Promise<CanvasArtworkReceipt[]>{
 return ids.length?(await tx.query("SELECT * FROM app_artworks WHERE email=$1 AND id=ANY($2::text[])",[email,ids])).rows.map(row=>({node:rowToArtwork(row) as Artwork,visible:!row.deleted_at})):[];
}
