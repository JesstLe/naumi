import {readCanvasArtworkReceiptTx} from "./artwork-write-repository";
import {assertCanvasArtworkVersion,type CanvasArtworkFields,type CanvasArtworkReceipt} from "./artwork-write";
import "server-only";
import {assertCanvasTextVersion} from "./text-write";
import {mapCanvasTextNode,type CanvasTextNodeRecord} from "./text-node-repository";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {createHash} from "node:crypto";

export async function deleteCanvasNodesAtomically(
  emailRaw: string,
  artworkIds: string[],
  textIds: string[],
  videoIds:string[]=[],
  operationId?:string,
  expectedTexts?:CanvasTextNodeRecord[],
  expectedArtworks?:Array<{id:string;fields:CanvasArtworkFields}>,
  directorIds:string[]=[]
): Promise<{ artworks: number; textNodes: number;videoNodes:number;directorNodes?:number;artworkNodes?:CanvasArtworkReceipt[];artworkIds?:string[] }> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const cleanArtworkIds = Array.from(new Set(artworkIds.filter(Boolean)));
  const cleanTextIds = Array.from(new Set(textIds.filter(Boolean)));
  const cleanVideoIds=Array.from(new Set(videoIds.filter(Boolean)));
  const cleanDirectorIds=Array.from(new Set(directorIds.filter(Boolean)));
  if(cleanDirectorIds.length)await (await import("./storage-schema")).ensureDirectorNodeSchema();
  if([cleanArtworkIds,cleanTextIds,cleanVideoIds,cleanDirectorIds].some(ids=>ids.length>200))throw new Error("单次删除节点过多");
  if(cleanVideoIds.length)await (await import("./storage-schema")).ensureVideoNodeSchema();
  if(expectedTexts&&(expectedTexts.length!==cleanTextIds.length||new Set(expectedTexts.map(n=>n.id)).size!==cleanTextIds.length||expectedTexts.some(n=>!cleanTextIds.includes(n.id))))throw new Error("文字删除基线无效");
  if(expectedArtworks&&(expectedArtworks.length!==cleanArtworkIds.length||new Set(expectedArtworks.map(n=>n.id)).size!==cleanArtworkIds.length||expectedArtworks.some(n=>!cleanArtworkIds.includes(n.id))))throw new Error("图片删除基线无效");
  const fingerprint=createHash("sha256").update(JSON.stringify({delete:{artworkIds:[...cleanArtworkIds].sort(),textIds:[...cleanTextIds].sort(),videoIds:[...cleanVideoIds].sort(),...(cleanDirectorIds.length?{directorIds:[...cleanDirectorIds].sort()}:{}),...(expectedTexts?{expectedTexts}:{} ),...(expectedArtworks?{expectedArtworks}:{})}})).digest("hex");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    if(operationId){const saved=(await client.query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2",[email,operationId])).rows[0];
      if(saved){if(saved.fingerprint!==fingerprint)throw new Error("操作编号已使用");const artworkNodes=await readCanvasArtworkReceiptTx(client,email,cleanArtworkIds);await client.query("COMMIT");return {artworks:cleanArtworkIds.length,textNodes:cleanTextIds.length,videoNodes:cleanVideoIds.length,...(cleanDirectorIds.length?{directorNodes:cleanDirectorIds.length}:{}),artworkNodes,artworkIds:cleanArtworkIds};}}
    if(cleanVideoIds.length||cleanDirectorIds.length)await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${email}`]);
    for(const [table,ids] of [["app_artworks",cleanArtworkIds],["app_canvas_text_nodes",cleanTextIds],["app_canvas_video_nodes",cleanVideoIds],["app_canvas_director_nodes",cleanDirectorIds]] as const){
      if(ids.length){const result=await client.query(`SELECT * FROM ${table} WHERE email=$1 AND id=ANY($2::text[]) FOR UPDATE`,[email,ids]);if(result.rowCount!==ids.length)throw new Error("节点不存在或无权修改");
        if(table==="app_canvas_text_nodes"&&expectedTexts)for(const expected of expectedTexts)assertCanvasTextVersion(expected.id,mapCanvasTextNode(result.rows.find(row=>row.id===expected.id)),expected);
      }
    }
    if(expectedArtworks){const rows=await readCanvasArtworkReceiptTx(client,email,cleanArtworkIds);for(const expected of expectedArtworks)assertCanvasArtworkVersion(expected.id,rows.find(r=>r.node.id===expected.id)||null,expected.fields);}
    let artworks = 0;
    let textNodes = 0;
    if(cleanVideoIds.length)await client.query("UPDATE app_canvas_video_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,cleanVideoIds]);
    if(cleanDirectorIds.length)await client.query("UPDATE app_canvas_director_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,cleanDirectorIds]);
    if (cleanArtworkIds.length) {
      const result = await client.query(
        `UPDATE app_artworks SET deleted_at = now()
           WHERE email = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL`,
        [email, cleanArtworkIds]
      );
      artworks = result.rowCount ?? 0;
    }
    if (cleanTextIds.length) {
      const result = await client.query(
        `DELETE FROM app_canvas_text_nodes
          WHERE email = $1 AND id = ANY($2::text[])`,
        [email, cleanTextIds]
      );
      textNodes = result.rowCount ?? 0;
    }
    if(operationId)await client.query("INSERT INTO app_canvas_history_ops(id,email,fingerprint) VALUES($1,$2,$3)",[operationId,email,fingerprint]);
    const artworkNodes=await readCanvasArtworkReceiptTx(client,email,cleanArtworkIds);await client.query("COMMIT");
    return {artworkNodes,artworkIds:cleanArtworkIds, artworks:operationId?cleanArtworkIds.length:artworks, textNodes:operationId?cleanTextIds.length:textNodes,videoNodes:cleanVideoIds.length,...(cleanDirectorIds.length?{directorNodes:cleanDirectorIds.length}:{}) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
