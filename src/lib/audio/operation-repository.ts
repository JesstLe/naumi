import "server-only";
import {getPool} from "@/platform/db/pool";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import type {ExecutionModel} from "../model-config/execution";
import type {DialogueLine} from "../timeline/dialogue";
import type {FrozenMediaInput} from "../video/media-inspection";
import type {AudioOperation} from "./operation-schema";
import type {PoolClient} from "pg";
import type {AudioAdoption} from "./dialogue-adoption";

export type AudioIntent={createdAt:string;actor:string;operationId:string;kind:"speech"|"transcribe";requestHash:string;request:AudioOperation;line:DialogueLine;execution:ExecutionModel;source?:FrozenMediaInput};
export async function ensureAudioOperationSchema(){
  const pool=getPool(),state=databaseSchemaReadiness(pool,"audio-operation-provenance-v1");
  state.pending??=(async()=>{const tx=await pool.connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('naumi-audio-operation-schema-v1',0))");await tx.query(`CREATE TABLE IF NOT EXISTS app_audio_operation_sources(
    billing_id text PRIMARY KEY,email text NOT NULL,project_key text NOT NULL,kind text NOT NULL CHECK(kind IN('speech','transcribe')),intent jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_audio_operation_project ON app_audio_operation_sources(email,project_key);
    CREATE TABLE IF NOT EXISTS app_audio_adoption_links(email text NOT NULL,operation_id uuid NOT NULL,input jsonb NOT NULL,PRIMARY KEY(email,operation_id));`);await tx.query("COMMIT");}catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}})().catch(e=>{state.pending=undefined;throw e;});await state.pending;
}
export async function readAudioAdoption(actor:string,input:AudioAdoption,tx?:PoolClient){
  if(!tx)await ensureAudioOperationSchema();const previous=(await (tx??getPool()).query("SELECT input FROM app_audio_adoption_links WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0]?.input;
  if(previous&&canonicalConfig(previous)!==canonicalConfig(input))throw new ModelConfigError("AUDIO_ADOPTION_CONFLICT","采用操作编号已用于不同输入",409);
  return !!previous;
}
export async function recordAudioAdoptionTx(tx:PoolClient,actor:string,input:AudioAdoption){
  await tx.query("INSERT INTO app_audio_adoption_links(email,operation_id,input) VALUES($1,$2,$3::jsonb)",[actor,input.operationId,JSON.stringify(input)]);
}
export async function readAudioCostSources(actor:string,projectKey:string,timelineIds:readonly string[]){
  await ensureAudioOperationSchema();if(!timelineIds.length)return [];
  return (await getPool().query("SELECT billing_id,kind,intent->'request'->'target'->>'timelineId' AS timeline_id FROM app_audio_operation_sources WHERE email=$1 AND project_key=$2 AND intent->'request'->'target'->>'timelineId'=ANY($3::text[])",[actor,projectKey,timelineIds])).rows.map(row=>({id:String(row.billing_id),kind:row.kind as "speech"|"transcribe",timelineId:String(row.timeline_id)}));
}
/** Immutable source evidence only. The existing billing row owns acceptance,
 * concurrent exclusion, result checkpoints, unknown state and settlement. */
export async function recordAudioIntent(input:AudioIntent){
  await ensureAudioOperationSchema();
  const stored=(await getPool().query("INSERT INTO app_audio_operation_sources(billing_id,email,project_key,kind,intent) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(billing_id) DO NOTHING RETURNING billing_id",[`tool-${input.operationId}`,input.actor,input.request.target.projectKey,input.kind,JSON.stringify(input)])).rowCount;
  if(!stored){const old=await readAudioIntent(input.actor,input.operationId);if(canonicalConfig(old)!==canonicalConfig(input))throw new ModelConfigError("AUDIO_OPERATION_CONFLICT","声音操作编号已用于其他输入",409);}
}
export async function readAudioIntent(actor:string,operationId:string):Promise<AudioIntent|null>{
  await ensureAudioOperationSchema();return (await getPool().query("SELECT intent FROM app_audio_operation_sources WHERE email=$1 AND billing_id=$2",[actor.toLowerCase(),`tool-${operationId}`])).rows[0]?.intent??null;
}
