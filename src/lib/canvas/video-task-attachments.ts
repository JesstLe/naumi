import 'server-only';
import {getPool} from '@/platform/db/pool';
import {ensureVideoNodeSchema} from './storage-schema';

/** Read-only Canvas attachment projection. Sending history attaches an owned
 * receipt to a project; it must not rewrite the original task's frozen scope.
 * Keep this relationship owned by Canvas, not by video task persistence. */
export async function attachedVideoTaskIds(actor:string,projectKey:string,nodeId?:string):Promise<string[]>{
  await ensureVideoNodeSchema();
  const {rows}=await getPool().query(`SELECT DISTINCT s.task_id FROM app_canvas_video_task_sends s
    JOIN app_canvas_video_nodes n ON n.email=s.email AND n.id=s.result->>'nodeId' AND n.project_key=s.project_key
    WHERE s.email=$1 AND s.project_key=$2 AND n.deleted_at IS NULL AND ($3::text IS NULL OR n.id=$3)`,[actor.toLowerCase(),projectKey,nodeId||null]);
  return rows.map(row=>String(row.task_id));
}
