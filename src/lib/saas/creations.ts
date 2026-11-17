import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from "@/platform/db/pool";
import {enterpriseRead,enterpriseReportRead} from '@/lib/enterprise/server';
import { TeamError } from "@/lib/teams/errors";
import type {TeamActor} from '@/lib/teams/grants';
import {ensureCreationSchema} from './creation-schema';
import {creationSourceEvidence,videoWorkflowEvidenceAvailable} from './creation-source-evidence';
import {publicCreationParameters} from './creation-parameters';
import {creationRequestEvidence} from './creation-request-evidence';
import {creationStatus,type CreationFilters,type CreationPage,type CreationListPage,type CreationSummary,type CreationDetail,type CreationAsset} from './creation-contracts';
import {legacyCreationId} from './creation-history-identity';
import {legacyCreationCandidates} from './creation-unified-query';
import {creationFailures,legacyCreationFailuresInTransaction,hasCreationFailure} from './creation-failures';
import {creationAssetViewSql,creationAssetViewOrder} from './creation-asset-view';
import {workflowOutcomeStagesSql} from '../video/workflow-outcome';

export type CreationDetailReader={platform:true;boundTenantId?:string}|{platform:false;tenantId:string;historyEmails?:readonly string[]};
export type CreationReader={platform:true;boundTenantId?:string}|{platform:false;actor:TeamActor;tenantId:string};
async function scoped<T>(reader:CreationReader,run:(tx:PoolClient,visible:string[]|null,historyVisible:readonly string[]|null)=>Promise<T>,kind:'report'|'asset'='report'){
 await ensureCreationSchema();
 if(!reader.platform)return (kind==='asset'?enterpriseRead:enterpriseReportRead)(reader.actor,reader.tenantId,(tx,s)=>run(tx,s.owner?null:[...s.visible],[...new Set([...s.visible,...(s.owner?[s.team.owner_email]:[])])]));
 const tx=await getPool().connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='20s'");const result=await run(tx,null,null);await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
const fromDate=(s:string)=>`${s}T00:00:00+08:00`;
const normalizedLiveStatus=`CASE WHEN live_status IN ('done','completed','success') THEN 'succeeded' WHEN live_status IN ('error','rejected') THEN 'failed' WHEN live_status IN ('pending','reviewing') THEN 'queued' WHEN live_status IN ('processing','generating') THEN 'running' WHEN live_status IN ('queued','running','succeeded','partial','failed','cancel_requested','cancelled','needs_review') THEN live_status ELSE 'needs_review' END`;
const pendingLiveStatuses="'queued','running','pending','processing','reviewing','generating','cancel_requested'";
const recordProjection=`SELECT c.*,COALESCE(u.name,c.actor_email) AS actor_name,
 (SELECT a.id FROM app_creation_assets a WHERE a.creation_id=c.id AND a.direction='output' AND a.media_type='image' ORDER BY position,id LIMIT 1) thumbnail_asset_id,`;
// A terminal result snapshot stays authoritative. A job that failed at its top
// level only overrides a result left mid-run (47: imagegen error, result 'running').
const recordLiveSelect=`COALESCE(j.failed_status,j.snapshot->'result'->>'status',j.snapshot->>'status',v.status,c.status) AS live_status
 FROM app_creation_records c LEFT JOIN app_users u ON u.email=c.actor_email
 LEFT JOIN LATERAL(SELECT x.snapshot,CASE WHEN x.snapshot->>'status' IN ('error','failed','cancelled','canceled') AND COALESCE(x.snapshot->'result'->>'status','') NOT IN ('succeeded','done','completed','success','partial','failed','error','cancelled','canceled') THEN x.snapshot->>'status' END AS failed_status FROM app_creation_links l JOIN app_image_jobs x ON x.id=l.target_id AND x.email=l.actor_email WHERE l.creation_id=c.id AND l.target_type LIKE 'image:%' LIMIT 1)j ON true
 LEFT JOIN LATERAL(SELECT x.status FROM app_creation_links l JOIN app_video_tasks x ON x.id=l.target_id AND x.email=l.actor_email WHERE l.creation_id=c.id AND l.target_type='video' LIMIT 1)v ON true`;
const recordBillingJoin=` LEFT JOIN LATERAL(WITH RECURSIVE family AS(SELECT c.id,c.actor_email,c.tenant_id UNION ALL SELECT child.id,child.actor_email,child.tenant_id FROM app_creation_records child JOIN family p ON child.parent_id=p.id AND child.actor_email=p.actor_email AND child.tenant_id IS NOT DISTINCT FROM p.tenant_id), operations AS(
 SELECT DISTINCT o.id,o.state,o.charged_credits FROM family f JOIN app_creation_links l ON l.creation_id=f.id AND l.target_type='billing' JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email)
 SELECT CASE WHEN count(*)>0 AND bool_and(state IN ('settled','released')) THEN sum(charged_credits)::int WHEN count(*)=0 AND EXISTS(SELECT 1 FROM app_creation_links n WHERE n.creation_id=c.id AND n.target_type='no-charge' AND n.relation='explicit-no-charge') THEN 0 ELSE NULL END AS charged,
 CASE WHEN count(*)=0 THEN 'not_recorded' WHEN bool_and(state IN ('settled','released')) THEN 'settled' ELSE 'pending' END AS state FROM operations)b ON true`;
async function recordSelect(tx:PoolClient,includeBilling=true){
 const baseRecordSelect=recordProjection+(includeBilling?' b.charged,b.state AS billing_state,':'')+recordLiveSelect+(includeBilling?recordBillingJoin:'');
 if(!await videoWorkflowEvidenceAvailable(tx))return baseRecordSelect;
 // Optional workflow schemas are initialized by their owning module. Its exact
 // durable node states remain authoritative if secondary evidence writing fails.
 return baseRecordSelect.replace('COALESCE(j.failed_status', 'COALESCE(wf.status,j.failed_status')+` LEFT JOIN LATERAL(
 SELECT CASE WHEN count(n.node_id)=0 THEN 'needs_review' WHEN bool_and(n.status='completed') THEN 'succeeded'
 WHEN bool_and(n.status IN ('completed','blocked','cancelled')) THEN CASE WHEN bool_or(n.status='completed') THEN 'partial' WHEN bool_or(n.status='blocked') THEN 'failed' ELSE 'cancelled' END
 WHEN bool_or(n.status IN ('needs_attention','needs_confirmation')) THEN 'needs_review' WHEN r.cancellation_requested_at IS NOT NULL THEN 'cancel_requested' ELSE 'running' END AS status
 FROM app_creation_links l JOIN app_video_workflow_runs r ON r.id::text=l.target_id AND r.email=l.actor_email
 LEFT JOIN LATERAL(${workflowOutcomeStagesSql})n ON true WHERE l.creation_id=c.id AND l.target_type='video-workflow' GROUP BY r.id LIMIT 1)wf ON true`;
}
function summary(row:Record<string,any>):CreationSummary{return {id:row.legacy_table?legacyCreationId({table:row.legacy_table,id:row.source_id,email:row.actor_email}):row.id,title:(row.request_snapshot?.title||row.request_snapshot?.text?.trim().split(/[\n。！？]/)[0])?.slice(0,64)||sourceLabel(row.source_kind),actorEmail:row.actor_email,actorName:row.actor_name,tenantId:row.tenant_id,scopeKind:row.scope_kind,sourceKind:row.source_kind,status:creationStatus(row.live_status||row.status),acceptedAt:new Date(row.accepted_at).toISOString(),settledCredits:row.charged===null||row.charged===undefined?null:Number(row.charged),thumbnailAssetId:row.thumbnail_asset_id||null,completeness:row.request_snapshot?.state==='recorded'?'recorded':'not_recorded'};}
export function sourceLabel(kind:string){return ({'image:imagegen':'图像创作','image:generate':'图片生成','image:suite':'商品套图','image:aplus':'A+ 详情','video':'视频创作','canvas-image':'图片编辑','agent-turn':'智能创作','agent':'智能创作'} as Record<string,string>)[kind]||kind.replace(/^\/api\//,'')||'创作记录';}
function where(reader:CreationReader,f:CreationFilters,visible:string[]|null){
 const values:unknown[]=[];const conditions=['c.parent_id IS NULL'];const add=(sql:string,v:unknown)=>{values.push(v);conditions.push(sql.replace('?',`$${values.length}`));};
 const tenant=reader.platform?reader.boundTenantId||f.tenantId:reader.tenantId;if(tenant)add('c.tenant_id=?',tenant);
 if(!reader.platform&&visible)add('c.actor_email=ANY(?::text[])',visible);
 if(f.q)add("COALESCE(c.request_snapshot->>'text','') ILIKE ?",`%${f.q.replace(/[\\%_]/g,'\\$&')}%`);
 if(f.user)add('c.actor_email=?',f.user.toLowerCase());if(f.source)add('c.source_kind=?',f.source);
 if(f.from)add('c.accepted_at>=?::timestamptz',fromDate(f.from));if(f.to)add("c.accepted_at<(?::timestamptz+interval '1 day')",fromDate(f.to));
 return {sql:conditions.join(' AND '),values};
}
export async function listCreations(reader:CreationReader,f:CreationFilters):Promise<CreationPage>{return readCreationList(reader,f,false);}
export async function listUnifiedCreations(reader:CreationReader,f:CreationFilters):Promise<CreationPage>{return readCreationList(reader,f,true);}
/** Overview preview: find the newest matching records across the whole window,
 * then read billing and assets only for that bounded set. */
export async function listRecentEnterpriseCreations(reader:Extract<CreationReader,{platform:false}>,f:CreationFilters):Promise<{items:CreationSummary[]}>{return scoped(reader,async(tx,visible)=>{
 const filter=where(reader,f,visible),values=[...filter.values];
 const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 const states=f.statusGroup==='pending'?`live_status IN (${pendingLiveStatuses})`:`${normalizedLiveStatus}=${bind(f.status)}`;
 const limit=bind(Math.min(5,f.size));
 const result=await tx.query(`WITH selected AS MATERIALIZED (
  SELECT id,live_status FROM (${await recordSelect(tx,false)} WHERE ${filter.sql}) eligible
  WHERE ${states} ORDER BY accepted_at DESC,id DESC LIMIT ${limit})
  ${recordProjection} b.charged,k.live_status
  FROM selected k JOIN app_creation_records c ON c.id=k.id LEFT JOIN app_users u ON u.email=c.actor_email
  ${recordBillingJoin} ORDER BY c.accepted_at DESC,c.id DESC`,values);
 return {items:result.rows.map(summary)};
});}
async function readCreationList(reader:CreationReader,f:CreationFilters,unified:boolean):Promise<CreationPage>{return scoped(reader,async(tx,visible,historyVisible)=>{
 const filter=where(reader,f,visible);let values=[...filter.values],sql=`SELECT id,actor_email,tenant_id,accepted_at,live_status,source_kind,source_id FROM (${await recordSelect(tx,false)} WHERE ${filter.sql}) records`;
 if(f.status){values.push(f.status);sql+=` WHERE ${normalizedLiveStatus}=$${values.length}`;}
 const historical=unified?legacyCreationCandidates(f,reader.platform&&(reader.boundTenantId||f.tenantId)?[]:historyVisible,value=>{values.push(value);return `$${values.length}`;},{...(!reader.platform?{tenantId:reader.tenantId}:{})}):null;
 // The exact status and recursive billing facts are needed for whole-result
 // totals/ranking, but must not be recomputed by four independent queries.
 // Keep snapshots and thumbnail lookup out of this materialized row set.
 const result=(await tx.query(`WITH RECURSIVE status_records AS MATERIALIZED (${sql}),
 families AS (SELECT id AS root_id,id,actor_email,tenant_id FROM status_records
 UNION ALL SELECT f.root_id,c.id,c.actor_email,c.tenant_id FROM app_creation_records c JOIN families f
 ON c.parent_id=f.id AND c.actor_email=f.actor_email AND c.tenant_id IS NOT DISTINCT FROM f.tenant_id),
 operations AS MATERIALIZED (SELECT DISTINCT f.root_id,o.id,o.state,o.charged_credits FROM families f
 JOIN app_creation_links l ON l.creation_id=f.id AND l.target_type='billing'
 JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email),
 billing AS (SELECT root_id,bool_and(state IN ('settled','released')) AS settled,sum(charged_credits) AS charged FROM operations GROUP BY root_id),
 record_facts AS MATERIALIZED (SELECT r.id,r.actor_email,r.accepted_at,r.live_status,
 CASE WHEN b.settled THEN b.charged::int WHEN b.root_id IS NULL AND EXISTS(
 SELECT 1 FROM app_creation_links n WHERE n.creation_id=r.id AND n.target_type='no-charge' AND n.relation='explicit-no-charge') THEN 0 ELSE NULL END AS charged,r.source_kind,r.source_id,NULL::text AS legacy_table
 FROM status_records r LEFT JOIN billing b ON b.root_id=r.id),
 creation_facts AS MATERIALIZED (SELECT * FROM record_facts ${historical?`UNION ALL SELECT id,actor_email,accepted_at,live_status,charged,source_kind,source_id,legacy_table FROM (${historical}) historical`:""}),
 selected AS MATERIALIZED (SELECT * FROM creation_facts ORDER BY accepted_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}),
 page_rows AS (SELECT c.id,c.actor_email,c.scope_kind,c.tenant_id,c.source_kind,c.status,c.request_snapshot,c.accepted_at,
 COALESCE(u.name,c.actor_email) AS actor_name,k.charged,k.live_status,k.legacy_table,c.source_id,
 (SELECT a.id FROM app_creation_assets a WHERE a.creation_id=c.id AND a.direction='output' AND a.media_type='image' ORDER BY position,id LIMIT 1) AS thumbnail_asset_id
 FROM selected k JOIN app_creation_records c ON c.id=k.id LEFT JOIN app_users u ON u.email=c.actor_email
 ${historical?`UNION ALL SELECT k.id,k.actor_email,'legacy_unconfirmed',NULL::uuid,k.source_kind,k.live_status,
 jsonb_build_object('state',CASE WHEN COALESCE(j.payload#>>'{plan,request,prompt}',j.payload#>>'{p,userPrompt}',j.payload#>>'{p,prompt}',ci.parameters->>'newText',ci.parameters->>'prompt',v.parameters->>'prompt') IS NULL THEN 'not_recorded' ELSE 'recorded' END,'text',COALESCE(j.payload#>>'{plan,request,prompt}',j.payload#>>'{p,userPrompt}',j.payload#>>'{p,prompt}',ci.parameters->>'newText',ci.parameters->>'prompt',v.parameters->>'prompt')),
 k.accepted_at,COALESCE(u.name,k.actor_email),k.charged,k.live_status,k.legacy_table,k.source_id,NULL::text
 FROM selected k LEFT JOIN app_users u ON u.email=k.actor_email
 LEFT JOIN app_image_jobs j ON k.legacy_table='app_image_jobs' AND j.id=k.source_id AND j.email=k.actor_email
 LEFT JOIN app_canvas_image_tasks ci ON k.legacy_table='app_canvas_image_tasks' AND ci.id=k.source_id AND ci.email=k.actor_email
 LEFT JOIN app_video_tasks v ON k.legacy_table='app_video_tasks' AND v.id=k.source_id AND v.email=k.actor_email
 WHERE k.legacy_table IS NOT NULL`:""}),
 aggregate AS (SELECT count(*)::int AS total,count(DISTINCT actor_email)::int AS active_members,
 sum(charged)::int AS charged,
 count(*) FILTER(WHERE live_status IN (${pendingLiveStatuses}))::int AS pending,
 count(*) FILTER(WHERE live_status IN ('failed','error','rejected'))::int AS failed,
 count(*) FILTER(WHERE live_status IN ('needs_review','needs_attention'))::int AS review FROM creation_facts),
 member_usage AS (SELECT f.actor_email AS email,COALESCE(max(u.name),f.actor_email) AS name,sum(f.charged)::int AS "settledCredits"
 FROM creation_facts f LEFT JOIN app_users u ON u.email=f.actor_email WHERE f.charged IS NOT NULL
 GROUP BY f.actor_email ORDER BY sum(f.charged) DESC,f.actor_email LIMIT 10)
 SELECT aggregate.*,
 COALESCE((SELECT jsonb_agg(p ORDER BY accepted_at DESC,id DESC) FROM page_rows p),'[]'::jsonb) AS items,
 COALESCE((SELECT jsonb_agg(m ORDER BY "settledCredits" DESC,email) FROM member_usage m),'[]'::jsonb) AS member_usage FROM aggregate`,[...values,f.size,(f.page-1)*f.size])).rows[0];
 const {items:rows,member_usage:memberUsage,...aggregate}=result;const total=Number(aggregate.total);
  const items:CreationSummary[]=rows.map(summary);
  if(reader.platform){const failures=await creationFailures(tx,items.filter(i=>!i.id.startsWith('legacy-')&&hasCreationFailure(i.status)).map(i=>({id:i.id,email:i.actorEmail})));
   const historicalFailures=await legacyCreationFailuresInTransaction(tx,rows.filter((r:Record<string,any>)=>r.legacy_table&&hasCreationFailure(r.live_status)).map((r:Record<string,any>)=>({root:legacyCreationId({table:r.legacy_table,id:r.source_id,email:r.actor_email}),table_name:r.legacy_table,id:r.source_id,email:r.actor_email})));
   for(const item of items)if(failures.has(item.id)||historicalFailures.has(item.id))item.failure=failures.get(item.id)||historicalFailures.get(item.id);}
  return {items,pagination:{total,page:f.page,size:f.size},appliedFilters:f,generatedAt:new Date().toISOString(),scope:reader.platform?'platform':visible?'member':'tenant',availability:'available',summary:{total,activeMembers:aggregate.active_members,settledCredits:aggregate.charged??null,pending:aggregate.pending,failed:aggregate.failed,needsReview:aggregate.review},memberUsage};
});}
/** Exact global keys/count first; expensive evidence and billing only for the
 * selected page. No cross-request cache or authorization snapshot is reused. */
export async function listUnifiedCreationPage(reader:CreationReader,f:CreationFilters):Promise<CreationListPage>{return scoped(reader,async(tx,visible,historyVisible)=>{
 const filter=where(reader,f,visible),values=[...filter.values];
 const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 const tenant=!reader.platform?reader.tenantId:undefined;
 const history=reader.platform&&(reader.boundTenantId||f.tenantId)?[]:historyVisible;
 const columns='id,actor_email,accepted_at,source_id';
 let canonical=f.status?`SELECT ${columns},NULL::text AS legacy_table FROM (${await recordSelect(tx,false)} WHERE ${filter.sql}) record_status`:
  `SELECT c.id,c.actor_email,c.accepted_at,c.source_id,NULL::text AS legacy_table FROM app_creation_records c WHERE ${filter.sql}`;
 if(f.status){const status=bind(f.status);canonical+=` WHERE ${normalizedLiveStatus}=${status}`;}
 const keys=legacyCreationCandidates(f,history,bind,{tenantId:tenant,keysOnly:true});
 const legacyPage=legacyCreationCandidates(f,history,bind,{tenantId:tenant,selectedOnly:true});
 const limit=bind(f.size),offset=bind((f.page-1)*f.size);
 const result=(await tx.query(`WITH creation_keys AS MATERIALIZED(
 ${canonical} UNION ALL SELECT ${columns},legacy_table FROM (${keys}) historical),
 selected AS MATERIALIZED(SELECT * FROM creation_keys ORDER BY accepted_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}),
 canonical_page AS (${await recordSelect(tx)} WHERE c.id IN(SELECT id FROM selected WHERE legacy_table IS NULL)),
 historical_page AS (${legacyPage}),
 page_rows AS(
 SELECT id,actor_email,scope_kind,tenant_id,source_kind,status,request_snapshot,accepted_at,actor_name,charged,live_status,
 NULL::text AS legacy_table,source_id,thumbnail_asset_id FROM canonical_page
 UNION ALL SELECT k.id,k.actor_email,'legacy_unconfirmed',NULL::uuid,k.source_kind,k.live_status,
 jsonb_build_object('state',CASE WHEN COALESCE(j.payload#>>'{plan,request,prompt}',j.payload#>>'{p,userPrompt}',j.payload#>>'{p,prompt}',ci.parameters->>'newText',ci.parameters->>'prompt',v.parameters->>'prompt') IS NULL THEN 'not_recorded' ELSE 'recorded' END,
 'text',COALESCE(j.payload#>>'{plan,request,prompt}',j.payload#>>'{p,userPrompt}',j.payload#>>'{p,prompt}',ci.parameters->>'newText',ci.parameters->>'prompt',v.parameters->>'prompt')),
 k.accepted_at,COALESCE(u.name,k.actor_email),k.charged,k.live_status,k.legacy_table,k.source_id,NULL::text
 FROM historical_page k LEFT JOIN app_users u ON u.email=k.actor_email
 LEFT JOIN app_image_jobs j ON k.legacy_table='app_image_jobs' AND j.id=k.source_id AND j.email=k.actor_email
 LEFT JOIN app_canvas_image_tasks ci ON k.legacy_table='app_canvas_image_tasks' AND ci.id=k.source_id AND ci.email=k.actor_email
 LEFT JOIN app_video_tasks v ON k.legacy_table='app_video_tasks' AND v.id=k.source_id AND v.email=k.actor_email)
 SELECT (SELECT count(*)::int FROM creation_keys) AS total,COALESCE((SELECT jsonb_agg(p ORDER BY accepted_at DESC,id DESC) FROM page_rows p),'[]'::jsonb) AS items`,values)).rows[0];
 const items:CreationSummary[]=result.items.map(summary);
 if(reader.platform){
  const canonicalFailures=await creationFailures(tx,items.filter(i=>!i.id.startsWith('legacy-')&&hasCreationFailure(i.status)).map(i=>({id:i.id,email:i.actorEmail})));
  const legacyFailures=await legacyCreationFailuresInTransaction(tx,result.items.filter((r:Record<string,any>)=>r.legacy_table&&hasCreationFailure(r.live_status)).map((r:Record<string,any>)=>({root:legacyCreationId({table:r.legacy_table,id:r.source_id,email:r.actor_email}),table_name:r.legacy_table,id:r.source_id,email:r.actor_email})));
  for(const item of items)if(canonicalFailures.has(item.id)||legacyFailures.has(item.id))item.failure=canonicalFailures.get(item.id)||legacyFailures.get(item.id);
 }
 return {items,pagination:{total:Number(result.total),page:f.page,size:f.size},appliedFilters:f,generatedAt:new Date().toISOString(),scope:reader.platform?'platform':visible?'member':'tenant',availability:'available'};
});}

async function authorizedRecord(tx:PoolClient,reader:CreationDetailReader,id:string,visible:readonly string[]|null){
 const tenant=reader.platform?reader.boundTenantId:reader.tenantId;
 // Match the existing member-history port, not arbitrary personal ledger data.
 // A personal image/video source can expose its recorded execution evidence to
 // that same live member scope without changing its original tenant or owner.
 const history=!reader.platform?reader.historyEmails||[]:[];
 const row=(await tx.query(`${await recordSelect(tx)} WHERE c.id=$1 ${tenant?`AND (c.tenant_id=$2 OR (c.tenant_id IS NULL AND c.scope_kind='personal' AND c.actor_email=ANY($3::text[]) AND (
  EXISTS(SELECT 1 FROM app_image_jobs j WHERE j.id=c.source_id AND j.email=c.actor_email AND c.source_kind='image:'||j.kind)
  OR c.source_kind IN ('canvas-image','canvas') AND EXISTS(SELECT 1 FROM app_canvas_image_tasks j WHERE j.id=c.source_id AND j.email=c.actor_email)
  OR c.source_kind='video' AND EXISTS(SELECT 1 FROM app_video_tasks j WHERE j.id=c.source_id AND j.email=c.actor_email))))`:''}`,[id,...(tenant?[tenant,history]:[])])).rows[0];
 if(!row||!reader.platform&&visible&&!visible.includes(row.actor_email))throw new TeamError('记录不存在或无权访问',404);return row;
}
const asset=(a:Record<string,any>):CreationAsset=>({id:a.id,direction:a.direction,role:a.role,...(Array.isArray(a.roles)?{roles:a.roles.filter((v:unknown)=>typeof v==='string')}:{}),position:a.position,...(Number.isInteger(a.input_position)?{inputPosition:a.input_position}:{}),...(a.execution_ref?{executionRef:a.execution_ref}:{}),variant:a.variant,mime:a.mime,bytes:a.byte_size===null?null:Number(a.byte_size),hash:a.hash,availability:a.availability,mediaType:a.media_type,...(a.text_content?{text:a.text_content}:{})});
export type DetailPages={assetPage?:number;eventPage?:number;childPage?:number};
const familySql=`WITH RECURSIVE family AS(SELECT id,actor_email,tenant_id FROM app_creation_records WHERE id=$1 UNION ALL SELECT c.id,c.actor_email,c.tenant_id FROM app_creation_records c JOIN family p ON c.parent_id=p.id AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id)`;
export async function creationDetail(reader:CreationReader,id:string,pages:DetailPages={}):Promise<CreationDetail>{return scoped(reader,(tx,visible,historyEmails)=>creationDetailInTransaction(tx,reader.platform?reader:{...reader,historyEmails:historyEmails||[]},id,visible,pages));}
/** Reuse the caller's authorization snapshot; no nested pool checkout. */
export async function creationDetailInTransaction(tx:PoolClient,reader:CreationDetailReader,id:string,visible:readonly string[]|null,pages:DetailPages={}):Promise<CreationDetail>{
 const row=await authorizedRecord(tx,reader,id,visible);const size=24,assetPage=pages.assetPage||1,eventPage=pages.eventPage||1,childPage=pages.childPage||1;
 const sourceEvidence=await creationSourceEvidence(tx,id);
 const assetSql=`${familySql}, asset_rows AS(SELECT to_jsonb(a) AS data,0 AS priority FROM app_creation_assets a JOIN family f ON f.id=a.creation_id
 UNION ALL SELECT value,1 FROM jsonb_array_elements($2::jsonb)),${creationAssetViewSql}`;
 const assetValues=[id,JSON.stringify(sourceEvidence.assets)];
 const assets=await tx.query(`${assetSql} SELECT data FROM dedup_assets ORDER BY ${creationAssetViewOrder} LIMIT $3 OFFSET $4`,[...assetValues,size,(assetPage-1)*size]);
 const assetCount=Number((await tx.query(`${assetSql} SELECT count(*)::int AS n FROM dedup_assets`,assetValues)).rows[0].n);
 const events=await tx.query(`${familySql} SELECT e.* FROM app_creation_events e JOIN family f ON f.id=e.creation_id ORDER BY occurred_at,e.id LIMIT $2 OFFSET $3`,[id,size,(eventPage-1)*size]);
 const billing=await tx.query(`${familySql} SELECT o.id,o.state,o.charged_credits,o.reserved_credits,o.quote,max(l.reserved_credits) AS evidence_reserved,max(l.released_credits) AS evidence_released FROM family f JOIN app_creation_links l ON l.creation_id=f.id AND l.target_type='billing' JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email GROUP BY o.id`,[id]);
 const links=reader.platform?await tx.query('SELECT target_type,target_id,relation FROM app_creation_links WHERE creation_id=$1 ORDER BY target_type,target_id LIMIT 100',[id]):{rows:[]};
 const children=await tx.query(`${await recordSelect(tx)} WHERE c.parent_id=$1 AND c.actor_email=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid ORDER BY accepted_at,c.id LIMIT $2 OFFSET $3`,[id,size,(childPage-1)*size,row.actor_email,row.tenant_id]);
 const counts=await tx.query(`${familySql} SELECT (SELECT count(*)::int FROM app_creation_events e JOIN family f ON f.id=e.creation_id) AS events,(SELECT count(*)::int FROM app_creation_records c JOIN family f ON f.id=c.id WHERE c.parent_id=$1) AS children`,[id]);
 const refunds=await tx.query(`${familySql} SELECT CASE WHEN count(*)>0 THEN sum(r.refund_credits)::int ELSE NULL END AS n FROM app_billing_api_cost_reviews r WHERE r.status IN ('confirmed','refunded') AND EXISTS(SELECT 1 FROM app_creation_links l JOIN family f ON f.id=l.creation_id WHERE l.target_type='billing' AND l.target_id=r.operation_id)`,[id]);
 const ops=billing.rows,settled=ops.length>0&&ops.every(o=>['settled','released'].includes(o.state));
 const noCharge=ops.length===0&&!!(await tx.query("SELECT 1 FROM app_creation_links WHERE creation_id=$1 AND target_type='no-charge' AND relation='explicit-no-charge' LIMIT 1",[id])).rowCount;
 const charged=settled?ops.reduce((n,o)=>n+Number(o.charged_credits),0):noCharge?0:null;
 const sumKnown=(key:string)=>ops.length&&ops.every(o=>o[key]!==null&&o[key]!==undefined)?ops.reduce((n,o)=>n+Number(o[key]),0):null;
 const sourceFacts=await creationRequestEvidence(tx,row);
 const recordedParams={...sourceFacts.values,...row.parameters_snapshot?.values};
 const projectedParams=reader.platform?recordedParams:publicCreationParameters(recordedParams);
 const requestText=row.request_snapshot?.state==='recorded'?row.request_snapshot.text:sourceFacts.text;
  const failure=reader.platform&&hasCreationFailure(row.live_status||row.status)?(await creationFailures(tx,[{id:row.id,email:row.actor_email}])).get(row.id):undefined;
 return {...summary(row),settledCredits:charged,evidencePending:sourceEvidence.pending,
  ...(failure?{failure}:{}),
 request:{state:typeof requestText==='string'?'recorded':row.request_snapshot?.state||'not_recorded',text:requestText??null},
 parameters:{state:Object.keys(projectedParams).length?'recorded':row.parameters_snapshot?.state||'not_recorded',values:projectedParams},
 model:{state:row.model_snapshot?.state||'not_recorded',label:row.model_snapshot?.label||null},
 assets:assets.rows.map(a=>asset(a.data)),
 events:events.rows.map(e=>({id:e.id,eventKey:reader.platform?e.event_key:e.type,type:e.type,status:e.status,summary:reader.platform?e.summary:({accepted:'已接受创作请求',execution:'执行状态更新',settlement:'账务状态更新',delivered:'已交付结果','input-prepared':'模型输入已就绪','agent-tool':'工具执行',evidence:'资料核查'} as Record<string,string>)[e.type]||'创作事件',occurredAt:new Date(e.occurred_at).toISOString(),observedAt:new Date(e.observed_at).toISOString()})),
 children:children.rows.map(summary),assetPagination:{page:assetPage,size,total:assetCount},eventPagination:{page:eventPage,size,total:counts.rows[0].events},childPagination:{page:childPage,size,total:counts.rows[0].children},
 billing:{payerAccountId:row.payer_account_id,source:row.payer_account_id?'实际付款账户':'未记录',
 quoted:ops.length&&ops.every(o=>Number.isSafeInteger(o.quote?.requestedCredits))?ops.reduce((n,o)=>n+o.quote.requestedCredits,0):null,
 reserved:sumKnown('evidence_reserved'),charged,released:sumKnown('evidence_released'),refunded:refunds.rows[0]?.n??null,
 state:ops.length?settled?'settled':'pending':noCharge?'not_applicable':'not_recorded',operations:ops.map(o=>({id:o.id,state:o.state,charged:['settled','released'].includes(o.state)?Number(o.charged_credits):null}))},
 ...(reader.platform?{technical:{sourceKind:row.source_kind,sourceId:row.source_id,parentId:row.parent_id,schemaVersion:row.schema_version,links:links.rows}}:{})};
}
export async function creationAsset(reader:CreationReader,id:string,assetId:string){return scoped(reader,(tx,visible,historyEmails)=>creationAssetInTransaction(tx,reader.platform?reader:{...reader,historyEmails:historyEmails||[]},id,assetId,visible),'asset');}
export async function creationAssetInTransaction(tx:PoolClient,reader:CreationDetailReader,id:string,assetId:string,visible:readonly string[]|null){
 await authorizedRecord(tx,reader,id,visible);let a=(await tx.query(`${familySql} SELECT a.* FROM app_creation_assets a JOIN family f ON f.id=a.creation_id WHERE a.id=$2`,[id,assetId])).rows[0];
 if(!a&&assetId.startsWith('recovered-'))a=(await creationSourceEvidence(tx,id)).assets.find(asset=>asset.id===assetId);
 if(!a)throw new TeamError('素材不存在或无权访问',404);
 let url=(a.storage_snapshot||a.storage_ref) as string;
 if(url.startsWith('artwork:')){const artworkId=url.slice(8);if(artworkId.startsWith('asset-')){const {readImagegenInputAsset}=await import('@/lib/imagegen/input-assets');url=(await readImagegenInputAsset(artworkId,a.actor_email)).url;}
 else {const work=(await tx.query('SELECT image_url,video_url FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[artworkId,a.actor_email])).rows[0];if(!work)throw new TeamError('素材已失效',404);url=a.media_type==='video'?work.video_url:work.image_url;}}
 const {isManagedImageUrl}=await import('@/lib/storage');if(!isManagedImageUrl(url)&&!url.startsWith('data:image/'))throw new TeamError('素材不在受控存储中',422);
 return {url,mediaType:a.media_type,mime:a.mime,direction:a.direction};
}
