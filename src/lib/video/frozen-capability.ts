import {nativeVideoQueryMatches} from './profiles/native-profile';
import {ensureVideoDefaultsSchema} from "@/lib/video/model-defaults-schema";
export {ensureVideoDefaultsSchema};

import "server-only";
import type {Pool,PoolClient} from "pg";
import {dbEnabled,getPool} from "@/platform/db/pool";
import type {ModelSnapshot,UpstreamModel,ModelProvider} from "../model-config/types";
import {ModelConfigError} from "../model-config/types";
import {supplierVideoDefinition} from "../supplier-models/video-access";
import {managedVideoDefinition} from "./model-definition";
import {videoProfileProtocol} from "./capability-schema";
import {inheritPublishedVideoParameters} from '../model-config/video-parameter-inheritance';

import {frozenVideoSchema,type FrozenVideoCapability} from './frozen-capability-schema';
export {frozenVideoSchema,type FrozenVideoCapability} from './frozen-capability-schema';

function decodeFrozen(value:unknown,snapshot:ModelSnapshot){
  const frozen=frozenVideoSchema.parse(value);
  if(frozen.execution&&(frozen.execution.modelVersion!==snapshot.version||frozen.execution.modelDigest!==snapshot.digest))throw new ModelConfigError('EXECUTION_MISMATCH','视频执行映射与冻结模型修订不一致',503);
  return frozen;
}
/** Dashboard projection only: absence stays absence until a publisher freezes it. */
export async function readFrozenVideoCapabilities(sql:Pick<Pool,'query'>,snapshot:ModelSnapshot,ids:readonly string[]){
  if(!ids.length)return new Map<string,FrozenVideoCapability>();
  const {rows}=await sql.query<{upstream_id:string;model_digest:string;value:unknown}>(
    "SELECT upstream_id,model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=ANY($2::text[])",
    [snapshot.version,[...new Set(ids)]]);
  return new Map(rows.map(row=>{
    if(row.model_digest!==snapshot.digest)throw new ModelConfigError("EXECUTION_MISMATCH","视频默认能力绑定与配置版本不一致",503);
    return [row.upstream_id,decodeFrozen(row.value,snapshot)];
  }));
}

export async function freezeManagedVideoCapability(snapshot:ModelSnapshot,upstream:UpstreamModel,provider:ModelProvider,connection?:Pool|PoolClient):Promise<FrozenVideoCapability>{
  const create=async()=>{
    if(upstream.parameterMap.videoExecution){
      const profile=upstream.parameterMap.videoProfile??provider.options?.videoProfile;
      if(upstream.parameterMap.videoExecution.profileId==='native-video'?!nativeVideoQueryMatches(upstream.parameterMap.videoExecution.recipe.layout,profile,provider.protocol,upstream.parameterMap.videoExecution.recipe.queryTransport):!profile||videoProfileProtocol(profile)!==provider.protocol)throw new ModelConfigError("VIDEO_PROFILE_MISMATCH","视频执行映射缺少匹配的查询协议",422);
      const inherited=inheritPublishedVideoParameters(upstream.parameterMap.videoExecution,provider,upstream.model,await supplierVideoDefinition(provider.id,upstream.model,connection));
      return frozenVideoSchema.parse({definition:inherited.conflicts?{parameterContract:{version:1,parameters:{},conflicts:inherited.conflicts}}:{},sources:inherited.sourceRevision?{parameters:'vendor'}:{},profile,
        ...(inherited.sourceRevision?{sourceRevision:inherited.sourceRevision}:{}),
        execution:{...inherited.execution,modelVersion:snapshot.version,modelDigest:snapshot.digest}});
    }
    const value=managedVideoDefinition(upstream,provider,await supplierVideoDefinition(provider.id,upstream.model,connection));
    if(value.profile&&videoProfileProtocol(value.profile)!==provider.protocol)throw new ModelConfigError("VIDEO_PROFILE_MISMATCH","视频来源协议与所选适配分支不一致",422);
    const {sources,...definition}=value.capability;
    return frozenVideoSchema.parse({definition,sources,profile:value.profile,sourceRevision:value.sourceRevision});
  };
  if(!connection&&!dbEnabled)return create();
  const pool=connection||getPool();
  if(!connection)await ensureVideoDefaultsSchema(getPool());
  const existing=(await pool.query("SELECT model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2",[snapshot.version,upstream.id])).rows[0];
  if(existing){if(existing.model_digest!==snapshot.digest)throw new ModelConfigError("EXECUTION_MISMATCH","视频默认能力绑定与配置版本不一致",503);return decodeFrozen(existing.value,snapshot);}
  const value=await create();
  await pool.query("INSERT INTO app_video_model_defaults(model_version,upstream_id,model_digest,value) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[snapshot.version,upstream.id,snapshot.digest,JSON.stringify(value)]);
  const frozen=(await pool.query("SELECT model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2",[snapshot.version,upstream.id])).rows[0];
  if(!frozen||frozen.model_digest!==snapshot.digest)throw new ModelConfigError("EXECUTION_MISMATCH","视频能力冻结失败",503);
  return decodeFrozen(frozen.value,snapshot);
}
