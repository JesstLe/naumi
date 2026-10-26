import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureSupplierVideoSchema(pool:Pool){
  const state=databaseSchemaReadiness(pool,"supplier-video");
  let task=state.pending;
  if(!task){task=pool.query(`CREATE TABLE IF NOT EXISTS app_supplier_video_definitions (
    id uuid NOT NULL UNIQUE,provider_id text NOT NULL,model_id text NOT NULL,definition jsonb NOT NULL,profile text,
    revision bigint NOT NULL DEFAULT 1,content_hash text NOT NULL,source_url text NOT NULL,collected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(provider_id,model_id));
    CREATE TABLE IF NOT EXISTS app_supplier_video_definition_versions (
      id uuid NOT NULL,revision bigint NOT NULL,definition jsonb NOT NULL,profile text,content_hash text NOT NULL,
      source_url text NOT NULL,collected_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(id,revision));`)
    .then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});state.pending=task;}
  await task;
}
