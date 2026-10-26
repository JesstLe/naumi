import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensurePostprocessSchema(pool: Pool) {
 const state=databaseSchemaReadiness<unknown>(pool,"postprocess");
  let p = state.pending;
  if (!p) { p = pool.query(`CREATE TABLE IF NOT EXISTS app_media_postprocess(
    operation_id text PRIMARY KEY,parent_operation_id text NOT NULL,email text NOT NULL,model_version bigint NOT NULL,
    digest text NOT NULL,policy jsonb NOT NULL,base_url text NOT NULL,result_url text,width int,height int,
    state text NOT NULL,attempts int NOT NULL DEFAULT 0,lease_id uuid,lease_until timestamptz,error text,
    processing_kind text NOT NULL,cost_cny_micros numeric(30,0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
    ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS output_mime text;
    ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS transparent_pixels bigint;
    ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS total_pixels bigint;`).catch(e => { state.pending=undefined; throw e; }); state.pending=p; }
  await p;
}
