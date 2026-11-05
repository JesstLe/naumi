import "server-only";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {ModelConfigError} from "../model-config/types";
import {acquireVideoCoordinationLock} from "./coordination-pool";
import {createMediaJob,getMediaJob,listMediaJobs,cancelMediaJob} from "./media-jobs";
import type {BillingQuote} from "../billing/types";
import type {MediaJobOutput,PublicMediaJob} from "./media-job-schema";
import type {VideoWorkflowPlan} from "./workflow-schema";
import type {SavedVideoResultAsset} from "./result-assets";

export type WorkflowAssemblyState={status:"waiting"|"queued"|"processing"|"completed"|"failed"|"cancelled"|"needs_attention";attempt:number;operationId?:string;jobId?:string;error?:string;outputs:MediaJobOutput[]};
type NodeState={node_id:string;status:string;result_assets?:SavedVideoResultAsset[]};
type Run={id:string;email:string;plan:VideoWorkflowPlan;cancellation_requested_at:unknown;assembly_state?:WorkflowAssemblyState;assembly_quote?:BillingQuote};
export function publicWorkflowAssembly(plan:VideoWorkflowPlan,state?:WorkflowAssemblyState|null):WorkflowAssemblyState|null{
  return plan.assembly?state?.status?state:{status:"waiting",attempt:0,outputs:[]}:null;
}
export function assemblyOperationId(runId:string,attempt:number){
  const hex=createHash("sha256").update(`video-workflow-assembly:${runId}:${attempt}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const fromJob=(state:WorkflowAssemblyState,job:PublicMediaJob):WorkflowAssemblyState=>({...state,status:job.status,jobId:job.id,operationId:job.operationId,outputs:job.outputs,...(job.error?{error:job.error}:{error:undefined})});

/** Caller holds the existing per-workflow coordination lock. Acceptance is
 * idempotent in the media module, so a lost response recovers the same receipt. */
export async function advanceWorkflowAssembly(run:Run,nodes:NodeState[]){
  if(!run.plan.assembly)return;
  let state=publicWorkflowAssembly(run.plan,run.assembly_state)!;
  if(state.status==="completed")return;
  const save=async(next:WorkflowAssemblyState)=>{await getPool().query("UPDATE app_video_workflow_runs SET assembly_state=$2::jsonb,creation_evidence_pending=true,updated_at=now() WHERE id=$1",[run.id,JSON.stringify(next)]);state=next;};
  const operationId=state.operationId||assemblyOperationId(run.id,state.attempt);
  try{
    let job=state.jobId?await getMediaJob(run.email,state.jobId,false):null;
    if(!job){const found=await listMediaJobs(run.email,{operationId,projectKey:run.plan.projectKey,source:"workflow",limit:1});job=found.jobs[0]||null;}
    if(job){
      if(run.cancellation_requested_at&&!['completed','failed','cancelled'].includes(job.status))job=await cancelMediaJob(run.email,job.id)||job;
      else if(['queued','processing'].includes(job.status))job=await getMediaJob(run.email,job.id)||job;
      await save(fromJob(state,job));return;
    }
    if(run.cancellation_requested_at){await save({...state,status:"cancelled",outputs:[],error:"制作链已停止"});return;}
    if(['failed','cancelled'].includes(state.status))return;
    const ordered=run.plan.assembly.nodeIds.map(id=>nodes.find(node=>node.node_id===id));
    if(ordered.some(node=>node&&['blocked','cancelled'].includes(node.status))){await save({...state,status:"failed",error:"镜头未全部完成，未提交成片；完成或替换该镜头后重新制作"});return;}
    if(ordered.some(node=>!node||node.status!=="completed"))return;
    const assets=ordered.map(node=>node!.result_assets?.find(asset=>asset.kind==="video"));
    if(assets.some(asset=>!asset))throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","镜头视频结果尚未核实",409);
    if(!run.assembly_quote)throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE","成片处理报价快照缺失",503);
    // Persist the operation before submit. Never infer non-acceptance from a timeout.
    await save({...state,status:"queued",operationId,error:undefined,outputs:[]});
    const stopped=(await getPool().query("SELECT cancellation_requested_at FROM app_video_workflow_runs WHERE id=$1",[run.id])).rows[0]?.cancellation_requested_at;
    if(stopped){await save({...state,status:"cancelled",error:"制作链已停止"});return;}
    job=await createMediaJob(run.email,{operationId,action:"concat",inputs:assets.map(asset=>asset!.artworkId),source:"workflow",projectKey:run.plan.projectKey},run.assembly_quote,assets.map(asset=>({artworkId:asset!.artworkId,sha256:asset!.sha256})));
    const cancelled=(await getPool().query("SELECT cancellation_requested_at FROM app_video_workflow_runs WHERE id=$1",[run.id])).rows[0]?.cancellation_requested_at;
    if(cancelled&&['queued','processing'].includes(job.status))job=await cancelMediaJob(run.email,job.id)||job;
    await save(fromJob(state,job));
  }catch(error){
    // Keep original operationId on all ambiguous submit/query failures. A missing
    // receipt alone never authorizes another purchase or a new media attempt.
    await save({...state,operationId,status:"needs_attention",error:error instanceof Error?error.message:"成片处理待核对"});
  }
}

/** A retry is a new local-media attempt only after the original job is proven
 * failed/cancelled. expectedAttempt makes double-click/replayed requests no-op. */
export async function resetWorkflowAssembly(actor:string,runId:string,expectedAttempt:number){
  const lock=await acquireVideoCoordinationLock(`video-workflow:${runId}`);
  try{
    if(!lock.acquired)throw new ModelConfigError("WORKFLOW_BUSY","制作链正在更新，请稍后重试",409);
    const run=(await getPool().query("SELECT * FROM app_video_workflow_runs WHERE id=$1 AND email=$2",[runId,actor])).rows[0] as Run|undefined;
    if(!run)throw new ModelConfigError("WORKFLOW_UNAVAILABLE","工作流不存在",404);
    const state=publicWorkflowAssembly(run.plan,run.assembly_state);
    if(!state)throw new ModelConfigError("ASSEMBLY_UNAVAILABLE","制作链没有成片阶段",409);
    if(state.attempt>expectedAttempt)return;
    if(state.attempt!==expectedAttempt||run.cancellation_requested_at)throw new ModelConfigError("ASSEMBLY_RETRY_CONFLICT","成片状态已改变或制作链已停止",409);
    const job=state.jobId?await getMediaJob(actor,state.jobId,false):null;
    if(!job||!['failed','cancelled'].includes(job.status))throw new ModelConfigError("ASSEMBLY_RETRY_UNCONFIRMED","原成片任务尚未确认失败，请核对原任务",409);
    const next:WorkflowAssemblyState={status:"waiting",attempt:state.attempt+1,outputs:[]};
    await getPool().query("UPDATE app_video_workflow_runs SET assembly_state=$3::jsonb,updated_at=now() WHERE id=$1 AND email=$2",[runId,actor,JSON.stringify(next)]);
  }finally{await lock.release();}
}
