import "server-only";
import type { PoolClient } from "pg";

/** Canvas-owned explicit insert. Deliberately NOT SELECT * or jsonb_populate_record: new runtime columns never cross owners. */
export async function insertSharedArtworkTx(tx: PoolClient, owner: string, id: string, projectKey: string, data: Record<string, any>) {
  await tx.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,video_url,gradient,style,ratio,resolution,
    parent_id,parent_ids,group_id,canvas_group_id,origin,canvas_x,canvas_y,canvas_width,canvas_height,image_width,image_height,canvas_image_version,canvas_image_revision,source_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,'canvas',$17,$18,$19,$20,$21,$22,$23::jsonb,0,$24)`,
  [id, owner, data.title, data.category, data.prompt || "", data.status, data.image_url || "", data.video_url, data.gradient || "", data.style, data.ratio, data.resolution,
    data.parent_id, JSON.stringify(data.parent_ids), projectKey.slice(5), data.canvas_group_id, data.canvas_x, data.canvas_y, data.canvas_width, data.canvas_height, data.image_width, data.image_height, data.canvas_image_version ? JSON.stringify(data.canvas_image_version) : null, data.source_marker || null]);
}
export async function insertSharedTextTx(tx: PoolClient, owner: string, id: string, projectKey: string, data: Record<string, any>) {
  await tx.query(`INSERT INTO app_canvas_text_nodes(id,email,project_key,title,prompt,content,status,canvas_x,canvas_y,canvas_width,canvas_height,source_ids,target_ids,product_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb)`,
  [id, owner, projectKey, data.title, data.prompt || "", data.content || "", data.status, data.canvas_x, data.canvas_y, data.canvas_width, data.canvas_height,
    JSON.stringify(data.source_ids), JSON.stringify(data.target_ids), JSON.stringify(data.product_ids)]);
}
