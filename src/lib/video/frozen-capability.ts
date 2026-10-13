import "server-only";
import type {Pool,PoolClient} from "pg";
import { z } from "zod";
import { dbEnabled,getPool } from "../db";
import type { ModelSnapshot,UpstreamModel,ModelProvider } from "../model-config/types";
import { ModelConfigError } from "../model-config/types";
import { supplierVideoDefinition } from "../supplier-models/video-access";
import { managedVideoDefinition } from "./model-definition";
import { videoDefinitionSchema,videoWireProfileSchema,videoProfileProtocol } from "./capability-schema";

export const frozenVideoSchema=z.strictObject({definition:videoDefinitionSchema,
  sources:z.record(z.string(),z.enum(["admin","vendor","adapter","unknown"])),profile:videoWireProfileSchema.optional(),
  sourceRevision:z.strictObject({id:z.string().uuid(),revision:z.number().int().positive(),sourceUrl:z.string().max(1500),collectedAt:z.string().max(100)}).optional()});
export type FrozenVideoCapability=z.infer<typeof frozenVideoSchema>;
const schemas=new WeakMap<Pool,Promise<void>>();
export async function ensureVideoDefaultsSchema(pool:Pool){
  let schema=schemas.get(pool);
  if(!schema){schema=pool.query(`CREATE TABLE IF NOT EXISTS app_video_model_defaults (
    model_version bigint NOT NULL,upstream_id text NOT NULL,model_digest text NOT NULL,value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(model_version,upstream_id));`).then(()=>undefined).catch(error=>{schemas.delete(pool);throw error;});schemas.set(pool,schema);}
  await schema;
}
export async function freezeManagedVideoCapability(snapshot:ModelSnapshot,upstream:UpstreamModel,provider:ModelProvider,connection?:Pool|PoolClient):Promise<FrozenVideoCapability>{
  const create=async()=>{
    const value=managedVideoDefinition(upstream,provider,await supplierVideoDefinition(provider.id,upstream.model,connection));
    if(value.profile&&videoProfileProtocol(value.profile)!==provider.protocol)throw new ModelConfigError("VIDEO_PROFILE_MISMATCH","视频来源协议与所选适配分支不一致",422);
    const {sources,...definition}=value.capability;
    return frozenVideoSchema.parse({definition,sources,profile:value.profile,sourceRevision:value.sourceRevision});
  };
  if(!connection&&!dbEnabled)return create();
  const pool=connection||getPool();
  if(!connection)await ensureVideoDefaultsSchema(getPool());
  const existing=(await pool.query("SELECT model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2",[snapshot.version,upstream.id])).rows[0];
  if(existing){if(existing.model_digest!==snapshot.digest)throw new ModelConfigError("EXECUTION_MISMATCH","视频默认能力绑定与配置版本不一致",503);return frozenVideoSchema.parse(existing.value);}
  const value=await create();
  await pool.query("INSERT INTO app_video_model_defaults(model_version,upstream_id,model_digest,value) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[snapshot.version,upstream.id,snapshot.digest,JSON.stringify(value)]);
  const frozen=(await pool.query("SELECT model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2",[snapshot.version,upstream.id])).rows[0];
  if(!frozen||frozen.model_digest!==snapshot.digest)throw new ModelConfigError("EXECUTION_MISMATCH","视频能力冻结失败",503);
  return frozenVideoSchema.parse(frozen.value);
}
