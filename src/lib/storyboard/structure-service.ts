import "server-only";
import type {PoolClient} from "pg";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {requireStoryboardPlan,assertStoryboardTake} from "./service";
import {getTimelineNode,saveTimelineEditTx} from "../canvas/timeline-node-service";
import {getVideoNode} from "../canvas/video-node-service";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {timelineArtworkIds} from "../canvas/timeline-node-schema";
import type {TimelineMaterial} from "../canvas/timeline-node-schema";
import {authorizeCanvasProject} from "../canvas/project-access";
import {bindActualCreationProject,assertCreationProjectInput,assertCurrentCreationFeature} from "../saas/creation-access";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {roughcutLinks,ensureRoughcutSchema,readRoughcutStructureOperation,recordRoughcutStructureTx,type RoughcutIntent} from "./production-repository";
import {structurePreviewSchema,structureApplySchema,structureRestoreSchema,proposeStoryboardStructure} from "./structure";
import type {z} from "zod";

const hash=(value:unknown)=>createHash("sha256").update(canonicalConfig(value)).digest("hex");
async function context(actor:string,input:{projectKey:string;planId:string;timelineId:string;timelineRevision:number},tx?:PoolClient){
 await authorizeCanvasProject(actor,input.projectKey);await bindActualCreationProject(actor,input.projectKey,{receipt:true,tx});await assertCreationProjectInput(actor,input.projectKey,tx,true);
 const node=await getTimelineNode(actor,input.timelineId,tx),link=(await roughcutLinks(actor,input.planId,tx)).find(link=>link.timelineId===input.timelineId);
 if(!node||node.projectKey!==input.projectKey||node.revision!==input.timelineRevision||!link)throw new ModelConfigError("STORYBOARD_CUT_CHANGED","目标粗剪不存在、已改变或不属于此方案",409);return {node,link};
}
async function build(actor:string,input:z.infer<typeof structurePreviewSchema>){
 const unavailableInserts=new Set<string>(),plan=await requireStoryboardPlan(actor,{id:input.planId,revision:input.revision},input.projectKey),{node,link}=await context(actor,input),materials:TimelineMaterial[]=await requireTimelineMaterials(actor,timelineArtworkIds(node.timeline));
 for(const shot of plan.document.shots.filter(shot=>!link.clips.some(clip=>clip.nodeId===shot.nodeId))){const take=shot.takes.find(take=>take.artworkId===shot.adoptedArtworkId);if(!take){unavailableInserts.add(shot.nodeId);continue;}
  try{await assertStoryboardTake(actor,input.projectKey,shot.nodeId,take);if(!materials.some(material=>material.artworkId===take.artworkId))materials.push(...await requireTimelineMaterials(actor,[take.artworkId]));}catch(error){if(!(error instanceof ModelConfigError))throw error;unavailableInserts.add(shot.nodeId);}
 }
 let proposal;try{proposal=proposeStoryboardStructure(node.timeline,link,plan.document,materials,input,id=>`shot-${createHash("sha256").update(`${plan.id}:${id}`).digest("hex").slice(0,32)}`);}catch(error){throw new ModelConfigError("STORYBOARD_STRUCTURE_INVALID",error instanceof Error?error.message:"结构同步参数无效",422);}
 for(const difference of proposal.differences)if(difference.selected&&difference.kind==="insert"&&unavailableInserts.has(difference.nodeId))proposal.conflicts.push({clipIds:[difference.clipId],message:`镜头 ${difference.number} 的采用来源已不可用`});
 return {node,link,materials,proposal,previewDigest:hash({input,project:node.timeline,link,document:plan.document,materials:materials.map(m=>({artworkId:m.artworkId,key:m.key,sha256:m.sha256,durationSeconds:m.durationSeconds})),proposal})};
}
export async function inspectStoryboardStructure(actorRaw:string,raw:unknown){
 const actor=actorRaw.toLowerCase(),input=structurePreviewSchema.parse(raw),value=await build(actor,input);
 const {project:_project,clips:_clips,...view}=value.proposal;
 return {...view,previewDigest:value.previewDigest,planId:input.planId,revision:input.revision,timelineId:input.timelineId,timelineRevision:input.timelineRevision,canApply:value.proposal.changed&&value.proposal.conflicts.length===0};
}
async function execute(actorRaw:string,raw:unknown,restore:boolean){
 const actor=actorRaw.toLowerCase(),input=restore?structureRestoreSchema.parse(raw):structureApplySchema.parse(raw),request={kind:restore?"structure-restore":"structure",...input};
 await ensureRoughcutSchema();await authorizeCanvasProject(actor,input.projectKey);await bindActualCreationProject(actor,input.projectKey,{receipt:true});await assertCreationProjectInput(actor,input.projectKey,undefined,true);
 const initial=await readRoughcutStructureOperation(actor,input.operationId);if(initial){if(initial.digest!==hash(request)||!initial.intent.result)throw new ModelConfigError("STORYBOARD_OPERATION_CONFLICT","结构操作编号已用于另一请求",409);return initial.intent.result;}
 const prepared=restore?undefined:await build(actor,structurePreviewSchema.parse(Object.fromEntries(Object.entries(input).filter(([key])=>!["operationId","previewDigest"].includes(key)))));
 let restoreMaterials:TimelineMaterial[]|undefined;
 if(restore){const source=(await readRoughcutStructureOperation(actor,structureRestoreSchema.parse(raw).sourceOperationId))?.intent;if(source?.structure&&source.projectKey===input.projectKey&&source.planId===input.planId&&source.write.id===input.timelineId)restoreMaterials=await requireTimelineMaterials(actor,timelineArtworkIds(source.structure.beforeProject));}
 const tx=await getPool().connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`roughcut-structure:${actor}:${input.operationId}`]);
  const known=await readRoughcutStructureOperation(actor,input.operationId,tx);if(known){if(known.digest!==hash(request)||!known.intent.result)throw new ModelConfigError("STORYBOARD_OPERATION_CONFLICT","结构操作编号已用于另一请求",409);await tx.query("COMMIT");return known.intent.result;}
  await assertCurrentCreationFeature("/api/canvas/storyboards");let intent:RoughcutIntent;
  if(restore){const restoreInput=structureRestoreSchema.parse(raw),{node,link}=await context(actor,restoreInput,tx),source=(await readRoughcutStructureOperation(actor,restoreInput.sourceOperationId,tx))?.intent;
   if(!source?.structure||source.projectKey!==input.projectKey||source.planId!==input.planId||source.write.id!==input.timelineId)throw new ModelConfigError("STORYBOARD_RESTORE_UNAVAILABLE","原结构操作不属于此方案或粗剪",404);
   if(canonicalConfig(node.timeline)!==canonicalConfig(source.write.timeline)||canonicalConfig(link.clips)!==canonicalConfig(source.clips))throw new ModelConfigError("STORYBOARD_RESTORE_CONFLICT","工程在同步后已人工修改，保留当前工程，请先核对",409);
   intent={projectKey:input.projectKey,planId:input.planId,write:{id:node.id,projectKey:node.projectKey,expectedRevision:node.revision,operationId:input.operationId,timeline:source.structure.beforeProject},clips:source.structure.beforeClips,changes:[],structure:{kind:"restore",beforeProject:node.timeline,beforeClips:link.clips,sourceOperationId:restoreInput.sourceOperationId}};
  }else{const applyInput=structureApplySchema.parse(raw),built=prepared!;
   await requireStoryboardPlan(actor,{id:input.planId,revision:applyInput.revision},input.projectKey);const locked=await context(actor,input,tx);
   if(canonicalConfig(locked.node.timeline)!==canonicalConfig(built.node.timeline)||canonicalConfig(locked.link)!==canonicalConfig(built.link))throw new ModelConfigError("STORYBOARD_PREVIEW_CHANGED","粗剪已变化，请重新预览",409);
   if(built.previewDigest!==applyInput.previewDigest)throw new ModelConfigError("STORYBOARD_PREVIEW_CHANGED","结构预览或素材已变化，请重新预览",409);
   if(built.proposal.conflicts.length)throw new ModelConfigError("STORYBOARD_STRUCTURE_CONFLICT",built.proposal.conflicts.map(c=>c.message).join("；"),422);
   if(!built.proposal.changed)throw new ModelConfigError("STORYBOARD_STRUCTURE_EMPTY","尚未选择可应用的结构变化",422);
   intent={projectKey:input.projectKey,planId:input.planId,write:{id:built.node.id,projectKey:built.node.projectKey,expectedRevision:built.node.revision,operationId:input.operationId,timeline:built.proposal.project},clips:built.proposal.clips,changes:[],structure:{kind:"sync",beforeProject:built.node.timeline,beforeClips:built.link.clips,previewDigest:applyInput.previewDigest}};
  }
  if(!restore)for(const difference of prepared!.proposal.differences.filter(d=>d.selected&&d.kind!=="remove")){const source=await getVideoNode(actor,difference.nodeId);if(!source||source.deletedAt||source.projectKey!==input.projectKey)throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE",`镜头 ${difference.number} 已移除，未覆盖工程`,409);}
  const frozen=restore?restoreMaterials:prepared!.materials,currentMaterials=await requireTimelineMaterials(actor,timelineArtworkIds(intent.write.timeline!),tx);
  if(currentMaterials.some(media=>{const old=frozen?.find(m=>m.artworkId===media.artworkId);return !old||old.key!==media.key||old.sha256!==media.sha256||old.durationSeconds!==media.durationSeconds;}))throw new ModelConfigError("STORYBOARD_INPUT_CHANGED","结构预览的素材字节已改变，未覆盖工程",409);
  const node=await saveTimelineEditTx(tx,actor,intent.write),result=await recordRoughcutStructureTx(tx,actor,request,intent,node);await tx.query("COMMIT");return result;
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export const applyStoryboardStructure=(actor:string,raw:unknown)=>execute(actor,raw,false);
export const restoreStoryboardStructure=(actor:string,raw:unknown)=>execute(actor,raw,true);
