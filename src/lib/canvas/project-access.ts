import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureVideoNodeSchema} from "./storage-schema";
import {videoProjectKeySchema} from "./project-key";
import {ModelConfigError} from "../model-config/types";
export async function authorizeVideoProject(actor:string,rawKey:string){
  const parsed=videoProjectKeySchema.safeParse(rawKey);if(!parsed.success)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","画布项目不存在",404);
  await ensureVideoNodeSchema();const pool=getPool(),[kind,id]=[rawKey.slice(0,rawKey.indexOf(":")),rawKey.slice(rawKey.indexOf(":")+1)];
  const own=(await pool.query(`SELECT 1 FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND
      (($3='tree' AND (group_id=$4 OR id=$4)) OR ($3='batch' AND batch_id=$4)) LIMIT 1`,[actor,rawKey,kind,id])).rowCount;
  if(!own)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","画布项目不存在或无权访问",404);
}
