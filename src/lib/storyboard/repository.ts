import "server-only";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureVideoNodeSchema} from "../canvas/storage-schema";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import type {StoryboardPlan,StoryboardWrite,StoryboardLineage} from "./plan";

export async function ensureStoryboardSchema(){
  const state=databaseSchemaReadiness(getPool(),"storyboard-plans-v2");
  state.pending ||= ensureVideoNodeSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_storyboard_plans (
      email text NOT NULL,id uuid NOT NULL,project_key text NOT NULL,revision bigint NOT NULL DEFAULT 1,
      document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
    CREATE INDEX IF NOT EXISTS app_storyboard_plans_project ON app_storyboard_plans(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_storyboard_operations (
      email text NOT NULL,operation_id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(email,operation_id));
    ALTER TABLE app_storyboard_plans ADD COLUMN IF NOT EXISTS lineage jsonb;
    CREATE TABLE IF NOT EXISTS app_storyboard_fork_operations (
      email text NOT NULL,operation_id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(email,operation_id));
    CREATE TABLE IF NOT EXISTS app_storyboard_take_origins (
      email text NOT NULL,project_key text NOT NULL,node_id text NOT NULL,task_id text NOT NULL,artwork_id text NOT NULL,
      origin_node_id text NOT NULL,operation_id uuid NOT NULL,PRIMARY KEY(email,node_id,task_id,artwork_id));
  `)).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});
  await state.pending;
}
function map(row:Record<string,any>):StoryboardPlan{return {id:String(row.id),projectKey:String(row.project_key),revision:Number(row.revision),document:row.document,...(row.lineage?{lineage:row.lineage}:{}),createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
export async function readStoryboardPlans(actor:string,projectKey:string){await ensureStoryboardSchema();return (await getPool().query("SELECT * FROM app_storyboard_plans WHERE email=$1 AND project_key=$2 ORDER BY updated_at DESC,id",[actor,projectKey])).rows.map(map);}
export async function readStoryboardPlan(actor:string,id:string,tx?:Pick<PoolClient,"query">){await ensureStoryboardSchema();const row=(await (tx??getPool()).query("SELECT * FROM app_storyboard_plans WHERE email=$1 AND id=$2",[actor,id])).rows[0];return row?map(row):null;}
export async function readStoryboardOperation(actor:string,operationId:string){await ensureStoryboardSchema();return (await getPool().query("SELECT result FROM app_storyboard_operations WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0]?.result as StoryboardPlan|undefined;}
export async function saveStoryboardTx(tx:PoolClient,actor:string,input:StoryboardWrite,validate:()=>Promise<void>,lineage?:StoryboardLineage){
  // Same lock order as node changes; the operation receipt and plan CAS commit together.
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`storyboard-operation:${actor}:${input.operationId}`]);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`storyboard-plan:${actor}:${input.id}`]);
  const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const prior=(await tx.query("SELECT digest,result FROM app_storyboard_operations WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
  if(prior){if(prior.digest!==digest)throw new ModelConfigError("STORYBOARD_OPERATION_CONFLICT","保存编号已用于另一方案修改",409);return prior.result as StoryboardPlan;}
  const old=(await tx.query("SELECT project_key,revision FROM app_storyboard_plans WHERE email=$1 AND id=$2 FOR UPDATE",[actor,input.id])).rows[0];
  if(old&&old.project_key!==input.projectKey)throw new ModelConfigError("STORYBOARD_PROJECT_CONFLICT","方案不能移动到其他项目",409);
  if((old?Number(old.revision):0)!==input.expectedRevision)throw new ModelConfigError("STORYBOARD_REVISION_CONFLICT","方案已在另一处修改，请载入最新方案",409);
  await validate();
  const row=(await tx.query(`INSERT INTO app_storyboard_plans(email,id,project_key,document,lineage) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)
    ON CONFLICT(email,id) DO UPDATE SET document=EXCLUDED.document,revision=app_storyboard_plans.revision+1,updated_at=now() RETURNING *`,[actor,input.id,input.projectKey,JSON.stringify(input.document),lineage?JSON.stringify(lineage):null])).rows[0];
  const plan=map(row);await tx.query("INSERT INTO app_storyboard_operations(email,operation_id,digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest,JSON.stringify(plan)]);return plan;
}

/** Only the fork service writes inheritance; public documents never supply task/node provenance. */
export async function inheritedStoryboardTakeOrigin(actor:string,projectKey:string,nodeId:string,take:{taskId:string;artworkId:string},tx?:Pick<PoolClient,"query">){
  await ensureStoryboardSchema();return (await (tx??getPool()).query("SELECT origin_node_id FROM app_storyboard_take_origins WHERE email=$1 AND project_key=$2 AND node_id=$3 AND task_id=$4 AND artwork_id=$5",[actor,projectKey,nodeId,take.taskId,take.artworkId])).rows[0]?.origin_node_id as string|undefined;
}
