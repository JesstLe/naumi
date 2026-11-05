import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";

export async function ensureMediaSchema() {
 const state=databaseSchemaReadiness(getPool(),"media");
  if (!state.pending) state.pending = ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_media_assets (
      id uuid NOT NULL DEFAULT gen_random_uuid(), key text PRIMARY KEY, owner text, public boolean NOT NULL DEFAULT false,
      driver text NOT NULL, remote_ready boolean NOT NULL DEFAULT false, content_type text NOT NULL,
      sha256 text NOT NULL, bytes bigint NOT NULL, width integer, height integer,
      thumbnail_key text, preview_key text, retry_after timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS app_media_asset_pending_idx ON app_media_assets(retry_after) WHERE NOT remote_ready;
    -- Expand-only: NULL = local copy not yet checked; 'infinity' = no local copy remains.
    ALTER TABLE app_media_assets ADD COLUMN IF NOT EXISTS local_evict_after timestamptz;
    CREATE INDEX IF NOT EXISTS app_media_asset_local_evict_idx ON app_media_assets(created_at)
      WHERE remote_ready AND local_evict_after IS DISTINCT FROM 'infinity'::timestamptz;
    CREATE TABLE IF NOT EXISTS app_media_uploads (
      id uuid PRIMARY KEY, owner text NOT NULL, staging_key text NOT NULL, content_type text NOT NULL,
      bytes integer NOT NULL CHECK(bytes>0 AND bytes<=67108864), expires_at timestamptz NOT NULL,
      asset_key text, committed_id text, created_at timestamptz NOT NULL DEFAULT now()
    );
    DO $upgrade$ BEGIN
     IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='app_media_uploads'::regclass AND conname='app_media_uploads_bytes_check' AND pg_get_constraintdef(oid) LIKE '%12582912%') THEN
      ALTER TABLE app_media_uploads DROP CONSTRAINT app_media_uploads_bytes_check;
      ALTER TABLE app_media_uploads ADD CONSTRAINT app_media_uploads_bytes_check CHECK(bytes>0 AND bytes<=67108864);
     END IF;
    END $upgrade$;
  `)).then(()=>{}).catch(e=>{state.pending=null;throw e;});
  return state.pending;
}
