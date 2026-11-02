import type {VideoWorkflowPlan} from "./workflow-schema";

type Asset={artworkId?:string;kind?:string;mimeType?:string};
type Assembly={status?:string;outputs?:Asset[]};
export function workflowAssemblyStageStatus(status?:string){
  return status==='completed'?'completed':status==='failed'?'blocked':status==='cancelled'?'cancelled':status==='needs_attention'?'needs_attention':'processing';
}
/** Reused outputs are dependencies of this run, not creations of this run. */
export function workflowCreatedAssets(plan:Pick<VideoWorkflowPlan,'nodes'|'assembly'>,nodes:{node_id:string;result_assets?:Asset[]}[],assembly?:Assembly|null){
  const reused=new Set((plan.nodes||[]).filter(node=>node.existingArtworkId).map(node=>node.id));
  return [...nodes.filter(node=>!reused.has(node.node_id)).flatMap(node=>Array.isArray(node.result_assets)?node.result_assets:[]),...(plan.assembly&&assembly?.status==='completed'&&Array.isArray(assembly.outputs)?assembly.outputs:[])];
}
/** Read-model stage relation. to_jsonb keeps pre-assembly database schemas
 * readable before the owning workflow module applies additive migrations. */
export const workflowOutcomeStagesSql=`
 SELECT node_id,status FROM app_video_workflow_run_nodes WHERE run_id=r.id
 UNION ALL SELECT '__assembly__',CASE to_jsonb(r)->'assembly_state'->>'status'
 WHEN 'completed' THEN 'completed' WHEN 'failed' THEN 'blocked' WHEN 'cancelled' THEN 'cancelled'
 WHEN 'needs_attention' THEN 'needs_attention' ELSE 'processing' END WHERE r.plan ? 'assembly'`;
