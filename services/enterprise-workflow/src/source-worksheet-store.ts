import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import sharp from 'sharp';
import {WorkflowError,type Principal} from './contracts';
import {sourceDigest} from './source-files';

const hash=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).refine(v=>!['__proto__','constructor','prototype'].includes(v));
const fileRef=z.strictObject({kind:z.enum(['source','worksheet']),id:hash,name:z.string().min(1).max(500)});
const value=z.union([z.string().max(20000),z.array(fileRef).max(50)]);
const column=z.strictObject({id:key,label:z.string().trim().min(1).max(80),type:z.enum(['text','date','number','image','files']),width:z.number().int().min(100).max(420),visible:z.boolean(),archived:z.boolean().default(false)});
const cells=z.record(key,value).refine(v=>Object.keys(v).length<=64);
const action=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('initialize')}),
 z.strictObject({type:z.literal('set-cells'),row:key,cells,parentId:key.nullable().optional()}),
 z.strictObject({type:z.literal('add-row'),id:key,cells,parentId:key.nullable().default(null)}),
 z.strictObject({type:z.literal('delete-row'),row:key}),
 z.strictObject({type:z.literal('restore-row'),row:key}),
 z.strictObject({type:z.literal('parent'),row:key,parentId:key.nullable()}),
 z.strictObject({type:z.literal('add-column'),column}),
 z.strictObject({type:z.literal('update-column'),column}),
 z.strictObject({type:z.literal('delete-column'),column:key}),
 z.strictObject({type:z.literal('restore-column'),column:key})
]);
const command=z.strictObject({commandId:z.string().uuid(),expectedVersion:z.number().int().min(0),action});
type Ref=z.infer<typeof fileRef>;
export type SheetColumn=z.infer<typeof column>;
export type SheetRow={id:string;originRow:number|null;parentId:string|null;parentConfirmed:boolean;archived:boolean;cells:Record<string,string|Ref[]>};
export type SheetDocument={columns:SheetColumn[];rows:SheetRow[]};
export type SheetAuthorize=(tx:PoolClient,p:Principal,write:boolean)=>Promise<void>;
function need(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}
const baseColumns:[string,string,SheetColumn['type'],number,string?][]=[
 ['title','产品需求 / 制作任务','text',310,'产品需求名称'],['image','产品图','image',100],['designer','设计师','text',135,'设计师'],['owner','需求方','text',130,'需求方'],['started','沟通后开始','date',140,'任务沟通后开始时间'],['finished','完成日期','date',140,'设计完成日期'],['status','完成情况','text',115,'任务完成情况'],['schedule','排期标签','text',160,'任务排期情况'],['quantity','数量','text',110,'数量'],['files','需求附件','files',130],['dispatch','下发日期','date',140,'下发日期'],['taskType','任务类型','text',140,'任务类型'],['attributes','属性','text',160,'属性（运营填写）'],['send','发送任务','text',130,'发送任务'],['parentText','原父标签','text',180,'父记录']
];
/** Import evidence is read to seed a document, never UPDATEd by this module. */
export class SourceWorksheetStore{
 constructor(readonly pool:Pool,private authorize:SheetAuthorize){}
 private async tx<T>(p:Principal,source:string,write:boolean,fn:(c:PoolClient)=>Promise<T>){hash.parse(source);const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s'");await this.authorize(c,p,write);
  need((await c.query('SELECT 1 FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2 AND active FOR SHARE',[p.enterpriseId,source])).rowCount===1,'SOURCE_NOT_FOUND',404);
  need((await c.query("SELECT to_regclass('enterprise_workflow.source_worksheets') AS t")).rows[0].t,'WORKSHEET_MIGRATION_REQUIRED',503);
  const result=await fn(c);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async seed(c:PoolClient,p:Principal,source:string):Promise<SheetDocument>{
  const sourceRows=(await c.query('SELECT document,resolution FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 ORDER BY row_number',[p.enterpriseId,source])).rows;
  const assets=(await c.query('SELECT document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2',[p.enterpriseId,source])).rows.map(r=>r.document);
  const columns=baseColumns.map(([id,label,type,width])=>({id,label,type,width,visible:!['dispatch','taskType','attributes','send','parentText'].includes(id),archived:false}));
  const known=new Set(baseColumns.map(c=>c[4]).filter(Boolean));known.add('白底产品图');known.add('运营需求文档（必传文档，按上传文档时间设计排期）');
  for(const k of new Set<string>(sourceRows.flatMap(x=>Object.keys(x.document.raw))))if(!known.has(k)&&columns.length<64)columns.push({id:'raw_'+sourceDigest(k).slice(0,16),label:k.slice(0,80),type:'text',width:160,visible:false,archived:false});
  return {columns,rows:sourceRows.map(({document:r,resolution})=>{const attached=new Set<string>(r.attachments.flatMap((l:any)=>l.assets));const refs=assets.filter(a=>attached.has(a.id)).map(a=>({kind:'source' as const,id:a.id,name:a.name}));const rowCells:SheetRow['cells']={};
   for(const col of columns){const field=baseColumns.find(x=>x[0]===col.id)?.[4];rowCells[col.id]=col.id==='image'?refs.filter(a=>/\.(png|jpe?g)$/i.test(a.name)):col.id==='files'?refs.filter(a=>!/\.(png|jpe?g)$/i.test(a.name)):field?(r.raw[field]||''):Object.entries(r.raw).find(([k])=>'raw_'+sourceDigest(k).slice(0,16)===col.id)?.[1] as string||'';}
   rowCells.title=r.title;const parent=resolution?.parentRow||(r.parentCandidates.length===1?r.parentCandidates[0]:null);
   return {id:'e'+r.excelRow,originRow:r.excelRow,parentId:parent?'e'+parent:null,parentConfirmed:!!resolution,archived:false,cells:rowCells};})};
 }
 async read(p:Principal,source:string){return this.tx(p,source,false,async c=>{const r=(await c.query('SELECT version,document,updated_at FROM enterprise_workflow.source_worksheets WHERE enterprise_id=$1 AND source_hash=$2',[p.enterpriseId,source])).rows[0];return r?{version:r.version,document:r.document,updatedAt:r.updated_at,persisted:true}:{version:0,document:await this.seed(c,p,source),updatedAt:null,persisted:false};});}
 async execute(p:Principal,source:string,raw:unknown){const cmd=command.parse(raw);return this.tx(p,source,true,async c=>{
  // Serialize the first write as well as later CAS checks; replay binds actor, tenant, source and payload.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`worksheet-command:${p.enterpriseId}:${cmd.commandId}`]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`worksheet:${p.enterpriseId}:${source}`]);
  const fingerprint=sourceDigest({p,source,cmd}),prior=(await c.query('SELECT fingerprint,result FROM enterprise_workflow.source_worksheet_commands WHERE enterprise_id=$1 AND command_id=$2',[p.enterpriseId,cmd.commandId])).rows[0];
  if(prior){need(prior.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT');return {...prior.result,replayed:true};}
  const current=(await c.query('SELECT version,document FROM enterprise_workflow.source_worksheets WHERE enterprise_id=$1 AND source_hash=$2 FOR UPDATE',[p.enterpriseId,source])).rows[0];const version=current?.version||0;need(version===cmd.expectedVersion,'VERSION_CONFLICT');
  const d:SheetDocument=current?structuredClone(current.document):await this.seed(c,p,source);const a=cmd.action;let before:unknown=null,after:unknown=null;
  const row=(id:string)=>{const r=d.rows.find(r=>r.id===id);need(r,'ROW_NOT_FOUND',404);return r;};
  const col=(id:string)=>{const x=d.columns.find(x=>x.id===id);need(x,'COLUMN_NOT_FOUND',404);return x;};
  const validate=async(entries:Record<string,string|Ref[]>)=>{for(const [k,v] of Object.entries(entries)){const f=col(k);need(!f.archived,'COLUMN_ARCHIVED');if(['image','files'].includes(f.type)){need(Array.isArray(v),'CELL_TYPE_INVALID',400);for(const ref of v){
    const table=ref.kind==='source'?'import_assets':'source_worksheet_files';const idColumn=ref.kind==='source'?'asset_id':'id';const found=(await c.query(`SELECT ${ref.kind==='source'?"document->>'name' AS name,document->>'extension' AS extension":"name,mime"} FROM enterprise_workflow.${table} WHERE enterprise_id=$1 AND source_hash=$2 AND ${idColumn}=$3`,[p.enterpriseId,source,ref.id])).rows[0];need(found&&found.name===ref.name,'ASSET_NOT_FOUND',404);if(f.type==='image')need(ref.kind==='source'?['.png','.jpg','.jpeg'].includes(found.extension):['image/png','image/jpeg'].includes(found.mime),'NOT_IMAGE',400);
   }}else{need(typeof v==='string','CELL_TYPE_INVALID',400);if(v&&f.type==='date')need(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'DATE_INVALID',400);if(v&&f.type==='number')need(/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)&&Number.isFinite(Number(v)),'NUMBER_INVALID',400);}}};
  const parent=(r:SheetRow,id:string|null)=>{if(id){const par=row(id);need(!par.archived&&par.id!==r.id,'PARENT_INVALID',400);let x:SheetRow|undefined=par;const seen=new Set([r.id]);while(x){need(!seen.has(x.id),'PARENT_CYCLE',400);seen.add(x.id);x=x.parentId?row(x.parentId):undefined;}}r.parentId=id;r.parentConfirmed=!!id;};
  switch(a.type){
   case 'initialize':need(!current,'WORKSHEET_ALREADY_EXISTS');after={rows:d.rows.length};break;
   case 'set-cells':{const r=row(a.row);need(!r.archived,'ROW_ARCHIVED');await validate(a.cells);before=Object.fromEntries(Object.keys(a.cells).map(k=>[k,r.cells[k]??'']));Object.assign(r.cells,a.cells);if(a.parentId!==undefined){before={cells:before,parentId:r.parentId};parent(r,a.parentId);}after={cells:a.cells,...(a.parentId!==undefined?{parentId:r.parentId}:{})};break;}
   case 'add-row':{need(!d.rows.some(r=>r.id===a.id),'ROW_EXISTS');need(d.rows.length<10000,'ROW_LIMIT',400);await validate(a.cells);const r:SheetRow={id:a.id,originRow:null,parentId:null,parentConfirmed:false,archived:false,cells:Object.fromEntries(d.columns.map(c=>[c.id,['image','files'].includes(c.type)?[]:'']))};Object.assign(r.cells,a.cells);parent(r,a.parentId);d.rows.unshift(r);after=r;break;}
   case 'delete-row':case 'restore-row':{const r=row(a.row);before={archived:r.archived};need(r.archived===(a.type==='restore-row'),'ROW_STATE_CONFLICT');r.archived=a.type==='delete-row';after={archived:r.archived};break;}
   case 'parent':{const r=row(a.row);need(!r.archived,'ROW_ARCHIVED');before={parentId:r.parentId};parent(r,a.parentId);after={parentId:r.parentId};break;}
   case 'add-column':need(!d.columns.some(c=>c.id===a.column.id),'COLUMN_EXISTS');need(d.columns.length<64,'COLUMN_LIMIT',400);d.columns.push(a.column);after=a.column;break;
   case 'update-column':{const f=col(a.column.id);need(f.type===a.column.type,'COLUMN_TYPE_LOCKED',400);need(a.column.id!=='title'||a.column.visible&&!a.column.archived,'TITLE_REQUIRED',400);before={...f};Object.assign(f,a.column);after=f;break;}
   case 'delete-column':case 'restore-column':{const f=col(a.column);need(f.id!=='title','TITLE_REQUIRED',400);need(f.archived===(a.type==='restore-column'),'COLUMN_STATE_CONFLICT');before={...f};f.archived=a.type==='delete-column';after={...f};break;}
  }
  need(Buffer.byteLength(JSON.stringify(d))<=12*1024*1024,'WORKSHEET_SIZE_LIMIT',413);
  const next=version+1;await c.query('INSERT INTO enterprise_workflow.source_worksheets(enterprise_id,source_hash,version,document)VALUES($1,$2,$3,$4) ON CONFLICT(enterprise_id,source_hash)DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document,updated_at=now()',[p.enterpriseId,source,next,d]);
  const result={version:next,replayed:false};await c.query('INSERT INTO enterprise_workflow.source_worksheet_commands(enterprise_id,command_id,source_hash,fingerprint,result,subject)VALUES($1,$2,$3,$4,$5,$6)',[p.enterpriseId,cmd.commandId,source,fingerprint,result,p.subject]);await c.query('INSERT INTO enterprise_workflow.source_worksheet_audit(enterprise_id,source_hash,version,subject,command_id,operation,detail)VALUES($1,$2,$3,$4,$5,$6,$7)',[p.enterpriseId,source,next,p.subject,cmd.commandId,a.type,{row:'row'in a?a.row:null,column:'column'in a?a.column:null,before,after}]);return result;
 });}
 async history(p:Principal,source:string,before=2147483647){need(Number.isInteger(before)&&before>0,'INVALID_CURSOR',400);return this.tx(p,source,false,async c=>({events:(await c.query('SELECT version,subject,operation,detail,created_at FROM enterprise_workflow.source_worksheet_audit WHERE enterprise_id=$1 AND source_hash=$2 AND version<$3 ORDER BY version DESC LIMIT 30',[p.enterpriseId,source,before])).rows}));}
 async upload(p:Principal,source:string,raw:unknown){const q=z.strictObject({name:z.string().trim().min(1).max(240).refine(v=>!/[\\/\x00-\x1f]/.test(v)),data:z.string().min(4).max(5592408).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(raw);const data=Buffer.from(q.data,'base64');need(data.length>0&&data.length<=4*1024*1024&&data.toString('base64')===q.data,'FILE_SIZE_OR_ENCODING',413);
  // Authorization happens before the potentially expensive decode, again before commit.
  await this.tx(p,source,true,async()=>{});let mime='application/octet-stream';if(/\.(png|jpe?g)$/i.test(q.name)){try{const x=sharp(data,{limitInputPixels:16_000_000,animated:false}),meta=await x.metadata();need(['png','jpeg'].includes(meta.format||''),'INVALID_IMAGE',400);await x.stats();mime=meta.format==='png'?'image/png':'image/jpeg';}catch{throw new WorkflowError(400,'INVALID_IMAGE');}}
  const id=createHash('sha256').update(data).digest('hex');return this.tx(p,source,true,async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`worksheet:${p.enterpriseId}:${source}`]);const existing=(await c.query('SELECT name,mime FROM enterprise_workflow.source_worksheet_files WHERE enterprise_id=$1 AND source_hash=$2 AND id=$3',[p.enterpriseId,source,id])).rows[0];if(existing)return {kind:'worksheet' as const,id,name:existing.name,mime:existing.mime};need((await c.query('SELECT count(*)::int AS n,COALESCE(sum(bytes),0)::bigint AS bytes FROM enterprise_workflow.source_worksheet_files WHERE enterprise_id=$1 AND source_hash=$2',[p.enterpriseId,source])).rows.every(r=>r.n<1000&&Number(r.bytes)+data.length<=128*1024*1024),'FILE_QUOTA',413);
   await c.query('INSERT INTO enterprise_workflow.source_worksheet_files(enterprise_id,source_hash,id,name,mime,bytes,content,subject)VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[p.enterpriseId,source,id,q.name,mime,data.length,data,p.subject]);return {kind:'worksheet' as const,id,name:q.name,mime};});
 }
 async file(p:Principal,source:string,id:string){hash.parse(id);return this.tx(p,source,false,async c=>{const r=(await c.query('SELECT name,mime,bytes,content FROM enterprise_workflow.source_worksheet_files WHERE enterprise_id=$1 AND source_hash=$2 AND id=$3',[p.enterpriseId,source,id])).rows[0];need(r,'ASSET_NOT_FOUND',404);need(r.content.length===r.bytes&&createHash('sha256').update(r.content).digest('hex')===id,'FILE_HASH_MISMATCH',503);return {...r,id};});}
}
