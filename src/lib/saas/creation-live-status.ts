import 'server-only';
import type {PoolClient} from 'pg';
import {workflowOutcomeStagesSql} from '../video/workflow-outcome';
import {videoWorkflowEvidenceAvailable} from './creation-source-evidence';

// A terminal result keeps precedence. Top-level image failure overrides a
// result only if the result was left running or otherwise not terminal.
const imageJoin=` LEFT JOIN LATERAL(SELECT x.snapshot,
 CASE WHEN x.snapshot->>'status' IN ('error','failed','cancelled','canceled')
 AND COALESCE(x.snapshot->'result'->>'status','') NOT IN ('succeeded','done','completed','success','partial','failed','error','cancelled','canceled')
 THEN x.snapshot->>'status' END AS failed_status
 FROM app_creation_links l JOIN app_image_jobs x ON x.id=l.target_id AND x.email=l.actor_email
 WHERE l.creation_id=c.id AND l.target_type LIKE 'image:%' LIMIT 1)j ON true`;
const videoJoin=` LEFT JOIN LATERAL(SELECT x.status FROM app_creation_links l JOIN app_video_tasks x ON x.id=l.target_id AND x.email=l.actor_email
 WHERE l.creation_id=c.id AND l.target_type='video' LIMIT 1)v ON true`;
const workflowJoin=` LEFT JOIN LATERAL(
 SELECT CASE WHEN count(n.node_id)=0 THEN 'needs_review' WHEN bool_and(n.status='completed') THEN 'succeeded'
 WHEN bool_and(n.status IN ('completed','blocked','cancelled')) THEN CASE WHEN bool_or(n.status='completed') THEN 'partial' WHEN bool_or(n.status='blocked') THEN 'failed' ELSE 'cancelled' END
 WHEN bool_or(n.status IN ('needs_attention','needs_confirmation')) THEN 'needs_review' WHEN r.cancellation_requested_at IS NOT NULL THEN 'cancel_requested' ELSE 'running' END AS status
 FROM app_creation_links l JOIN app_video_workflow_runs r ON r.id::text=l.target_id AND r.email=l.actor_email
 LEFT JOIN LATERAL(${workflowOutcomeStagesSql})n ON true WHERE l.creation_id=c.id AND l.target_type='video-workflow' GROUP BY r.id LIMIT 1)wf ON true`;

/** Use the same precedence everywhere. The caller may pass the exact records
 * of an authorized detail page to avoid joins that would lock unrelated tables. */
export async function creationLiveStatusSql(tx:PoolClient,ids?:readonly string[]){
 const {rows}=ids?(ids.length?await tx.query<{kind:string}>(`SELECT DISTINCT CASE WHEN target_type LIKE 'image:%' THEN 'image' ELSE target_type END AS kind
  FROM app_creation_links WHERE creation_id=ANY($1::text[]) AND (target_type LIKE 'image:%' OR target_type IN ('video','video-workflow'))`,[ids]):{rows:[]}):
  {rows:[{kind:'image'},{kind:'video'},{kind:'video-workflow'}]};
 const kinds=new Set(rows.map(row=>row.kind));
 const image=kinds.has('image'),video=kinds.has('video'),workflow=kinds.has('video-workflow')&&await videoWorkflowEvidenceAvailable(tx);
 const statuses=[...(workflow?['wf.status']:[]),...(image?["j.failed_status","j.snapshot->'result'->>'status'","j.snapshot->>'status'"]:[]),...(video?['v.status']:[]),'c.status'];
 return {status:statuses.length===1?'c.status':`COALESCE(${statuses.join(',')})`,joins:(image?imageJoin:'')+(video?videoJoin:'')+(workflow?workflowJoin:'')};
}
