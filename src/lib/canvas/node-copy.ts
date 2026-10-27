import {ensureCanvasNodeCopySchema} from "./storage-schema";
import "server-only";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {listCanvasTextNodes, type CanvasTextNodeRecord} from "@/lib/canvas/text-node-repository";
import {saveVideoNodeTx} from "./video-node-repository";
import {ensureVideoNodeSchema} from "@/lib/canvas/storage-schema";

import { authorizeNodeInputs, listVideoNodes } from "./video-node-service";
import { authorizeVideoProject } from "./project-access";
import type {CanvasVideoNode} from "./video-node-schema";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";

import {ensureDirectorNodeSchema} from "./storage-schema";
import {listDirectorNodes,saveDirectorNodeTx} from "./director-node-repository";
import {authorizeDirectorInputs} from "./director-node-service";
import type {CanvasDirectorNode} from "./director-node-schema";
import {assertCreationProjectInput} from "../saas/creation-access";
import {nodeCopyRequest,type CanvasNodeCopyInput,type CanvasNodeCopyResult as CopyResult} from "./node-copy-contract";
export {nodeCopyRequest} from "./node-copy-contract";
function stableUuid(seed:string){const bytes=createHash("sha256").update(seed).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
/** Copies media identities and editable records together. No supplier requests, media writes, task replay or fees. */
export async function copyCanvasNodes(actorRaw:string,raw:CanvasNodeCopyInput):Promise<CopyResult>{
  const actor=actorRaw.toLowerCase(),input=nodeCopyRequest.parse(raw);await ensureSchema();await ensureVideoNodeSchema();await ensureDirectorNodeSchema();
  const pool=getPool();await ensureCanvasNodeCopySchema();
  const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const previous=(await pool.query("SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
  if(previous){if(previous.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","复制操作编号已用于另一请求",409);return previous.result;}
  const [artworks,textNodes,videoNodes,directorRecords]=await Promise.all([listArtworksByIds(actor,input.ids),listCanvasTextNodes(actor),listVideoNodes(actor),listDirectorNodes(actor)]);
  const wanted=new Set(input.ids),texts=textNodes.filter(node=>wanted.has(node.id)),videos=videoNodes.filter(node=>wanted.has(node.id)),directors=directorRecords.filter(node=>wanted.has(node.id));
  const kinds=new Map([...artworks.map(node=>[node.id,"art"] as const),...texts.map(node=>[node.id,"text"] as const),...videos.map(node=>[node.id,"vnode"] as const),...directors.map(node=>[node.id,"director"] as const)]);
  if(input.ids.some(id=>!kinds.has(id)))throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","复制节点不存在或无权访问",404);
  if(input.singleArtwork&&artworks.length!==1)throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","单图复制来源不是作品",422);
  for(const node of videos)await authorizeNodeInputs(actor,{id:node.id,operationId:input.operationId,expectedRevision:node.revision,config:node.config,inputs:node.inputs});
  for(const node of directors){await assertCreationProjectInput(actor,node.projectKey);await authorizeDirectorInputs(actor,{project:node.project});}
  const mapping=new Map(input.ids.map(id=>[id,`${kinds.get(id)}-copy-${createHash("sha256").update(`${actor}:${input.operationId}:${id}`).digest("hex").slice(0,40)}`]));
  const key=input.projectKey||`tree:${mapping.get(input.ids[0])}`;
  if(input.projectKey)await authorizeVideoProject(actor,key);
  const remap=(id:string)=>mapping.get(id)||id;
  const remapReference=(nodeId:string)=>{const prefix=nodeId.match(/^(?:text|image|video|audio):/)?.[0]||"";return `${prefix}${remap(nodeId.slice(prefix.length))}`;};
  const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    const saved=(await client.query("SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
    if(saved){if(saved.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","复制操作编号已用于另一请求",409);await client.query("COMMIT");return saved.result;}
    await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING",[actor,key]);
    const [kind,projectId]=[key.slice(0,key.indexOf(":")),key.slice(key.indexOf(":")+1)];
    const artworkIds:string[]=[],copiedTexts:CanvasTextNodeRecord[]=[],nodes:CanvasVideoNode[]=[],directorNodes:CanvasDirectorNode[]=[];
    for(const node of artworks){
      const current=(await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current)throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","复制媒体已删除",409);
      const newId=mapping.get(node.id)!,sameProject=kind==="tree"?current.group_id===projectId:current.batch_id===projectId;
      const fields={id:newId,email:actor,group_id:kind==="tree"?projectId:newId,batch_id:kind==="batch"?projectId:null,canvas_group_id:null,
        parent_id:current.parent_id&&(mapping.has(current.parent_id)||sameProject)?remap(current.parent_id):null,parent_ids:(current.parent_ids||[]).filter((id:string)=>mapping.has(id)||sameProject).map(remap),
        canvas_x:Number(current.canvas_x||0)+40,canvas_y:Number(current.canvas_y||0)+40,origin:"canvas",source_url:current.source_url,source:"canvas-add",deleted_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        ...(input.singleArtwork?{canvas_x:input.singleArtwork.x,canvas_y:input.singleArtwork.y,title:input.singleArtwork.title??current.title,
          source_url:"canvas-add",parent_id:kind==="tree"&&projectId!==newId?projectId:null,parent_ids:[],
          creation_provenance:{version:1,operation:"copy",entry:"canvas",ref:newId,sourceArtworkId:node.id,evidence:"server-route"}}:{} )};
      const result=await client.query("INSERT INTO app_artworks SELECT (jsonb_populate_record(NULL::app_artworks,to_jsonb(src)||$3::jsonb)).* FROM app_artworks src WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[actor,node.id,JSON.stringify(fields)]);
      if(!result.rowCount)throw new Error("复制媒体失败");artworkIds.push(newId);
    }
    for(const node of texts){
      const current=(await client.query("SELECT * FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 FOR SHARE",[actor,node.id])).rows[0];if(!current)throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","复制文字已删除",409);
      const fields={id:mapping.get(node.id)!,email:actor,project_key:key,status:current.status==="generating"?"idle":current.status,
        canvas_x:Number(current.canvas_x||0)+40,canvas_y:Number(current.canvas_y||0)+40,source_ids:(current.source_ids||[]).map(remap),target_ids:(current.target_ids||[]).filter((id:string)=>mapping.has(id)).map(remap),product_ids:(current.product_ids||[]).map(remap),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      await client.query("INSERT INTO app_canvas_text_nodes SELECT (jsonb_populate_record(NULL::app_canvas_text_nodes,to_jsonb(src)||$3::jsonb)).* FROM app_canvas_text_nodes src WHERE email=$1 AND id=$2",[actor,node.id,JSON.stringify(fields)]);
      copiedTexts.push({...node,title:String(current.title),prompt:String(current.prompt||""),content:String(current.content||""),width:Number(current.canvas_width),height:Number(current.canvas_height),id:fields.id,projectKey:key,status:fields.status,canvasX:fields.canvas_x,canvasY:fields.canvas_y,sourceIds:fields.source_ids,targetIds:fields.target_ids,productIds:fields.product_ids,createdAt:fields.created_at,updatedAt:fields.updated_at});
    }
    for(const node of videos){
      const current=(await client.query("SELECT revision FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","视频节点已更新，请重新复制",409);
      const refs=(values:CanvasVideoNode["config"]["references"])=>values?.map(ref=>({...ref,artworkId:ref.artworkId?remap(ref.artworkId):undefined}));
      const config={...node.config,references:refs(node.config.references),elements:node.config.elements?.map(element=>({...element,references:refs(element.references)!})),shots:node.config.shots?.map(shot=>({...shot,textNodeId:shot.textNodeId?remapReference(shot.textNodeId):undefined}))};
      nodes.push(await saveVideoNodeTx(client,actor,{id:mapping.get(node.id)!,projectKey:key,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,config,inputs:node.inputs.map(ref=>({...ref,nodeId:remapReference(ref.nodeId)}))},key));
    }
    for(const node of directors){
      const current=(await client.query("SELECT revision FROM app_canvas_director_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("DIRECTOR_REVISION_CONFLICT","导演工程已更新，请重新复制",409);
      directorNodes.push(await saveDirectorNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,
        project:{...node.project,panoramaArtworkId:node.project.panoramaArtworkId?remap(node.project.panoramaArtworkId):null}},key));
    }
    // Copy shared properties only when that table already exists; do not initialize unrelated edit tables.
    if(!input.singleArtwork&&(await client.query("SELECT to_regclass('app_canvas_node_settings') AS name")).rows[0].name){for(const [oldId,newId] of mapping)await client.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) SELECT email,$3,kind,settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2 ON CONFLICT(email,node_id) DO NOTHING",[actor,oldId,newId]);}
    const result:CopyResult={artworkIds,textNodes:copiedTexts,nodes,...(directorNodes.length?{directorNodes}:{}),idMap:Object.fromEntries(mapping),projectKey:key};
    await client.query("INSERT INTO app_canvas_node_copies(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest,JSON.stringify(result)]);await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
