import "server-only";
import { getPool } from "../db";
import { ensureVideoNodeSchema } from "../canvas/video-node-repository";
import { ensureDirectorNodeSchema } from "../canvas/director-node-repository";
import { ensureCharacterNodeSchema } from "../canvas/character-node-repository";
import { ensureSceneNodeSchema } from "../canvas/scene-node-repository";
import { ensureAudioNodeSchema } from "../canvas/audio-node-repository";
import { ensureTimelineNodeSchema } from "../canvas/timeline-node-repository";
import { ensureCanvasImageVersions } from "../canvas/image-version-store";
import { ensureMediaSchema } from "../media-assets";
import { ensureMediaInspectionSchema } from "../video/media-inspection";

let ready: Promise<void> | undefined;
/** Must run before checkout. No schema initialization inside an authorization transaction. */
export async function ensureCanvasSharingSchema() {
  if (!ready) ready = (async () => {
    for (const ensure of [ensureVideoNodeSchema, ensureDirectorNodeSchema, ensureCharacterNodeSchema, ensureSceneNodeSchema,
      ensureAudioNodeSchema, ensureTimelineNodeSchema, ensureCanvasImageVersions, ensureMediaSchema, ensureMediaInspectionSchema]) await ensure();
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS app_canvas_shares (
        id uuid PRIMARY KEY,enterprise_id uuid NOT NULL,author_id text NOT NULL,requester_id text NOT NULL,
        status text NOT NULL CHECK(status IN ('offered','requested','approved','rejected','revoked')),
        title text NOT NULL,kind text NOT NULL CHECK(kind IN ('artwork','workflow')),version bigint NOT NULL DEFAULT 1,
        source jsonb,preview jsonb,result_project_key text,snapshot jsonb,snapshot_digest text,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(author_id<>requester_id));
      CREATE INDEX IF NOT EXISTS canvas_share_sent ON app_canvas_shares(enterprise_id,author_id,created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS canvas_share_received ON app_canvas_shares(enterprise_id,requester_id,created_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS app_canvas_share_operations (
        enterprise_id uuid NOT NULL,actor_id text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,
        share_id uuid NOT NULL REFERENCES app_canvas_shares(id),created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(enterprise_id,actor_id,operation_id));
      CREATE TABLE IF NOT EXISTS app_canvas_share_copies (
        share_id uuid PRIMARY KEY REFERENCES app_canvas_shares(id),recipient_id text NOT NULL,project_key text NOT NULL,
        snapshot_digest text NOT NULL,id_map jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(recipient_id,project_key));
      CREATE TABLE IF NOT EXISTS app_canvas_share_media_staging (
        attempt_id uuid PRIMARY KEY,share_id uuid NOT NULL REFERENCES app_canvas_shares(id),keys jsonb NOT NULL,
        state text NOT NULL CHECK(state IN ('staging','committed','cleanup_pending','cleaned')),
        expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',updated_at timestamptz NOT NULL DEFAULT now());
    `);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
