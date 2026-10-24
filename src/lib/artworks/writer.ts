import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {PoolClient} from "pg";
import type {ArtworkRecord} from "./types";
import {creationProvenance} from "@/lib/artwork-provenance";
import {currentArtworkCreation} from "@/lib/artwork-provenance-context";
import {currentCreationContext} from "@/lib/saas/creation-context";
import {creationLinkTx,addCreationAssetTx,creationEvidenceTx} from "@/lib/saas/creation-writer";

// Persist results and their best-effort creation evidence on the caller's transaction.
// Queries do not import this orchestration module.
export async function addArtworks(
  emailRaw: string,
  items: Omit<ArtworkRecord, "createdAt">[],
  batchId?: string
): Promise<void> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await addArtworksTx(client,email,items,batchId);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Use an existing transaction when artifacts and their durable task settle together. */
export async function addArtworksTx(
  client: PoolClient,
  emailRaw: string,
  items: Omit<ArtworkRecord,"createdAt">[],
  batchId?: string,
  conflict: "revive" | "preserve" = "revive"
): Promise<void> {
    const email=emailRaw.toLowerCase();
    for (const a of items) {
      // 稳定分组:有父节点 → 继承父节点的 group_id(同一项目);无父(新根)→ 用自己的 id。
      let groupId: string = a.groupId ?? a.id;
      if (!a.groupId && a.parentId) {
        const pg = await client.query(
          `SELECT group_id FROM app_artworks WHERE id = $1 AND email = $2`,
          [a.parentId, email]
        );
        const pgid = pg.rows[0]?.group_id as string | null | undefined;
        groupId = pgid || a.parentId; // 父没有 group_id 时退而用父 id(根)
      }
      await client.query(
        `INSERT INTO app_artworks
           (id, email, title, category, prompt, status, image_url, gradient,
            style, ratio, resolution, source_url, batch_id, parent_id, template_id, parent_ids, group_id, canvas_group_id, origin,
            image_width, image_height, processing_kind, postprocess_status, canvas_width, canvas_height, video_url, creation_provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb)
         ON CONFLICT (id) ${conflict==="preserve"?"DO NOTHING":"DO UPDATE SET deleted_at = NULL WHERE app_artworks.email = EXCLUDED.email"}`,
        [
          a.id,
          email,
          a.title,
          a.category,
          a.prompt,
          a.status,
          a.image,
          a.gradient,
          a.style ?? null,
          a.ratio ?? null,
          a.resolution ?? null,
          a.source ?? null,
          batchId ?? a.batchId ?? null,
          a.parentId ?? null,
          a.templateId ?? null,
          JSON.stringify(a.parentIds ?? []),
          groupId,
          a.canvasGroupId ?? null,
          a.origin ?? null,
          a.width ?? null,
          a.height ?? null,
          a.processingKind ?? null,
          a.postprocessStatus ?? null,
          a.canvasWidth ?? null,
          a.canvasHeight ?? null,
          a.videoUrl ?? null,
          JSON.stringify(creationProvenance({ id: a.id, batchId: batchId ?? a.batchId, templateId: a.templateId, explicit: a.creationProvenance, ...currentArtworkCreation() })),
        ]
      );
      const creation=currentCreationContext();
      if(creation?.creationId&&creation.actorEmail===email)await creationEvidenceTx(client,async()=>{
        await creationLinkTx(client,creation.creationId!,email,'artwork',a.id,'output');
        await addCreationAssetTx(client,creation.creationId!,email,{direction:'output',role:'result',position:items.indexOf(a),storageRef:`artwork:${a.id}`,mediaType:a.videoUrl||a.category==='video'?'video':'image'});
      });
    }
}

// 找/建"模板原图"根作品:用户首次从某模板「做同款」时,在其名下落一条代表该模板的
// 根作品(模板图+提示词,parent=null,template_id=模板id),后续同款生成都挂它下面。
// 同一用户+同一模板只建一条(去重),返回该根作品 id。
export async function ensureTemplateRoot(
  emailRaw: string,
  tpl: {
    templateId: string;
    image: string;
    prompt: string;
    title: string;
    gradient?: string | null;
    category?: string | null;
    ratio?: string | null;
  }
): Promise<string | null> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  if (!tpl.templateId || !tpl.image) return null;
  const found = await getPool().query(
    `SELECT id FROM app_artworks
       WHERE email = $1 AND template_id = $2 AND parent_id IS NULL
         AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1`,
    [email, tpl.templateId]
  );
  if (found.rows[0]?.id) return found.rows[0].id as string;
  const id = `tplroot-${tpl.templateId}-${Date.now()}`;
  await getPool().query(
    `INSERT INTO app_artworks
       (id, email, title, category, prompt, status, image_url, gradient,
        style, ratio, resolution, source_url, batch_id, parent_id, template_id, group_id, creation_provenance)
     VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,NULL,$8,NULL,NULL,NULL,NULL,$9,$1,$10::jsonb)`,
    [
      id,
      email,
      tpl.title.slice(0, 60) || "模板原图",
      tpl.category || "main",
      tpl.prompt,
      tpl.image,
      tpl.gradient || "from-slate-100 to-zinc-100",
      tpl.ratio || "1:1",
      tpl.templateId,
      JSON.stringify({ version: 1, operation: "template", entry: "template", ref: tpl.templateId, evidence: "server-route" }),
    ]
  );
  return id;
}
