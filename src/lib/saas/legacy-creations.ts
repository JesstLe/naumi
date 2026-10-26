import 'server-only';
import {z} from 'zod';
import {getPool} from '@/lib/db';
import {queryBi,ensureBiSchema} from '@/lib/bi/repository';
import {parseBiQuery} from '@/lib/bi/contracts';
import {isManagedImageUrl} from '@/lib/storage';
import {creationStatus,type CreationDetail,type CreationFilters,type CreationPage,type CreationSummary,type CreationAsset} from './creation-contracts';
import {TeamError} from '@/lib/teams/server';
const source=z.object({table:z.enum(['app_image_jobs','app_canvas_image_tasks','app_video_tasks','app_artworks']),id:z.string().min(1).max(240),email:z.string().min(1).max(254)});
type Source=z.infer<typeof source>;
export function legacyCreationId(value:Source){return `legacy-${Buffer.from(JSON.stringify(value)).toString('base64url')}`;}
function parseId(id:string){try{if(id.length>1600||!id.startsWith('legacy-'))throw new Error();return source.parse(JSON.parse(Buffer.from(id.slice(7),'base64url').toString()));}catch{throw new TeamError('记录不存在或无权访问',404);}}
const item=(r:Record<string,any>):CreationSummary=>({id:legacyCreationId({table:r.source_table,id:r.id,email:r.email}),title:r.content?.slice(0,120)||r.kind||'历史创作',actorEmail:r.email,actorName:r.email,tenantId:null,scopeKind:'legacy_unconfirmed',sourceKind:r.kind,status:creationStatus(r.status),acceptedAt:new Date(r.created_at).toISOString(),settledCredits:r.has_ledger_charge?Number(r.billed_credits):null,thumbnailAssetId:null,completeness:'not_recorded'});
export async function listLegacyCreations(f:CreationFilters):Promise<CreationPage>{
 const p=new URLSearchParams({section:'operations',page:String(f.page),size:String(f.size),email:f.user,q:f.q});if(f.from)p.set('from',f.from);if(f.to)p.set('to',f.to);if(f.status)p.set('status',`creation:${f.status}`);
 const query=parseBiQuery(p);if(f.period==='all'){query.start='-infinity';query.end='infinity';}
 const rows=await queryBi(query);return {items:rows.rows.map(item),pagination:{total:rows.total,page:rows.page,size:rows.size},appliedFilters:f,generatedAt:rows.generatedAt,scope:'platform',availability:'available',summary:{total:rows.total,activeMembers:0,settledCredits:null,pending:0,failed:0,needsReview:0},memberUsage:[]};
}
type LegacyMedia={asset:CreationAsset;storageRef:string;actorEmail:string};
export async function legacyCreationDetail(id:string,pages:{assetPage?:number}={}){
 const ref=parseId(id);await ensureBiSchema();const pool=getPool();
 // Table names come exclusively from the closed schema above; values stay bound.
 const row=(await pool.query(`SELECT * FROM ${ref.table} WHERE id=$1 AND email=$2`,[ref.id,ref.email])).rows[0];if(!row)throw new TeamError('记录不存在或无权访问',404);
 const request=row.payload?.plan?.request||row.payload?.p?.imagegen?.request;
 const text=request?.prompt??row.payload?.p?.userPrompt??row.payload?.p?.prompt??row.parameters?.newText??row.parameters?.prompt??row.prompt;
 const root=item({source_table:ref.table,id:ref.id,email:ref.email,content:typeof text==='string'?text:'',kind:row.kind||'视频创作',status:row.snapshot?.result?.status||row.snapshot?.status||row.status,created_at:row.created_at});
 const media:LegacyMedia[]=[];let i=0;
 const add=(direction:'input'|'output',role:string,storageRef:string,variant:'original'|'processed'='original',mediaType:'image'|'video'='image')=>{media.push({asset:{id:`legacy-media-${i}`,direction,role,position:i++,variant,mime:null,bytes:null,hash:null,availability:'recorded',mediaType},storageRef,actorEmail:ref.email});};
 if(Array.isArray(request?.inputs))for(const input of request.inputs)if(typeof input.artworkId==='string')add('input',String(input.role||'reference'),`artwork:${input.artworkId}`);
 const uploaded=row.payload?.p?.images||row.payload?.images;if(Array.isArray(uploaded))for(const image of uploaded){const url=image?.buf?.$imageJobBuffer;if(typeof url==='string'&&isManagedImageUrl(url))add('input','reference',url,'original');}
 if(row.source_artwork_id)add('input','edit-target',`artwork:${row.source_artwork_id}`);
 const inputCount=media.length,page=pages.assetPage||1,size=24,start=(page-1)*size;
 const inputs=media.slice(start,start+size),outputOffset=Math.max(0,start-inputCount),outputLimit=size-inputs.length;
 const outputFilter=ref.table==='app_artworks'?'id=$2':`(batch_id=$2 OR batch_id='b-'||$2 OR creation_provenance->>'ref'=$2 ${ref.table==='app_canvas_image_tasks'?'OR id=$3':''})`;
 const args=[ref.email,ref.id,...(ref.table==='app_canvas_image_tasks'?[row.result_artwork_id||'']:[])];
 const outputTotal=Number((await pool.query(`SELECT count(*)::int AS n FROM app_artworks WHERE email=$1 AND ${outputFilter}`,args)).rows[0].n);
 const results=outputLimit?(await pool.query(`SELECT id,image_url,video_url FROM app_artworks WHERE email=$1 AND ${outputFilter} ORDER BY created_at,id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,outputLimit,outputOffset])).rows:[];
 media.length=0;media.push(...inputs);
 for(const [index,result] of results.entries()){add('output','result',`artwork:${result.id}`,'original',result.video_url?'video':'image');const added=media[media.length-1];added.asset.id=`legacy-artwork-${Buffer.from(result.id).toString('base64url')}`;added.asset.position=inputCount+outputOffset+index;}
 const billing=(await pool.query(`SELECT id,state,charged_credits,reserved_credits,quote FROM app_billing_operations WHERE email=$1 AND id=$2`,[ref.email,ref.id])).rows[0];
 const ledgerId=ref.table==='app_image_jobs'?`led-image-${ref.id}`:ref.table==='app_video_tasks'?`led-video-${ref.id}`:ref.table==='app_canvas_image_tasks'?`led-canvas-image-${ref.id}`:null;
 const ledger=ledgerId?(await pool.query("SELECT -sum(delta)::int AS charged FROM app_ledger WHERE email=$1 AND id=$2 AND kind='consume'",[ref.email,ledgerId])).rows[0]?.charged:null;
 const charged=billing&&['settled','released'].includes(billing.state)?Number(billing.charged_credits):ledger!==null&&ledger!==undefined?Number(ledger):row.metered===false?0:null;
 const detail:CreationDetail={...root,settledCredits:charged,evidencePending:false,request:{state:typeof text==='string'?'recorded':'not_recorded',text:typeof text==='string'?text:null},parameters:{state:request?.parameters?'recorded':'not_recorded',values:request?.parameters||{}},model:{state:'not_recorded',label:null},assets:media.map(m=>m.asset),events:[],children:[],assetPagination:{page,size,total:inputCount+outputTotal},eventPagination:{page:1,size:24,total:0},childPagination:{page:1,size:24,total:0},billing:{payerAccountId:billing||ledger!==null?ref.email:null,source:'历史实际账户',quoted:Number.isSafeInteger(billing?.quote?.requestedCredits)?billing.quote.requestedCredits:null,reserved:null,charged,released:null,refunded:null,state:billing?.state||'not_recorded',operations:billing?[{id:billing.id,state:billing.state,charged}]:[]},technical:{sourceTable:ref.table,sourceId:ref.id,scope:'历史企业归属未确认',originalStatus:row.snapshot?.status||row.status}};
 return {detail,media};
}
export async function legacyCreationAsset(id:string,assetId:string){const {media}=await legacyCreationDetail(id);let m=media.find(m=>m.asset.id===assetId);
 if(!m&&/^legacy-media-\d+$/.test(assetId)){const index=Number(assetId.slice(13));m=(await legacyCreationDetail(id,{assetPage:Math.floor(index/24)+1})).media.find(m=>m.asset.id===assetId);}
 if(!m&&assetId.startsWith('legacy-artwork-')){
  const ref=parseId(id),artworkId=Buffer.from(assetId.slice(15),'base64url').toString();if(artworkId.length>240)throw new TeamError('素材不存在',404);
  const row=(await getPool().query(`SELECT * FROM ${ref.table} WHERE id=$1 AND email=$2`,[ref.id,ref.email])).rows[0];if(!row)throw new TeamError('素材不存在',404);
  const found=(await getPool().query(`SELECT id,video_url FROM app_artworks WHERE id=$1 AND email=$2 AND ($3='app_artworks' AND id=$4 OR $3<>'app_artworks' AND (batch_id=$4 OR batch_id='b-'||$4 OR creation_provenance->>'ref'=$4 OR $3='app_canvas_image_tasks' AND id=$5))`,[artworkId,ref.email,ref.table,ref.id,row.result_artwork_id||''])).rows[0];
  if(found)m={asset:{id:assetId,direction:'output',role:'result',position:0,variant:'original',mime:null,bytes:null,hash:null,availability:'recorded',mediaType:found.video_url?'video':'image'},storageRef:`artwork:${found.id}`,actorEmail:ref.email};
 }
 if(!m)throw new TeamError('素材不存在',404);let url=m.storageRef;
 if(url.startsWith('artwork:')){const artwork=url.slice(8);if(artwork.startsWith('asset-')){url=(await(await import('@/lib/imagegen/input-assets')).readImagegenInputAsset(artwork,m.actorEmail)).url;}else{const row=(await getPool().query('SELECT image_url,video_url FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[artwork,m.actorEmail])).rows[0];if(!row)throw new TeamError('素材已失效',404);url=m.asset.mediaType==='video'?row.video_url:row.image_url;}}
 if(!isManagedImageUrl(url)&&!url.startsWith('data:image/'))throw new TeamError('素材不在受控存储中',422);return {url,mediaType:m.asset.mediaType,mime:m.asset.mime};
}
