-- Additive only. Historical records are resolved from evidence at read time;
-- rollback retains this column, existing data, wallets and media.
BEGIN;
ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS creation_provenance jsonb;
CREATE INDEX IF NOT EXISTS app_video_tasks_artwork_idx ON app_video_tasks(email, artwork_id);
CREATE INDEX IF NOT EXISTS app_canvas_image_tasks_artwork_idx ON app_canvas_image_tasks(email, result_artwork_id);
COMMIT;
