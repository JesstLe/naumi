import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {TeamError} from "../teams/errors";
import {ModelConfigError} from "../model-config/types";
import {bindActualCreationProject,assertCreationProjectInput,assertCurrentCreationFeature,filterCreationProjects} from "../saas/creation-access";
import {createMediaJob,listMediaJobs,readMediaJobEvidence} from "../video/media-jobs";
import {timelineMediaRequest} from "../timeline/render";
import {authorizeCanvasProject,mayCreateCanvasRoot} from "./project-access";
import {timelineNodeWriteSchema,type TimelineRender} from "./timeline-node-schema";
import {ensureTimelineNodeSchema,findTimelineOperation,findTimelineRenderIntent,getTimelineNode as getRawTimelineNode,listTimelineNodes as listRawTimelineNodes,saveTimelineNodeTx} from "./timeline-node-repository";
import {validateTimelineProject,validateTimelineAdoption,assertTimelineJobRecipe} from "./timeline-project-validation";
import {requireTimelineMaterials} from "./timeline-materials";
import {validateDialogueSources} from "./timeline-dialogue-sources";
export async function getTimelineNode(actor:string,id:string,tx?:PoolClient){
  const node=await getRawTimelineNode(actor,id,false,tx);if(!node)return null;
  try{await assertCreationProjectInput(actor,node.projectKey,tx,true);}catch(error){if(error instanceof TeamError&&error.status===403)return null;throw error;}return node;
}
export async function listTimelineNodes(actor:string,includeDeleted=false){
  return filterCreationProjects(actor,await listRawTimelineNodes(actor,includeDeleted));
}

