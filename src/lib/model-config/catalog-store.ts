import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { discoverProviderCatalog, type ProviderCatalogResult } from "./catalog";
import type { ModelProvider } from "./types";
import type { createCredentialStore } from "./credentials";

export const PROVIDER_CATALOG_SQL = `CREATE TABLE IF NOT EXISTS app_model_provider_catalog(
 fingerprint text PRIMARY KEY,provider_id text NOT NULL,result jsonb NOT NULL,last_success_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);`;
export type CatalogEntry = ProviderCatalogResult & { cached: boolean; stale: boolean; lastSuccessAt?: string; refreshing?: boolean };
const ready = new WeakMap<Pool,Promise<unknown>>();
async function ensure(pool:Pool){let p=ready.get(pool);if(!p){p=(async()=>{const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('model-provider-catalog-schema',0))");await tx.query(PROVIDER_CATALOG_SQL);await tx.query('COMMIT')}catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}})().catch(e=>{ready.delete(pool);throw e});ready.set(pool,p)}await p;}
const fingerprint=(p:ModelProvider)=>createHash('sha256').update(JSON.stringify([p.id,p.baseUrl,p.protocol,p.credentialRef||null])).digest('hex');
function entry(row:any,p:ModelProvider):CatalogEntry{
  const result=row?.result as ProviderCatalogResult|undefined;
  const stale=!row||Date.now()-new Date(row.updated_at).getTime()>=(result?.status==='ok'||result?.status==='empty'?300000:60000);
  return {...(result||{status:'empty',models:[],fetchedAt:''}),providerId:p.id,name:p.name,protocol:p.protocol,cached:!!row,stale,...(row?.last_success_at?{lastSuccessAt:new Date(row.last_success_at).toISOString()}:{})};
}
export async function readProviderCatalog(pool:Pool,providers:ModelProvider[]){
  await ensure(pool);
  const rows=(await pool.query('SELECT * FROM app_model_provider_catalog WHERE fingerprint=ANY($1::text[])',[providers.map(fingerprint)])).rows;
  return providers.map(p=>entry(rows.find(r=>r.fingerprint===fingerprint(p)),p));
}
export async function refreshProviderCatalog(pool:Pool,p:ModelProvider,credentials:ReturnType<typeof createCredentialStore>,trustedOrigins:readonly string[],fetcher?:typeof fetch){
  await ensure(pool);const tx=await pool.connect();
  try{
    await tx.query('BEGIN');
    const locked=(await tx.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',['provider-catalog:'+fingerprint(p)])).rows[0].locked;
    const old=(await tx.query('SELECT * FROM app_model_provider_catalog WHERE fingerprint=$1',[fingerprint(p)])).rows[0];
    if(!locked){await tx.query('COMMIT');return {...entry(old,p),refreshing:true};}
    if(old&&!entry(old,p).stale){await tx.query('COMMIT');return entry(old,p);}
    const result=await discoverProviderCatalog(p,credentials,trustedOrigins,fetcher);
    const success=['ok','empty'].includes(result.status);
    const saved={...result,models:success?result.models:old?.result.models||[]};
    const row=(await tx.query(`INSERT INTO app_model_provider_catalog(fingerprint,provider_id,result,last_success_at) VALUES($1,$2,$3::jsonb,CASE WHEN $4 THEN now() ELSE NULL END)
      ON CONFLICT(fingerprint) DO UPDATE SET result=EXCLUDED.result,last_success_at=COALESCE(EXCLUDED.last_success_at,app_model_provider_catalog.last_success_at),updated_at=now() RETURNING *`,[fingerprint(p),p.id,JSON.stringify(saved),success])).rows[0];
    await tx.query('COMMIT');return {...entry(row,p),cached:false};
  }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
