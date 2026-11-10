import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import {ensureVideoWorkflowSchema,ensureMediaJobSchema} from "./storage-schema";
import {assertWorkflowCreationScope} from "./workflow-creation";
import {assemblyOperationId,type WorkflowAssemblyState} from "./workflow-assembly";
import type {VideoWorkflowPlan} from "./workflow-schema";

export type VideoCostSubject={id:string;status:string;nodeId:string|null;runId:string|null;byoc:boolean;zeroByocPolicy:boolean;retry:boolean};
export type WorkflowCostSubject={id:string;storyboard:VideoWorkflowPlan["storyboard"];reviewPlanId:string|null;nodes:Array<{id:string;nodeId:string|null;contentDigest:string|null;reused:boolean;status:string;taskId:string|null;quotedCredits:number|null;upperBound:boolean}>;assemblyOperations:string[]};
/** Owning video module projects only identities, public credit quotes and input digests.
 * No list-page limit: superseded runs and retries still count. Caller authorizes project. */
export async function readVideoCostHistory(actor:string,projectKey:string,planId:string,nodeIds:readonly string[],inheritedIds:readonly string[]){
 await ensureSchema();await ensureVideoWorkflowSchema();
 const runs=(await getPool().query(`SELECT id,plan,creation_scope,public_frozen_nodes,assembly_state FROM app_video_workflow_runs
  WHERE email=$1 AND project_key=$2 AND (plan->'storyboard'->>'id'=$3 OR plan->'reviewOrigin'->>'planId'=$3
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'nodes') n WHERE n->>'canvasNodeId'=ANY($4::text[]))) ORDER BY created_at,id`,[actor.toLowerCase(),projectKey,planId,nodeIds])).rows;
 const states=(await getPool().query("SELECT run_id,node_id,status,task_id FROM app_video_workflow_run_nodes WHERE run_id=ANY($1::uuid[])",[runs.map(run=>run.id)])).rows;
 const workflows:WorkflowCostSubject[]=[];
 for(const run of runs){assertWorkflowCreationScope(run.creation_scope,actor);const plan=run.plan as VideoWorkflowPlan;
  const assembly=run.assembly_state as WorkflowAssemblyState|null,attempt=Number.isSafeInteger(assembly?.attempt)&&assembly!.attempt>=0?assembly!.attempt:0;
  workflows.push({id:String(run.id),storyboard:plan.storyboard,reviewPlanId:plan.reviewOrigin?.planId||null,nodes:plan.nodes.map(node=>{
   const state=states.find(s=>s.run_id===run.id&&s.node_id===node.id),q=run.public_frozen_nodes?.[node.id],credits=q?.authorization?q.authorizedCredits:q?.credits;
   return {id:node.id,nodeId:node.canvasNodeId||null,contentDigest:node.canvasContentDigest||null,reused:!!node.existingArtworkId,status:String(state?.status||"pending"),taskId:state?.task_id||null,quotedCredits:Number.isSafeInteger(credits)&&credits>=0?credits:null,upperBound:!!q?.authorization};
  }),assemblyOperations:plan.assembly?Array.from({length:attempt+1},(_,i)=>assemblyOperationId(String(run.id),i)):[]});
 }
 const taskIds=workflows.flatMap(run=>run.nodes.flatMap(node=>node.taskId?[node.taskId]:[]));
 const rows=(await getPool().query(`SELECT id,status,source,source_id,parameters FROM app_video_tasks
  WHERE email=$1 AND parameters->>'projectKey'=$2 AND (parameters->>'nodeId'=ANY($3::text[]) OR id=ANY($4::text[])
   OR (source='workflow' AND source_id=ANY($5::text[]))) ORDER BY created_at,id`,[actor.toLowerCase(),projectKey,nodeIds,[...taskIds,...inheritedIds],workflows.map(run=>run.id)])).rows;
 const tasks:VideoCostSubject[]=rows.map(row=>({id:String(row.id),status:String(row.status),nodeId:typeof row.parameters?.nodeId==="string"?row.parameters.nodeId:null,runId:row.source==="workflow"?String(row.source_id):null,byoc:!!row.parameters?.byocSnapshot,zeroByocPolicy:row.parameters?.billingException==="comfyui-byoc-zero"&&!!row.parameters?.byocSnapshot,retry:!!row.parameters?.retryOf}));
 return {workflows,tasks};
}
export type MediaCostSubject={id:string;operationId:string;status:string;audio:boolean;outputArtworkIds:string[]};
/** Exact operation/output references, not all unrelated project jobs. */
export async function readMediaCostHistory(actor:string,projectKey:string,operationIds:readonly string[],artworkIds:readonly string[]):Promise<MediaCostSubject[]>{
 await ensureMediaJobSchema();
 const rows=(await getPool().query(`SELECT id,operation_id,status,outputs,inputs FROM app_video_media_jobs WHERE email=$1 AND request->>'projectKey'=$2
  AND (operation_id::text=ANY($3::text[]) OR EXISTS(SELECT 1 FROM jsonb_array_elements(outputs) o WHERE o->>'artworkId'=ANY($4::text[]))) ORDER BY created_at,id`,[actor.toLowerCase(),projectKey,operationIds,artworkIds])).rows;
 return rows.map(row=>({id:String(row.id),operationId:String(row.operation_id),status:String(row.status),audio:row.outputs?.some((o:{kind?:string;mimeType?:string})=>o.kind==="audio"||o.mimeType?.startsWith("audio/"))||row.inputs?.every((i:{kind?:string})=>i.kind==="audio")||false,outputArtworkIds:(row.outputs||[]).flatMap((o:{artworkId?:string})=>o.artworkId?[o.artworkId]:[])}));
}
