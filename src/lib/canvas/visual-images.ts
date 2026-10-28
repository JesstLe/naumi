import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {ModelConfigError} from "../model-config/types";
import {assertCreationInputsTx, assertCreationObjectRefs} from "../saas/creation-writer";

export type CanvasVisualImage = {id: string; image: string};
type Kind = "character" | "scene";
function referenceFailure(error: unknown, kind: Kind): never {
  if (error instanceof Error && ["素材不存在或无权访问", "不能直接引用其他企业的素材"].includes(error.message)) throw new ModelConfigError(kind === "scene" ? "SCENE_REFERENCE_UNAVAILABLE" : "CHARACTER_REFERENCE_UNAVAILABLE", error.message, 404);
  throw error;
}
/** Real image ownership/type/scope rules shared by the two visual assets.
 * A caller-supplied transaction owns all locks; no nested transaction is opened. */
export async function requireVisualImages(actor: string, ids: readonly string[], kind: Kind, transaction?: PoolClient): Promise<CanvasVisualImage[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  if (!transaction) try {await assertCreationObjectRefs(actor, unique);} catch (error) {referenceFailure(error, kind);}
  const client = transaction ?? await getPool().connect();
  try {
    const rows = (await client.query(`SELECT id,status,image_url,video_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL${transaction ? " FOR SHARE" : ""}`, [actor, unique])).rows;
    const byId = new Map(rows.map(row => [String(row.id), row]));
    for (const id of unique) {
      const image = byId.get(id);
      if (!image || image.status !== "completed" || !image.image_url || image.video_url) throw new ModelConfigError(kind === "scene" ? "SCENE_REFERENCE_UNAVAILABLE" : "CHARACTER_REFERENCE_UNAVAILABLE", `${kind === "scene" ? "场景" : "角色"}参考图片不存在、尚未完成或已改变类型`, 404);
    }
    await assertCreationInputsTx(client, actor, unique);
    return unique.map(id => ({id, image: String(byId.get(id)!.image_url)}));
  } catch (error) {return referenceFailure(error, kind);}
  finally {if (!transaction) client.release();}
}
