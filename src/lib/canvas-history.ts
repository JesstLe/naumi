import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { nodeSettingsSchema } from "@/lib/canvas/node-settings";
import { ensureCanvasSettingsSchema } from "@/lib/canvas-node-settings-store";

const id = z.string().min(1).max(200);
const coordinate = z.number().finite().min(-1e7).max(1e7);
const textFields = z.object({
  title: z.string().max(80), prompt: z.string().max(4000).optional(), content: z.string().max(20000),
  sourceIds: z.array(id).max(200), targetIds: z.array(id).max(200), productIds: z.array(id).max(200),
  width: z.number().min(80).max(4096), height: z.number().min(80).max(4096),
});
const textNode = textFields.extend({ id, prompt: z.string().max(4000), projectKey: id, canvasX: coordinate, canvasY: coordinate,
  status: z.enum(["idle", "generating", "completed", "failed"]), createdAt: z.string().datetime(),
});
export const historyRequest = z.object({
  operationId: z.string().uuid(),
  operations: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("visibility"), id, visible: z.boolean() }),
    z.object({ type: z.literal("text-restore"), node: textNode }),
    z.object({ type: z.literal("text-delete"), id }),
    z.object({ type: z.literal("position"), id, text: z.boolean(), x: coordinate, y: coordinate }),
    z.object({ type: z.literal("group"), id, value: id.nullable() }),
    z.object({ type: z.literal("parent"), id, parentId: id, add: z.boolean() }),
    z.object({ type: z.literal("text-patch"), id, fields: textFields }),
    z.object({ type: z.literal("rename"), id, title: z.string().max(80) }),
    z.object({ type: z.literal("size"), id, x: coordinate, y: coordinate, width: z.number().min(80).max(4096), height: z.number().min(80).max(4096) }),
    z.object({ type: z.literal("mark"), id, marked: z.boolean() }),
    z.object({ type: z.literal("node-settings"), id, text: z.boolean(), settings: nodeSettingsSchema }),
  ])).min(1).max(400),
});

