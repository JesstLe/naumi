import { createHash,randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { WorkflowError } from './contracts';
const hash=z.string().regex(/^[a-f0-9]{64}$/),rowNo=z.number().int().min(2).max(10001);
const issue=z.object({excelRow:z.number().int().min(0),code:z.string().max(80),message:z.string().max(2000)});
const attachment=z.object({excelRow:rowNo,cell:z.string().regex(/^[A-Z]+[0-9]+$/),assets:z.array(hash).max(500)});
const row=z.object({excelRow:rowNo,title:z.string().max(2000),parentLabel:z.string().max(2000),raw:z.record(z.string(),z.string().max(20000)),rawCells:z.record(z.string(),z.string().max(20000)),parentCandidates:z.array(rowNo).max(1000),attachments:z.array(attachment).max(100),issues:z.array(issue).max(100)});
const asset=z.object({id:hash,path:z.string().max(2000),name:z.string().max(500),sha256:hash,bytes:z.number().int().min(0).max(1024**3),extension:z.string().max(20)});
const payload=z.object({schema:z.literal('enterprise-source-import-v1'),sourceHash:hash,workbookHash:hash,sheet:z.string().max(200),headers:z.record(z.string(),z.string()),rows:z.array(row).min(1).max(10000),issues:z.array(issue).max(100000),summary:z.record(z.string(),z.unknown()),assets:z.array(asset).max(5000),links:z.array(attachment).max(10000)});
export type ImportedRow=z.infer<typeof row> & {version:number;resolution:{parentRow:number|null;reason:string;subject:string;at:string}|null};
export async function fileHash(path:string){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
function ensure(v:unknown,code:string,status=400):asserts v {if(!v)throw new WorkflowError(status,code);}
export class ImportStore {
 constructor(readonly pool:Pool,readonly enterpriseId:string,readonly blobRoot:string){}
 private async tx<T>(f:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const v=await f(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async ingest(raw:unknown,subject:string){
  const p=payload.parse(raw),rows=new Map(p.rows.map(r=>[r.excelRow,r])),assets=new Map(p.assets.map(a=>[a.id,a]));
  ensure(rows.size===p.rows.length&&assets.size===p.assets.length,'DUPLICATE_SOURCE_KEY');
  ensure(p.summary.rows===p.rows.length&&p.summary.children===p.rows.filter(r=>r.parentLabel).length,'SOURCE_COUNT_MISMATCH');
  for(const r of p.rows){
   const candidates=p.rows.filter(x=>!!x.title&&!x.parentLabel&&x.title===r.parentLabel).map(x=>x.excelRow);
   ensure(JSON.stringify(r.parentCandidates)===JSON.stringify(r.parentLabel?candidates:[]),'PARENT_CANDIDATE_MISMATCH');
   ensure(r.issues.every(i=>i.excelRow===r.excelRow),'ISSUE_ROW_MISMATCH');
   for(const l of r.attachments)ensure(l.excelRow===r.excelRow&&l.assets.every(a=>assets.has(a)),'ATTACHMENT_SCOPE_MISMATCH');
  }
  for(const a of p.assets){const f=join(this.blobRoot,a.sha256);ensure((await stat(f)).size===a.bytes&&await fileHash(f)===a.sha256,'BLOB_HASH_MISMATCH');}
  const fingerprint=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  return this.tx(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`import:${this.enterpriseId}:${p.sourceHash}`]);
   const prior=(await c.query('SELECT document FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2',[this.enterpriseId,p.sourceHash])).rows[0];
   if(prior){ensure(prior.document.fingerprint===fingerprint,'SOURCE_REPLAY_CONFLICT',409);return {replayed:true,rows:p.rows.length,assets:p.assets.length,sourceHash:p.sourceHash};}
   const {rows:_,assets:__,...meta}=p;
   await c.query('INSERT INTO enterprise_workflow.import_batches(enterprise_id,source_hash,document) VALUES($1,$2,$3)',[this.enterpriseId,p.sourceHash,{...meta,fingerprint}]);
   for(const r of p.rows)await c.query('INSERT INTO enterprise_workflow.import_rows(enterprise_id,source_hash,row_number,document) VALUES($1,$2,$3,$4)',[this.enterpriseId,p.sourceHash,r.excelRow,r]);
   for(const a of p.assets)await c.query('INSERT INTO enterprise_workflow.import_assets(enterprise_id,source_hash,asset_id,document) VALUES($1,$2,$3,$4)',[this.enterpriseId,p.sourceHash,a.id,a]);
   await c.query('INSERT INTO enterprise_workflow.import_audit(id,enterprise_id,source_hash,subject,operation,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),this.enterpriseId,p.sourceHash,subject,'import',{rows:p.rows.length,assets:p.assets.length}]);
   return {replayed:false,rows:p.rows.length,assets:p.assets.length,sourceHash:p.sourceHash};
  });
 }
 async batches(){return (await this.pool.query('SELECT source_hash,document,created_at FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND active ORDER BY created_at DESC',[this.enterpriseId])).rows.map(r=>({sourceHash:r.source_hash,sheet:r.document.sheet,summary:r.document.summary,headers:r.document.headers,createdAt:r.created_at}));}
 async data(source:string){ensure(hash.safeParse(source).success,'INVALID_SOURCE');const result=await this.pool.query(`SELECT r.document,r.version,r.resolution FROM enterprise_workflow.import_rows r JOIN enterprise_workflow.import_batches b USING(enterprise_id,source_hash) WHERE r.enterprise_id=$1 AND r.source_hash=$2 AND b.active ORDER BY r.row_number`,[this.enterpriseId,source]);ensure(result.rowCount,'SOURCE_NOT_FOUND',404);return result.rows.map(r=>({...r.document,version:r.version,resolution:r.resolution})) as ImportedRow[];}
 async assets(source:string){ensure(hash.safeParse(source).success,'INVALID_SOURCE');return (await this.pool.query('SELECT a.document FROM enterprise_workflow.import_assets a JOIN enterprise_workflow.import_batches b USING(enterprise_id,source_hash) WHERE a.enterprise_id=$1 AND a.source_hash=$2 AND b.active',[this.enterpriseId,source])).rows.map(r=>r.document) as z.infer<typeof asset>[];}
 async resolve(source:string,raw:unknown,subject:string){
  const cmd=z.strictObject({row:rowNo,parentRow:rowNo.nullable(),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(200)}).parse(raw);ensure(hash.safeParse(source).success,'INVALID_SOURCE');
  return this.tx(async c=>{const result=await c.query(`SELECT r.document,r.version FROM enterprise_workflow.import_rows r JOIN enterprise_workflow.import_batches b USING(enterprise_id,source_hash) WHERE r.enterprise_id=$1 AND r.source_hash=$2 AND r.row_number=$3 AND b.active FOR UPDATE OF r`,[this.enterpriseId,source,cmd.row]);const r=result.rows[0];ensure(r,'ROW_NOT_FOUND',404);ensure(r.version===cmd.expectedVersion,'VERSION_CONFLICT',409);ensure(r.document.parentLabel,'NOT_CHILD');ensure(cmd.parentRow===null||r.document.parentCandidates.includes(cmd.parentRow),'PARENT_NOT_CANDIDATE');
   const resolution=cmd.parentRow===null?null:{parentRow:cmd.parentRow,subject,reason:cmd.reason,at:new Date().toISOString()};
   await c.query('UPDATE enterprise_workflow.import_rows SET resolution=$4,version=version+1 WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3',[this.enterpriseId,source,cmd.row,resolution]);
   await c.query('INSERT INTO enterprise_workflow.import_audit(id,enterprise_id,source_hash,row_number,subject,operation,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),this.enterpriseId,source,cmd.row,subject,'resolve-parent',cmd]);return {version:r.version+1,resolution};
  });
 }
 async active(source:string,active:boolean,subject:string){ensure(hash.safeParse(source).success,'INVALID_SOURCE');return this.tx(async c=>{const r=await c.query('UPDATE enterprise_workflow.import_batches SET active=$3 WHERE enterprise_id=$1 AND source_hash=$2 RETURNING source_hash',[this.enterpriseId,source,active]);ensure(r.rowCount,'SOURCE_NOT_FOUND',404);await c.query('INSERT INTO enterprise_workflow.import_audit(id,enterprise_id,source_hash,subject,operation,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),this.enterpriseId,source,subject,'batch-active',{active}]);return {active};});}
}
