import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureVideoDefaultsSchema(pool:Pool){
 const state=databaseSchemaReadiness(pool,"video-defaults");
  let schema=state.pending;
  if(!schema){schema=pool.query(`CREATE TABLE IF NOT EXISTS app_video_model_defaults (
    model_version bigint NOT NULL,upstream_id text NOT NULL,model_digest text NOT NULL,value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(model_version,upstream_id));`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});state.pending=schema;}
  await schema;
}
