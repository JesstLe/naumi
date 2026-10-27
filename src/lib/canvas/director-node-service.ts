import "server-only";
import { getPool, listArtworksByIds } from "../db";
import { ModelConfigError } from "../model-config/types";
import { bindActualCreationProject, assertCreationProjectInput } from "../saas/creation-context";
import { assertCreationObjectRefs, assertCreationInputsTx } from "../saas/creation-writer";
import { storageKeyFromManagedUrl } from "../storage";
import { verifiedOwnedMedia } from "../video/media-inspection";
import { authorizeVideoProject } from "./video-node-service";
import { directorNodeWriteSchema, directorOutputSchema, type DirectorNodeWrite } from "./director-node-schema";
import { directorOperationTx, ensureDirectorNodeSchema, getDirectorNode, mapDirectorNode, saveDirectorNodeTx } from "./director-node-repository";
export { getDirectorNode, listDirectorNodes } from "./director-node-repository";

export async function authorizeDirectorInputs(actor: string, input: Pick<DirectorNodeWrite, "project">) {
  const id = input.project?.panoramaArtworkId; if (!id) return;
  await assertCreationObjectRefs(actor, [id]); const artwork = (await listArtworksByIds(actor, [id]))[0];
  if (!artwork || artwork.status !== "completed" || !artwork.image || artwork.videoUrl) throw new ModelConfigError("DIRECTOR_BACKGROUND_UNAVAILABLE", "背景图片不存在或尚未完成", 404);
  const tx=await getPool().connect();try{await assertCreationInputsTx(tx,actor,[id]);}finally{tx.release();}
}
export async function saveDirectorNode(actorRaw: string, raw: unknown) {
  const actor = actorRaw.toLowerCase(), parsed = directorNodeWriteSchema.safeParse(raw);
  if (!parsed.success) throw new ModelConfigError("INVALID_DIRECTOR_NODE", "导演工程字段无效", 422, parsed.error.issues.map(issue => issue.path.join(".")));
  const input = parsed.data; await ensureDirectorNodeSchema(); const old = await getDirectorNode(actor, input.id, true), key = input.projectKey || old?.projectKey || `tree:${input.id}`;
  let newRoot = false;
  try { await authorizeVideoProject(actor, key); } catch (error) {
    if (!(error instanceof ModelConfigError) || old || input.expectedRevision !== 0 || key !== `tree:${input.id}`) throw error;
    const other = (await getPool().query(`SELECT 1 FROM app_canvas_video_projects WHERE project_key=$1 AND email<>$2
      UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE project_key=$1 AND email<>$2
      UNION ALL SELECT 1 FROM app_artworks WHERE email<>$2 AND (group_id=$3 OR id=$3) LIMIT 1`, [key, actor, input.id])).rowCount;
    if (other) throw error; newRoot = true;
  }
  await authorizeDirectorInputs(actor, input);
  const tx = await getPool().connect(); try {
    await tx.query("BEGIN"); await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    await bindActualCreationProject(actor, key, { tx, newRoot });
    const node = await saveDirectorNodeTx(tx, actor, input, key); await tx.query("COMMIT"); return node;
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
export async function attachDirectorOutput(actorRaw: string, id: string, raw: unknown) {
  const actor = actorRaw.toLowerCase(), parsed = directorOutputSchema.safeParse(raw); if (!parsed.success) throw new ModelConfigError("INVALID_DIRECTOR_OUTPUT", "导演输出字段无效", 422);
  const input = parsed.data, node = await getDirectorNode(actor, id); if (!node) throw new ModelConfigError("DIRECTOR_UNAVAILABLE", "导演节点不存在", 404);
  await bindActualCreationProject(actor, node.projectKey); await assertCreationProjectInput(actor, node.projectKey); await assertCreationObjectRefs(actor, [input.artworkId]);
  const art = (await listArtworksByIds(actor, [input.artworkId]))[0], key = storageKeyFromManagedUrl(input.kind === "image" ? art?.image || "" : art?.videoUrl || "");
  const sameProject = node.projectKey.startsWith("tree:") ? art?.groupId === node.projectKey.slice(5) : art?.batchId === node.projectKey.slice(6);
  if (!art || art.status !== "completed" || !key || !sameProject) throw new ModelConfigError("DIRECTOR_OUTPUT_UNAVAILABLE", "输出素材不存在或不属于当前画布", 404);
  const media = await verifiedOwnedMedia(actor, key, art.id); if (!media.mimeType.startsWith(input.kind + "/")) throw new ModelConfigError("DIRECTOR_OUTPUT_KIND", "输出媒体类型不一致", 422);
  const tx = await getPool().connect(); try {
    await tx.query("BEGIN"); const operation = await directorOperationTx(tx, actor, input.operationId, { action: "output", id, input });
    if (operation.replay) { await tx.query("COMMIT"); return operation.replay; }
    const current = (await tx.query("SELECT * FROM app_canvas_director_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, id])).rows[0];
    if (!current || current.deleted_at || Number(current.revision) !== input.expectedRevision) throw new ModelConfigError("DIRECTOR_REVISION_CONFLICT", "导演工程已更新，输出素材已保留在画布，请重新读取", 409);
    const existing = (await tx.query("SELECT group_id,batch_id,image_url,video_url FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL AND status='completed' FOR SHARE", [actor, art.id])).rows[0];
    const unchanged=existing&&(node.projectKey.startsWith("tree:")?existing.group_id===node.projectKey.slice(5):existing.batch_id===node.projectKey.slice(6))&&storageKeyFromManagedUrl(input.kind==="image"?existing.image_url:existing.video_url)===key;
    if (!unchanged) throw new ModelConfigError("DIRECTOR_OUTPUT_UNAVAILABLE", "输出素材已删除或改变", 409);
    const outputs = [...(current.outputs || []).filter((output: { artworkId: string }) => output.artworkId !== art.id), { artworkId: art.id, kind: input.kind }];
    const result = mapDirectorNode((await tx.query("UPDATE app_canvas_director_nodes SET outputs=$3::jsonb,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2 RETURNING *", [actor, id, JSON.stringify(outputs)])).rows[0]);
    await tx.query("INSERT INTO app_canvas_director_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)", [actor, input.operationId, operation.digest, JSON.stringify(result)]); await tx.query("COMMIT"); return result;
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
