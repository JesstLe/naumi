import "server-only";
import type {Pool} from "pg";
import type {ValidationOptions} from "./schema";
import {decodeModelSnapshot} from "./snapshot-value";
import {ModelConfigError,type ModelSnapshot} from "./types";

/** A caller may keep a published read on its existing transaction. */
export async function readPublishedModelSnapshot(sql:Pick<Pool,'query'>,options:ValidationOptions={}):Promise<ModelSnapshot|null>{
  const {rows}=await sql.query(`SELECT v.* FROM app_model_config_state s
    LEFT JOIN app_model_config_versions v ON v.version=s.active_version WHERE singleton=true`);
  if(!rows.length)return null;
  if(rows[0].version===null)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
  return decodeModelSnapshot(rows[0],options);
}

/** Released reads only: no ensure, draft, publish or discovery. Re-read the
 * pointer on EVERY call, but decode/compile each immutable version only once.
 * Transaction-local reads above deliberately do not use this process cache. */
export function createPublishedModelReader(input:ValidationOptions & {pool:Pool}) {
  type VersionRead={snapshot:ModelSnapshot;rowRevision:string};
  const versions=new Map<number,Promise<VersionRead>>();
  const loadVersion=async(version:number):Promise<VersionRead>=>{
      if(!Number.isSafeInteger(version)||version<1)throw new ModelConfigError("INVALID_CONFIG","配置版本无效");
      let pending=versions.get(version);
      if(!pending){
        pending=input.pool.query("SELECT *,xmin::text AS row_revision FROM app_model_config_versions WHERE version=$1",[version])
          .then(result=>({snapshot:decodeModelSnapshot(result.rows[0],input),rowRevision:result.rows[0].row_revision as string}))
          .catch(error=>{if(versions.get(version)===pending)versions.delete(version);throw error;});
        versions.set(version,pending);
        if(versions.size>64)versions.delete(versions.keys().next().value!);
      }else{versions.delete(version);versions.set(version,pending);}
      return pending;
  };
  const byVersion=async(version:number)=>structuredClone((await loadVersion(version)).snapshot);
  return {
    async current():Promise<ModelSnapshot|null>{
      // Metadata only: avoid transferring/parsing the config and running the
      // business parameter compiler again for every catalog/quote read.
      const {rows}=await input.pool.query(`SELECT s.active_version AS version,v.digest,v.xmin::text AS row_revision FROM app_model_config_state s
        LEFT JOIN app_model_config_versions v ON v.version=s.active_version WHERE singleton=true`);
      if(!rows.length)return null;
      if(!rows[0].digest)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置版本不存在",503);
      const version=Number(rows[0].version);
      let loaded=await loadVersion(version);
      if(loaded.rowRevision!==rows[0].row_revision){
        // Published rows normally never change. Preserve the old corruption
        // check even if an out-of-band UPDATE keeps the same version/digest.
        versions.delete(version);loaded=await loadVersion(version);
      }
      if(loaded.snapshot.digest!==rows[0].digest||loaded.rowRevision!==rows[0].row_revision){
        // A rewritten row is not an immutable publication. Fail closed rather
        // than serving a cached version under a different current digest.
        versions.delete(version);
        throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置摘要不一致",503);
      }
      return structuredClone(loaded.snapshot);
    },
    byVersion,
  };
}
