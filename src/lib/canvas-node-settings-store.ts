import {ensureCanvasSettingsSchema} from "@/lib/canvas/storage-schema";
export {ensureCanvasSettingsSchema};
import "server-only";

import {getPool} from "@/platform/db/pool";
import {validNodeSettings} from "@/lib/canvas/node-settings";



export async function listCanvasNodeSettings(email: string) {
  await ensureCanvasSettingsSchema();
  await (await import("@/lib/canvas/video-node-repository")).ensureVideoNodeSchema();
  // Deleted records stay available for undo, but are not exposed as live settings.
  const { rows } = await getPool().query(`SELECT s.node_id,s.settings FROM app_canvas_node_settings s
    WHERE s.email=$1 AND ((s.kind='image' AND (EXISTS(SELECT 1 FROM app_artworks a WHERE a.email=s.email AND a.id=s.node_id AND a.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM app_canvas_video_nodes v WHERE v.email=s.email AND v.id=s.node_id AND v.deleted_at IS NULL)))
    OR (s.kind='text' AND EXISTS(SELECT 1 FROM app_canvas_text_nodes n WHERE n.email=s.email AND n.id=s.node_id)))`, [email]);
  return Object.fromEntries(rows.map(row => [row.node_id, validNodeSettings(row.settings)]));
}
