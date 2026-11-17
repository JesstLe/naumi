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

/** Released reads only: no ensure, draft, publish or discovery. Current is always
 * read from its pointer; only immutable versions have a bounded private cache. */
export function createPublishedModelReader(input:ValidationOptions & {pool:Pool}) {
  const versions=new Map<number,Promise<ModelSnapshot>>();
  return {
    current:()=>readPublishedModelSnapshot(input.pool,input),
    async byVersion(version:number):Promise<ModelSnapshot> {
      if(!Number.isSafeInteger(version)||version<1)throw new ModelConfigError("INVALID_CONFIG","配置版本无效");
      let pending=versions.get(version);
      if(!pending){
        pending=input.pool.query("SELECT * FROM app_model_config_versions WHERE version=$1",[version])
          .then(result=>decodeModelSnapshot(result.rows[0],input))
          .catch(error=>{versions.delete(version);throw error;});
        versions.set(version,pending);
        if(versions.size>64)versions.delete(versions.keys().next().value!);
      }else{versions.delete(version);versions.set(version,pending);}
      return structuredClone(await pending);
    },
  };
}
