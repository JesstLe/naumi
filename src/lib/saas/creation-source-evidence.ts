import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
const family=`WITH RECURSIVE family AS(SELECT id,actor_email,tenant_id FROM app_creation_records WHERE id=$1
 UNION ALL SELECT c.id,c.actor_email,c.tenant_id FROM app_creation_records c JOIN family p ON c.parent_id=p.id
 AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id), links AS(
 SELECT l.* FROM app_creation_links l JOIN family f ON f.id=l.creation_id)`;
export async function videoWorkflowEvidenceAvailable(tx:PoolClient){return !!(await tx.query("SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('app_video_workflow_runs') AND attname='creation_evidence_pending' AND NOT attisdropped")).rowCount;}
/** Read-only recovery from exact frozen source IDs. Never schedules or repairs paid work. */
export async function creationSourceEvidence(tx:PoolClient,rootId:string){
 const rows=(await tx.query(`${family}
 SELECT l.*,COALESCE(j.snapshot->'result'->'artifacts',j.snapshot->'images',j.snapshot->'shots','[]'::jsonb) AS outputs,'[]'::jsonb AS ids,'image'::text AS media_type
 FROM links l JOIN app_image_jobs j ON j.id=l.target_id AND j.email=l.actor_email
 WHERE l.target_type LIKE 'image:%' AND j.snapshot->>'creationEvidencePending'='true'
 UNION ALL SELECT l.*,COALESCE(v.parameters->'resultAssets','[]'::jsonb),COALESCE(v.parameters->'resultArtworkIds','[]'::jsonb),'video'
 FROM links l JOIN app_video_tasks v ON v.id=l.target_id AND v.email=l.actor_email
 WHERE l.target_type='video' AND v.parameters->>'creationEvidencePending'='true'
 UNION ALL SELECT l.*,'[]'::jsonb,jsonb_build_array(c.result_artwork_id),'image'
 FROM links l JOIN app_canvas_image_tasks c ON c.id=l.target_id AND c.email=l.actor_email
 WHERE l.target_type='canvas-image' AND c.parameters->>'creationEvidencePending'='true'`,[rootId])).rows;
 const assets:Record<string,unknown>[]=[];let pending=rows.length>0;
 const add=(link:Record<string,any>,artworkId:unknown,position:number,mediaType='image')=>{
  if(typeof artworkId!=='string'||!artworkId||artworkId.length>240)return;
  assets.push({id:`recovered-${createHash('sha256').update(`${link.creation_id}:${artworkId}`).digest('hex').slice(0,32)}`,
   creation_id:link.creation_id,direction:'output',role:'result',position,variant:'original',storage_ref:`artwork:${artworkId}`,
   actor_email:link.actor_email,mime:null,byte_size:null,hash:null,availability:'recorded',media_type:mediaType,text_content:null});
 };
 for(const row of rows){
  for(const[i,id]of (Array.isArray(row.ids)?row.ids:[]).entries())add(row,id,i,row.media_type);
  for(const[i,output]of (Array.isArray(row.outputs)?row.outputs:[]).entries())add(row,output.artworkId||output.id,i,row.media_type);
 }
 const batchTable=(await tx.query("SELECT to_regclass('app_imagegen_batches') AS name")).rows[0]?.name;
 if(batchTable){
  const batches=(await tx.query(`${family} SELECT l.*,i.result->'artifacts' AS outputs FROM links l
   -- Link targets are heterogeneous text; cast the UUID source, never the link.
   JOIN app_imagegen_batches b ON b.id::text=l.target_id AND b.owner=l.actor_email
   LEFT JOIN app_imagegen_batch_items i ON i.batch_id=b.id
   WHERE l.target_type='imagegen-batch' AND b.plan->>'creationEvidencePending'='true' ORDER BY i.ordinal`,[rootId])).rows;
  if(batches.length)pending=true;
  for(const row of batches)for(const[i,output]of (Array.isArray(row.outputs)?row.outputs:[]).entries())add(row,output.artworkId||output.id,i);
 }
 if(await videoWorkflowEvidenceAvailable(tx)){
  const workflows=(await tx.query(`${family} SELECT l.*,n.result_assets AS outputs FROM links l
   JOIN app_video_workflow_runs r ON r.id::text=l.target_id AND r.email=l.actor_email
   LEFT JOIN app_video_workflow_run_nodes n ON n.run_id=r.id
   WHERE l.target_type='video-workflow' AND r.creation_evidence_pending ORDER BY n.node_id`,[rootId])).rows;
  if(workflows.length)pending=true;
  for(const row of workflows)for(const[i,output]of (Array.isArray(row.outputs)?row.outputs:[]).entries())add(row,output.artworkId,i,['image','video','audio'].includes(output.kind)?output.kind:'video');
 }
 if(!pending)pending=!!(await tx.query(`${family} SELECT 1 FROM app_billing_operations b JOIN links l ON l.target_type='billing' AND l.target_id=b.id AND l.actor_email=b.email WHERE b.result_response->>'creationEvidencePending'='true' LIMIT 1`,[rootId])).rowCount;
 if(!pending)pending=!!(await tx.query(`${family} SELECT 1 FROM app_creation_events e JOIN family f ON f.id=e.creation_id
  WHERE e.type='evidence' AND e.status='needs_review' LIMIT 1`,[rootId])).rowCount;
 return {pending,assets:[...new Map(assets.map(a=>[`${a.creation_id}:${a.storage_ref}`,a])).values()]};
}