/** A whole history step commits once, including mixed image/text operations. */
export async function saveCanvasHistory(email: string, input: z.infer<typeof historyRequest>) {
  await ensureSchema();
  if (input.operations.some(op => op.type === "node-settings")) await ensureCanvasSettingsSchema();
  const client = await getPool().connect();
  const fingerprint = createHash("sha256").update(JSON.stringify(input.operations)).digest("hex");
  try {
    await client.query("BEGIN");
    // Serialize steps per owner, including concurrent retries of one request.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const previous = await client.query("SELECT fingerprint FROM app_canvas_history_ops WHERE email=$1 AND id=$2", [email,input.operationId]);
    if (previous.rows.length) {
      if (previous.rows[0].fingerprint !== fingerprint) throw new Error("操作编号已使用");
      await client.query("COMMIT"); return;
    }
    for (const op of input.operations) {
      if (op.type === "text-restore") {
        const n = op.node;
        const result = await client.query(`INSERT INTO app_canvas_text_nodes(id,email,project_key,title,prompt,content,status,canvas_x,canvas_y,canvas_width,canvas_height,created_at,source_ids,target_ids,product_ids)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb)
          ON CONFLICT(id) DO UPDATE SET project_key=EXCLUDED.project_key,title=EXCLUDED.title,prompt=EXCLUDED.prompt,content=EXCLUDED.content,status=EXCLUDED.status,
          canvas_x=EXCLUDED.canvas_x,canvas_y=EXCLUDED.canvas_y,canvas_width=EXCLUDED.canvas_width,canvas_height=EXCLUDED.canvas_height,
          source_ids=EXCLUDED.source_ids,target_ids=EXCLUDED.target_ids,product_ids=EXCLUDED.product_ids,updated_at=now()
          WHERE app_canvas_text_nodes.email=EXCLUDED.email`, [n.id,email,n.projectKey,n.title,n.prompt,n.content,n.status,n.canvasX,n.canvasY,n.width,n.height,n.createdAt,JSON.stringify(n.sourceIds),JSON.stringify(n.targetIds),JSON.stringify(n.productIds)]);
        if (!result.rowCount) throw new Error("文字节点不存在或无权修改");
        continue;
      }
      const text = op.type === "text-delete" || op.type === "text-patch" || ((op.type === "position" || op.type === "node-settings") && op.text);
      const table = text ? "app_canvas_text_nodes" : "app_artworks";
      const owned = await client.query(`SELECT * FROM ${table} WHERE email=$1 AND id=$2 FOR UPDATE`, [email,op.id]);
      if (!owned.rows.length) throw new Error("节点不存在或无权修改，请刷新画布");
      const row = owned.rows[0];
      if (op.type === "node-settings") {
        if (!text && row.deleted_at) throw new Error("节点已删除，请刷新画布");
        await client.query(`INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,$2,$3,$4::jsonb)
          ON CONFLICT(email,node_id) DO UPDATE SET kind=EXCLUDED.kind,settings=EXCLUDED.settings,updated_at=now()`,
          [email,op.id,op.text ? "text" : "image",JSON.stringify(op.settings)]);
        continue;
      }
      if (op.type === "visibility") await client.query("UPDATE app_artworks SET deleted_at=CASE WHEN $3 THEN NULL ELSE now() END WHERE email=$1 AND id=$2",[email,op.id,op.visible]);
      else if (op.type === "text-delete") await client.query("DELETE FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[email,op.id]);
      else if (op.type === "position") await client.query(`UPDATE ${table} SET canvas_x=$3,canvas_y=$4 WHERE email=$1 AND id=$2`,[email,op.id,op.x,op.y]);
      else if (op.type === "rename") await client.query("UPDATE app_artworks SET title=$3 WHERE email=$1 AND id=$2",[email,op.id,op.title]);
      else if (op.type === "size") await client.query("UPDATE app_artworks SET canvas_x=$3,canvas_y=$4,canvas_width=$5,canvas_height=$6 WHERE email=$1 AND id=$2",[email,op.id,op.x,op.y,op.width,op.height]);
      else if (op.type === "mark") await client.query("UPDATE app_artworks SET marked=$3 WHERE email=$1 AND id=$2",[email,op.id,op.marked]);
      else if (op.type === "group") {
        if (op.value) {
          const other = await client.query("SELECT 1 FROM app_artworks WHERE email=$1 AND canvas_group_id=$2 AND group_id IS DISTINCT FROM $3 AND deleted_at IS NULL",[email,op.value,row.group_id]);
          if (other.rows.length) throw new Error("不能跨项目成组");
        }
        await client.query("UPDATE app_artworks SET canvas_group_id=$3 WHERE email=$1 AND id=$2",[email,op.id,op.value]);
      } else if (op.type === "text-patch") {
        const f=op.fields;
        await client.query(`UPDATE app_canvas_text_nodes SET title=$3,prompt=COALESCE($4,prompt),content=$5,source_ids=$6::jsonb,target_ids=$7::jsonb,product_ids=$8::jsonb,canvas_width=$9,canvas_height=$10,updated_at=now() WHERE email=$1 AND id=$2`,[email,op.id,f.title,f.prompt,f.content,JSON.stringify(f.sourceIds),JSON.stringify(f.targetIds),JSON.stringify(f.productIds),f.width,f.height]);
      } else if (op.type === "parent") {
        if (op.add) {
          const parent=await client.query("SELECT group_id FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[email,op.parentId]);
          if (!parent.rows.length || parent.rows[0].group_id!==row.group_id) throw new Error("父节点不存在或跨项目");
          const cycle=await client.query(`WITH RECURSIVE ancestors AS (
            SELECT id,parent_id,parent_ids FROM app_artworks WHERE email=$1 AND id=$2
            UNION SELECT a.id,a.parent_id,a.parent_ids FROM app_artworks a JOIN ancestors p
            ON a.id=p.parent_id OR p.parent_ids ? a.id WHERE a.email=$1
          ) SELECT 1 FROM ancestors WHERE id=$3`,[email,op.parentId,op.id]);
          if (cycle.rows.length) throw new Error("不能形成循环连线");
        }
        const parents = new Set<string>(row.parent_ids || []);
        let primary=row.parent_id;
        if (op.add) { if (!primary) primary=op.parentId; else if (primary!==op.parentId) parents.add(op.parentId); }
        else { if (primary===op.parentId) primary=null; parents.delete(op.parentId); }
        await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,op.id,primary,JSON.stringify(Array.from(parents))]);
      }
    }
    await client.query("INSERT INTO app_canvas_history_ops(id,email,fingerprint) VALUES($1,$2,$3)",[input.operationId,email,fingerprint]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
