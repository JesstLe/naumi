import "server-only";
import { getPool } from "@/platform/db/pool";
import { ModelConfigError } from "../model-config/types";
import { ensureVideoNodeSchema } from "./storage-schema";
import { videoProjectKeySchema } from "./project-key";

/** Shared mixed-canvas project registry; its historical table name is retained. */
export async function authorizeCanvasProject(actor: string, rawKey: string) {
  if (!videoProjectKeySchema.safeParse(rawKey).success) throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE", "画布项目不存在", 404);
  await ensureVideoNodeSchema();
  const kind = rawKey.slice(0, rawKey.indexOf(":")), id = rawKey.slice(rawKey.indexOf(":") + 1);
  const own = (await getPool().query(`SELECT 1 FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND
      (($3='tree' AND (group_id=$4 OR id=$4)) OR ($3='batch' AND batch_id=$4)) LIMIT 1`, [actor, rawKey, kind, id])).rowCount;
  if (!own) throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE", "画布项目不存在或无权访问", 404);
}
export async function mayCreateCanvasRoot(actor: string, input: { id: string }, key: string) {
  if (key !== `tree:${input.id}`) return false;
  const other = (await getPool().query(`SELECT 1 FROM app_canvas_video_projects WHERE project_key=$1 AND email<>$2
    UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE project_key=$1 AND email<>$2
    UNION ALL SELECT 1 FROM app_artworks WHERE email<>$2 AND (group_id=$3 OR id=$3) LIMIT 1`, [key, actor, input.id])).rowCount;
  return !other;
}

export {authorizeCanvasProject as authorizeVideoProject};
