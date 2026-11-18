import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {workflowCreatedAssets} from '../video/workflow-outcome';
const family=`WITH RECURSIVE family AS(SELECT id,actor_email,tenant_id FROM app_creation_records WHERE id=$1
 UNION ALL SELECT c.id,c.actor_email,c.tenant_id FROM app_creation_records c JOIN family p ON c.parent_id=p.id
 AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id), links AS(
 SELECT l.creation_id,l.actor_email,l.target_type,l.target_id FROM app_creation_links l JOIN family f ON f.id=l.creation_id)`;
const recordLinks=`WITH links AS(SELECT creation_id,actor_email,target_type,target_id FROM app_creation_links WHERE creation_id=$1)`;
const ordinarySourceReads={
 image:`SELECT l.creation_id,l.actor_email,COALESCE(j.snapshot->'result'->'artifacts',j.snapshot->'images',j.snapshot->'shots','[]'::jsonb) AS outputs,
  '[]'::jsonb AS ids,'image'::text AS media_type FROM links l JOIN app_image_jobs j ON j.id=l.target_id AND j.email=l.actor_email
  WHERE l.target_type LIKE 'image:%' AND j.snapshot->>'creationEvidencePending'='true'`,
 video:`SELECT l.creation_id,l.actor_email,COALESCE(v.parameters->'resultAssets','[]'::jsonb) AS outputs,
  COALESCE(v.parameters->'resultArtworkIds','[]'::jsonb) AS ids,'video'::text AS media_type
  FROM links l JOIN app_video_tasks v ON v.id=l.target_id AND v.email=l.actor_email
  WHERE l.target_type='video' AND v.parameters->>'creationEvidencePending'='true'`,
 'canvas-image':`SELECT l.creation_id,l.actor_email,'[]'::jsonb AS outputs,jsonb_build_array(c.result_artwork_id) AS ids,'image'::text AS media_type
  FROM links l JOIN app_canvas_image_tasks c ON c.id=l.target_id AND c.email=l.actor_email
  WHERE l.target_type='canvas-image' AND c.parameters->>'creationEvidencePending'='true'`,
} as const;
export async function videoWorkflowEvidenceAvailable(tx:PoolClient){return !!(await tx.query("SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('app_video_workflow_runs') AND attname='creation_evidence_pending' AND NOT attisdropped")).rowCount;}
/** Read-only recovery from exact frozen source IDs. Never schedules or repairs paid work. */
export function creationSourceEvidence(tx:PoolClient,rootId:string){return readEvidence(tx,rootId,{scope:'family',pending:true});}
export async function creationSourceAssets(tx:PoolClient,rootId:string){
 return (await readEvidence(tx,rootId,{scope:'family',pending:false})).assets;
}

/** Asset-only callers don't need the pending state from settlements or events. */
export async function creationRecoveredAsset(tx:PoolClient,id:string,assetId:string,recordOnly:boolean){
 return (await readEvidence(tx,id,{scope:recordOnly?'record':'family',pending:false})).assets.find(asset=>asset.id===assetId);
}

async function readEvidence(tx:PoolClient,rootId:string,options:{scope:'family'|'record';pending:boolean}){
 const scope=options.scope==='record'?recordLinks:family;
 // A false SQL join condition still takes a relation lock in PostgreSQL.
 // Select only actual source categories in this authorization snapshot.
 const {rows:categories}=await tx.query<{kind:string}>(`${scope}
  SELECT DISTINCT CASE WHEN target_type LIKE 'image:%' THEN 'image' ELSE target_type END AS kind FROM links
  WHERE target_type LIKE 'image:%' OR target_type IN ('video','canvas-image','imagegen-batch','video-workflow','billing')`,[rootId]);
 const sources=new Set(categories.map(row=>row.kind));
 const selected=Object.entries(ordinarySourceReads).filter(([kind])=>sources.has(kind)).map(([,sql])=>sql);
 const rows=selected.length?(await tx.query(`${scope} ${selected.join(' UNION ALL ')}`,[rootId])).rows:[];
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
 const batchTable=sources.has('imagegen-batch')&&(await tx.query("SELECT to_regclass('app_imagegen_batches') AS name")).rows[0]?.name;
 if(batchTable){
  const batches=(await tx.query(`${scope} SELECT l.creation_id,l.actor_email,i.result->'artifacts' AS outputs FROM links l
   -- Link targets are heterogeneous text; cast the UUID source, never the link.
   JOIN app_imagegen_batches b ON b.id::text=l.target_id AND b.owner=l.actor_email
   LEFT JOIN app_imagegen_batch_items i ON i.batch_id=b.id
   WHERE l.target_type='imagegen-batch' AND b.plan->>'creationEvidencePending'='true' ORDER BY i.ordinal`,[rootId])).rows;
  if(batches.length)pending=true;
  for(const row of batches)for(const[i,output]of (Array.isArray(row.outputs)?row.outputs:[]).entries())add(row,output.artworkId||output.id,i);
 }
 if(sources.has('video-workflow')&&await videoWorkflowEvidenceAvailable(tx)){
  const workflows=(await tx.query(`${scope} SELECT l.creation_id,l.actor_email,r.plan,to_jsonb(r)->'assembly_state' AS assembly_state,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('node_id',n.node_id,'result_assets',n.result_assets) ORDER BY n.node_id) FROM app_video_workflow_run_nodes n WHERE n.run_id=r.id),'[]'::jsonb) AS nodes FROM links l
   JOIN app_video_workflow_runs r ON r.id::text=l.target_id AND r.email=l.actor_email
   WHERE l.target_type='video-workflow' AND r.creation_evidence_pending`,[rootId])).rows;
  if(workflows.length)pending=true;
  for(const row of workflows)for(const[i,output]of workflowCreatedAssets(row.plan||{nodes:[]},row.nodes||[],row.assembly_state).entries())add(row,output.artworkId,i,['image','video','audio'].includes(output.kind||'')?output.kind:'video');
 }
 if(options.pending&&!pending&&sources.has('billing'))pending=!!(await tx.query(`${family} SELECT 1 FROM app_billing_operations b JOIN links l ON l.target_type='billing' AND l.target_id=b.id AND l.actor_email=b.email WHERE b.result_response->>'creationEvidencePending'='true' LIMIT 1`,[rootId])).rowCount;
 if(options.pending&&!pending)pending=!!(await tx.query(`${family} SELECT 1 FROM app_creation_events e JOIN family f ON f.id=e.creation_id
  WHERE e.type='evidence' AND e.status='needs_review' LIMIT 1`,[rootId])).rowCount;
 return {pending,assets:[...new Map(assets.map(a=>[`${a.creation_id}:${a.storage_ref}`,a])).values()]};
}
