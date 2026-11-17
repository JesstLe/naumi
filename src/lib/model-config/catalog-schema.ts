import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import type {Pool} from "pg";

export async function ensureProviderCatalogSchema(pool:Pool){
 const state=databaseSchemaReadiness<unknown>(pool,"provider-catalog");let p=state.pending;if(!p){p=(async()=>{const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('model-provider-catalog-schema',0))");await tx.query(PROVIDER_CATALOG_SQL);await tx.query('COMMIT')}catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}})().catch(e=>{state.pending=undefined;throw e});state.pending=p}await p;}

export const PROVIDER_CATALOG_SQL = `CREATE TABLE IF NOT EXISTS app_model_provider_catalog(
 fingerprint text PRIMARY KEY,provider_id text NOT NULL,result jsonb NOT NULL,last_success_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_model_provider_catalog_refresh(
 fingerprint text PRIMARY KEY, token uuid NOT NULL, expires_at timestamptz NOT NULL,
 published boolean NOT NULL DEFAULT false
);`;
