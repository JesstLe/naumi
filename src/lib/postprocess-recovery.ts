import "server-only";
import { getPool } from "./db";
import { resumePostprocess } from "./media-postprocess";
export async function recoverPostprocess(id: string, email: string) {
  const result = await resumePostprocess(id,email,true), pool=getPool();
  const row=(await pool.query("SELECT parent_operation_id FROM app_media_postprocess WHERE operation_id=$1 AND email=$2",[id,email])).rows[0];
  if(row) {
    await pool.query("UPDATE app_canvas_image_tasks SET status='queued',error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND email=$2 AND status='needs_attention' AND parameters->>'upstreamResult' IS NOT NULL",[row.parent_operation_id,email]);
    await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"pending\"'::jsonb),lease_until=NULL WHERE id=$1 AND email=$2 AND snapshot->>'status' IN ('pending','needs_attention')",[row.parent_operation_id,email]);
  }
  return result;
}
