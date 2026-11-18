import {PROVIDER_CATALOG_SQL} from "@/lib/model-config/catalog-schema";
export {PROVIDER_CATALOG_SQL};
import {ensureProviderCatalogSchema as ensure} from "@/lib/model-config/catalog-schema";
import "server-only";
import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {withTransaction} from "@/platform/db/transaction";
import {discoverProviderCatalog,type ProviderCatalogResult} from "./catalog";
import type {ModelProvider} from "./types";
import type {createCredentialStore} from "./credentials";
import {ingestSupplierSources} from "../supplier-models/repository";
import {discoverPublicSupplierDirectory} from "../supplier-models/discovery";


export type CatalogEntry = ProviderCatalogResult & { cached: boolean; stale: boolean; lastSuccessAt?: string; refreshing?: boolean; metadataSaved?:boolean };


const fingerprint=(p:ModelProvider)=>createHash('sha256').update(JSON.stringify([p.id,p.baseUrl,p.protocol,p.credentialRef||null,...(p.options?.parameterCatalogPath?[p.options.parameterCatalogPath]:[])])).digest('hex');
function entry(row:any,p:ModelProvider):CatalogEntry{
  const result=row?.result as ProviderCatalogResult|undefined;
  const {sourceModels: _internalSource, ...publicResult} = result || {status:'empty' as const,models:[],fetchedAt:''};
  const stale=!row||Date.now()-new Date(row.updated_at).getTime()>=(result?.status==='ok'||result?.status==='empty'?300000:60000);
  return {...publicResult,providerId:p.id,name:p.name,protocol:p.protocol,cached:!!row,stale,...(row?.last_success_at?{lastSuccessAt:new Date(row.last_success_at).toISOString()}:{})};
}
export async function readProviderCatalog(pool:Pool,providers:ModelProvider[]){
  await ensure(pool);
  return readProviderCatalogFrom(pool,providers);
}
export async function readProviderCatalogFrom(pool:Pick<Pool,"query">,providers:ModelProvider[]){
  const rows=(await pool.query('SELECT * FROM app_model_provider_catalog WHERE fingerprint=ANY($1::text[])',[providers.map(fingerprint)])).rows;
  return providers.map(p=>entry(rows.find(r=>r.fingerprint===fingerprint(p)),p));
}
type CacheRow={revision:string;result:ProviderCatalogResult;updated_at:Date;last_success_at:Date|null};
const cacheRow=async (tx:PoolClient,key:string)=>(await tx.query<CacheRow>(
  "SELECT xmin::text AS revision,result,updated_at,last_success_at FROM app_model_provider_catalog WHERE fingerprint=$1",[key])).rows[0];
