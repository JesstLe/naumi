import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from '@/lib/db';
import {enterpriseRead} from '@/lib/enterprise/server';
import {TeamError} from '@/lib/teams/server';
import type {TeamActor} from '@/lib/teams/grants';
import {ensureCreationSchema} from './creation-schema';
import {creationStatus,type CreationFilters,type CreationPage,type CreationSummary,type CreationDetail,type CreationAsset} from './creation-contracts';

export type CreationReader={platform:true}|{platform:false;actor:TeamActor;tenantId:string};
async function scoped<T>(reader:CreationReader,run:(tx:PoolClient,visible:string[]|null)=>Promise<T>){
 await ensureCreationSchema();
 if(!reader.platform)return enterpriseRead(reader.actor,reader.tenantId,(tx,s)=>run(tx,s.owner?null:[...s.visible]));
 const tx=await getPool().connect();try{return await run(tx,null);}finally{tx.release();}
}
const fromDate=(s:string)=>`${s}T00:00:00+08:00`;
const recordSelect=`SELECT c.*,COALESCE(u.name,c.actor_email) AS actor_name,
 (SELECT a.id FROM app_creation_assets a WHERE a.creation_id=c.id AND a.direction='output' AND a.media_type='image' ORDER BY position,id LIMIT 1) thumbnail_asset_id,
 b.charged,b.state AS billing_state,
 COALESCE(j.snapshot->'result'->>'status',j.snapshot->>'status',v.status,c.status) AS live_status
 FROM app_creation_records c LEFT JOIN app_users u ON u.email=c.actor_email
 LEFT JOIN LATERAL(SELECT x.snapshot FROM app_creation_links l JOIN app_image_jobs x ON x.id=l.target_id AND x.email=l.actor_email WHERE l.creation_id=c.id AND l.target_type LIKE 'image:%' LIMIT 1)j ON true
 LEFT JOIN LATERAL(SELECT x.status FROM app_creation_links l JOIN app_video_tasks x ON x.id=l.target_id AND x.email=l.actor_email WHERE l.creation_id=c.id AND l.target_type='video' LIMIT 1)v ON true
 LEFT JOIN LATERAL(SELECT CASE WHEN count(*)>0 AND bool_and(o.state IN ('settled','released')) THEN sum(o.charged_credits)::int ELSE NULL END AS charged,
 CASE WHEN count(*)=0 THEN 'not_recorded' WHEN bool_and(o.state IN ('settled','released')) THEN 'settled' ELSE 'pending' END AS state
 FROM app_creation_links l JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email WHERE l.creation_id=c.id AND l.target_type='billing')b ON true`;
