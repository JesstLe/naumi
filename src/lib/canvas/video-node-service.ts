import "server-only";
import {createHash} from "node:crypto";
import {getPool,listArtworksByIds,getVideoTask,type ArtworkRecord} from "../db";
import {canonicalConfig} from "../model-config/repository";
import {publicVideoTaskSnapshot} from "../video/task-snapshot";
import {importVideoAsset} from "../video/assets";
import {storageKeyFromManagedUrl} from "../storage";
import type {OrderedInput} from "../video/references";
import {ownedVideoWorkflowSource} from "../video/workflow-source";
import {verifiedOwnedMedia} from "../video/media-inspection";
import {ModelConfigError} from "../model-config/types";
import {authorizeVideoReferences} from "../video/reference-materialization";
import {videoNodeWriteSchema,videoNodeConfigSchema,videoProjectKeySchema,type CanvasVideoNode,type VideoNodeWrite} from "./video-node-schema";
import {ensureVideoNodeSchema,getVideoNode,listVideoNodes,saveVideoNodeTx,associateVideoTaskTx,completeVideoNodeTx} from "./video-node-repository";
export {getVideoNode,listVideoNodes};

export async function authorizeVideoProject(actor:string,rawKey:string){
  const parsed=videoProjectKeySchema.safeParse(rawKey);if(!parsed.success)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","画布项目不存在",404);
  await ensureVideoNodeSchema();const pool=getPool(),[kind,id]=[rawKey.slice(0,rawKey.indexOf(":")),rawKey.slice(rawKey.indexOf(":")+1)];
  const own=(await pool.query(`SELECT 1 FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2
    UNION ALL SELECT 1 FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND
      (($3='tree' AND (group_id=$4 OR id=$4)) OR ($3='batch' AND batch_id=$4)) LIMIT 1`,[actor,rawKey,kind,id])).rowCount;
  if(!own)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","画布项目不存在或无权访问",404);
}
async function mayCreateOwnRoot(actor:string,input:VideoNodeWrite,key:string){
  if(key!==`tree:${input.id}`)return false;
  const other=(await getPool().query(`SELECT 1 FROM app_canvas_video_projects WHERE project_key=$1 AND email<>$2
    UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE project_key=$1 AND email<>$2
    UNION ALL SELECT 1 FROM app_artworks WHERE email<>$2 AND (group_id=$3 OR id=$3) LIMIT 1`,[key,actor,input.id])).rowCount;
  return !other;
}
export async function authorizeNodeInputs(actor:string,input:VideoNodeWrite){
  const config=input.config;
  if(config?.workflowTaskId&&!await ownedVideoWorkflowSource(actor,config.workflowTaskId))throw new ModelConfigError("VIDEO_WORKFLOW_UNAVAILABLE","历史工作流不存在或无权访问",404);
  if(config?.references?.length||config?.elements?.length){await authorizeVideoReferences(actor,{source:"canvas",providerId:config.providerId||"managed-video",modelId:config.modelId||"",prompt:config.prompt||"",durationSeconds:config.durationSeconds??4,
    references:config.references||[],elements:config.elements,idempotencyKey:input.operationId});}
  for(const ref of input.inputs||[]){
    if(ref.kind==="text"){
      if(ref.nodeId.startsWith("inline:"))continue;
      const id=ref.nodeId.replace(/^text:/,"");
      if(!(await getPool().query("SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[actor,id])).rowCount)throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","引用文字节点不存在或无权访问",404);
    }else{
      const nodeId=ref.nodeId.replace(/^(?:image|video|audio):/,""),art=(await listArtworksByIds(actor,[nodeId]))[0];
      if(!art&&!await getVideoNode(actor,nodeId))throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","引用媒体节点不存在或无权访问",404);
    }
  }
}
export async function saveVideoNode(actorRaw:string,raw:unknown):Promise<CanvasVideoNode>{
  const actor=actorRaw.toLowerCase(),parsed=videoNodeWriteSchema.safeParse(raw);
  if(!parsed.success)throw new ModelConfigError("INVALID_VIDEO_NODE","视频节点字段无效",422,parsed.error.issues.map(issue=>issue.path.join(".")));
  const input=parsed.data;await ensureVideoNodeSchema();const existing=await getVideoNode(actor,input.id,true),key=input.projectKey||existing?.projectKey||`tree:${input.id}`;
  try{await authorizeVideoProject(actor,key);}catch(error){if(!(error instanceof ModelConfigError)||!await mayCreateOwnRoot(actor,input,key))throw error;}
  await authorizeNodeInputs(actor,input);
  const client=await getPool().connect();
  try{await client.query("BEGIN");const node=await saveVideoNodeTx(client,actor,input,key);await client.query("COMMIT");return node;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function copyVideoNodes(actor:string,ids:string[],targetProject:string,operationId:string){
  actor=actor.toLowerCase();
  await authorizeVideoProject(actor,targetProject);if(!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw new ModelConfigError("INVALID_VIDEO_NODE_COPY","请选择不重复的视频节点",422);
  const originals:CanvasVideoNode[]=[];for(const id of ids){const node=await getVideoNode(actor,id);if(!node)throw new ModelConfigError("VIDEO_NODE_UNAVAILABLE","视频节点不存在",404);originals.push(node);}
  for(const node of originals)await authorizeNodeInputs(actor,{id:node.id,expectedRevision:node.revision,operationId,config:node.config,inputs:node.inputs});
  const mapping=new Map(originals.map(node=>[node.id,`vnode-copy-${createHash("sha256").update(`${operationId}:${node.id}`).digest("hex").slice(0,40)}`]));
  const digest=createHash("sha256").update(canonicalConfig({ids,targetProject})).digest("hex"),client=await getPool().connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-copy:${actor}:${operationId}`]);
    const previous=(await client.query("SELECT input_digest,result FROM app_canvas_video_node_copies WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0];
    if(previous){if(previous.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","复制操作编号已用于另一请求",409);await client.query("COMMIT");return previous.result as {nodes:CanvasVideoNode[];idMap:Record<string,string>};}
    const nodes:CanvasVideoNode[]=[];
    for(const node of originals){
      const bytes=createHash("sha256").update(`${operationId}:node:${node.id}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=bytes.toString("hex"),op=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      const copied=videoNodeWriteSchema.parse({id:mapping.get(node.id)!,projectKey:targetProject,expectedRevision:0,operationId:op,title:node.title,
        x:node.x+40,y:node.y+40,width:node.width,height:node.height,config:node.config,
        inputs:node.inputs.map(input=>{const prefix=input.nodeId.match(/^(?:video|image|audio):/)?.[0]||"",id=input.nodeId.slice(prefix.length);return {...input,nodeId:mapping.has(id)?`${prefix}${mapping.get(id)}`:input.nodeId};})});
      nodes.push(await saveVideoNodeTx(client,actor,copied,targetProject));
    }
    const result={nodes,idMap:Object.fromEntries(mapping)};
    await client.query("INSERT INTO app_canvas_video_node_copies(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,operationId,digest,JSON.stringify(result)]);
    await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
function stableOperation(value:string){const bytes=createHash("sha256").update(value).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
/** Owned immutable outputs and frozen inputs are atomically attached once per target project. */
export async function sendVideoTaskToCanvas(actorRaw:string,taskId:string,target?:string){
  const actor=actorRaw.toLowerCase(),task=await getVideoTask(actor,taskId);
  if(!task)throw new ModelConfigError("VIDEO_TASK_UNAVAILABLE","视频任务不存在",404);
  if(task.status!=="completed"||!task.artworkId||!task.videoUrl)throw new ModelConfigError("VIDEO_NOT_COMPLETED","视频任务尚未完成",409);
  const primary=(await listArtworksByIds(actor,[task.artworkId]))[0],key=target||String(task.parameters?.projectKey||`tree:${primary?.groupId||task.artworkId}`);
  await authorizeVideoProject(actor,key);
  const replay=(await getPool().query("SELECT result FROM app_canvas_video_task_sends WHERE email=$1 AND task_id=$2 AND project_key=$3",[actor,taskId,key])).rows[0];if(replay)return {...replay.result,replayed:true};
  if(!primary)throw new ModelConfigError("VIDEO_RESULT_UNAVAILABLE","视频结果已删除",404);
  const snapshot=publicVideoTaskSnapshot(task),resultIds=[...new Set([task.artworkId,...(Array.isArray(task.parameters.resultAssets)?task.parameters.resultAssets.map(asset=>(asset as {artworkId:string}).artworkId):[])])];
  const resultArts=await listArtworksByIds(actor,resultIds);if(resultArts.length!==resultIds.length)throw new ModelConfigError("VIDEO_RESULT_UNAVAILABLE","部分视频产物已删除或无法访问",404);
  const inputArts=new Map<string,ArtworkRecord>(),preparedInputs:OrderedInput[]=[];
  for(const [index,input] of snapshot.inputs.entries()){
    if(input.kind==="text"){preparedInputs.push({...input,nodeId:`inline:frozen-${createHash("sha256").update(`${taskId}:${input.id}`).digest("hex").slice(0,32)}`});continue;}
    const ref=snapshot.config.references?.find(ref=>ref.id===input.id),sourceId=ref?.artworkId||input.nodeId.replace(/^(?:image|video|audio):/,""),key=ref?.storageKey||storageKeyFromManagedUrl(input.value);
    let source:ArtworkRecord|undefined=(await listArtworksByIds(actor,[sourceId]))[0];if(source&&key&&storageKeyFromManagedUrl(source.videoUrl||source.image)!==key)source=undefined;
    if(key)await verifiedOwnedMedia(actor,key,source?.id||null,ref?.sha256);
    if(!source){if(!key)throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","历史素材身份无法确认",422);
      const imported=await importVideoAsset(actor,{operationId:stableOperation(`send-input:${actor}:${taskId}:${input.id}`),storageKey:key,title:`引用 ${index+1}`,kind:input.kind});source=(await listArtworksByIds(actor,[imported.artworkId]))[0];}
    if(!source)throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","历史素材已删除",404);inputArts.set(source.id,source);preparedInputs.push({...input,nodeId:source.id});
  }
  const digest=createHash("sha256").update(`${actor}:${taskId}:${key}`).digest("hex").slice(0,40),nodeId=`vnode-result-${digest}`,allArts=new Map([...resultArts,...inputArts.values()].map(art=>[art.id,art]));
  const sameProject=(art:ArtworkRecord)=>key===`tree:${art.groupId||art.id}`||key===`batch:${art.batchId}`;
  const mapping=new Map([...allArts.values()].map(art=>[art.id,sameProject(art)?art.id:`vid-ref-${createHash("sha256").update(`${actor}:${taskId}:${key}:${art.id}`).digest("hex").slice(0,40)}`]));
  const artworkId=mapping.get(primary.id)!,artworkIds=resultIds.map(id=>mapping.get(id)!),inputArtworkIds=[...inputArts.keys()].map(id=>mapping.get(id)!);
  const config=videoNodeConfigSchema.parse({...snapshot.config,shots:snapshot.config.shots?.map(shot=>({...shot,textNodeId:undefined})),references:snapshot.config.references?.map(ref=>({...ref,artworkId:ref.artworkId?mapping.get(ref.artworkId)||ref.artworkId:undefined})),elements:snapshot.config.elements?.map(element=>({...element,references:element.references.map(ref=>({...ref,artworkId:ref.artworkId?mapping.get(ref.artworkId)||ref.artworkId:undefined}))}))});
  const client=await getPool().connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    const previous=(await client.query("SELECT result FROM app_canvas_video_task_sends WHERE email=$1 AND task_id=$2 AND project_key=$3",[actor,taskId,key])).rows[0];if(previous){await client.query("COMMIT");return {...previous.result,replayed:true};}
    const project=(await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2",[actor,key])).rows[0];if(project?.deleted_at)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","目标项目已删除",409);
    if(typeof task.parameters.workflowManifestEnc==="string")await client.query("INSERT INTO app_canvas_video_workflow_sources(email,task_id,public_model_id,manifest_enc,digest) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[actor,taskId,String(task.parameters.publicModelId||task.model),task.parameters.workflowManifestEnc,task.parameters.workflowManifestDigest||null]);
    for(const art of allArts.values()){
      const id=mapping.get(art.id)!;
      if(id!==art.id)await client.query(`INSERT INTO app_artworks SELECT (jsonb_populate_record(NULL::app_artworks,to_jsonb(src)||jsonb_build_object(
        'id',$3::text,'group_id',CASE WHEN $4='tree' THEN $5 ELSE NULL END,'batch_id',CASE WHEN $4='batch' THEN $5 ELSE NULL END,
        'parent_id',$6::text,'parent_ids',$7::jsonb,'origin','canvas','canvas_group_id',NULL,'canvas_x',NULL,'canvas_y',NULL,'deleted_at',NULL,'created_at',now(),'updated_at',now()))).* FROM app_artworks src
        WHERE email=$1 AND id=$2 AND deleted_at IS NULL ON CONFLICT(id) DO NOTHING`,[actor,art.id,id,key.split(":")[0],key.slice(key.indexOf(":")+1),art.parentId?mapping.get(art.parentId)||art.parentId:null,JSON.stringify((art.parentIds||[]).map(parent=>mapping.get(parent)||parent))]);
      if(!(await client.query("UPDATE app_artworks SET origin='canvas' WHERE email=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",[actor,id])).rowCount)throw new ModelConfigError("VIDEO_RESULT_UNAVAILABLE","素材已删除，发送没有完成",404);
    }
    const node=await saveVideoNodeTx(client,actor,{id:nodeId,projectKey:key,expectedRevision:0,operationId:stableOperation(`send:${actor}:${taskId}:${key}`),title:primary.title,config,inputs:preparedInputs.map(input=>({...input,nodeId:input.kind==="text"?input.nodeId:mapping.get(input.nodeId)!}))},key);
    await associateVideoTaskTx(client,actor,nodeId,node.revision,taskId);await completeVideoNodeTx(client,actor,nodeId,taskId,artworkId);
    const result={artworkId,artworkIds,inputArtworkIds,nodeId,projectKey:key,reused:sameProject(primary)};await client.query("INSERT INTO app_canvas_video_task_sends(email,task_id,project_key,result) VALUES($1,$2,$3,$4::jsonb)",[actor,taskId,key,JSON.stringify(result)]);
    await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
