import "server-only";
import {validateCanvasTextLinksTx} from "./text-node-links";
import {mergeCanvasTextWrite,CanvasTextWriteConflict} from "./text-write";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {creationTransaction,creationEvidenceTx,creationLinkTx,addCreationAssetTx} from "@/lib/saas/creation-writer";

export type CanvasTextNodeRecord = {
  id: string;
  projectKey: string;
  title: string;
  prompt: string;
  content: string;
  status: "idle" | "generating" | "completed" | "failed";
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  sourceIds: string[];
  targetIds: string[];
  productIds: string[];
};

export function mapCanvasTextNode(row: Record<string, unknown>): CanvasTextNodeRecord {
  const status = String(row.status || "completed");
  return {
    id: String(row.id || ""),
    projectKey: String(row.project_key || ""),
    title: String(row.title || "文字生成"),
    prompt: String(row.prompt || ""),
    content: String(row.content || ""),
    status:
      status === "idle" || status === "generating" || status === "failed"
        ? status
        : "completed",
    canvasX: Number(row.canvas_x || 0),
    canvasY: Number(row.canvas_y || 0),
    width: Number(row.canvas_width || 300),
    height: Number(row.canvas_height || 176),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    sourceIds: Array.isArray(row.source_ids) ? (row.source_ids as string[]) : [],
    targetIds: Array.isArray(row.target_ids) ? (row.target_ids as string[]) : [],
    productIds: Array.isArray(row.product_ids) ? (row.product_ids as string[]) : [],
  };
}

export async function listCanvasTextNodes(
  emailRaw: string
): Promise<CanvasTextNodeRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, project_key, title, prompt, content, status, canvas_x, canvas_y,
            canvas_width, canvas_height,
            created_at, updated_at, source_ids, target_ids, product_ids
       FROM app_canvas_text_nodes
      WHERE email = $1
      ORDER BY updated_at DESC
      LIMIT 1000`,
    [emailRaw.toLowerCase()]
  );
  return rows.map((row) => mapCanvasTextNode(row));
}

export async function upsertCanvasTextNode(
  emailRaw: string,
  node: CanvasTextNodeRecord,
  options?:{base:CanvasTextNodeRecord|null}
): Promise<CanvasTextNodeRecord> {
  await ensureSchema();
  let status = ["idle", "generating", "completed", "failed"].includes(node.status)
    ? node.status
    : "completed";
  const client=await getPool().connect();let rows:Record<string,unknown>[];
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[emailRaw.toLowerCase()]);
    if(options){
      const existing=(await client.query("SELECT * FROM app_canvas_text_nodes WHERE id=$1 FOR UPDATE",[node.id])).rows[0];
      if(existing&&existing.email!==emailRaw.toLowerCase())throw new Error("文字节点不存在或无权修改");
      const current=existing?mapCanvasTextNode(existing):null;
      if(options.base&&options.base.id!==node.id)throw new CanvasTextWriteConflict(node.id,["id"],current);
      node=mergeCanvasTextWrite(node.id,current,node,options.base);status=node.status;
      await validateCanvasTextLinksTx(client,emailRaw.toLowerCase(),node);
    }
    const result=await client.query(
    `INSERT INTO app_canvas_text_nodes
       (id, email, project_key, title, prompt, content, status, canvas_x, canvas_y, canvas_width, canvas_height, created_at, updated_at, source_ids, target_ids, product_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz, now()),now(),$13::jsonb,$14::jsonb,$15::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       project_key = EXCLUDED.project_key,
       title = EXCLUDED.title,
       prompt = EXCLUDED.prompt,
       content = EXCLUDED.content,
       status = EXCLUDED.status,
       canvas_x = EXCLUDED.canvas_x,
       canvas_y = EXCLUDED.canvas_y,
       canvas_width = EXCLUDED.canvas_width,
       canvas_height = EXCLUDED.canvas_height,
       source_ids = EXCLUDED.source_ids,
       target_ids = EXCLUDED.target_ids,
       product_ids = EXCLUDED.product_ids,
       updated_at = now()
     WHERE app_canvas_text_nodes.email = EXCLUDED.email
     RETURNING id, project_key, title, prompt, content, status, canvas_x, canvas_y,
               canvas_width, canvas_height,
               created_at, updated_at, source_ids, target_ids, product_ids`,
    [
      node.id,
      emailRaw.toLowerCase(),
      node.projectKey,
      node.title.slice(0, 80),
      node.prompt.slice(0, 4000),
      node.content.slice(0, 20000),
      status,
      node.canvasX,
      node.canvasY,
      node.width,
      node.height,
      node.createdAt || null,
      JSON.stringify(node.sourceIds ?? []),
      JSON.stringify(node.targetIds ?? []),
      JSON.stringify(node.productIds ?? []),
    ]
  );
    rows=result.rows;
    if(!rows[0])throw new Error("文字节点不存在或无权修改");
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  if (!rows[0]) throw new Error("文字节点不存在或无权修改");
  const creation=currentCreationContext();if(creation?.creationId&&creation.actorEmail===emailRaw.toLowerCase()){
    await creationTransaction(tx=>creationEvidenceTx(tx,async()=>{
      await creationLinkTx(tx,creation.creationId!,creation.actorEmail,'text-node',node.id,'output');
      if(status==='completed')await addCreationAssetTx(tx,creation.creationId!,creation.actorEmail,{direction:'output',role:`text:${node.id}`,position:0,storageRef:'',mime:'text/plain',mediaType:'file',text:node.content.slice(0,20000)});
    })).catch(()=>{});
  }
  return mapCanvasTextNode(rows[0]);
}

export async function deleteCanvasTextNodes(
  emailRaw: string,
  ids: string[]
): Promise<number> {
  await ensureSchema();
  const clean = ids.filter(Boolean).slice(0, 200);
  if (!clean.length) return 0;
  const result = await getPool().query(
    `DELETE FROM app_canvas_text_nodes WHERE email = $1 AND id = ANY($2::text[])`,
    [emailRaw.toLowerCase(), clean]
  );
  return result.rowCount ?? 0;
}
