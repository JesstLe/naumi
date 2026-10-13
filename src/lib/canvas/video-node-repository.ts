import "server-only";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {getPool,ensureSchema} from "../db";
import {canonicalConfig} from "../model-config/repository";
import {ModelConfigError} from "../model-config/types";
import type {CanvasVideoNode,VideoNodeWrite} from "./video-node-schema";
let ready:Promise<void>|undefined;
export async function ensureVideoNodeSchema(){
  if(!ready)ready=ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_canvas_video_projects(email text NOT NULL,project_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,project_key));
    ALTER TABLE app_canvas_video_projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    CREATE TABLE IF NOT EXISTS app_canvas_video_nodes(email text NOT NULL,id text NOT NULL,project_key text NOT NULL,revision bigint NOT NULL DEFAULT 1,
      title text NOT NULL DEFAULT '视频',x double precision NOT NULL DEFAULT 0,y double precision NOT NULL DEFAULT 0,
      width double precision NOT NULL DEFAULT 384,height double precision NOT NULL DEFAULT 320,config jsonb NOT NULL DEFAULT '{}',inputs jsonb NOT NULL DEFAULT '[]',
      last_task_id text,last_result_id text,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,id));
    CREATE INDEX IF NOT EXISTS app_canvas_video_nodes_project_idx ON app_canvas_video_nodes(email,project_key,updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_canvas_video_node_operations(email text NOT NULL,operation_id uuid NOT NULL,node_id text NOT NULL,
      input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
    CREATE TABLE IF NOT EXISTS app_canvas_video_node_copies(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,
      result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  `)).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;
}
function mapNode(row:Record<string,any>):CanvasVideoNode{return {id:String(row.id),projectKey:String(row.project_key),revision:Number(row.revision),title:String(row.title),x:Number(row.x),y:Number(row.y),width:Number(row.width),height:Number(row.height),
  config:row.config,inputs:row.inputs,lastTaskId:row.last_task_id||null,lastResultId:row.last_result_id||null,deletedAt:row.deleted_at?new Date(row.deleted_at).toISOString():null,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
export async function getVideoNode(actor:string,id:string,includeDeleted=false){await ensureVideoNodeSchema();const row=(await getPool().query("SELECT * FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 AND ($3 OR deleted_at IS NULL)",[actor,id,includeDeleted])).rows[0];return row?mapNode(row):null;}
export async function listVideoNodes(actor:string,projectKey?:string,includeDeleted=false){await ensureVideoNodeSchema();return (await getPool().query("SELECT * FROM app_canvas_video_nodes WHERE email=$1 AND ($2::text IS NULL OR project_key=$2) AND ($3 OR deleted_at IS NULL) ORDER BY created_at,id LIMIT 2000",[actor,projectKey||null,includeDeleted])).rows.map(mapNode);}
export async function saveVideoNodeTx(client:PoolClient,actor:string,input:VideoNodeWrite,projectKey:string):Promise<CanvasVideoNode>{
  // Serialize graph edits before per-node locks, including copies and cross-project references.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-op:${actor}:${input.operationId}`]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node:${actor}:${input.id}`]);
  const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const replay=(await client.query("SELECT node_id,input_digest,result FROM app_canvas_video_node_operations WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
  if(replay){if(replay.node_id!==input.id||replay.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","操作编号已用于另一节点修改",409);return replay.result as CanvasVideoNode;}
  const old=(await client.query("SELECT * FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[actor,input.id])).rows[0];
  if(old&&Number(old.revision)!==input.expectedRevision||!old&&input.expectedRevision!==0)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点已更新，请重新读取后修改",409);
  if(old&&old.project_key!==projectKey)throw new ModelConfigError("VIDEO_NODE_PROJECT_CONFLICT","请复制节点到目标项目",409);
  if(input.deleted!==true&&(input.inputs!==undefined||input.deleted===false)){
    const graph=new Map<string,string[]>((await client.query("SELECT id,inputs FROM app_canvas_video_nodes WHERE email=$1 AND deleted_at IS NULL",[actor])).rows.map(row=>[String(row.id),(row.inputs as CanvasVideoNode["inputs"]).filter(ref=>ref.kind!=="text").map(ref=>ref.nodeId.replace(/^(?:image|video|audio):/,""))]));
    const sources=(input.inputs??old?.inputs??[]) as CanvasVideoNode["inputs"];
    graph.set(input.id,sources.filter(ref=>ref.kind!=="text").map(ref=>ref.nodeId.replace(/^(?:image|video|audio):/,"")));
    const pending=[...(graph.get(input.id)||[])],seen=new Set<string>();
    while(pending.length){const id=pending.pop()!;if(id===input.id)throw new ModelConfigError("VIDEO_DEPENDENCY_CYCLE","视频引用不能形成循环",422);if(seen.has(id))continue;seen.add(id);pending.push(...(graph.get(id)||[]));}
  }
  await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT(email,project_key) DO UPDATE SET deleted_at=NULL",[actor,projectKey]);
  const row=(await client.query(`INSERT INTO app_canvas_video_nodes(email,id,project_key,title,x,y,width,height,config,inputs,deleted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,CASE WHEN $11 THEN now() ELSE NULL END)
    ON CONFLICT(email,id) DO UPDATE SET title=EXCLUDED.title,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,
      config=EXCLUDED.config,inputs=EXCLUDED.inputs,deleted_at=EXCLUDED.deleted_at,revision=app_canvas_video_nodes.revision+1,updated_at=now() RETURNING *`,
    [actor,input.id,projectKey,input.title??old?.title??"视频",input.x??old?.x??0,input.y??old?.y??0,input.width??old?.width??384,input.height??old?.height??320,
      JSON.stringify(input.config??old?.config??{}),JSON.stringify(input.inputs??old?.inputs??[]),input.deleted===undefined?!!old?.deleted_at:input.deleted])).rows[0];
  const result=mapNode(row);
  await client.query("INSERT INTO app_canvas_video_node_operations(email,operation_id,node_id,input_digest,result) VALUES($1,$2,$3,$4,$5::jsonb)",[actor,input.operationId,input.id,digest,JSON.stringify(result)]);
  return result;
}
/** Caller owns the reservation transaction; no nested BEGIN or COMMIT. */
export async function associateVideoTaskTx(client:PoolClient,actor:string,nodeId:string,revision:number,taskId:string){
  const node=(await client.query("SELECT revision,last_task_id,deleted_at FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[actor,nodeId])).rows[0];
  if(!node||node.deleted_at)throw new ModelConfigError("VIDEO_NODE_UNAVAILABLE","视频节点不存在",404);
  if(node.last_task_id===taskId)return;
  if(Number(node.revision)!==revision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点已更新，生成没有提交",409);
  const ownTask=(await client.query("SELECT id FROM app_video_tasks WHERE email=$1 AND id=$2",[actor,taskId])).rows[0];
  if(!ownTask)throw new ModelConfigError("VIDEO_TASK_UNAVAILABLE","视频任务不存在",404);
  await client.query("UPDATE app_canvas_video_nodes SET last_task_id=$3,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2",[actor,nodeId,taskId]);
}
/** Older tasks cannot replace the latest node result, and soft deletion remains reversible. */
export async function completeVideoNodeTx(client:PoolClient,actor:string,nodeId:string,taskId:string,resultId:string){
  await client.query(`UPDATE app_canvas_video_nodes SET last_result_id=$4,revision=revision+1,updated_at=now()
    WHERE email=$1 AND id=$2 AND last_task_id=$3 AND last_result_id IS DISTINCT FROM $4`,[actor,nodeId,taskId,resultId]);
}
