import "server-only";
import {assertWorkflowCreationScope,bindWorkflowCreationProject,validateWorkflowCreationInputs} from "./workflow-creation";
import {z} from "zod";
import {videoNodeIdSchema,videoProjectKeySchema} from "../canvas/video-node-schema";
import {getVideoNode} from "../canvas/video-node-repository";
import {getVideoTask,listArtworksByIds} from "../db";
import {ModelConfigError} from "../model-config/types";
import {scheduleVideoWorkflow,ensureVideoWorkflowSchema,authorizeWorkflowInputs,validateVideoWorkflow} from "./workflow";
import {workflowVideoRequestSchema,type VideoWorkflowPlan} from "./workflow-schema";
import {canonicalConfig} from "../model-config/repository";
import {freezeVideoWorkflow,type FrozenWorkflowStage} from "./workflow-freeze";
import type {VideoReference} from "./types";
export const canvasWorkflowSchema=z.strictObject({id:z.uuid(),projectKey:videoProjectKeySchema,nodes:z.array(z.strictObject({id:videoNodeIdSchema,revision:z.number().int().nonnegative(),billingConfirmation:z.strictObject({version:z.number().int().positive(),credits:z.number().finite().nonnegative()}).optional()})).min(1).max(100).refine(nodes=>new Set(nodes.map(node=>node.id)).size===nodes.length,"节点不能重复")});
export async function buildCanvasVideoWorkflow(actor:string,raw:unknown):Promise<VideoWorkflowPlan>{
  const input=canvasWorkflowSchema.parse(raw),selected=new Set(input.nodes.map(node=>node.id)),nodes:VideoWorkflowPlan["nodes"]=[];
  for(const requested of input.nodes){const current=await getVideoNode(actor,requested.id);if(!current||current.projectKey!==input.projectKey||current.revision!==requested.revision)throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT","制作链节点不存在或已更新",409);
    if(current.lastTaskId){const old=await getVideoTask(actor,current.lastTaskId);if(old&&["queued","processing","needs_attention"].includes(old.status))throw new ModelConfigError("VIDEO_NODE_BUSY","节点仍有正在执行或待核查的任务",409);}
    const references:VideoReference[]=[],ordered=structuredClone(current.inputs),bindings:NonNullable<VideoWorkflowPlan["nodes"][number]["mediaBindings"]>=[],dependsOn=new Set<string>();
    for(const source of ordered){if(source.kind==="text")continue;const id=source.nodeId.replace(/^(image|video|audio):/,"");if(selected.has(id)){dependsOn.add(id);bindings.push({fromNodeId:id,inputId:source.id,kind:source.kind,role:source.role as VideoReference["role"]});continue;}
      const previous=await getVideoNode(actor,id);let artworkId=id;if(previous){const task=previous.lastTaskId?await getVideoTask(actor,previous.lastTaskId):null;if(!previous.displayResultId&&task&&task.status!=="completed"||!previous.displayResultId&&!previous.lastResultId)throw new ModelConfigError("VIDEO_DEPENDENCY_PENDING","未加入制作链的前序素材尚未完成",409);artworkId=previous.displayResultId||previous.lastResultId!;}
      const art=(await listArtworksByIds(actor,[artworkId]))[0];if(!art||art.status!=="completed")throw new ModelConfigError("VIDEO_INPUT_UNAVAILABLE","制作链素材不存在或未完成",404);const url=source.kind==="image"?art.image:art.videoUrl||art.image;references.push({id:source.id,kind:source.kind,role:source.role as VideoReference["role"],artworkId,url});source.value=url;source.nodeId=artworkId;
    }
    const {batchCount:_batchCount,...generationConfig}=current.config;
    const request=workflowVideoRequestSchema.parse({...generationConfig,prompt:current.config.prompt||"",references:current.inputs.length?references:current.config.references,orderedInputs:ordered.length?ordered:undefined,billingConfirmation:requested.billingConfirmation});
    nodes.push({id:current.id,canvasNodeId:current.id,canvasNodeRevision:current.revision,request,dependsOn:[...dependsOn],mediaBindings:bindings});
  }
  return {id:input.id,projectKey:input.projectKey,nodes};
}
export async function scheduleCanvasVideoWorkflow(actor:string,raw:unknown,prepared?:PreparedCanvasVideoWorkflow,signal?:AbortSignal){const input=canvasWorkflowSchema.parse(raw);
  // Stable node-list operation survives later revisions; the persisted run owns the frozen plan.
  await ensureVideoWorkflowSchema();const {getPool}=await import("../db");
  {const row=(await getPool().query("SELECT email,canvas_intent_digest,creation_scope FROM app_video_workflow_runs WHERE id=$1",[input.id])).rows[0];if(row){assertWorkflowCreationScope(row.creation_scope,actor);const {canonicalConfig}=await import("../model-config/repository"),{createHash}=await import("node:crypto"),digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");if(row.email!==actor||row.canvas_intent_digest!==digest)throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","制作链编号已用于另一请求",409);const {resumeVideoWorkflow}=await import("./workflow"),run=await resumeVideoWorkflow(input.id,actor);return {runId:input.id,taskIds:run.nodes.map(node=>node.taskId).filter((id):id is string=>!!id)};}}
  if(prepared&&canonicalIntent(prepared.intent)!==canonicalIntent(input))throw new ModelConfigError("WORKFLOW_OPERATION_CONFLICT","预检制作链与提交不同",409);
  await bindWorkflowCreationProject(actor,input.projectKey);const plan=prepared?.plan||await buildCanvasVideoWorkflow(actor,input);return scheduleVideoWorkflow(actor,plan,input,prepared?.frozen,signal);
}

function canonicalIntent(input:unknown){return canonicalConfig(input);}
export type PreparedCanvasVideoWorkflow={intent:z.infer<typeof canvasWorkflowSchema>;plan:VideoWorkflowPlan;frozen:Record<string,FrozenWorkflowStage>};
export async function prepareCanvasVideoWorkflow(actor:string,raw:unknown):Promise<PreparedCanvasVideoWorkflow>{const intent=canvasWorkflowSchema.parse(raw);await bindWorkflowCreationProject(actor,intent.projectKey);const plan=validateVideoWorkflow(await buildCanvasVideoWorkflow(actor,intent));await validateWorkflowCreationInputs(actor,plan);await authorizeWorkflowInputs(actor,plan);const frozen=await freezeVideoWorkflow(actor,plan);for(const node of plan.nodes){const value=frozen[node.id].quote;node.request.billingConfirmation={version:value.version,credits:value.authorization?value.authorizedCredits:value.credits};}return {intent,plan,frozen};}
