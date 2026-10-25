import "server-only";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import { createHash, randomUUID } from "node:crypto";
import type { Pool,PoolClient } from "pg";
import { dbEnabled, getPool } from "@/platform/db/pool";
import { videoDefinitionSchema, videoWireProfileSchema, type VideoModelDefinition, type VideoWireProfile } from "../video/capability-schema";
import type { ModelConfig } from "../model-config/types";

export type SupplierVideoDefinition={definition:VideoModelDefinition;profile?:VideoWireProfile;sourceRevision:{id:string;revision:number;sourceUrl:string;collectedAt:string}};
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
export async function recordSupplierVideoDefinition(pool:Pool,input:{providerId:string;modelId:string;definition:unknown;profile?:unknown;sourceUrl:string},parent?:PoolClient){
  const definition=videoDefinitionSchema.parse(input.definition),profile=input.profile===undefined?undefined:videoWireProfileSchema.parse(input.profile);
  if(Object.keys(definition.providerOptions||{}).some(key=>/^(api_?key|authorization|password|secret|credential|access_?token|token)$/i.test(key)))throw new Error("供应商资料不能存认证字段");
  const url=new URL(input.sourceUrl);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw new Error("供应商来源地址无效");
  for(const key of [...url.searchParams.keys()])if(/key|secret|token|signature|credential/i.test(key))url.searchParams.delete(key);
  await ensureSupplierVideoSchema(pool);
  const hash=createHash("sha256").update(JSON.stringify({definition,profile,sourceUrl:url.href})).digest("hex"),tx=parent||await pool.connect();
  try{
    if(!parent)await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`supplier-video:${input.providerId}:${input.modelId}`]);
    const old=(await tx.query("SELECT * FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2 FOR UPDATE",[input.providerId,input.modelId])).rows[0];
    if(old?.content_hash===hash){if(!parent)await tx.query("COMMIT");return {id:String(old.id),revision:Number(old.revision)};}
    const id=old?.id||randomUUID(),revision=old?Number(old.revision)+1:1;
    await tx.query(`INSERT INTO app_supplier_video_definitions(id,provider_id,model_id,definition,profile,revision,content_hash,source_url)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8) ON CONFLICT(provider_id,model_id) DO UPDATE SET definition=EXCLUDED.definition,
      profile=EXCLUDED.profile,revision=EXCLUDED.revision,content_hash=EXCLUDED.content_hash,source_url=EXCLUDED.source_url,collected_at=now()`,
      [id,input.providerId,input.modelId,JSON.stringify(definition),profile||null,revision,hash,url.href]);
    await tx.query("INSERT INTO app_supplier_video_definition_versions(id,revision,definition,profile,content_hash,source_url) VALUES($1,$2,$3::jsonb,$4,$5,$6)",[id,revision,JSON.stringify(definition),profile||null,hash,url.href]);
    if(!parent)await tx.query("COMMIT");return {id:String(id),revision};
  }catch(error){if(!parent)await tx.query("ROLLBACK");throw error;}finally{if(!parent)tx.release();}
}
function parseRow(row:Record<string,any>|undefined):SupplierVideoDefinition|null{
  if(!row)return null;const definition=videoDefinitionSchema.safeParse(row.definition),profile=videoWireProfileSchema.safeParse(row.profile);
  if(!definition.success)return null;
  return {definition:definition.data,...(profile.success?{profile:profile.data}:{}),sourceRevision:{id:String(row.id),revision:Number(row.revision),sourceUrl:String(row.source_url),collectedAt:new Date(row.collected_at).toISOString()}};
}
export async function supplierVideoDefinition(providerId:string,wireModel:string,connection?:Pool|PoolClient):Promise<SupplierVideoDefinition|null>{
  if(!connection&&!dbEnabled)return null;
  if(!connection){const pool=getPool();await ensureSupplierVideoSchema(pool);connection=pool;}
  return parseRow((await connection.query("SELECT * FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2",[providerId,wireModel])).rows[0]);
}
export async function readVideoDefaults(pool:Pool,config:ModelConfig){
  await ensureSupplierVideoSchema(pool);
  const targets=config.upstreamModels.filter(u=>u.modality==="video").map(u=>({provider_id:u.providerId,model_id:u.model}));
  const rows=(await pool.query(`SELECT d.* FROM app_supplier_video_definitions d JOIN jsonb_to_recordset($1::jsonb)
    AS t(provider_id text,model_id text) ON d.provider_id=t.provider_id AND d.model_id=t.model_id`,[JSON.stringify(targets)])).rows;
  return new Map(config.upstreamModels.filter(u=>u.modality==="video").map(u=>[u.id,parseRow(rows.find(row=>row.provider_id===u.providerId&&row.model_id===u.model))] as const));
}