function summary(row:Record<string,any>):CreationSummary{return {id:row.id,title:row.request_snapshot?.text?.trim().slice(0,120)||sourceLabel(row.source_kind),actorEmail:row.actor_email,actorName:row.actor_name,tenantId:row.tenant_id,scopeKind:row.scope_kind,sourceKind:row.source_kind,status:creationStatus(row.live_status||row.status),acceptedAt:new Date(row.accepted_at).toISOString(),settledCredits:row.charged===null||row.charged===undefined?null:Number(row.charged),thumbnailAssetId:row.thumbnail_asset_id||null,completeness:row.request_snapshot?.state==='recorded'?'recorded':'not_recorded'};}
export function sourceLabel(kind:string){return ({'image:imagegen':'图像创作','image:generate':'图片生成','image:suite':'商品套图','image:aplus':'A+ 详情','video':'视频创作'} as Record<string,string>)[kind]||kind.replace(/^\/api\//,'')||'创作记录';}
function where(reader:CreationReader,f:CreationFilters,visible:string[]|null){
 const values:unknown[]=[];const conditions=['c.parent_id IS NULL'];const add=(sql:string,v:unknown)=>{values.push(v);conditions.push(sql.replace('?',`$${values.length}`));};
 const tenant=reader.platform?f.tenantId:reader.tenantId;if(tenant)add('c.tenant_id=?',tenant);
 if(!reader.platform&&visible)add('c.actor_email=ANY(?::text[])',visible);
 if(f.q)add("COALESCE(c.request_snapshot->>'text','') ILIKE ?",`%${f.q.replace(/[\\%_]/g,'\\$&')}%`);
 if(f.user)add('c.actor_email=?',f.user.toLowerCase());if(f.source)add('c.source_kind=?',f.source);
 if(f.from)add('c.accepted_at>=?::timestamptz',fromDate(f.from));if(f.to)add("c.accepted_at<(?::timestamptz+interval '1 day')",fromDate(f.to));
 return {sql:conditions.join(' AND '),values};
}
export async function listCreations(reader:CreationReader,f:CreationFilters):Promise<CreationPage>{return scoped(reader,async(tx,visible)=>{
 const filter=where(reader,f,visible);let values=[...filter.values],sql=`SELECT * FROM (${recordSelect} WHERE ${filter.sql}) records`;
 if(f.status){values.push(f.status);sql+=` WHERE CASE WHEN live_status IN ('done','completed','success') THEN 'succeeded' WHEN live_status IN ('error','rejected') THEN 'failed' WHEN live_status IN ('pending','reviewing') THEN 'queued' WHEN live_status IN ('processing','generating') THEN 'running' WHEN live_status IN ('queued','running','succeeded','partial','failed','cancel_requested','cancelled','needs_review') THEN live_status ELSE 'needs_review' END=$${values.length}`;}
 const total=Number((await tx.query(`SELECT count(*)::int AS n FROM (${sql}) count_records`,values)).rows[0].n);
 const rows=(await tx.query(`${sql} ORDER BY accepted_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.size,(f.page-1)*f.size])).rows;
 const aggregate=(await tx.query(`SELECT count(DISTINCT actor_email)::int AS active_members,
 CASE WHEN count(*) FILTER(WHERE charged IS NULL)>0 THEN NULL ELSE sum(charged)::int END AS charged,
 count(*) FILTER(WHERE live_status IN ('queued','running','pending','processing'))::int AS pending,
 count(*) FILTER(WHERE live_status IN ('failed','error'))::int AS failed,
 count(*) FILTER(WHERE live_status IN ('needs_review','needs_attention'))::int AS review FROM (${sql}) grouped`,values)).rows[0];
 const memberUsage=(await tx.query(`SELECT actor_email email,max(actor_name) name,sum(charged)::int AS "settledCredits" FROM (${sql}) usages WHERE charged IS NOT NULL GROUP BY actor_email ORDER BY sum(charged) DESC,actor_email LIMIT 10`,values)).rows;
 return {items:rows.map(summary),pagination:{total,page:f.page,size:f.size},appliedFilters:f,generatedAt:new Date().toISOString(),scope:reader.platform?'platform':visible?'member':'tenant',availability:'available',summary:{total,activeMembers:aggregate.active_members,settledCredits:aggregate.charged??null,pending:aggregate.pending,failed:aggregate.failed,needsReview:aggregate.review},memberUsage};
});}
async function authorizedRecord(tx:PoolClient,reader:CreationReader,id:string,visible:string[]|null){
 const row=(await tx.query(`${recordSelect} WHERE c.id=$1 ${reader.platform?'':'AND c.tenant_id=$2'}`,[id,...(reader.platform?[]:[reader.tenantId])])).rows[0];
 if(!row||!reader.platform&&visible&&!visible.includes(row.actor_email))throw new TeamError('记录不存在或无权访问',404);return row;
}
const asset=(a:Record<string,any>):CreationAsset=>({id:a.id,direction:a.direction,role:a.role,position:a.position,variant:a.variant,mime:a.mime,bytes:a.byte_size===null?null:Number(a.byte_size),hash:a.hash,availability:a.availability,mediaType:a.media_type,...(a.text_content?{text:a.text_content}:{})});
export async function creationDetail(reader:CreationReader,id:string):Promise<CreationDetail>{return scoped(reader,async(tx,visible)=>{
 const row=await authorizedRecord(tx,reader,id,visible);
 const [assets,events,billing,links]=await Promise.all([
  tx.query('SELECT * FROM app_creation_assets WHERE creation_id=$1 ORDER BY direction,position,id LIMIT 100',[id]),
  tx.query('SELECT * FROM app_creation_events WHERE creation_id=$1 ORDER BY occurred_at,id LIMIT 100',[id]),
  tx.query(`WITH RECURSIVE family AS(SELECT id FROM app_creation_records WHERE id=$1 UNION ALL SELECT c.id FROM app_creation_records c JOIN family p ON c.parent_id=p.id)
   SELECT DISTINCT o.id,o.state,o.charged_credits,o.reserved_credits,o.quote FROM family f JOIN app_creation_links l ON l.creation_id=f.id AND l.target_type='billing' JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email`,[id]),
  tx.query('SELECT target_type,target_id,relation FROM app_creation_links WHERE creation_id=$1 ORDER BY target_type,target_id LIMIT 100',[id])]);
 const ops=billing.rows,settled=ops.length>0&&ops.every(o=>['settled','released'].includes(o.state));
 const charged=settled?ops.reduce((n,o)=>n+Number(o.charged_credits||0),0):null;
 return {...summary(row),settledCredits:charged,request:{state:row.request_snapshot?.state||'not_recorded',text:row.request_snapshot?.text??null},parameters:{state:row.parameters_snapshot?.state||'not_recorded',values:row.parameters_snapshot?.values||{}},model:{state:row.model_snapshot?.state||'not_recorded',label:row.model_snapshot?.label||null},assets:assets.rows.map(asset),events:events.rows.map(e=>({id:e.id,eventKey:e.event_key,type:e.type,status:e.status,summary:e.summary,occurredAt:new Date(e.occurred_at).toISOString(),observedAt:new Date(e.observed_at).toISOString()})),billing:{payerAccountId:row.payer_account_id,source:'成员个人账户',quoted:ops.length?ops.reduce((n,o)=>n+Number(o.quote?.credits??o.quote?.reserveCredits??0),0):null,reserved:ops.length?ops.reduce((n,o)=>n+Number(o.reserved_credits||0),0):null,charged,released:ops.length&&settled?ops.reduce((n,o)=>n+Math.max(0,Number(o.quote?.reserveCredits||0)-Number(o.charged_credits||0)),0):null,refunded:null,state:ops.length?settled?'settled':'pending':'not_recorded',operations:ops.map(o=>({id:o.id,state:o.state,charged:['settled','released'].includes(o.state)?Number(o.charged_credits):null}))},...(reader.platform?{technical:{sourceKind:row.source_kind,sourceId:row.source_id,parentId:row.parent_id,schemaVersion:row.schema_version,links:links.rows}}:{})};
});}
export async function creationAsset(reader:CreationReader,id:string,assetId:string){return scoped(reader,async(tx,visible)=>{
 await authorizedRecord(tx,reader,id,visible);const a=(await tx.query('SELECT * FROM app_creation_assets WHERE creation_id=$1 AND id=$2',[id,assetId])).rows[0];
 if(!a)throw new TeamError('素材不存在或无权访问',404);
 let url=a.storage_ref as string;
 if(url.startsWith('artwork:')){const artworkId=url.slice(8);if(artworkId.startsWith('asset-')){const {readImagegenInputAsset}=await import('@/lib/imagegen/input-assets');url=(await readImagegenInputAsset(artworkId,a.actor_email)).url;}
 else {const work=(await tx.query('SELECT image_url,video_url FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[artworkId,a.actor_email])).rows[0];if(!work)throw new TeamError('素材已失效',404);url=a.media_type==='video'?work.video_url:work.image_url;}}
 const {isManagedImageUrl}=await import('@/lib/storage');if(!isManagedImageUrl(url)&&!url.startsWith('data:image/'))throw new TeamError('素材不在受控存储中',422);
 return {url,mediaType:a.media_type,mime:a.mime};
});}