const catalogLockKey=(key:string)=>'provider-catalog:'+key;
const tryCatalogLock=async (tx:PoolClient,key:string)=>(await tx.query<{locked:boolean}>(
  'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[catalogLockKey(key)])).rows[0].locked;
const lockCatalog=(tx:PoolClient,key:string)=>tx.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[catalogLockKey(key)]);
const refreshState=async (tx:PoolClient,key:string)=>(await tx.query<{published:boolean}>(
  'SELECT published FROM app_model_provider_catalog_refresh WHERE fingerprint=$1 AND expires_at>clock_timestamp()',[key])).rows[0];
const ownsRefresh=async(tx:PoolClient,key:string,token:string)=>!!(await tx.query(
  'SELECT 1 FROM app_model_provider_catalog_refresh WHERE fingerprint=$1 AND token=$2 AND expires_at>clock_timestamp() FOR UPDATE',[key,token])).rowCount;
function catalogTx<T>(pool:Pool,run:(tx:PoolClient)=>Promise<T>){
  return withTransaction(pool,async tx=>{
    await tx.query("SET LOCAL lock_timeout='750ms'; SET LOCAL statement_timeout='3s'");
    return run(tx);
  });
}

/** The persistent claim covers network and metadata phases without keeping a
 * PostgreSQL connection. A token and cached revision fence late observers. */
export async function refreshProviderCatalog(pool:Pool,p:ModelProvider,credentials:ReturnType<typeof createCredentialStore>,
  trustedOrigins:readonly string[],fetcher?:typeof fetch,force=false,signal?:AbortSignal):Promise<CatalogEntry>{
  signal?.throwIfAborted();
  await ensure(pool);
  signal?.throwIfAborted();
  const key=fingerprint(p),token=randomUUID();
  const claimed=await catalogTx(pool,async tx=>{
    signal?.throwIfAborted();
    // Same advisory namespace as the previous runtime during a rolling deploy.
    const locked=await tryCatalogLock(tx,key),previous=await cacheRow(tx,key),cached=entry(previous,p);
    const active=await refreshState(tx,key);
    if(active?.published&&previous&&!cached.stale&&!force)return {kind:'cached',entry:cached} as const;
    if(!locked||active)return {kind:'cached',entry:{...cached,refreshing:true}} as const;
    if(previous&&!cached.stale&&!force)return {kind:'cached',entry:cached} as const;
    await tx.query(`INSERT INTO app_model_provider_catalog_refresh(fingerprint,token,expires_at)
      VALUES($1,$2,clock_timestamp()+interval '60 seconds')
      ON CONFLICT(fingerprint) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at,published=false`,[key,token]);
    return {kind:'claimed',previous} as const;
  });
  if(claimed.kind==='cached')return claimed.entry;
  try{
    const remote=await discoverProviderCatalog(p,credentials,trustedOrigins,fetcher,signal);
    signal?.throwIfAborted();
    const success=remote.status==='ok'||remote.status==='empty';
    const written=await catalogTx(pool,async tx=>{
      signal?.throwIfAborted();
      // A duplicate request can hold the advisory lock briefly while reading
      // the lease. Wait for that transaction within catalogTx's lock timeout.
      await lockCatalog(tx,key);
      signal?.throwIfAborted();
      const current=await cacheRow(tx,key);
      if(!await ownsRefresh(tx,key,token)||current?.revision!==claimed.previous?.revision){
        const running=!!await refreshState(tx,key);
        return {entry:{...entry(current,p),...(running?{refreshing:true}:{})}};
      }
      const saved={...remote,models:success?remote.models:current?.result.models||[]};
      const {rows:[row]}=await tx.query<CacheRow>(`INSERT INTO app_model_provider_catalog(fingerprint,provider_id,result,last_success_at)
        VALUES($1,$2,$3::jsonb,CASE WHEN $4 THEN now() ELSE NULL END)
        ON CONFLICT(fingerprint) DO UPDATE SET result=EXCLUDED.result,last_success_at=COALESCE(EXCLUDED.last_success_at,app_model_provider_catalog.last_success_at),updated_at=now()
        RETURNING xmin::text AS revision,result,updated_at,last_success_at`,[key,p.id,JSON.stringify(saved),success]);
      await tx.query("UPDATE app_model_provider_catalog_refresh SET published=true WHERE fingerprint=$1 AND token=$2",[key,token]);
      return {entry:{...entry(row,p),cached:false},revision:row.revision};
    });
    if(!written.revision||!success)return written.entry;
    const published=await discoverPublicSupplierDirectory(p,trustedOrigins,fetcher,signal);
    signal?.throwIfAborted();
    let superseded=false;
    const metadataSaved=await ingestSupplierSources(pool,p,{...written.entry,models:remote.sourceModels||written.entry.models},published,async tx=>{
      signal?.throwIfAborted();
      await tx.query("SET LOCAL lock_timeout='750ms'");
      await lockCatalog(tx,key);
      signal?.throwIfAborted();
      if(!await ownsRefresh(tx,key,token)||(await cacheRow(tx,key))?.revision!==written.revision){
        superseded=true;
        throw Error('CATALOG_REFRESH_SUPERSEDED');
      }
    }).then(()=>true,()=>false);
    signal?.throwIfAborted();
    if(superseded)return await catalogTx(pool,async tx=>{
      const current=entry(await cacheRow(tx,key),p),active=await refreshState(tx,key);
      return {...current,...(active&&!active.published?{refreshing:true}:{})};
    });
    return {...written.entry,metadataSaved};
  }finally{
    // Cleanup is conditional and never touches a successor. If the DB is
    // temporarily unavailable a short lease can expire; don't replay a phase.
    await catalogTx(pool,tx=>tx.query('DELETE FROM app_model_provider_catalog_refresh WHERE fingerprint=$1 AND token=$2',[key,token])).catch(()=>{});
  }
}
