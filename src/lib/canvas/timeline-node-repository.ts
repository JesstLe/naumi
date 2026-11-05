import "server-only";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {newTimelineProject} from "../timeline/project";
import type {CanvasTimelineNode,TimelineNodeWrite,TimelineRender} from "./timeline-node-schema";

export {ensureTimelineNodeSchema} from "./storage-schema";
import {ensureTimelineNodeSchema} from "./storage-schema";
export function mapTimelineNode(row:Record<string,any>):CanvasTimelineNode{
  return {id:String(row.id),projectKey:String(row.project_key),revision:Number(row.revision),title:String(row.title),x:Number(row.x),y:Number(row.y),width:Number(row.width),height:Number(row.height),
    timeline:row.timeline,adopted:row.adopted||null,render:row.render||null,deletedAt:row.deleted_at?new Date(row.deleted_at).toISOString():null,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};
}
export async function getTimelineNode(actor:string,id:string,includeDeleted=false){
  await ensureTimelineNodeSchema();const row=(await getPool().query("SELECT * FROM app_canvas_timeline_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)",[actor.toLowerCase(),id,includeDeleted])).rows[0];return row?mapTimelineNode(row):null;
}
export async function listTimelineNodes(actor:string,includeDeleted=false){
  await ensureTimelineNodeSchema();return (await getPool().query("SELECT * FROM app_canvas_timeline_nodes WHERE email=$1 AND ($2 OR deleted_at IS NULL) ORDER BY created_at,id",[actor.toLowerCase(),includeDeleted])).rows.map(mapTimelineNode);
}
const digest=(value:unknown)=>createHash("sha256").update(canonicalConfig(value)).digest("hex");
export async function findTimelineOperation(actor:string,operationId:string,input:unknown,tx?:PoolClient){
  if(!tx)await ensureTimelineNodeSchema();const row=(await (tx??getPool()).query("SELECT input_digest,result FROM app_canvas_timeline_operations WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0];
  if(row&&row.input_digest!==digest(input))throw new ModelConfigError("TIMELINE_OPERATION_CONFLICT","操作编号已用于另一项多轨修改",409);return row?.result as CanvasTimelineNode|undefined;
}
export async function findTimelineRenderIntent(actor:string,operationId:string,tx?:PoolClient){
  if(!tx)await ensureTimelineNodeSchema();const saved=(await (tx??getPool()).query("SELECT result FROM app_canvas_timeline_operations WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0]?.result as CanvasTimelineNode|undefined;
  return saved?.render?.operationId===operationId?saved:undefined;
}
/** Caller owns reference/scope validation and the shared graph transaction.
 * Render is an internal-only patch, never a field in the public write schema. */
export async function saveTimelineNodeTx(tx:PoolClient,actor:string,input:TimelineNodeWrite,projectKey:string,render?:TimelineRender|null):Promise<CanvasTimelineNode>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
  const identity={input,projectKey,...(render!==undefined?{render}:{})},previous=await findTimelineOperation(actor,input.operationId,identity,tx);if(previous)return previous;
  const old=(await tx.query("SELECT * FROM app_canvas_timeline_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[actor,input.id])).rows[0];
  if(old?Number(old.revision)!==input.expectedRevision:input.expectedRevision!==0)throw new ModelConfigError("TIMELINE_REVISION_CONFLICT","多轨工程已更新，请读取最新版本后保存",409);
  if(old&&old.project_key!==projectKey)throw new ModelConfigError("TIMELINE_PROJECT_CONFLICT","请复制多轨节点到目标画布",409);
  if((await tx.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2",[actor,projectKey])).rows[0]?.deleted_at)throw new ModelConfigError("TIMELINE_PROJECT_UNAVAILABLE","画布项目已删除",409);
  await tx.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING",[actor,projectKey]);
  const row=(await tx.query(`INSERT INTO app_canvas_timeline_nodes(email,id,project_key,title,x,y,width,height,timeline,adopted,render,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,CASE WHEN $12 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,timeline=EXCLUDED.timeline,adopted=EXCLUDED.adopted,render=EXCLUDED.render,deleted_at=EXCLUDED.deleted_at,revision=app_canvas_timeline_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor,input.id,projectKey,input.title??old?.title??"多轨",input.x??old?.x??0,input.y??old?.y??0,input.width??old?.width??400,input.height??old?.height??280,
      JSON.stringify(input.timeline??old?.timeline??newTimelineProject()),JSON.stringify(input.adopted===undefined?old?.adopted??null:input.adopted),JSON.stringify(render===undefined?old?.render??null:render),input.deleted===undefined?!!old?.deleted_at:input.deleted])).rows[0];
  const result=mapTimelineNode(row);await tx.query("INSERT INTO app_canvas_timeline_operations(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest(identity),JSON.stringify(result)]);return result;
}
