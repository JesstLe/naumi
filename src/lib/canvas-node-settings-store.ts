import "server-only";
import { ensureSchema, getPool } from "@/lib/db";
import { validNodeSettings } from "@/lib/canvas/node-settings";

let schema: Promise<void> | undefined;
export async function ensureCanvasSettingsSchema() {
  await ensureSchema();
  if (!schema) schema = getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_node_settings (
    email text NOT NULL, node_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('text','image')),
    settings jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(email,node_id));
    CREATE TABLE IF NOT EXISTS app_canvas_local_edits (
      email text NOT NULL, operation_id uuid NOT NULL, fingerprint text NOT NULL, artwork_id text NOT NULL,
      PRIMARY KEY(email,operation_id));`).then(() => undefined).catch(error => { schema = undefined; throw error; });
  await schema;
}
export async function listCanvasNodeSettings(email: string) {
  await ensureCanvasSettingsSchema();
  await (await import("@/lib/canvas/video-node-repository")).ensureVideoNodeSchema();
  await (await import("@/lib/canvas/director-node-repository")).ensureDirectorNodeSchema();
  await (await import("@/lib/canvas/character-node-repository")).ensureCharacterNodeSchema();
  await (await import("@/lib/canvas/scene-node-repository")).ensureSceneNodeSchema();
  // Deleted records stay available for undo, but are not exposed as live settings.
  const { rows } = await getPool().query(`SELECT s.node_id,s.settings FROM app_canvas_node_settings s
    WHERE s.email=$1 AND ((s.kind='image' AND (EXISTS(SELECT 1 FROM app_artworks a WHERE a.email=s.email AND a.id=s.node_id AND a.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM app_canvas_video_nodes v WHERE v.email=s.email AND v.id=s.node_id AND v.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM app_canvas_director_nodes d WHERE d.email=s.email AND d.id=s.node_id AND d.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM app_canvas_character_nodes c WHERE c.email=s.email AND c.id=s.node_id AND c.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM app_canvas_scene_nodes p WHERE p.email=s.email AND p.id=s.node_id AND p.deleted_at IS NULL)))
    OR (s.kind='text' AND EXISTS(SELECT 1 FROM app_canvas_text_nodes n WHERE n.email=s.email AND n.id=s.node_id)))`, [email]);
  return Object.fromEntries(rows.map(row => [row.node_id, validNodeSettings(row.settings)]));
}
