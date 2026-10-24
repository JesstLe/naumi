import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {createHash} from "node:crypto";

export async function deleteCanvasNodesAtomically(
  emailRaw: string,
  artworkIds: string[],
  textIds: string[],
  videoIds:string[]=[],
  operationId?:string
): Promise<{ artworks: number; textNodes: number;videoNodes:number }> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const cleanArtworkIds = Array.from(new Set(artworkIds.filter(Boolean)));
  const cleanTextIds = Array.from(new Set(textIds.filter(Boolean)));
  const cleanVideoIds=Array.from(new Set(videoIds.filter(Boolean)));
  if([cleanArtworkIds,cleanTextIds,cleanVideoIds].some(ids=>ids.length>200))throw new Error("单次删除节点过多");
  if(cleanVideoIds.length)await (await import("./video-node-repository")).ensureVideoNodeSchema();
  const fingerprint=createHash("sha256").update(JSON.stringify({delete:{artworkIds:[...cleanArtworkIds].sort(),textIds:[...cleanTextIds].sort(),videoIds:[...cleanVideoIds].sort()}})).digest("hex");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    if(operationId){const saved=(await client.query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2",[email,operationId])).rows[0];
      if(saved){if(saved.fingerprint!==fingerprint)throw new Error("操作编号已使用");await client.query("COMMIT");return {artworks:cleanArtworkIds.length,textNodes:cleanTextIds.length,videoNodes:cleanVideoIds.length};}}
    if(cleanVideoIds.length)await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${email}`]);
    for(const [table,ids] of [["app_artworks",cleanArtworkIds],["app_canvas_text_nodes",cleanTextIds],["app_canvas_video_nodes",cleanVideoIds]] as const){
      if(ids.length&&(await client.query(`SELECT id FROM ${table} WHERE email=$1 AND id=ANY($2::text[]) FOR UPDATE`,[email,ids])).rowCount!==ids.length)throw new Error("节点不存在或无权修改");
    }
    let artworks = 0;
    let textNodes = 0;
    if(cleanVideoIds.length)await client.query("UPDATE app_canvas_video_nodes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,cleanVideoIds]);
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
    await client.query("COMMIT");
    return { artworks:operationId?cleanArtworkIds.length:artworks, textNodes:operationId?cleanTextIds.length:textNodes,videoNodes:cleanVideoIds.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
