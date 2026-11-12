import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from "@/platform/db/pool";
import {queryBi} from "@/lib/bi/repository";
import {ensureBiSchema} from "@/lib/bi/schema";

import {parseBiQuery} from '@/lib/bi/contracts';
import { isManagedImageUrl } from "@/lib/object-storage/runtime";
import {creationStatus,type CreationDetail,type CreationFilters,type CreationPage,type CreationSummary,type CreationAsset} from './creation-contracts';
import { TeamError } from "@/lib/teams/errors";
import {legacyCreationFailures,hasCreationFailure} from './creation-failures';
import {readImagegenInputAssetReference} from '@/lib/imagegen/input-asset-reference';
import {legacyCreationId,parseLegacyCreationId as parseId,type LegacySource as Source} from './creation-history-identity';
export {legacyCreationId} from './creation-history-identity';
import {linkedCreation} from './creation-history-link';
import {creationDetailInTransaction,creationAssetInTransaction,type DetailPages} from './creations';
import {creationRequestFacts} from './creation-parameters';
import {legacyImageChildren,legacyOutputFilter,confirmedParentCharge} from './legacy-creation-family';
export type LegacyReadScope={client:PoolClient;allowedEmails:readonly string[];tenantId?:string};
const item=(r:Record<string,any>):CreationSummary=>({id:legacyCreationId({table:r.source_table,id:r.id,email:r.email}),title:r.content?.slice(0,120)||r.kind||'历史创作',actorEmail:r.email,actorName:r.email,tenantId:null,scopeKind:'legacy_unconfirmed',sourceKind:r.kind,status:creationStatus(r.status),acceptedAt:new Date(r.created_at).toISOString(),settledCredits:r.has_ledger_charge?Number(r.billed_credits):null,thumbnailAssetId:null,completeness:'not_recorded'});
export async function listLegacyCreations(f:CreationFilters,access?:LegacyReadScope):Promise<CreationPage>{
 const p=new URLSearchParams({section:'operations',page:String(f.page),size:String(f.size),email:f.user,q:f.q});if(f.from)p.set('from',f.from);if(f.to)p.set('to',f.to);if(f.status)p.set('status',`creation:${f.status}`);
 const query=parseBiQuery(p);if(f.period==='all'){query.start='-infinity';query.end='infinity';}
  const rows=await queryBi(query,access),items=rows.rows.map(item);
  const failures=access?new Map():await legacyCreationFailures(getPool(),items.filter(i=>hasCreationFailure(i.status)).map(i=>{const r=parseId(i.id);return {root:i.id,table_name:r.table,id:r.id,email:r.email};}));
  for(const i of items)if(failures.has(i.id))i.failure=failures.get(i.id);
  return {items,pagination:{total:rows.total,page:rows.page,size:rows.size},appliedFilters:f,generatedAt:rows.generatedAt,scope:'platform',availability:'available',summary:{total:rows.total,activeMembers:0,settledCredits:null,pending:0,failed:0,needsReview:0},memberUsage:[]};
}
type LegacyMedia={asset:CreationAsset;storageRef:string;actorEmail:string};
export async function legacyCreationDetail(id:string,pages:DetailPages&{diagnostics?:boolean;canonical?:boolean}={},access?:LegacyReadScope){
 const ref=parseId(id);if(access&&!access.allowedEmails.includes(ref.email))throw new TeamError('记录不存在或无权访问',404);
 if(!access)await ensureBiSchema();const pool=access?.client||getPool();
 // Table names come exclusively from the closed schema above; values stay bound.
 const row=(await pool.query(`SELECT * FROM ${ref.table} WHERE id=$1 AND email=$2`,[ref.id,ref.email])).rows[0];if(!row)throw new TeamError('记录不存在或无权访问',404);
 if(pages.canonical!==false&&(!access||access.tenantId)){
  const linked=await linkedCreation(pool as PoolClient,ref,access?.tenantId);
  if(linked){const run=async(tx:PoolClient)=>({detail:await creationDetailInTransaction(tx,access?{platform:false,tenantId:access.tenantId!}:{platform:true},linked.id,access?.allowedEmails||null,pages),media:[] as LegacyMedia[]});
   if(access)return run(access.client);
   const tx=await getPool().connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await run(tx);await tx.query('COMMIT');return result;}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
  }
 }
 const request=row.payload?.plan?.request||row.payload?.p?.imagegen?.request;
 const facts=creationRequestFacts(row.payload,row.parameters,row.prompt),text=facts.text;
 const childRows=await legacyImageChildren(pool,ref,row);
 const root=item({source_table:ref.table,id:ref.id,email:ref.email,content:typeof text==='string'?text:'',kind:row.kind||'视频创作',status:row.snapshot?.result?.status||row.snapshot?.status||row.status,created_at:row.created_at});
 const media:LegacyMedia[]=[];let i=0;
 const add=(direction:'input'|'output',role:string,storageRef:string,variant:'original'|'processed'='original',mediaType:'image'|'video'='image')=>{media.push({asset:{id:`legacy-media-${i}`,direction,role,position:i++,variant,mime:null,bytes:null,hash:null,availability:'recorded',mediaType},storageRef,actorEmail:ref.email});};
 if(Array.isArray(request?.inputs))for(const input of request.inputs)if(typeof input.artworkId==='string')add('input',String(input.role||'reference'),`artwork:${input.artworkId}`);
 const uploaded=row.payload?.p?.images||row.payload?.images;if(Array.isArray(uploaded))for(const image of uploaded){const url=image?.buf?.$imageJobBuffer;if(typeof url==='string'&&isManagedImageUrl(url))add('input','reference',url,'original');}
 if(row.source_artwork_id)add('input','edit-target',`artwork:${row.source_artwork_id}`);
 const inputCount=media.length,page=pages.assetPage||1,size=24,start=(page-1)*size;
 const inputs=media.slice(start,start+size),outputOffset=Math.max(0,start-inputCount),outputLimit=size-inputs.length;
 const outputScope=legacyOutputFilter(ref,row,childRows),outputFilter=outputScope.sql,args=outputScope.values;
 const outputTotal=Number((await pool.query(`SELECT count(*)::int AS n FROM app_artworks WHERE email=$1 AND ${outputFilter}`,args)).rows[0].n);
 const results=outputLimit?(await pool.query(`SELECT id,image_url,video_url FROM app_artworks WHERE email=$1 AND ${outputFilter} ORDER BY created_at,id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,outputLimit,outputOffset])).rows:[];
 media.length=0;media.push(...inputs);
 for(const [index,result] of results.entries()){add('output','result',`artwork:${result.id}`,'original',result.video_url?'video':'image');const added=media[media.length-1];added.asset.id=`legacy-artwork-${Buffer.from(result.id).toString('base64url')}`;added.asset.position=inputCount+outputOffset+index;}
 const billings=(await pool.query(`SELECT id,state,charged_credits,reserved_credits,quote FROM app_billing_operations WHERE email=$1 AND id=ANY($2::text[])`,[ref.email,[ref.id,...childRows.map(c=>c.id)]])).rows;
 const billing=billings.find(b=>b.id===ref.id),parentCharged=confirmedParentCharge(row);
 const ledgerId=ref.table==='app_image_jobs'?`led-image-${ref.id}`:ref.table==='app_video_tasks'?`led-video-${ref.id}`:ref.table==='app_canvas_image_tasks'?`led-canvas-image-${ref.id}`:null;
 const ledger=ledgerId?(await pool.query("SELECT -sum(delta)::int AS charged FROM app_ledger WHERE email=$1 AND id=$2 AND kind='consume'",[ref.email,ledgerId])).rows[0]?.charged:null;
 const charged=parentCharged!==null?parentCharged:row.kind==='imagegen'&&childRows.length?null:billing&&['settled','released'].includes(billing.state)?Number(billing.charged_credits):ledger!==null&&ledger!==undefined?Number(ledger):row.metered===false?0:null;
 const detail:CreationDetail={...root,settledCredits:charged,evidencePending:row.snapshot?.creationEvidencePending===true||row.parameters?.creationEvidencePending===true,request:{state:typeof text==='string'?'recorded':'not_recorded',text:typeof text==='string'?text:null},parameters:{state:Object.keys(facts.values).length?'recorded':'not_recorded',values:facts.values},model:{state:'not_recorded',label:null},assets:media.map(m=>m.asset),events:[],children:childRows.slice(((pages.childPage||1)-1)*24,(pages.childPage||1)*24).map(c=>item({source_table:'app_image_jobs',id:c.id,email:c.email,content:creationRequestFacts(c.payload).text||'',kind:'image:'+c.kind,status:c.snapshot?.status,created_at:c.created_at})),assetPagination:{page,size,total:inputCount+outputTotal},eventPagination:{page:1,size:24,total:0},childPagination:{page:pages.childPage||1,size:24,total:childRows.length},billing:{payerAccountId:billings.length||parentCharged!==null||ledger!==null?ref.email:null,source:'历史实际账户',quoted:Number.isSafeInteger(billing?.quote?.requestedCredits)?billing.quote.requestedCredits:Number.isSafeInteger(row.payload?.plan?.totalCredits)?row.payload.plan.totalCredits:null,reserved:null,charged,released:null,refunded:null,state:parentCharged!==null?'settled':billing?.state||'not_recorded',operations:billings.map(b=>({id:b.id,state:b.state,charged:['settled','released'].includes(b.state)?Number(b.charged_credits):null}))},technical:{sourceTable:ref.table,sourceId:ref.id,scope:'历史企业归属未确认',originalStatus:row.snapshot?.status||row.status}};
  if(!access&&pages.diagnostics!==false&&hasCreationFailure(root.status))detail.failure=(await legacyCreationFailures(getPool(),[{root:id,table_name:ref.table,id:ref.id,email:ref.email}])).get(id);
  return {detail,media};
}
export async function legacyCreationAsset(id:string,assetId:string,access?:LegacyReadScope){const pool=access?.client||getPool();
 const ref=parseId(id);if(access&&!access.allowedEmails.includes(ref.email))throw new TeamError('记录不存在或无权访问',404);
 if(!assetId.startsWith('legacy-')&&(!access||access.tenantId)){
  if(!access)await ensureBiSchema();const linked=await linkedCreation(pool as PoolClient,ref,access?.tenantId);
  if(linked){if(access)return creationAssetInTransaction(access.client,{platform:false,tenantId:access.tenantId!},linked.id,assetId,access.allowedEmails);
   const tx=await getPool().connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await creationAssetInTransaction(tx,{platform:true},linked.id,assetId,null);await tx.query('COMMIT');return result;}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
  }
 }
 const {media}=await legacyCreationDetail(id,{diagnostics:false,canonical:false},access);let m=media.find(m=>m.asset.id===assetId);
 if(!m&&/^legacy-media-\d+$/.test(assetId)){const index=Number(assetId.slice(13));m=(await legacyCreationDetail(id,{assetPage:Math.floor(index/24)+1,diagnostics:false,canonical:false},access)).media.find(m=>m.asset.id===assetId);}
 if(!m&&assetId.startsWith('legacy-artwork-')){
  const ref=parseId(id),artworkId=Buffer.from(assetId.slice(15),'base64url').toString();if(artworkId.length>240)throw new TeamError('素材不存在',404);
  const row=(await pool.query(`SELECT * FROM ${ref.table} WHERE id=$1 AND email=$2`,[ref.id,ref.email])).rows[0];if(!row)throw new TeamError('素材不存在',404);
  const childRows=await legacyImageChildren(pool,ref,row),scope=legacyOutputFilter(ref,row,childRows);
  const found=(await pool.query(`SELECT id,video_url FROM app_artworks WHERE email=$1 AND ${scope.sql} AND id=$${scope.values.length+1}`,[...scope.values,artworkId])).rows[0];
  if(found)m={asset:{id:assetId,direction:'output',role:'result',position:0,variant:'original',mime:null,bytes:null,hash:null,availability:'recorded',mediaType:found.video_url?'video':'image'},storageRef:`artwork:${found.id}`,actorEmail:ref.email};
 }
 if(!m)throw new TeamError('素材不存在',404);let url=m.storageRef;
 // Only resolve owned metadata here. The HTTP media renderer reads bytes after
 // enterpriseRead has committed and released its authorization locks/client.
 if(url.startsWith('artwork:')){const artwork=url.slice(8);if(artwork.startsWith('asset-')){url=(await readImagegenInputAssetReference(artwork,m.actorEmail,access?.client)).url;}else{const row=(await pool.query('SELECT image_url,video_url FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[artwork,m.actorEmail])).rows[0];if(!row)throw new TeamError('素材已失效',404);url=m.asset.mediaType==='video'?row.video_url:row.image_url;}}
 if(!isManagedImageUrl(url)&&!url.startsWith('data:image/'))throw new TeamError('素材不在受控存储中',422);return {url,mediaType:m.asset.mediaType,mime:m.asset.mime};
}