async function saveNode(actor:string,raw:unknown,render?:TimelineRender|null){
  const parsed=timelineNodeWriteSchema.safeParse(raw);if(!parsed.success)throw new ModelConfigError("INVALID_TIMELINE_NODE","多轨节点字段无效",422,parsed.error.issues.map(issue=>issue.path.join(".")));
  const input=parsed.data;await ensureTimelineNodeSchema();const old=await getRawTimelineNode(actor,input.id,true),projectKey=input.projectKey||old?.projectKey||`tree:${input.id}`;
  const replay=await findTimelineOperation(actor,input.operationId,{input,projectKey,...(render!==undefined?{render}:{})});if(replay){await bindActualCreationProject(actor,replay.projectKey,{receipt:true});await assertCreationProjectInput(actor,replay.projectKey);return replay;}
  let newRoot=false;try{await authorizeCanvasProject(actor,projectKey);}catch(error){if(!(error instanceof ModelConfigError)||old||input.expectedRevision!==0||!await mayCreateCanvasRoot(actor,input,projectKey))throw error;newRoot=true;}
  const project=input.deleted===true?undefined:input.timeline??(input.deleted===false?old?.timeline:undefined),adopted=input.deleted===true?null:input.adopted===undefined?(input.deleted===false?old?.adopted:null):input.adopted;
  if(project){await validateTimelineProject(actor,project);await validateDialogueSources(actor,projectKey,project,old?.timeline);}if(adopted)await validateTimelineAdoption(actor,adopted);
  const tx=await getPool().connect();try{
    await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);await bindActualCreationProject(actor,projectKey,{tx,newRoot});
    if(project){await validateTimelineProject(actor,project,tx);await validateDialogueSources(actor,projectKey,project,old?.timeline,tx);}if(adopted)await validateTimelineAdoption(actor,adopted,tx);
    const node=await saveTimelineNodeTx(tx,actor,input,projectKey,render);await tx.query("COMMIT");return node;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export const saveTimelineNode=(actor:string,raw:unknown)=>saveNode(actor.toLowerCase(),raw);

/** Existing media jobs own acceptance, billing, execution, cancel and recovery.
 * A durable intent bridges the acknowledgement gap, without another queue. */
export async function renderTimelineNode(actorRaw:string,input:{id:string;expectedRevision:number;operationId:string;billingConfirmation?:{version:number;credits:number}}){
  const actor=actorRaw.toLowerCase();let intent=await findTimelineRenderIntent(actor,input.operationId);
  if(intent){
    if(intent.id!==input.id||intent.render!.baseRevision!==input.expectedRevision)throw new ModelConfigError("TIMELINE_OPERATION_CONFLICT","操作编号已用于另一项导出",409);
    await bindActualCreationProject(actor,intent.projectKey,{receipt:true});await assertCreationProjectInput(actor,intent.projectKey);
    const accepted=(await listMediaJobs(actor,{operationId:input.operationId})).jobs[0];if(accepted)return {node:await getRawTimelineNode(actor,input.id,true)??intent,job:accepted};
  }else{
    const node=await getRawTimelineNode(actor,input.id);if(!node)throw new ModelConfigError("TIMELINE_NODE_UNAVAILABLE","多轨节点不存在或无权访问",404);
    await bindActualCreationProject(actor,node.projectKey);await assertCreationProjectInput(actor,node.projectKey);
    if(node.revision!==input.expectedRevision)throw new ModelConfigError("TIMELINE_REVISION_CONFLICT","多轨工程已更新，请读取最新版本后导出",409);
    const materials=await validateTimelineProject(actor,node.timeline);let compiled;try{compiled=timelineMediaRequest(node.timeline,materials.map(({artworkId,kind,durationSeconds,hasAudio})=>({artworkId,kind,durationSeconds,hasAudio})),input.operationId,node.projectKey);}catch(error){throw new ModelConfigError("TIMELINE_EXPORT_INVALID",(error as Error).message,422);}
    const render:TimelineRender={operationId:input.operationId,baseRevision:input.expectedRevision,project:structuredClone(node.timeline),sources:materials,request:compiled.request};
    intent=await saveNode(actor,{id:node.id,expectedRevision:input.expectedRevision,operationId:input.operationId},render);
  }
  await assertCurrentCreationFeature("/api/canvas/timeline-nodes/render");
  const render=intent.render!,current=await requireTimelineMaterials(actor,render.request.inputs);for(const source of current){const frozen=render.sources.find(media=>media.artworkId===source.artworkId);if(!frozen||source.key!==frozen.key||source.sha256!==frozen.sha256)throw new ModelConfigError("TIMELINE_INPUT_CHANGED","导出来源已改变，请重新提交工程",409);}
  return {node:await getRawTimelineNode(actor,input.id,true)??intent,job:await createMediaJob(actor,{...render.request,...(input.billingConfirmation?{billingConfirmation:input.billingConfirmation}:{})})};
}
export async function adoptTimelineResult(actorRaw:string,input:{id:string;expectedRevision:number;operationId:string;jobId:string}){
  const actor=actorRaw.toLowerCase(),job=await readMediaJobEvidence(actor,input.jobId),intent=await findTimelineRenderIntent(actor,job.operationId);if(!intent?.render||intent.id!==input.id)throw new ModelConfigError("TIMELINE_RESULT_CONFLICT","结果不属于此多轨工程",409);
  assertTimelineJobRecipe(intent.render,job);const output=job.outputs.find(output=>!output.fragment&&output.mimeType.startsWith("video/"));if(!output)throw new ModelConfigError("TIMELINE_RESULT_UNAVAILABLE","导出没有可采用的视频结果",409);
  return saveTimelineNode(actor,{id:input.id,expectedRevision:input.expectedRevision,operationId:input.operationId,adopted:{artworkId:output.artworkId,jobId:input.jobId,project:structuredClone(intent.render.project)}});
}

/** Existing-project edit participant. The caller holds the business transaction;
 * this owner still validates scope, media, original text, receipt identity and CAS. */
export async function saveTimelineEditTx(tx:PoolClient,actorRaw:string,raw:unknown){
 const actor=actorRaw.toLowerCase(),input=timelineNodeWriteSchema.parse(raw);
 if(!input.timeline||!input.projectKey||input.deleted!==undefined||input.adopted!==undefined)throw new ModelConfigError("TIMELINE_EDIT_INVALID","结构同步只保存已有工程",422);
 await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
 const old=await getRawTimelineNode(actor,input.id,false,tx);if(!old||old.projectKey!==input.projectKey)throw new ModelConfigError("TIMELINE_NODE_UNAVAILABLE","多轨节点不存在或无权访问",404);
 await bindActualCreationProject(actor,input.projectKey,{tx});await assertCreationProjectInput(actor,input.projectKey,tx);
 await validateTimelineProject(actor,input.timeline,tx);await validateDialogueSources(actor,input.projectKey,input.timeline,old.timeline,tx);
 return saveTimelineNodeTx(tx,actor,input,input.projectKey);
}
