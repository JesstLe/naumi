import {withVideoCoordinationActivity} from "./coordination-activity";
import {deferApplicationTask} from "../application/task-execution";
import {ensureVideoWorkflowSchema as ensureWorkflowSchema} from "@/lib/video/storage-schema";
import {detachBackgroundActivity,bindBackgroundClaim} from "@/lib/release-runtime/background-activity";
import "server-only";
import {creationTransaction} from "../saas/creation-writer";
import {assertWorkflowCreationScope,runWorkflowCreation,bindWorkflowCreationProject,validateWorkflowCreationInputs,acceptWorkflowCreationTx,updateWorkflowCreationTx} from "./workflow-creation";
import {encryptAtRest,decryptAtRest} from "../settings";
import {freezeVideoWorkflow,withFrozenWorkflowStage,workflowBindingId,type FrozenWorkflowStage} from "./workflow-freeze";
import {createHash} from "node:crypto";
import {getVideoTask,getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {acquireVideoCoordinationLock} from "./coordination-pool";
import {ModelConfigError} from "../model-config/types";
import {BillingError} from "../billing/types";
import {createVideoGeneration,withVideoCreationModel} from "./creation";
import {currentModelExecution} from "../model-config/context";
import {type CreateVideoInput} from "./submission-types";
import {authorizeVideoReferences} from "./reference-materialization";
import {videoWorkflowPlanSchema,workflowVideoRequestSchema,type VideoWorkflowPlan,type WorkflowVideoRequest} from "./workflow-schema";
import {getVideoNode} from "../canvas/video-node-repository";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import type {VideoGenerationRequest,VideoReference} from "./types";
import {existingWorkflowResult} from "./workflow-reuse";
import {advanceWorkflowAssembly,publicWorkflowAssembly,resetWorkflowAssembly} from "./workflow-assembly";
import {mediaBillingQuote} from "./media-billing";

export type VideoWorkflowNodeStatus="pending"|"processing"|"completed"|"blocked"|"needs_confirmation"|"needs_attention"|"cancelled";



function substitute(template:string,variables:NonNullable<VideoWorkflowPlan["variables"]>){
  return template.replace(/\{\{\s*var\s+([A-Za-z0-9._:-]+)\s*\}\}/g,(_match,name:string)=>{
    if(!Object.prototype.hasOwnProperty.call(variables,name))throw new ModelConfigError("WORKFLOW_VARIABLE_MISSING",`工作流缺少变量${name}`,422);
    return String(variables[name]);
  });
}
function requestWithVariables(request:WorkflowVideoRequest,variables:VideoWorkflowPlan["variables"]):WorkflowVideoRequest{
  const values=variables||{},result={...request,prompt:substitute(request.prompt,values),negativePrompt:request.negativePrompt===undefined?undefined:substitute(request.negativePrompt,values)};
  if(result.orderedInputs)result.orderedInputs=result.orderedInputs.map(input=>input.kind==="text"?{...input,value:substitute(input.value,values)}:input);
  const parsed=workflowVideoRequestSchema.safeParse(result);
  if(!parsed.success)throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流变量展开后超过字段限制或类型无效",422);
  return parsed.data;
}
export function validateVideoWorkflow(raw:unknown):VideoWorkflowPlan{
  const parsed=videoWorkflowPlanSchema.safeParse(raw);
  if(!parsed.success)throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","视频工作流字段无效",422,parsed.error.issues.map(issue=>issue.path.join(".")));
  const plan=parsed.data,ids=new Set(plan.nodes.map(node=>node.id));
  if(ids.size!==plan.nodes.length)throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流节点重复",422);
  if(plan.assembly&&(new Set(plan.assembly.nodeIds).size!==ids.size||plan.assembly.nodeIds.length!==ids.size||plan.assembly.nodeIds.some(id=>!ids.has(id))))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","成片顺序必须完整包含本次镜头且不重复",422);
  for(const node of plan.nodes){
    if(node.existingArtworkId&&(node.dependsOn.length||node.mediaBindings?.length))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","复用镜头不得再执行前序依赖",422);
    if(new Set(node.dependsOn).size!==node.dependsOn.length||node.dependsOn.some(id=>id===node.id||!ids.has(id)))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流存在自引用、重复依赖或缺失节点",422);
    if(node.mediaBindings?.some(binding=>!node.dependsOn.includes(binding.fromNodeId)))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","媒体来源必须是已声明的前序节点",422);
    node.request=requestWithVariables(node.request,plan.variables);
  }
  const complete=new Set<string>();
  while(complete.size<plan.nodes.length){const batch=plan.nodes.filter(node=>!complete.has(node.id)&&node.dependsOn.every(id=>complete.has(id)));if(!batch.length)throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流依赖有环",422);for(const node of batch)complete.add(node.id);}
  return plan;
}
function operationId(runId:string,nodeId:string){return `video-wf-${createHash("sha256").update(`${runId}\0${nodeId}`).digest("hex")}`;}
async function authorizeProject(actor:string,key:string){const {authorizeVideoProject}=await import("../canvas/project-access");await authorizeVideoProject(actor,key);}
export async function authorizeWorkflowInputs(actor:string,plan:VideoWorkflowPlan,prepared?:Record<string,FrozenWorkflowStage>){
  for(const node of plan.nodes){
    if(node.canvasNodeId){const current=await getVideoNode(actor,node.canvasNodeId);if(!current||current.projectKey!==plan.projectKey||current.revision!==node.canvasNodeRevision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","制作链节点不存在或已更新",409);node.canvasContentDigest=createHash("sha256").update(canonicalConfig({config:current.config,inputs:current.inputs})).digest("hex");node.canvasLastTaskId=current.lastTaskId;}
    if(node.existingArtworkId){await existingWorkflowResult(actor,node.existingArtworkId);continue;}
    const input=node.request,request:VideoGenerationRequest={...input,source:"workflow",providerId:input.providerId||"managed-video",modelId:input.modelId||"",prompt:input.prompt,
      durationSeconds:input.durationSeconds??(input.seconds?Number(input.seconds):-1),resolution:input.resolution||input.size,references:input.references||[],idempotencyKey:operationId(plan.id,node.id)};
    if(prepared?.[node.id]?.compiledVersion===1)continue;
    if(input.comfyWorkflowId){const owned=await authorizeVideoReferences(actor,request);node.request={...input,references:owned.references};continue;}
    await withVideoCreationModel(input.modelId,async()=>{
      // New bindings use the trusted Resolver while freezing. Legacy reference
      // materialization is not an additional authority over the new draft.
      if(currentModelExecution('video')?.frozen.video?.execution)return;
      const owned=await authorizeVideoReferences(actor,request);node.request={...input,references:owned.references,...(input.elements?{elements:owned.elements}:{})};
    });
  }
}
export async function scheduleVideoWorkflow(actor:string,raw:unknown,canvasIntent?:unknown,preparedFrozen?:Record<string,FrozenWorkflowStage>,signal?:AbortSignal,frozenAssemblyQuote?:import("../billing/types").BillingQuote):Promise<{runId:string;taskIds:string[]}>{
  actor=actor.toLowerCase();const plan=validateVideoWorkflow(raw);if((plan.reviewOrigin||plan.storyboard)&&!canvasIntent)throw new ModelConfigError("STORYBOARD_REVIEW_CONTEXT_REQUIRED","审片返工须从正式方案提交",422);await ensureWorkflowSchema();const inputDigest=createHash("sha256").update(canonicalConfig(plan)).digest("hex"),known=(await getPool().query("SELECT email,input_digest,creation_scope FROM app_video_workflow_runs WHERE id=$1",[plan.id])).rows[0];
  if(known?.input_digest){assertWorkflowCreationScope(known.creation_scope,actor);if(known.email!==actor||known.input_digest!==inputDigest)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);const resumed=await resumeVideoWorkflow(plan.id,actor);return {runId:plan.id,taskIds:resumed.nodes.map(node=>node.taskId).filter((id):id is string=>!!id)};}
  if(known&&known.email!==actor)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);
  await authorizeProject(actor,plan.projectKey);await bindWorkflowCreationProject(actor,plan.projectKey);await validateWorkflowCreationInputs(actor,plan);await authorizeWorkflowInputs(actor,plan,preparedFrozen);const frozen=known?null:preparedFrozen||await freezeVideoWorkflow(actor,plan),frozenEnc=frozen?encryptAtRest(JSON.stringify(frozen)):null,publicFrozen=frozen?Object.fromEntries(Object.entries(frozen).map(([id,stage])=>[id,stage.quote])):{};
  const reused=new Map<string,import("./result-assets").SavedVideoResultAsset>();
  for(const node of plan.nodes)if(node.existingArtworkId)reused.set(node.id,await existingWorkflowResult(actor,node.existingArtworkId));
  const assemblyQuote=plan.assembly?frozenAssemblyQuote||await mediaBillingQuote(actor,"concat"):null;
  const digest=createHash("sha256").update(canonicalConfig(plan)).digest("hex"),pool=getPool(),tx=await pool.connect();
  if(signal?.aborted){tx.release();throw new DOMException("制作链提交已停止","AbortError");}
  try{await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workflow-accept:${plan.id}`]);
    const prior=(await tx.query("SELECT email,creation_scope FROM app_video_workflow_runs WHERE id=$1",[plan.id])).rows[0];
    if(prior&&prior.email!==actor)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);
    const scope=prior?assertWorkflowCreationScope(prior.creation_scope,actor):await acceptWorkflowCreationTx(tx,actor,plan);
    await tx.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,input_digest,frozen_nodes_enc,public_frozen_nodes,canvas_intent_digest,creation_scope) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9,$10::jsonb) ON CONFLICT(id) DO NOTHING",[plan.id,actor,plan.projectKey,JSON.stringify(plan),digest,inputDigest,frozenEnc,JSON.stringify(publicFrozen),canvasIntent?createHash("sha256").update(canonicalConfig(canvasIntent)).digest("hex"):null,scope?JSON.stringify(scope):null]);
    const row=(await tx.query("SELECT email,plan_digest,input_digest FROM app_video_workflow_runs WHERE id=$1 FOR UPDATE",[plan.id])).rows[0];
    if(row?.email!==actor||(row.input_digest?row.input_digest!==inputDigest:row.plan_digest!==digest))throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);
    if(plan.assembly)await tx.query("UPDATE app_video_workflow_runs SET assembly_quote=COALESCE(assembly_quote,$2::jsonb) WHERE id=$1",[plan.id,JSON.stringify(assemblyQuote)]);
    for(const node of plan.nodes){const asset=reused.get(node.id);await tx.query("INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status,result_assets) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[plan.id,node.id,asset?"completed":"pending",JSON.stringify(asset?[asset]:[])]);}
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
  const result=await resumeVideoWorkflow(plan.id,actor);return {runId:plan.id,taskIds:result.nodes.map(node=>node.taskId).filter((id):id is string=>!!id)};
}
type StoredNode={node_id:string;status:VideoWorkflowNodeStatus;task_id:string|null;error:string|null;result_assets?:import("./result-assets").SavedVideoResultAsset[]};
export async function getVideoWorkflow(actor:string,runId:string){
  await ensureWorkflowSchema();const pool=getPool(),run=(await pool.query("SELECT * FROM app_video_workflow_runs WHERE id=$1 AND email=$2",[runId,actor])).rows[0];
  if(!run)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
  const rows=(await pool.query<StoredNode>("SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1 ORDER BY created_at,node_id",[runId])).rows;
  const nodes=rows.map(node=>({id:node.node_id,status:node.status,taskId:node.task_id,error:node.error,quote:run.public_frozen_nodes?.[node.node_id]||null})),assembly=publicWorkflowAssembly(run.plan,run.assembly_state);
  return {runId,projectKey:String(run.project_key),plan:run.plan as VideoWorkflowPlan,cancellationRequestedAt:run.cancellation_requested_at,
    progress:Math.round((nodes.filter(node=>node.status==="completed").length+(assembly?.status==="completed"?1:0))/Math.max(1,nodes.length+(assembly?1:0))*100),nodes,assembly};
}
async function dependencyReference(actor:string,runId:string,binding:NonNullable<VideoWorkflowPlan["nodes"][number]["mediaBindings"]>[number],states:Map<string,StoredNode>):Promise<VideoReference>{
  const cached=states.get(binding.fromNodeId);if(cached?.status==="completed"&&cached.result_assets?.length){const asset=cached.result_assets[binding.outputIndex||0];if(!asset||asset.kind!==binding.kind)throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","前序产物类型或序号不符",422);const art=(await listArtworksByIds(actor,[asset.artworkId]))[0];if(!art||art.status!=="completed")throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","前序产物已删除",422);return {id:workflowBindingId(runId,binding),kind:binding.kind,role:binding.role,artworkId:art.id,url:asset.url,sha256:asset.sha256};}
  const previous=states.get(binding.fromNodeId),task=previous?.task_id?await getVideoTask(actor,previous.task_id):null;
  if(task?.status!=="completed"||!task.artworkId)throw new ModelConfigError("WORKFLOW_OUTPUT_PENDING","前序视频尚未完成",409);
  const produced=Array.isArray(task.parameters.resultArtworkIds)?task.parameters.resultArtworkIds as string[]:[task.artworkId];
  const id=produced[binding.outputIndex||0],artwork=id?(await listArtworksByIds(actor,[id]))[0]:undefined;
  if(!artwork||artwork.status!=="completed")throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","前序产物不存在或无权访问",422);
  return {id:workflowBindingId(runId,binding),
    kind:binding.kind,role:binding.role,artworkId:artwork.id,url:binding.kind==="image"?artwork.image:artwork.videoUrl||artwork.image};
}
async function resumeVideoWorkflowLocal(runId:string,actor?:string){
  await ensureWorkflowSchema();const pool=getPool(),lock=await acquireVideoCoordinationLock(`video-workflow:${runId}`);
  try{
    const run=(await pool.query("SELECT * FROM app_video_workflow_runs WHERE id=$1",[runId])).rows[0];
    if(!run||actor&&run.email!==actor)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
    if(!lock.acquired)return getVideoWorkflow(run.email,runId);
    await bindBackgroundClaim(runId);
    const decrypted=run.frozen_nodes_enc?decryptAtRest(run.frozen_nodes_enc):null;
    if(run.frozen_nodes_enc&&!decrypted)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","制作链冻结记录不可用，未继续提交",503);
    const frozen:Record<string,FrozenWorkflowStage>|null=decrypted?JSON.parse(decrypted):null;
    const creationScope=assertWorkflowCreationScope(run.creation_scope,run.email);
    const plan=run.plan as VideoWorkflowPlan,rows=(await pool.query<StoredNode>("SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1",[runId])).rows,states=new Map(rows.map(node=>[node.node_id,node]));
    const update=async(node:StoredNode,status:VideoWorkflowNodeStatus,error?:string,taskId?:string)=>{
      // Worker completion and result caching share one transaction. A late create response
      // must not demote that terminal state or lose its durable dependency outputs.
      const saved=(await pool.query<StoredNode>(`UPDATE app_video_workflow_run_nodes
        SET status=CASE WHEN status='completed' THEN status ELSE $3 END,
          error=CASE WHEN status='completed' THEN NULL ELSE $4 END,
          task_id=COALESCE($5,task_id),updated_at=now()
        WHERE run_id=$1 AND node_id=$2 RETURNING *`,[runId,node.node_id,status,error||null,taskId||null])).rows[0];
      if(saved)Object.assign(node,saved);
    };
    for(const node of rows){
      const task=node.task_id?await getVideoTask(run.email,node.task_id):await getVideoTaskByIdempotencyKey(run.email,operationId(runId,node.node_id));
      if(task){const status:VideoWorkflowNodeStatus=task.status==="completed"?"completed":["failed","cancelled"].includes(task.status)?"blocked":task.status==="needs_attention"?"needs_attention":"processing";
        await update(node,status,task.error||undefined,task.id);}
    }
    const readyNodes=plan.nodes.filter(node=>states.get(node.id)?.status==="pending"&&node.dependsOn.every(id=>states.get(id)?.status==="completed"));
    for(const node of plan.nodes){const state=states.get(node.id)!;
      if(state.status==="pending"&&node.dependsOn.some(id=>["blocked","cancelled"].includes(states.get(id)?.status||"")))await update(state,"blocked","前序节点失败，未提交此节点");
      if(run.cancellation_requested_at&&state.status==="pending")await update(state,"cancelled","已停止工作流，未提交此节点");}
    const submitNode=async(node:VideoWorkflowPlan["nodes"][number])=>{
      const state=states.get(node.id)!,request=structuredClone(node.request),references=[...(request.references||[])];
      try{
        for(const binding of node.mediaBindings||[]){
          const reference=await dependencyReference(run.email,runId,binding,states);references.push(reference);
          if(request.orderedInputs){const entry={id:reference.id,nodeId:reference.artworkId!,kind:binding.kind,role:binding.role,value:reference.url!},index=request.orderedInputs.findIndex(input=>input.id===reference.id);if(index>=0)request.orderedInputs[index]=entry;else request.orderedInputs.push(entry);}
        }
        let nodeRevision=node.canvasNodeRevision;
        if(node.canvasNodeId&&node.canvasContentDigest){const current=await getVideoNode(run.email,node.canvasNodeId);if(!current||current.projectKey!==plan.projectKey||current.lastTaskId!==(node.canvasLastTaskId??null)||createHash("sha256").update(canonicalConfig({config:current.config,inputs:current.inputs})).digest("hex")!==node.canvasContentDigest)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","制作链节点内容已变更或有新任务，未覆盖新编辑",409);nodeRevision=current.revision;}
        const {comfyWorkflowId,comfyInputs,comfyOverrides,...managedRequest}=request;
        const requestInput:CreateVideoInput={...managedRequest,nodeId:node.canvasNodeId,nodeRevision,workflowRunId:runId,workflowNodeId:node.id,source:"workflow",sourceId:runId,projectKey:plan.projectKey,seconds:request.seconds||String(request.durationSeconds??""),
          size:request.size||request.resolution||"",references,idempotencyKey:operationId(runId,node.id),billingConfirmation:run.confirmations?.[node.id]||request.billingConfirmation};
        const create=async()=>{if(comfyWorkflowId){const {submitByocComfyVideo}=await import("./byoc");return submitByocComfyVideo(run.email,{workflowId:comfyWorkflowId,idempotencyKey:requestInput.idempotencyKey,source:"workflow",nodeId:node.canvasNodeId,expectedRevision:nodeRevision,projectKey:plan.projectKey,prompt:request.prompt,parameters:request.parameters,references,orderedInputs:request.orderedInputs,inputMappings:comfyInputs,...comfyOverrides,negativePrompt:request.negativePrompt,resolution:request.resolution,aspectRatio:request.aspectRatio,generateAudio:request.generateAudio,watermark:request.watermark,...(request.durationSeconds&&request.durationSeconds>0?{durationSeconds:request.durationSeconds}:{})},{runId,nodeId:node.id});}return createVideoGeneration(run.email,requestInput);};if(frozen&&!frozen[node.id])throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","阶段冻结记录缺失",503);const stageCreation=creationScope?{...creationScope,requestText:request.prompt,parameters:{...request},workspaceExplicit:false}:undefined;const created=await runWorkflowCreation(stageCreation,()=>frozen?withFrozenWorkflowStage(run.email,frozen[node.id],create,run.confirmations?.[node.id]):create());await update(state,"processing",undefined,created.taskId);
      }catch(error){
        const recovered=await getVideoTaskByIdempotencyKey(run.email,operationId(runId,node.id));
        if(recovered)await update(state,recovered.status==="completed"?"completed":["failed","cancelled"].includes(recovered.status)?"blocked":"needs_attention","提交结果已保留，等待核对",recovered.id);
        else await update(state,error instanceof BillingError&&error.code==="PRICE_CHANGED"?"needs_confirmation":"blocked",error instanceof Error?error.message:"工作流提交失败");
      }
    };
    if(!run.cancellation_requested_at)for(let offset=0;offset<readyNodes.length;offset+=3)await Promise.allSettled(readyNodes.slice(offset,offset+3).map(submitNode));
    if(plan.assembly)await runWorkflowCreation(creationScope,()=>advanceWorkflowAssembly(run,[...states.values()]));
    await pool.query("UPDATE app_video_workflow_runs SET updated_at=now() WHERE id=$1",[runId]);await creationTransaction(tx=>updateWorkflowCreationTx(tx,run.email,runId)).catch(()=>{});return getVideoWorkflow(run.email,runId);
  }finally{await lock.release();}
}
const recoveringVideoWorkflows=new Set<string>();
export async function recoverVideoWorkflows(limit=2){
  if(await deferApplicationTask())return 0;
  const direct=process.env.NAUMI_APPLICATION_TASK_EXECUTION==="worker",available=direct?Math.max(0,limit-recoveringVideoWorkflows.size):limit;
  if(!available)return 0;
  await ensureWorkflowSchema();const pool=getPool(),bounded=Math.max(1,Math.min(10,available));
  // Terminal evidence repair is not execution: retain its original identity
  // and never enter task creation or supplier/media submission to repair it.
  const evidence=(await pool.query("SELECT id,email FROM app_video_workflow_runs WHERE creation_evidence_pending ORDER BY updated_at LIMIT $1",[bounded])).rows;
  for(const row of evidence){try{await creationTransaction(tx=>updateWorkflowCreationTx(tx,row.email,row.id));await pool.query("UPDATE app_video_workflow_runs SET updated_at=now() WHERE id=$1",[row.id]);}catch{console.error("[video-worker] workflow evidence remains pending");}}
  const runs=(await pool.query(`SELECT r.id FROM app_video_workflow_runs r WHERE EXISTS (
    SELECT 1 FROM app_video_workflow_run_nodes n WHERE n.run_id=r.id AND n.status IN ('pending','processing')) OR (r.plan ? 'assembly' AND COALESCE(r.assembly_state->>'status','waiting') IN ('waiting','queued','processing','needs_attention') AND NOT EXISTS (SELECT 1 FROM app_video_workflow_run_nodes n WHERE n.run_id=r.id AND n.status<>'completed')) ORDER BY r.updated_at LIMIT $1`,[bounded])).rows;
  if(direct){
    let admitted=0;
    for(const run of runs){
      if(recoveringVideoWorkflows.has(run.id)||recoveringVideoWorkflows.size>=limit)continue;
      recoveringVideoWorkflows.add(run.id);
      try{
        const started=await detachBackgroundActivity("video-workflow",run.id,"claim",async()=>{
          try{await resumeVideoWorkflowLocal(run.id);}finally{recoveringVideoWorkflows.delete(run.id);}
        });
        if(started)admitted++;else recoveringVideoWorkflows.delete(run.id);
      }catch(error){recoveringVideoWorkflows.delete(run.id);throw error;}
    }
    return admitted;
  }
  let processed=0;
  for(const run of runs){
    try{await resumeVideoWorkflow(run.id);processed++;}
    catch{console.error("[video-worker] workflow recovery failed; retained for next scan");}
  }
  return processed;
}

export async function confirmVideoWorkflowNode(actor:string,runId:string,nodeId:string,confirmation:{version:number;credits:number}){
  if(!Number.isSafeInteger(confirmation.version)||confirmation.version<1||!Number.isFinite(confirmation.credits)||confirmation.credits<0)throw new ModelConfigError("INVALID_WORKFLOW_CONFIRMATION","报价确认无效",422);
  await ensureWorkflowSchema();const client=await getPool().connect();
  try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-workflow:${runId}`]);
    const run=(await client.query("SELECT * FROM app_video_workflow_runs WHERE id=$1 AND email=$2 FOR UPDATE",[runId,actor])).rows[0];
    if(!run)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
    if(run.cancellation_requested_at)throw new ModelConfigError("WORKFLOW_STOPPED","工作流已经停止",409);
    const node=(await client.query("SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1 AND node_id=$2 FOR UPDATE",[runId,nodeId])).rows[0];
    if(!node||node.status!=="needs_confirmation")throw new ModelConfigError("WORKFLOW_CONFIRMATION_UNAVAILABLE","此节点无需确认报价",409);
    await client.query("UPDATE app_video_workflow_runs SET confirmations=jsonb_set(confirmations,$2::text[],$3::jsonb),updated_at=now() WHERE id=$1",[runId,[nodeId],JSON.stringify(confirmation)]);
    await client.query("UPDATE app_video_workflow_run_nodes SET status='pending',error=NULL,updated_at=now() WHERE run_id=$1 AND node_id=$2",[runId,nodeId]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  return resumeVideoWorkflow(runId,actor);
}
export async function listVideoWorkflows(actor:string,projectKey?:string,review?:{planId:string;nodeId:string}){
  await ensureWorkflowSchema();const rows=(await getPool().query("SELECT id FROM app_video_workflow_runs WHERE email=$1 AND ($2::text IS NULL OR project_key=$2) AND ($3::text IS NULL OR (plan->'reviewOrigin'->>'planId'=$3 AND plan->'reviewOrigin'->>'nodeId'=$4)) ORDER BY created_at DESC LIMIT 50",[actor,projectKey||null,review?.planId||null,review?.nodeId||null])).rows;
  const result=[];for(const row of rows)result.push(await getVideoWorkflow(actor,row.id));return result;
}
export async function cancelVideoWorkflow(actor:string,runId:string){
  await ensureWorkflowSchema();const changed=await getPool().query("UPDATE app_video_workflow_runs SET cancellation_requested_at=COALESCE(cancellation_requested_at,now()),updated_at=now() WHERE id=$1 AND email=$2 RETURNING id",[runId,actor]);
  if(!changed.rowCount)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
  const current=await getVideoWorkflow(actor,runId),{requestVideoCancellation}=await import("./cancellation");
  for(const node of current.nodes)if(node.taskId&&node.status==="processing")await requestVideoCancellation(actor,node.taskId);
  await getPool().query("UPDATE app_video_workflow_run_nodes SET status='cancelled',error='已停止，未提交' WHERE run_id=$1 AND task_id IS NULL AND status IN ('pending','needs_confirmation')",[runId]);
  await creationTransaction(tx=>updateWorkflowCreationTx(tx,actor,runId)).catch(()=>{});return resumeVideoWorkflow(runId,actor);
}

export {ensureWorkflowSchema as ensureVideoWorkflowSchema};

export async function retryVideoWorkflowAssembly(actor:string,runId:string,expectedAttempt:number){
  await ensureWorkflowSchema();await resetWorkflowAssembly(actor,runId,expectedAttempt);return resumeVideoWorkflow(runId,actor);
}

export async function resumeVideoWorkflow(runId:string,actor?:string) {
  const view=async () => {
    await ensureWorkflowSchema();
    const run=(await getPool().query("SELECT email FROM app_video_workflow_runs WHERE id=$1",[runId])).rows[0];
    if(!run||actor&&run.email!==actor)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
    return getVideoWorkflow(run.email,runId);
  };
  if(await deferApplicationTask())return view();
  return withVideoCoordinationActivity("video-workflow", runId, "claim", `video-workflow:${runId}`, () => resumeVideoWorkflowLocal(runId,actor), view);
}
