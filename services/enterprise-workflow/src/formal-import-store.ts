import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {WorkflowError,type Principal,type Actor} from './contracts';
import type {ResolveActor} from './store';
const hash=z.string().regex(/^[a-f0-9]{64}$/),rowNo=z.number().int().min(2).max(10001);
const confirmation=z.strictObject({row:rowNo,parentRow:rowNo.nullable(),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(200)});
function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}

/** Formal employee access, deliberately separate from the local preparation adapter. */
export class FormalImportStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private roots:Record<string,string>={}){}
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
  const root=this.roots[p.enterpriseId];ensure(root,'SOURCE_STORAGE_NOT_CONFIGURED',503);ensure(isAbsolute(root)&&hash.safeParse(a.sha256).success&&Number.isSafeInteger(a.bytes)&&a.bytes>=0&&a.bytes<=1024**3,'SOURCE_FILE_INVALID',503);
  let f;try{const rootStat=await lstat(root);ensure(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'SOURCE_ROOT_INVALID',503);const canonical=await realpath(root),path=join(canonical,a.sha256),st=await lstat(path);ensure(st.isFile()&&!st.isSymbolicLink()&&resolve(await realpath(path))===resolve(path),'SOURCE_FILE_INVALID',503);f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const actual=await f.stat();ensure(actual.isFile()&&actual.size===a.bytes,'SOURCE_FILE_INVALID',503);const h=createHash('sha256'),head=Buffer.alloc(12),buffer=Buffer.alloc(64*1024);let pos=0;
   for(;;){const {bytesRead}=await f.read(buffer,0,buffer.length,pos);if(!bytesRead)break;if(pos===0)buffer.copy(head,0,0,Math.min(head.length,bytesRead));h.update(buffer.subarray(0,bytesRead));pos+=bytesRead;ensure(pos<=a.bytes,'SOURCE_FILE_INVALID',503);}ensure(pos===a.bytes&&h.digest('hex')===a.sha256,'SOURCE_FILE_HASH_MISMATCH',503);
   await this.tx(p,async c=>{await this.batch(c,p,source);});
   const png=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=head[0]===255&&head[1]===216&&head[2]===255,inline=!download&&(png||jpeg),mime=inline?(png?'image/png':'image/jpeg'):'application/octet-stream';return {asset:a,stream:f.createReadStream({start:0,autoClose:true}),mime,inline};
  }catch(e){await f?.close();if(e instanceof WorkflowError)throw e;throw new WorkflowError(503,'SOURCE_FILE_UNAVAILABLE');}
 }
}
