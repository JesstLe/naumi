import "server-only";
import type {PoolClient} from "pg";
import type {TimelineProject} from "../timeline/project";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {ensureStoryboardSchema} from "./repository";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import type {TimelineNodeWrite,CanvasTimelineNode} from "../canvas/timeline-node-schema";
import type {RoughcutLink} from "./production";

export type RoughcutIntent={projectKey:string;planId:string;write:TimelineNodeWrite;clips:RoughcutLink["clips"];changes:Array<{nodeId:string;clipId:string;from:string;to:string}>;unchanged?:boolean;structure?:{kind:"sync"|"restore";beforeProject:TimelineProject;beforeClips:RoughcutLink["clips"];previewDigest?:string;sourceOperationId?:string};result?:{node:CanvasTimelineNode;link:RoughcutLink;operationId:string}};
async function schema(){const state=databaseSchemaReadiness(getPool(),"storyboard-production-v1");state.pending ||= ensureStoryboardSchema().then(()=>getPool().query(`
 CREATE TABLE IF NOT EXISTS app_storyboard_roughcuts(email text NOT NULL,plan_id uuid NOT NULL,project_key text NOT NULL,timeline_id text NOT NULL,revision bigint NOT NULL,link jsonb NOT NULL,PRIMARY KEY(email,timeline_id));
 CREATE TABLE IF NOT EXISTS app_storyboard_roughcut_operations(email text NOT NULL,operation_id uuid NOT NULL,digest text NOT NULL,intent jsonb NOT NULL,PRIMARY KEY(email,operation_id));
 `)).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;}
export async function roughcutLinks(actor:string,planId:string,tx?:PoolClient){if(!tx)await schema();return (await (tx??getPool()).query("SELECT link FROM app_storyboard_roughcuts WHERE email=$1 AND plan_id=$2 ORDER BY timeline_id",[actor,planId])).rows.map(row=>row.link as RoughcutLink);}
export async function readRoughcutIntent(actor:string,operationId:string,request:unknown){await schema();const row=(await getPool().query("SELECT digest,intent FROM app_storyboard_roughcut_operations WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0];if(!row)return null;if(row.digest!==createHash("sha256").update(canonicalConfig(request)).digest("hex"))throw new ModelConfigError("STORYBOARD_OPERATION_CONFLICT","粗剪编号已用于另一操作",409);return row.intent as RoughcutIntent;}
export async function reserveRoughcutIntent(actor:string,operationId:string,request:unknown,intent:RoughcutIntent){await schema();await getPool().query("INSERT INTO app_storyboard_roughcut_operations(email,operation_id,digest,intent) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[actor,operationId,createHash("sha256").update(canonicalConfig(request)).digest("hex"),JSON.stringify(intent)]);return (await readRoughcutIntent(actor,operationId,request))!;}
export async function recordRoughcut(actor:string,intent:RoughcutIntent,node:CanvasTimelineNode){
  await schema();const link:RoughcutLink={timelineId:node.id,revision:node.revision,title:node.title,clips:intent.clips};
  await getPool().query(`INSERT INTO app_storyboard_roughcuts(email,plan_id,project_key,timeline_id,revision,link) VALUES($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT(email,timeline_id) DO UPDATE SET revision=EXCLUDED.revision,link=EXCLUDED.link WHERE app_storyboard_roughcuts.revision<EXCLUDED.revision`,[actor,intent.planId,intent.projectKey,node.id,node.revision,JSON.stringify(link)]);
  return link;
}

export const ensureRoughcutSchema=schema;
/** Atomic structure edits join the timeline's existing graph transaction. */
export async function readRoughcutStructureOperation(actor:string,operationId:string,tx?:PoolClient){
 if(!tx)await schema();return (await (tx??getPool()).query("SELECT digest,intent FROM app_storyboard_roughcut_operations WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0] as {digest:string;intent:RoughcutIntent}|undefined;
}
export async function recordRoughcutStructureTx(tx:PoolClient,actor:string,request:unknown,intent:RoughcutIntent,node:CanvasTimelineNode){
 const link:RoughcutLink={timelineId:node.id,revision:node.revision,title:node.title,clips:intent.clips},result={node,link,operationId:intent.write.operationId};
 const updated=await tx.query(`UPDATE app_storyboard_roughcuts SET revision=$4,link=$5::jsonb
  WHERE email=$1 AND plan_id=$2 AND timeline_id=$3 AND revision<$4`,[actor,intent.planId,node.id,node.revision,JSON.stringify(link)]);
 if(updated.rowCount!==1)throw new ModelConfigError("STORYBOARD_CUT_CHANGED","粗剪关联已改变，未部分写入",409);
 await tx.query("INSERT INTO app_storyboard_roughcut_operations(email,operation_id,digest,intent) VALUES($1,$2,$3,$4::jsonb)",[actor,intent.write.operationId,createHash("sha256").update(canonicalConfig(request)).digest("hex"),JSON.stringify({...intent,result})]);
 return result;
}
