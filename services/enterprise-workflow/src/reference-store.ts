import {readScope} from './read-scope';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {id,WorkflowError,type Principal,type Actor,type WorkOrder} from './contracts';
import {canRead} from './domain';
import type {ResolveActor} from './store';
import {sourceAssetSchema,sourceDigest,openSourceFile} from './source-files';
const libraryQuery=z.strictObject({query:z.string().max(120).default(''),scope:z.enum(['all','mine']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)});
const hash=z.string().regex(/^[a-f0-9]{64}$/),snapshotAssets=z.array(sourceAssetSchema).max(50);
function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}
export class ReferenceStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private roots:Record<string,string>={}){}
 private async tx<T>(p:Principal,fn:(c:PoolClient,a:Actor)=>Promise<T>,repeatable=false){const c=await this.pool.connect();try{await c.query(repeatable?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');await c.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");const a=await this.resolveActor(c,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId,'MEMBERSHIP_REQUIRED',403);const result=await fn(c,a);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async read(c:PoolClient,a:Actor,orderId:string){id.parse(orderId);const order=(await c.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,orderId])).rows[0]?.document as WorkOrder|undefined;ensure(order&&canRead(a,order),'NOT_FOUND',404);
  const source=(await c.query('SELECT source_hash,row_number,snapshot FROM enterprise_workflow.order_sources WHERE enterprise_id=$1 AND order_id=$2 FOR SHARE',[a.enterpriseId,orderId])).rows[0];if(!source)return {assets:[],selection:'none' as const};
  const parsed=snapshotAssets.safeParse(source.snapshot.referenceAssets??[]);ensure(parsed.success,'REFERENCE_SNAPSHOT_INVALID');ensure(new Set(parsed.data.map(a=>a.id)).size===parsed.data.length,'REFERENCE_SNAPSHOT_INVALID');
  if(!parsed.data.length)return {assets:[],selection:source.snapshot.referenceAssets?'empty' as const:'legacy' as const};
  const batch=(await c.query('SELECT active FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2 FOR SHARE',[a.enterpriseId,source.source_hash])).rows[0],row=(await c.query('SELECT document FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3 FOR SHARE',[a.enterpriseId,source.source_hash,source.row_number])).rows[0]?.document;
  const rowIds=new Set<string>((row?.attachments??[]).flatMap((x:{assets:string[]})=>x.assets));const docs=(await c.query('SELECT asset_id,document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2 AND asset_id=ANY($3::text[]) FOR SHARE',[a.enterpriseId,source.source_hash,parsed.data.map(a=>a.id)])).rows;const byId=new Map(docs.map(d=>[d.asset_id,sourceAssetSchema.safeParse(d.document)]));
  const rootReady=!!this.roots[a.enterpriseId],unchanged=!!row&&typeof source.snapshot.referenceRowHash==='string'&&sourceDigest(row)===source.snapshot.referenceRowHash;
  return {selection:'selected' as const,assets:parsed.data.map(asset=>{const current=byId.get(asset.id),reason=!batch?.active?'SOURCE_INACTIVE':!unchanged||!rowIds.has(asset.id)?'SOURCE_CHANGED':!current?.success?'SOURCE_ASSET_MISSING':sourceDigest(current.data)!==sourceDigest(asset)?'SOURCE_ASSET_CHANGED':!rootReady?'SOURCE_STORAGE_NOT_CONFIGURED':null;return {...asset,available:!reason,reason};})};
 }
 async library(p:Principal,raw:unknown={}){const q=libraryQuery.parse(raw);return this.tx(p,async(c,a)=>{
  const has=(p:typeof a.permissions[number])=>a.permissions.includes(p),values=[a.enterpriseId,a.teamId??null,has('manage')||has('dispatch')||has('review'),a.subject,has('execute'),a.workKinds,has('manage')||has('dispatch'),q.query,q.scope,(q.page-1)*24];
  const result=(await c.query(`WITH selected AS MATERIALIZED (SELECT o.id order_id,o.document->>'title' order_title,o.document->>'status' order_status,(o.document->>'version')::int order_version,o.updated_at,asset->>'id' asset_id
   FROM enterprise_workflow.orders o JOIN enterprise_workflow.order_sources s ON s.enterprise_id=o.enterprise_id AND s.order_id=o.id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.snapshot->'referenceAssets','[]'::jsonb)) asset
   WHERE o.enterprise_id=$1 AND ${readScope('o.document','$7')} AND ($9='all' OR o.document->>'requester'=$4) AND ($8='' OR strpos(lower(COALESCE(asset->>'name','')||' '||(o.document->>'title')),lower($8))>0)),
   page AS (SELECT * FROM selected ORDER BY updated_at DESC,order_id,asset_id LIMIT 24 OFFSET $10)
   SELECT jsonb_build_object('total',(SELECT count(*) FROM selected),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY updated_at DESC,order_id,asset_id) FROM page),'[]'::jsonb)) data`,values)).rows[0].data as {total:number;rows:{order_id:string;order_title:string;order_status:string;order_version:number;asset_id:string}[]};
  const cache=new Map<string,Awaited<ReturnType<ReferenceStore['read']>>>(),assets=[];for(const row of result.rows){let selected=cache.get(row.order_id);if(!selected){selected=await this.read(c,a,row.order_id);cache.set(row.order_id,selected);}const asset=selected.assets.find(x=>x.id===row.asset_id);ensure(asset,'REFERENCE_SNAPSHOT_INVALID');assets.push({...asset,order:{id:row.order_id,title:row.order_title,status:row.order_status,version:row.order_version}});}
  return {assets,total:result.total,page:q.page,pageSize:24,scope:q.scope,query:q.query,unit:'order-file-reference' as const};
 },true);}
 async list(p:Principal,orderId:string){return this.tx(p,(c,a)=>this.read(c,a,orderId));}
 async file(p:Principal,orderId:string,assetId:string,download:boolean){hash.parse(assetId);const selected=(await this.list(p,orderId)).assets.find(a=>a.id===assetId);ensure(selected,'REFERENCE_NOT_FOUND',404);ensure(selected.available,selected.reason||'REFERENCE_UNAVAILABLE',selected.reason==='SOURCE_STORAGE_NOT_CONFIGURED'?503:409);return openSourceFile(this.roots[p.enterpriseId],selected,download,async()=>{const current=(await this.list(p,orderId)).assets.find(a=>a.id===assetId);ensure(current?.available,'REFERENCE_UNAVAILABLE',409);ensure(sourceDigest(sourceAssetSchema.parse(current))===sourceDigest(sourceAssetSchema.parse(selected)),'REFERENCE_CHANGED',409);});}
}
