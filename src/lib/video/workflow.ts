import "server-only";
import {encryptAtRest,decryptAtRest} from "../settings";
import {freezeVideoWorkflow,withFrozenWorkflowStage,workflowBindingId,type FrozenWorkflowStage} from "./workflow-freeze";
import {createHash} from "node:crypto";
import {getPool,getVideoTask,getVideoTaskByIdempotencyKey,listArtworksByIds} from "../db";
import {ModelConfigError} from "../model-config/types";
import {BillingError} from "../billing/types";
import {createVideoGeneration,type CreateVideoInput} from "./service";
import {authorizeVideoReferences} from "./reference-materialization";
import {videoWorkflowPlanSchema,workflowVideoRequestSchema,type VideoWorkflowPlan,type WorkflowVideoRequest} from "./workflow-schema";
import {canonicalConfig} from "../model-config/repository";
import type {VideoGenerationRequest,VideoReference} from "./types";

export type VideoWorkflowNodeStatus="pending"|"processing"|"completed"|"blocked"|"needs_confirmation"|"needs_attention"|"cancelled";
let ready:Promise<void>|undefined;
async function ensureWorkflowSchema(){if(!ready)ready=getPool().query(`
 CREATE TABLE IF NOT EXISTS app_video_workflow_runs(id uuid PRIMARY KEY,email text NOT NULL,project_key text NOT NULL,plan jsonb NOT NULL,plan_digest text NOT NULL,
   cancellation_requested_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS app_video_workflow_runs_owner_idx ON app_video_workflow_runs(email,project_key,created_at DESC);
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS confirmations jsonb NOT NULL DEFAULT '{}'::jsonb;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS input_digest text;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS frozen_nodes_enc text;
 ALTER TABLE app_video_workflow_runs ADD COLUMN IF NOT EXISTS public_frozen_nodes jsonb NOT NULL DEFAULT '{}'::jsonb;
 CREATE TABLE IF NOT EXISTS app_video_workflow_run_nodes(run_id uuid NOT NULL REFERENCES app_video_workflow_runs(id),node_id text NOT NULL,status text NOT NULL DEFAULT 'pending',
   task_id text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,node_id));
`).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;}

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
  for(const node of plan.nodes){
    if(new Set(node.dependsOn).size!==node.dependsOn.length||node.dependsOn.some(id=>id===node.id||!ids.has(id)))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流存在自引用、重复依赖或缺失节点",422);
    if(node.mediaBindings?.some(binding=>!node.dependsOn.includes(binding.fromNodeId)))throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","媒体来源必须是已声明的前序节点",422);
    node.request=requestWithVariables(node.request,plan.variables);
  }
  const complete=new Set<string>();
  while(complete.size<plan.nodes.length){const batch=plan.nodes.filter(node=>!complete.has(node.id)&&node.dependsOn.every(id=>complete.has(id)));if(!batch.length)throw new ModelConfigError("INVALID_VIDEO_WORKFLOW","工作流依赖有环",422);for(const node of batch)complete.add(node.id);}
  return plan;
}
function operationId(runId:string,nodeId:string){return `video-wf-${createHash("sha256").update(`${runId}\0${nodeId}`).digest("hex")}`;}
async function authorizeProject(actor:string,key:string){const {authorizeVideoProject}=await import("../canvas/video-node-service");await authorizeVideoProject(actor,key);}
async function authorizeStaticInputs(actor:string,plan:VideoWorkflowPlan){
  for(const node of plan.nodes){
    const input=node.request,request:VideoGenerationRequest={...input,source:"workflow",providerId:input.providerId||"managed-video",modelId:input.modelId||"",prompt:input.prompt,
      durationSeconds:input.durationSeconds??(input.seconds?Number(input.seconds):-1),resolution:input.resolution||input.size,references:input.references||[],idempotencyKey:operationId(plan.id,node.id)};
    const owned=await authorizeVideoReferences(actor,request);node.request={...input,references:owned.references,...(input.elements?{elements:owned.elements}:{})};
  }
}
export async function scheduleVideoWorkflow(actor:string,raw:unknown):Promise<{runId:string;taskIds:string[]}>{
  actor=actor.toLowerCase();const plan=validateVideoWorkflow(raw);await ensureWorkflowSchema();const inputDigest=createHash("sha256").update(canonicalConfig(plan)).digest("hex"),known=(await getPool().query("SELECT email,input_digest FROM app_video_workflow_runs WHERE id=$1",[plan.id])).rows[0];
  if(known?.input_digest){if(known.email!==actor||known.input_digest!==inputDigest)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);const resumed=await resumeVideoWorkflow(plan.id,actor);return {runId:plan.id,taskIds:resumed.nodes.map(node=>node.taskId).filter((id):id is string=>!!id)};}
  if(known&&known.email!==actor)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);
  await authorizeProject(actor,plan.projectKey);await authorizeStaticInputs(actor,plan);const frozen=known?null:await freezeVideoWorkflow(actor,plan),frozenEnc=frozen?encryptAtRest(JSON.stringify(frozen)):null,publicFrozen=frozen?Object.fromEntries(Object.entries(frozen).map(([id,stage])=>[id,stage.quote])):{};
  const digest=createHash("sha256").update(canonicalConfig(plan)).digest("hex"),pool=getPool(),tx=await pool.connect();
  try{await tx.query("BEGIN");
    await tx.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,input_digest,frozen_nodes_enc,public_frozen_nodes) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) ON CONFLICT(id) DO NOTHING",[plan.id,actor,plan.projectKey,JSON.stringify(plan),digest,inputDigest,frozenEnc,JSON.stringify(publicFrozen)]);
    const row=(await tx.query("SELECT email,plan_digest,input_digest FROM app_video_workflow_runs WHERE id=$1 FOR UPDATE",[plan.id])).rows[0];
    if(row?.email!==actor||(row.input_digest?row.input_digest!==inputDigest:row.plan_digest!==digest))throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","工作流编号已用于另一请求",409);
    for(const node of plan.nodes)await tx.query("INSERT INTO app_video_workflow_run_nodes(run_id,node_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[plan.id,node.id]);
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
  const result=await resumeVideoWorkflow(plan.id,actor);return {runId:plan.id,taskIds:result.nodes.map(node=>node.taskId).filter((id):id is string=>!!id)};
}
type StoredNode={node_id:string;status:VideoWorkflowNodeStatus;task_id:string|null;error:string|null};
export async function getVideoWorkflow(actor:string,runId:string){
  await ensureWorkflowSchema();const pool=getPool(),run=(await pool.query("SELECT * FROM app_video_workflow_runs WHERE id=$1 AND email=$2",[runId,actor])).rows[0];
  if(!run)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
  const rows=(await pool.query<StoredNode>("SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1 ORDER BY created_at,node_id",[runId])).rows;
  const nodes=rows.map(node=>({id:node.node_id,status:node.status,taskId:node.task_id,error:node.error,quote:run.public_frozen_nodes?.[node.node_id]||null}));
  return {runId,projectKey:String(run.project_key),plan:run.plan as VideoWorkflowPlan,cancellationRequestedAt:run.cancellation_requested_at,
    progress:Math.round(nodes.filter(node=>node.status==="completed").length/Math.max(1,nodes.length)*100),nodes};
}
async function dependencyReference(actor:string,runId:string,binding:NonNullable<VideoWorkflowPlan["nodes"][number]["mediaBindings"]>[number],states:Map<string,StoredNode>):Promise<VideoReference>{
  const previous=states.get(binding.fromNodeId),task=previous?.task_id?await getVideoTask(actor,previous.task_id):null;
  if(task?.status!=="completed"||!task.artworkId)throw new ModelConfigError("WORKFLOW_OUTPUT_PENDING","前序视频尚未完成",409);
  const produced=Array.isArray(task.parameters.resultArtworkIds)?task.parameters.resultArtworkIds as string[]:[task.artworkId];
  const id=produced[binding.outputIndex||0],artwork=id?(await listArtworksByIds(actor,[id]))[0]:undefined;
  if(!artwork||artwork.status!=="completed")throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","前序产物不存在或无权访问",422);
  return {id:workflowBindingId(runId,binding),
    kind:binding.kind,role:binding.role,artworkId:artwork.id,url:binding.kind==="image"?artwork.image:artwork.videoUrl||artwork.image};
}
export async function resumeVideoWorkflow(runId:string,actor?:string){
  await ensureWorkflowSchema();const pool=getPool(),lock=await pool.connect();let acquired=false;
  try{
    acquired=(await lock.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",[`video-workflow:${runId}`])).rows[0].acquired;
    const run=(await pool.query("SELECT * FROM app_video_workflow_runs WHERE id=$1",[runId])).rows[0];
    if(!run||actor&&run.email!==actor)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
    if(!acquired)return getVideoWorkflow(run.email,runId);
    const decrypted=run.frozen_nodes_enc?decryptAtRest(run.frozen_nodes_enc):null;
    if(run.frozen_nodes_enc&&!decrypted)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","制作链冻结记录不可用，未继续提交",503);
    const frozen:Record<string,FrozenWorkflowStage>|null=decrypted?JSON.parse(decrypted):null;
    const plan=run.plan as VideoWorkflowPlan,rows=(await pool.query<StoredNode>("SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1",[runId])).rows,states=new Map(rows.map(node=>[node.node_id,node]));
    const update=async(node:StoredNode,status:VideoWorkflowNodeStatus,error?:string,taskId?:string)=>{await pool.query("UPDATE app_video_workflow_run_nodes SET status=$3,error=$4,task_id=COALESCE($5,task_id),updated_at=now() WHERE run_id=$1 AND node_id=$2",[runId,node.node_id,status,error||null,taskId||null]);Object.assign(node,{status,error:error||null,...(taskId?{task_id:taskId}:{})});};
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
          if(request.orderedInputs)request.orderedInputs.push({id:reference.id,nodeId:binding.fromNodeId,kind:binding.kind,role:binding.role,value:reference.url!});
        }
        const requestInput:CreateVideoInput={...request,source:"workflow",sourceId:runId,projectKey:plan.projectKey,seconds:request.seconds||String(request.durationSeconds??""),
          size:request.size||request.resolution||"",references,idempotencyKey:operationId(runId,node.id),billingConfirmation:run.confirmations?.[node.id]||request.billingConfirmation};
        const create=()=>createVideoGeneration(run.email,requestInput);if(frozen&&!frozen[node.id])throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","阶段冻结记录缺失",503);const created=frozen?await withFrozenWorkflowStage(run.email,frozen[node.id],create):await create();await update(state,"processing",undefined,created.taskId);
      }catch(error){
        const recovered=await getVideoTaskByIdempotencyKey(run.email,operationId(runId,node.id));
        if(recovered)await update(state,recovered.status==="failed"?"blocked":"needs_attention","提交结果已保留，等待核对",recovered.id);
        else await update(state,error instanceof BillingError&&error.code==="PRICE_CHANGED"?"needs_confirmation":"blocked",error instanceof Error?error.message:"工作流提交失败");
      }
    };
    if(!run.cancellation_requested_at)for(let offset=0;offset<readyNodes.length;offset+=3)await Promise.allSettled(readyNodes.slice(offset,offset+3).map(submitNode));
    await pool.query("UPDATE app_video_workflow_runs SET updated_at=now() WHERE id=$1",[runId]);return getVideoWorkflow(run.email,runId);
  }finally{if(acquired)await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[`video-workflow:${runId}`]).catch(()=>{});lock.release();}
}
export async function recoverVideoWorkflows(limit=2){
  await ensureWorkflowSchema();const runs=(await getPool().query(`SELECT r.id FROM app_video_workflow_runs r WHERE EXISTS (
    SELECT 1 FROM app_video_workflow_run_nodes n WHERE n.run_id=r.id AND n.status IN ('pending','processing')) ORDER BY r.updated_at LIMIT $1`,[Math.max(1,Math.min(10,limit))])).rows;
  for(const run of runs)await resumeVideoWorkflow(run.id);return runs.length;
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
export async function listVideoWorkflows(actor:string,projectKey?:string){
  await ensureWorkflowSchema();const rows=(await getPool().query("SELECT id FROM app_video_workflow_runs WHERE email=$1 AND ($2::text IS NULL OR project_key=$2) ORDER BY created_at DESC LIMIT 50",[actor,projectKey||null])).rows;
  const result=[];for(const row of rows)result.push(await getVideoWorkflow(actor,row.id));return result;
}
export async function cancelVideoWorkflow(actor:string,runId:string){
  await ensureWorkflowSchema();const changed=await getPool().query("UPDATE app_video_workflow_runs SET cancellation_requested_at=COALESCE(cancellation_requested_at,now()),updated_at=now() WHERE id=$1 AND email=$2 RETURNING id",[runId,actor]);
  if(!changed.rowCount)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
  const current=await getVideoWorkflow(actor,runId),{requestVideoCancellation}=await import("./cancellation");
  for(const node of current.nodes)if(node.taskId&&node.status==="processing")await requestVideoCancellation(actor,node.taskId);
  await getPool().query("UPDATE app_video_workflow_run_nodes SET status='cancelled',error='已停止，未提交' WHERE run_id=$1 AND task_id IS NULL AND status IN ('pending','needs_confirmation')",[runId]);
  return getVideoWorkflow(actor,runId);
}
