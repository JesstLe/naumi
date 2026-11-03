import {withTransaction} from "@/platform/db/transaction";
import {readNativeNodeReceiptsTx} from "./native-node-lifecycle";
import {canvasNativeIds} from "./native-node-records";
import {ensureTimelineNodeSchema} from "./storage-schema";
import {listTimelineNodes,saveTimelineNodeTx} from "./timeline-node-repository";
import {validateTimelineProject,validateTimelineAdoption} from "./timeline-project-validation";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {TimelineProject} from "../timeline/project";
import {listAudioNodes,saveAudioNodeTx} from "./audio-node-repository";
import {ensureAudioNodeSchema} from "./storage-schema";
import {validateAudioProject} from "./audio-project-validation";
import type {CanvasAudioNode} from "./audio-node-schema";
import {listSceneNodes,saveSceneNodeTx} from "./scene-node-repository";
import {ensureSceneNodeSchema} from "./storage-schema";
import {authorizeSceneImages,lockSceneImagesTx} from "./scene-references";
import type {CanvasSceneNode} from "./scene-node-schema";
import {parseSceneInputIdentity,sceneInputIdentity} from "../scene/project";
import {listCharacterNodes,saveCharacterNodeTx} from "./character-node-repository";
import {ensureCharacterNodeSchema} from "./storage-schema";
import {authorizeCharacterImages,lockCharacterImagesTx} from "./character-references";
import type {CanvasCharacterNode} from "./character-node-schema";
import {parseCharacterInputIdentity,characterInputIdentity} from "../character/project";
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
import {currentCreationContext} from "../saas/creation-scope";
import {ensureImagePromptSchema,writeCopiedImagePromptTx} from "./image-prompt-repository";
import {imagePromptDocumentSchema,remapImagePromptDocument} from "./image-prompt-schema";
import {authorizeImagePromptNodeTx} from "./image-prompt-service";
import {nodeCopyRequest,type CanvasNodeCopyInput,type CanvasNodeCopyResult as CopyResult} from "./node-copy-contract";
export {nodeCopyRequest} from "./node-copy-contract";
function stableUuid(seed:string){const bytes=createHash("sha256").update(seed).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
/** Copies media identities and editable records together. No supplier requests, media writes, task replay or fees. */
export async function copyCanvasNodes(actorRaw:string,raw:CanvasNodeCopyInput):Promise<CopyResult>{
  const actor=actorRaw.toLowerCase(),input=nodeCopyRequest.parse(raw);await ensureSchema();await ensureVideoNodeSchema();await ensureDirectorNodeSchema();await ensureCharacterNodeSchema();await ensureSceneNodeSchema();await ensureAudioNodeSchema();await ensureTimelineNodeSchema();await ensureImagePromptSchema();
  const pool=getPool();await ensureCanvasNodeCopySchema();
  const currentCopyReceipt=async(result:CopyResult)=>{
    return withTransaction(pool,async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
      return {...result,nativeNodes:await readNativeNodeReceiptsTx(client,actor,canvasNativeIds({videoNodes:result.nodes,...result}))};
    });
  };
  const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
  const previous=(await pool.query("SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
  if(previous){if(previous.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","复制操作编号已用于另一请求",409);return currentCopyReceipt(previous.result);}
  const [artworks,textNodes,videoNodes,directorRecords,characterRecords,sceneRecords,audioRecords,timelineRecords]=await Promise.all([listArtworksByIds(actor,input.ids),listCanvasTextNodes(actor),listVideoNodes(actor),listDirectorNodes(actor),listCharacterNodes(actor),listSceneNodes(actor),listAudioNodes(actor),listTimelineNodes(actor)]);
  const wanted=new Set(input.ids),texts=textNodes.filter(node=>wanted.has(node.id)),videos=videoNodes.filter(node=>wanted.has(node.id)),directors=directorRecords.filter(node=>wanted.has(node.id)),characters=characterRecords.filter(node=>wanted.has(node.id)),scenes=sceneRecords.filter(node=>wanted.has(node.id)),audios=audioRecords.filter(node=>wanted.has(node.id)),timelines=timelineRecords.filter(node=>wanted.has(node.id));
  const kinds=new Map([...artworks.map(node=>[node.id,"art"] as const),...texts.map(node=>[node.id,"text"] as const),...videos.map(node=>[node.id,"vnode"] as const),...directors.map(node=>[node.id,"director"] as const),...characters.map(node=>[node.id,"character"] as const),...scenes.map(node=>[node.id,"scene"] as const),...audios.map(node=>[node.id,"audio"] as const),...timelines.map(node=>[node.id,"timeline"] as const)]);
  if(input.detached&&kinds.get(input.ids[0])!=="art")throw new ModelConfigError("INVALID_NODE_COPY","独立复制仅支持图片节点",422);
  if(input.ids.some(id=>!kinds.has(id)))throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","复制节点不存在或无权访问",404);
  if(input.singleArtwork&&artworks.length!==1)throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","单图复制来源不是作品",422);
  for(const node of videos)await authorizeNodeInputs(actor,{id:node.id,operationId:input.operationId,expectedRevision:node.revision,config:node.config,inputs:node.inputs});
  for(const node of directors){await assertCreationProjectInput(actor,node.projectKey);await authorizeDirectorInputs(actor,{project:node.project});}
  for(const node of characters){await assertCreationProjectInput(actor,node.projectKey);await authorizeCharacterImages(actor,node.character);}
  for(const node of scenes){await assertCreationProjectInput(actor,node.projectKey);await authorizeSceneImages(actor,node.scene);}
  for(const node of audios){await assertCreationProjectInput(actor,node.projectKey);await validateAudioProject(actor,node.audio);}
  for(const node of timelines){await assertCreationProjectInput(actor,node.projectKey);await validateTimelineProject(actor,node.timeline);if(node.adopted)await validateTimelineAdoption(actor,node.adopted);}
  const mapping=new Map(input.ids.map(id=>[id,`${kinds.get(id)}-copy-${createHash("sha256").update(`${actor}:${input.operationId}:${id}`).digest("hex").slice(0,40)}`]));
  const key=input.projectKey||`tree:${mapping.get(input.ids[0])}`;
  if(input.projectKey)await authorizeVideoProject(actor,key);
  const remap=(id:string)=>mapping.get(id)||id;
  const remapReference=(nodeId:string)=>{const scene=parseSceneInputIdentity(nodeId);if(scene)return sceneInputIdentity(remap(scene.id),scene.stateId);const character=parseCharacterInputIdentity(nodeId);if(character)return characterInputIdentity(remap(character.id),character.appearanceId);const prefix=nodeId.match(/^(?:text|image|video|audio|audio-node|timeline-node):/)?.[0]||"";return `${prefix}${remap(nodeId.slice(prefix.length))}`;};
  const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    const saved=(await client.query("SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
    if(saved){if(saved.input_digest!==digest)throw new ModelConfigError("NODE_OPERATION_CONFLICT","复制操作编号已用于另一请求",409);const nativeNodes=await readNativeNodeReceiptsTx(client,actor,canvasNativeIds({videoNodes:saved.result.nodes,...saved.result}));await client.query("COMMIT");return {...saved.result,nativeNodes};}
    await client.query("INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING",[actor,key]);
    const [kind,projectId]=[key.slice(0,key.indexOf(":")),key.slice(key.indexOf(":")+1)];
    const artworkIds:string[]=[],copiedTexts:CanvasTextNodeRecord[]=[],nodes:CanvasVideoNode[]=[],directorNodes:CanvasDirectorNode[]=[],characterNodes:CanvasCharacterNode[]=[],sceneNodes:CanvasSceneNode[]=[],audioNodes:CanvasAudioNode[]=[],timelineNodes:CanvasTimelineNode[]=[];
    for(const node of artworks){
      const current=(await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current)throw new ModelConfigError("CANVAS_NODE_UNAVAILABLE","复制媒体已删除",409);
      const newId=mapping.get(node.id)!,sameProject=kind==="tree"?current.group_id===projectId:current.batch_id===projectId;
      const fields={id:newId,email:actor,group_id:kind==="tree"?projectId:newId,batch_id:kind==="batch"?projectId:null,canvas_group_id:null,
        ...(input.detached?{title:`${String(current.title||"图片")} 副本`}:{}),
        parent_id:!input.detached&&current.parent_id&&(mapping.has(current.parent_id)||sameProject)?remap(current.parent_id):null,parent_ids:input.detached?[]:(current.parent_ids||[]).filter((id:string)=>mapping.has(id)||sameProject).map(remap),
        canvas_x:Number(current.canvas_x||0)+40,canvas_y:Number(current.canvas_y||0)+40,origin:"canvas",source_url:current.source_url,source:"canvas-add",deleted_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        ...(input.singleArtwork?{canvas_x:input.singleArtwork.x,canvas_y:input.singleArtwork.y,title:input.singleArtwork.title??current.title,
          source_url:"canvas-add",parent_id:kind==="tree"&&projectId!==newId?projectId:null,parent_ids:[],
          creation_provenance:{version:1,operation:"copy",entry:"canvas",ref:newId,sourceArtworkId:node.id,evidence:"server-route"}}:{} )};
      const result=await client.query("INSERT INTO app_artworks SELECT (jsonb_populate_record(NULL::app_artworks,to_jsonb(src)||$3::jsonb)).* FROM app_artworks src WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[actor,node.id,JSON.stringify(fields)]);
      if(!result.rowCount)throw new Error("复制媒体失败");artworkIds.push(newId);
      const prompt=(await client.query("SELECT project_key,document,scope_kind,tenant_id FROM app_canvas_image_prompts WHERE email=$1 AND node_id=$2 FOR SHARE",[actor,node.id])).rows[0];
      if(prompt){
        await authorizeImagePromptNodeTx(client,actor,prompt.project_key,node.id);
        const scope=currentCreationContext();
        if(!scope||prompt.scope_kind!==scope.scopeKind||prompt.tenant_id!==scope.tenantId)throw new ModelConfigError("IMAGE_PROMPT_SCOPE_MISMATCH","提示词不属于当前工作空间",403);
        const document=remapImagePromptDocument(imagePromptDocumentSchema.parse(prompt.document),mapping,{preserveExternal:prompt.project_key===key,detached:input.detached||!!input.singleArtwork});
        await writeCopiedImagePromptTx(client,actor,newId,key,document,{scopeKind:prompt.scope_kind,tenantId:prompt.tenant_id});
      }
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
      const snapshot=node.project.sceneReference,sceneSource=snapshot&&scenes.find(scene=>scene.id===snapshot.sceneId&&scene.revision===snapshot.revision);
      const sceneReference=snapshot?{...snapshot,sceneId:sceneSource?remap(snapshot.sceneId):snapshot.sceneId,revision:sceneSource?1:snapshot.revision,referenceArtworkIds:snapshot.referenceArtworkIds.map(remap),background:snapshot.background?{...snapshot.background,artworkId:remap(snapshot.background.artworkId)}:null}:snapshot;
      directorNodes.push(await saveDirectorNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,
        project:{...node.project,...(snapshot?{sceneReference}:{}),panoramaArtworkId:node.project.panoramaArtworkId?remap(node.project.panoramaArtworkId):null}},key));
    }
    for(const node of characters){
      const current=(await client.query("SELECT revision FROM app_canvas_character_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("CHARACTER_REVISION_CONFLICT","角色已更新，请重新复制",409);
      const character={...node.character,appearances:node.character.appearances.map(appearance=>({...appearance,referenceArtworkIds:appearance.referenceArtworkIds.map(remap)}))};
      await lockCharacterImagesTx(client,actor,character);
      characterNodes.push(await saveCharacterNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,character},key));
    }
    for(const node of scenes){
      const current=(await client.query("SELECT revision FROM app_canvas_scene_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("SCENE_REVISION_CONFLICT","场景已更新，请重新复制",409);
      const scene={...node.scene,states:node.scene.states.map(state=>({...state,referenceArtworkIds:state.referenceArtworkIds.map(remap),background:state.background?{...state.background,artworkId:remap(state.background.artworkId)}:null}))};
      await lockSceneImagesTx(client,actor,scene);
      sceneNodes.push(await saveSceneNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,scene},key));
    }
    for(const node of audios){
      const current=(await client.query("SELECT revision FROM app_canvas_audio_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("AUDIO_REVISION_CONFLICT","音频工程已更新，请重新复制",409);
      const adopted=node.audio.adopted,audio={...node.audio,render:null,sourceArtworkId:node.audio.sourceArtworkId?remap(node.audio.sourceArtworkId):null,
        adopted:adopted?{...adopted,artworkId:remap(adopted.artworkId),sourceArtworkId:remap(adopted.sourceArtworkId)}:null};
      await validateAudioProject(actor,audio,client);
      audioNodes.push(await saveAudioNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,audio},key));
    }
    const remapTimeline=(project:TimelineProject):TimelineProject=>({...project,tracks:project.tracks.map(track=>({...track,clips:track.clips.map(clip=>({...clip,artworkId:remap(clip.artworkId),...(clip.canvasSourceId?{canvasSourceId:remap(clip.canvasSourceId)}:{})}))}))});
    for(const node of timelines){
      const current=(await client.query("SELECT revision FROM app_canvas_timeline_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[actor,node.id])).rows[0];
      if(!current||Number(current.revision)!==node.revision)throw new ModelConfigError("TIMELINE_REVISION_CONFLICT","多轨工程已更新，请重新复制",409);
      const timeline=remapTimeline(node.timeline),adopted=node.adopted?{...node.adopted,artworkId:remap(node.adopted.artworkId),project:remapTimeline(node.adopted.project)}:null;
      await validateTimelineProject(actor,timeline,client);if(adopted)await validateTimelineAdoption(actor,adopted,client);
      timelineNodes.push(await saveTimelineNodeTx(client,actor,{id:mapping.get(node.id)!,operationId:stableUuid(`${actor}:${input.operationId}:${node.id}`),expectedRevision:0,title:node.title,x:node.x+40,y:node.y+40,width:node.width,height:node.height,timeline,adopted},key));
    }
    // Copy shared properties only when that table already exists; do not initialize unrelated edit tables.
    if(!input.singleArtwork&&(await client.query("SELECT to_regclass('app_canvas_node_settings') AS name")).rows[0].name){for(const [oldId,newId] of mapping)await client.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) SELECT email,$3,kind,settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2 ON CONFLICT(email,node_id) DO NOTHING",[actor,oldId,newId]);}
    const result:CopyResult={nativeNodes:{videoNodes:nodes,directorNodes,characterNodes,sceneNodes,audioNodes,timelineNodes},artworkIds,textNodes:copiedTexts,nodes,...(directorNodes.length?{directorNodes}:{}),...(characterNodes.length?{characterNodes}:{}),...(sceneNodes.length?{sceneNodes}:{}),...(audioNodes.length?{audioNodes}:{}),...(timelineNodes.length?{timelineNodes}:{}),idMap:Object.fromEntries(mapping),projectKey:key};
    await client.query("INSERT INTO app_canvas_node_copies(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest,JSON.stringify(result)]);await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
