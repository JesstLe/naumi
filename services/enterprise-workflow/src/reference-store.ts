import {readScope} from './read-scope';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {id,WorkflowError,type Principal,type Actor,type WorkOrder} from './contracts';
import {canRead} from './domain';
import type {ResolveActor} from './store';
import {readWorkflowSnapshot} from './read-transaction';
import {sourceAssetSchema,sourceDigest,openSourceFile,type SourceAsset} from './source-files';
const libraryQuery=z.strictObject({query:z.string().max(120).default(''),scope:z.enum(['all','mine']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)});
const hash=z.string().regex(/^[a-f0-9]{64}$/),snapshotAssets=z.array(sourceAssetSchema).max(50);
function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}

type RevisionRow={id:string;revisions:(string|null)[]};
type Bundle=RevisionRow&{document:WorkOrder;source_hash:string|null;source_snapshot:{referenceAssets?:unknown;referenceRowHash?:unknown}|null;active:boolean|null;source_row:Record<string,unknown>&{attachments?:{assets:string[]}[]}|null};
type AssetKey={source_hash:string;asset_id:string};
type Evidence={orders:RevisionRow[];keys:AssetKey[];assets:Map<string,string>};
type Reference=SourceAsset&{available:boolean;reason:string|null};
type ReferenceList={assets:Reference[];selection:'none'|'empty'|'legacy'|'selected'};
type OrderInfo=Pick<WorkOrder,'id'|'title'|'status'|'version'>;
const assetKey=(source:string,id:string)=>source+':'+id;
const sourceJoins=`FROM enterprise_workflow.orders o
 LEFT JOIN enterprise_workflow.order_sources s ON s.enterprise_id=o.enterprise_id AND s.order_id=o.id
 LEFT JOIN enterprise_workflow.import_batches b ON b.enterprise_id=s.enterprise_id AND b.source_hash=s.source_hash
 LEFT JOIN enterprise_workflow.import_rows r ON r.enterprise_id=s.enterprise_id AND r.source_hash=s.source_hash AND r.row_number=s.row_number
 WHERE o.enterprise_id=$1 AND o.id=ANY($2::uuid[])`;
const sourceRevisions='ARRAY[o.xmin::text,s.xmin::text,b.xmin::text,r.xmin::text] AS revisions';
const assetJoins=`FROM jsonb_to_recordset($2::jsonb) AS k(source_hash text,asset_id text)
 JOIN enterprise_workflow.import_assets a ON a.enterprise_id=$1 AND a.source_hash=k.source_hash AND a.asset_id=k.asset_id`;

