import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from '../db';
import {ModelConfigError} from '../model-config/types';
import {currentCreationContext,frozenCreationScope,withFrozenCreation,withoutCreationContext,bindActualCreationProject,assertCreationProjectInput,type CreationContext} from '../saas/creation-context';
import {acceptCreationTx,assertCreationInputsTx,assertCreationObjectRefs,captureCreationMediaTx,creationEvidenceTx,recordSourceOutcomeTx} from '../saas/creation-writer';
import {ensureCreationSchema} from '../saas/creation-schema';
import type {VideoWorkflowPlan} from './workflow-schema';

export function assertWorkflowCreationScope(value:unknown,actor:string){
 const saved=frozenCreationScope(value,actor),current=currentCreationContext();
 if(value&&!saved)throw new ModelConfigError('WORKFLOW_SCOPE_UNAVAILABLE','制作链归属记录不可用，未继续提交',503);
 if(current&&(current.workspaceExplicit||current.creationId)&&(saved?(saved.scopeKind!==current.scopeKind||saved.tenantId!==current.tenantId):current.tenantId!==null))throw new ModelConfigError('WORKFLOW_SCOPE_CONFLICT','此制作链的工作空间已固定',409);
 return saved;
}
export function runWorkflowCreation<T>(scope:CreationContext|undefined,run:()=>Promise<T>){return scope?withFrozenCreation({...scope},run):withoutCreationContext(run);}
export async function bindWorkflowCreationProject(actor:string,project:string){return bindActualCreationProject(actor,project);}
export async function validateWorkflowCreationInputs(actor:string,plan:VideoWorkflowPlan){
 const scope=currentCreationContext();if(!scope)return;
 const {authorizeNodeInputs}=await import('../canvas/video-node-service');
 for(const node of plan.nodes){
  const references=[...(node.request.references||[]),...(node.request.elements||[]).flatMap(e=>e.references)];
  await assertCreationObjectRefs(actor,references.map(r=>r.artworkId).filter((id):id is string=>!!id));
  for(const input of node.request.orderedInputs||[])if(input.kind==='text'&&!input.nodeId.startsWith('inline:')){
   const row=(await getPool().query('SELECT project_key FROM app_canvas_text_nodes WHERE email=$1 AND id=$2',[actor,input.nodeId.replace(/^text:/,'')])).rows[0];if(row)await assertCreationProjectInput(actor,row.project_key);
  }
  for(const shot of node.request.shots||[])if(shot.textNodeId){const row=(await getPool().query('SELECT project_key FROM app_canvas_text_nodes WHERE email=$1 AND id=$2',[actor,shot.textNodeId.replace(/^text:/,'')])).rows[0];if(row)await assertCreationProjectInput(actor,row.project_key);}
  if(node.canvasNodeId){const {getVideoNode}=await import('../canvas/video-node-repository');const source=await getVideoNode(actor,node.canvasNodeId);if(source)await authorizeNodeInputs(actor,{id:source.id,expectedRevision:source.revision,operationId:plan.id,config:source.config,inputs:source.inputs});}
 }
}
/** The root, its accepted scope and the owning workflow/receipt commit together. */
export async function acceptWorkflowCreationTx(tx:PoolClient,actor:string,plan:VideoWorkflowPlan){
 const context=currentCreationContext();if(!context)return undefined;
 await ensureCreationSchema();
 const references=plan.nodes.flatMap(n=>[...(n.request.references||[]),...(n.request.elements||[]).flatMap(e=>e.references)]);
 await assertCreationInputsTx(tx,actor,references.map(r=>r.artworkId).filter((id):id is string=>!!id),context);
 const root={...context,requestText:context.requestText||plan.nodes.map(n=>`${n.id}: ${n.request.prompt}`).join('\n').slice(0,50000)};
 const id=await acceptCreationTx(tx,'video-workflow',plan.id,actor,{inputs:references},root);
 if(id)await captureCreationMediaTx(tx,id,actor,references);
 return {...root,creationId:id||root.creationId};
}
export async function updateWorkflowCreationTx(tx:PoolClient,actor:string,runId:string){
 const rows=(await tx.query('SELECT status,result_assets FROM app_video_workflow_run_nodes WHERE run_id=$1',[runId])).rows;
 const run=(await tx.query('SELECT cancellation_requested_at FROM app_video_workflow_runs WHERE id=$1 AND email=$2',[runId,actor])).rows[0];
 const status=workflowCreationStatus(rows.map(r=>String(r.status)),!!run?.cancellation_requested_at);
 const ids=rows.flatMap(r=>Array.isArray(r.result_assets)?r.result_assets:[]).map(a=>a.artworkId).filter((id):id is string=>typeof id==='string');
 await creationEvidenceTx(tx,()=>recordSourceOutcomeTx(tx,'video-workflow',runId,actor,status,{artworkIds:ids,eventKey:`workflow:${status}`,summary:`制作链状态：${status}`}),()=>tx.query("UPDATE app_video_workflow_runs SET creation_evidence_pending=true WHERE id=$1",[runId]));
}
export function workflowCreationStatus(statuses:string[],cancellationRequested=false){
 if(!statuses.length)return 'needs_review' as const;
 const done=statuses.every(s=>['completed','blocked','cancelled'].includes(s));
 return done?(statuses.every(s=>s==='completed')?'succeeded':statuses.some(s=>s==='completed')?'partial':statuses.some(s=>s==='blocked')?'failed':'cancelled'):statuses.some(s=>['needs_attention','needs_confirmation'].includes(s))?'needs_review':cancellationRequested?'cancel_requested':'running';
}
/** Accepted continuations remain available after membership expiry. The saved
 * actor and scope, not request-body fields, control every resumed stage. */
export async function withWorkflowContinuation<T>(request:Request,actor:string,id:string,run:()=>Promise<T>){
 const row=(await getPool().query('SELECT creation_scope FROM app_video_workflow_runs WHERE id=$1 AND email=$2',[id,actor.toLowerCase()])).rows[0];
 if(!row)throw new ModelConfigError('WORKFLOW_UNAVAILABLE','工作流不存在',404);
 const scope=assertWorkflowCreationScope(row.creation_scope,actor),selected=request.headers.get('x-naumi-workspace');
 if(selected&&selected!==(scope?.tenantId||'personal'))throw new ModelConfigError('WORKFLOW_SCOPE_CONFLICT','此制作链的工作空间已固定',409);
 return runWorkflowCreation(scope,run);
}
