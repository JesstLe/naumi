import {SourceWorksheetStore} from './source-worksheet-store';
import {randomUUID} from 'node:crypto';
import {openSourceFile} from './source-files';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {WorkflowError,type Principal,type Actor} from './contracts';
import type {ResolveActor} from './store';
const hash=z.string().regex(/^[a-f0-9]{64}$/),rowNo=z.number().int().min(2).max(10001);
const confirmation=z.strictObject({row:rowNo,parentRow:rowNo.nullable(),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(200)});
function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}

/** Formal employee access, deliberately separate from the local preparation adapter. */
export class FormalImportStore{
 readonly worksheet:SourceWorksheetStore;
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private roots:Record<string,string>={}){this.worksheet=new SourceWorksheetStore(pool,async(c,p)=>{const a=await resolveActor(c,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId&&a.permissions.includes('manage'),'FORBIDDEN',403);ensure((await c.query('SELECT 1 FROM enterprise_workflow.person_directory_admins WHERE enterprise_id=$1 AND subject=$2 AND enabled FOR SHARE',[p.enterpriseId,p.subject])).rowCount===1,'DIRECTORY_ADMIN_REQUIRED',403);});}
 private async tx<T>(p:Principal,fn:(c:PoolClient,a:Actor)=>Promise<T>){const c=await this.pool.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
  const a=await this.resolveActor(c,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId&&a.permissions.includes('manage'),'FORBIDDEN',403);
  ensure((await c.query('SELECT 1 FROM enterprise_workflow.person_directory_admins WHERE enterprise_id=$1 AND subject=$2 AND enabled FOR SHARE',[p.enterpriseId,p.subject])).rowCount===1,'DIRECTORY_ADMIN_REQUIRED',403);
  const result=await fn(c,a);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async batch(c:PoolClient,p:Principal,source:string){hash.parse(source);const r=await c.query('SELECT document FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2 AND active FOR SHARE',[p.enterpriseId,source]);ensure(r.rowCount===1,'SOURCE_NOT_FOUND',404);return r.rows[0].document;}
 async context(p:Principal){return this.tx(p,async(c,a)=>({mode:'employee',viewer:a.subject,workflowPromotion:a.permissions.includes('request'),batches:(await c.query('SELECT source_hash,document,created_at FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND active ORDER BY created_at DESC,source_hash',[p.enterpriseId])).rows.map(r=>({sourceHash:r.source_hash,sheet:r.document.sheet,headers:r.document.headers,summary:r.document.summary,createdAt:r.created_at}))}));}
 async rows(p:Principal,source:string){return this.tx(p,async c=>{await this.batch(c,p,source);const rows=(await c.query('SELECT document,version,resolution FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 ORDER BY row_number',[p.enterpriseId,source])).rows.map(r=>({...r.document,version:r.version,resolution:r.resolution}));const assets=(await c.query('SELECT document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2 ORDER BY asset_id',[p.enterpriseId,source])).rows.map(r=>{const {path:_,...a}=r.document;return a;});return {rows,assets};});}
 async confirm(p:Principal,source:string,raw:unknown){const cmd=confirmation.parse(raw);return this.tx(p,async c=>{await this.batch(c,p,source);const r=(await c.query('SELECT document,version FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3 FOR UPDATE',[p.enterpriseId,source,cmd.row])).rows[0];ensure(r,'ROW_NOT_FOUND',404);ensure(r.version===cmd.expectedVersion,'VERSION_CONFLICT');ensure(r.document.parentLabel,'NOT_CHILD',400);ensure(cmd.parentRow===null||r.document.parentCandidates.includes(cmd.parentRow),'PARENT_NOT_CANDIDATE',400);
  const resolution=cmd.parentRow===null?null:{parentRow:cmd.parentRow,subject:p.subject,reason:cmd.reason,at:new Date().toISOString()};await c.query('UPDATE enterprise_workflow.import_rows SET resolution=$4,version=version+1 WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3',[p.enterpriseId,source,cmd.row,resolution]);await c.query('INSERT INTO enterprise_workflow.import_audit(id,enterprise_id,source_hash,row_number,subject,operation,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),p.enterpriseId,source,cmd.row,p.subject,'resolve-parent',cmd]);return {version:r.version+1,resolution};});}
 async asset(p:Principal,source:string,id:string,download:boolean){hash.parse(id);
  // Read and verify through one descriptor, then reauthorize before returning bytes.
  const a=await this.tx(p,async c=>{await this.batch(c,p,source);const r=(await c.query('SELECT document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2 AND asset_id=$3',[p.enterpriseId,source,id])).rows[0];ensure(r,'ASSET_NOT_FOUND',404);return r.document;});
  return openSourceFile(this.roots[p.enterpriseId],a,download,async()=>{await this.tx(p,async c=>{await this.batch(c,p,source);});});
 }
}