export class ReferenceStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private roots:Record<string,string>={}){}
 private async load(c:PoolClient,a:Actor,requested:Map<string,Set<string>|null>,mine=false){
  const result=new Map<string,{order:OrderInfo;list:ReferenceList}>(),evidence:Evidence={orders:[],keys:[],assets:new Map()};
  if(!requested.size)return {result,evidence};
  const rows=(await c.query<Bundle>(`SELECT o.id,o.document,s.source_hash,s.snapshot AS source_snapshot,b.active,r.document AS source_row,${sourceRevisions}
   ${sourceJoins}`,[a.enterpriseId,[...requested.keys()]])).rows;
  ensure(rows.length===requested.size,'NOT_FOUND',404);
  const parsed=rows.map(row=>{
   ensure(canRead(a,row.document)&&(!mine||row.document.requester===a.subject),'NOT_FOUND',404);
   const assets=snapshotAssets.safeParse(row.source_snapshot?.referenceAssets??[]);
   ensure(assets.success&&new Set(assets.data.map(a=>a.id)).size===assets.data.length,'REFERENCE_SNAPSHOT_INVALID');
   const pins=requested.get(row.id);
   return {row,selected:assets.data.length>0,assets:pins?assets.data.filter(a=>pins.has(a.id)):assets.data};
  });
  const keys=new Map<string,AssetKey>();
  for(const {row,assets} of parsed)if(row.source_hash)for(const asset of assets)keys.set(assetKey(row.source_hash,asset.id),{source_hash:row.source_hash,asset_id:asset.id});
  evidence.orders=rows.map(({id,revisions})=>({id,revisions}));evidence.keys=[...keys.values()];
  const stored=keys.size?(await c.query<AssetKey&{document:unknown;revision:string}>(`SELECT a.source_hash,a.asset_id,a.document,a.xmin::text AS revision
   ${assetJoins}`,[a.enterpriseId,JSON.stringify(evidence.keys)])).rows:[];
  evidence.assets=new Map(stored.map(x=>[assetKey(x.source_hash,x.asset_id),x.revision]));
  const byAsset=new Map(stored.map(d=>[assetKey(d.source_hash,d.asset_id),sourceAssetSchema.safeParse(d.document)]));
  const rootReady=!!this.roots[a.enterpriseId];
  for(const {row,selected,assets} of parsed){
   const {id,title,status,version}=row.document;
   const selection=!row.source_snapshot?'none':selected?'selected':row.source_snapshot.referenceAssets?'empty':'legacy';
   const rowIds=new Set((row.source_row?.attachments??[]).flatMap(x=>x.assets));
   const unchanged=!!row.source_row&&typeof row.source_snapshot?.referenceRowHash==='string'&&sourceDigest(row.source_row)===row.source_snapshot.referenceRowHash;
   const evaluated=assets.map(asset=>{
    const current=byAsset.get(assetKey(row.source_hash!,asset.id));
    const reason=!row.active?'SOURCE_INACTIVE':!unchanged||!rowIds.has(asset.id)?'SOURCE_CHANGED':!current?.success?'SOURCE_ASSET_MISSING':sourceDigest(current.data)!==sourceDigest(asset)?'SOURCE_ASSET_CHANGED':!rootReady?'SOURCE_STORAGE_NOT_CONFIGURED':null;
    return {...asset,available:!reason,reason};
   });
   result.set(row.id,{order:{id,title,status,version},list:{selection,assets:evaluated}});
  }
  return {result,evidence};
 }
 private async checkCurrent(c:PoolClient,a:Actor,evidence:Evidence){
  if(!evidence.orders.length)return;
  const before=new Map(evidence.orders.map(o=>[o.id,JSON.stringify(o.revisions)]));
  const orders=(await c.query<RevisionRow>(`SELECT o.id,${sourceRevisions} ${sourceJoins}`,[a.enterpriseId,[...before.keys()]])).rows;
  ensure(orders.length===before.size&&orders.every(o=>before.get(o.id)===JSON.stringify(o.revisions)),'REFERENCE_CHANGED');
  if(!evidence.keys.length)return;
  const assets=(await c.query<AssetKey&{revision:string}>(`SELECT a.source_hash,a.asset_id,a.xmin::text AS revision ${assetJoins}`,[a.enterpriseId,JSON.stringify(evidence.keys)])).rows;
  ensure(assets.length===evidence.assets.size&&assets.every(x=>evidence.assets.get(assetKey(x.source_hash,x.asset_id))===x.revision),'REFERENCE_CHANGED');
 }
 async library(p:Principal,raw:unknown={}){
  const q=libraryQuery.parse(raw);
  type PageRow={order_id:string;asset_id:string};
  type Answer=Reference&{order:OrderInfo};
  const hydrate=async(c:PoolClient,a:Actor,rows:PageRow[])=>{
   const requested=new Map<string,Set<string>>();
   for(const row of rows){const pins=requested.get(row.order_id)??new Set<string>();pins.add(row.asset_id);requested.set(row.order_id,pins);}
   const {result,evidence}=await this.load(c,a,requested,q.scope==='mine');
   const assets:Answer[]=rows.map(row=>{const bundle=result.get(row.order_id)!;const asset=bundle.list.assets.find(x=>x.id===row.asset_id);ensure(asset,'REFERENCE_SNAPSHOT_INVALID');return {...asset,order:bundle.order};});
   return {assets,evidence};
  };
  const page=await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(c,a)=>{
   const has=(p:typeof a.permissions[number])=>a.permissions.includes(p),values=[a.enterpriseId,a.teamId??null,has('manage')||has('dispatch')||has('review'),a.subject,has('execute'),a.workKinds,has('manage')||has('dispatch'),q.query,q.scope,(q.page-1)*24];
   const {data}=(await c.query<{data:{total:number;rows:PageRow[]}}>(`WITH selected AS MATERIALIZED (SELECT o.id order_id,o.updated_at,asset->>'id' asset_id
    FROM enterprise_workflow.orders o JOIN enterprise_workflow.order_sources s ON s.enterprise_id=o.enterprise_id AND s.order_id=o.id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.snapshot->'referenceAssets','[]'::jsonb)) asset
    WHERE o.enterprise_id=$1 AND ${readScope('o.document','$7')} AND ($9='all' OR o.document->>'requester'=$4) AND ($8='' OR strpos(lower(COALESCE(asset->>'name','')||' '||(o.document->>'title')),lower($8))>0)),
    page AS (SELECT * FROM selected ORDER BY updated_at DESC,order_id,asset_id LIMIT 24 OFFSET $10)
    SELECT jsonb_build_object('total',(SELECT count(*) FROM selected),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY updated_at DESC,order_id,asset_id) FROM page),'[]'::jsonb)) data`,values)).rows[0];
   return {total:data.total,...await hydrate(c,a,data.rows)};
  },{legacyRepeatable:true,checkCurrent:(c,a,page)=>this.checkCurrent(c,a,page.evidence)});
  return {assets:page.assets,total:page.total,page:q.page,pageSize:24,scope:q.scope,query:q.query,unit:'order-file-reference' as const};
 }
 private async orderReferences(p:Principal,orderId:string,assetId?:string){
  id.parse(orderId);const refs=new Map([[orderId,assetId?new Set([assetId]):null]]);
  const value=await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(c,a)=>{
   const {result,evidence}=await this.load(c,a,refs),item=result.get(orderId);ensure(item,'NOT_FOUND',404);return {list:item.list,evidence};
  },{legacyRepeatable:true,checkCurrent:(c,a,result)=>this.checkCurrent(c,a,result.evidence)});
  return value.list;
 }
 async list(p:Principal,orderId:string){return this.orderReferences(p,orderId);}
 async file(p:Principal,orderId:string,assetId:string,download:boolean){hash.parse(assetId);const selected=(await this.orderReferences(p,orderId,assetId)).assets[0];ensure(selected,'REFERENCE_NOT_FOUND',404);ensure(selected.available,selected.reason||'REFERENCE_UNAVAILABLE',selected.reason==='SOURCE_STORAGE_NOT_CONFIGURED'?503:409);return openSourceFile(this.roots[p.enterpriseId],selected,download,async()=>{const current=(await this.orderReferences(p,orderId,assetId)).assets[0];ensure(current?.available,'REFERENCE_UNAVAILABLE',409);ensure(sourceDigest(sourceAssetSchema.parse(current))===sourceDigest(sourceAssetSchema.parse(selected)),'REFERENCE_CHANGED',409);});}
}
