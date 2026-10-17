import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {link,unlink,open,lstat,readdir,rmdir,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {id,WorkflowError,type Actor,type Principal,type WorkOrder} from './contracts';
import {canRead} from './domain';
import type {ResolveActor} from './store';
import {DeliveryStore} from './delivery-store';
import {deliveryDirectory,verifiedPath} from './delivery-files';
import {deliveryUsage,multipartInstalled} from './delivery-quota';
import {uploadSessionSchema,PART_BYTES,MAX_MULTIPART_BYTES,partBytes} from './multipart-contracts';

type Session={enterprise_id:string;id:string;team_id:string;subject:string;identity_hash:string;order_id:string;task_id:string;name:string;bytes:string|number;manifest:string[];fingerprint:string;state:'open'|'completed'|'cancelled'|'expired';reserved_bytes:string|number;final_sha256:string|null;expires_at:Date;created_at:Date;completed_at:Date|null};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const identity=(p:Principal)=>digest([p.enterpriseId,p.teamId,p.subject,p.sourceBinding?.sourceInstance??null,p.sourceBinding?.sourceEnterprise??null,p.sourceBinding?.sourceSubject??null]);
function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}
const busy=new WeakMap<Pool,number>();
const listSchema=z.strictObject({orderId:id,taskId:id,page:z.coerce.number().int().min(1).max(10000).default(1)});
export class MultipartStore{
 constructor(readonly delivery:DeliveryStore,private resolveActor:ResolveActor,private now=()=>new Date()){}
 private get pool(){return this.delivery.pool;}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>,client?:PoolClient){
  const tx=client??await this.pool.connect();try{
   await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");
   ensure(await multipartInstalled(tx),'UPLOAD_MIGRATION_REQUIRED',503);
   const a=await this.resolveActor(tx,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId&&a.subject===p.subject,'MEMBERSHIP_REQUIRED',403);
   const result=await fn(tx,a);await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{if(!client)tx.release();}
 }
 private ioKey(enterprise:string,sessionId:string){return `upload-io:${enterprise}:${sessionId}`;}
 // Shared session locks protect disk IO across processes without a long DB transaction.
 // Cleanup only tries an exclusive lock; cancellation can commit during an active transfer.
 private async io<T>(p:Principal,sessionId:string,fn:(client:PoolClient)=>Promise<T>){
  id.parse(sessionId);id.parse(p.enterpriseId);const n=busy.get(this.pool)??0;ensure(n<2,'UPLOAD_BUSY',429);busy.set(this.pool,n+1);
  let client:PoolClient|undefined;try{client=await this.pool.connect();ensure((await client.query('SELECT pg_try_advisory_lock_shared(hashtextextended($1,0)) ok',[this.ioKey(p.enterpriseId,sessionId)])).rows[0].ok,'UPLOAD_BUSY',429);return await fn(client);}
  finally{try{if(client){try{await client.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,0))',[this.ioKey(p.enterpriseId,sessionId)]);client.release();}catch{client.release(true);}}}finally{busy.set(this.pool,(busy.get(this.pool)??1)-1);}}
 }
 private async locks(tx:PoolClient,enterprise:string,orderId:string,sessionId:string){
  for(const key of [`order:${enterprise}:${orderId}`,`asset:${enterprise}:${sessionId}`])await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
 }
 private async order(tx:PoolClient,a:Actor,orderId:string){
  const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,orderId])).rows[0]?.document as WorkOrder|undefined;
  ensure(o&&canRead(a,o),'NOT_FOUND',404);return o;
 }
 private writable(a:Actor,o:WorkOrder,taskId:string,version?:number){
  ensure(a.teamId===o.teamId,'EXECUTION_TEAM_REQUIRED',403);const t=o.tasks.find(t=>t.id===taskId);
  ensure(t&&t.assignee===a.subject&&a.permissions.includes('execute')&&a.workKinds.includes(t.kind),'ASSET_UPLOAD_FORBIDDEN',403);
  ensure(o.status==='active'&&t.status==='in_progress','UPLOAD_REQUIRES_IN_PROGRESS');ensure(!t.pendingHandover,'HANDOVER_PENDING');
  if(version!==undefined)ensure(o.version===version,'VERSION_CONFLICT');
 }
 private owner(p:Principal,s:Session){ensure(s.subject===p.subject&&s.team_id===p.teamId&&s.identity_hash===identity(p),'UPLOAD_NOT_FOUND',404);}
 private active(s:Session){ensure(s.state==='open','UPLOAD_NOT_OPEN');ensure(+new Date(s.expires_at)>+this.now(),'UPLOAD_EXPIRED');}
 private async session(tx:PoolClient,a:Actor,sessionId:string,write=false){
  let s=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,sessionId])).rows[0] as Session|undefined;
  ensure(s,'UPLOAD_NOT_FOUND',404);this.owner(a,s);
  if(write)await this.locks(tx,a.enterpriseId,s.order_id,sessionId);
  const o=await this.order(tx,a,s.order_id);
  if(write){s=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND id=$2 FOR UPDATE',[a.enterpriseId,sessionId])).rows[0] as Session;this.owner(a,s);}
  return {s,o};
 }
 private async directory(s:Session,create=false){const tmp=await deliveryDirectory(this.delivery.root,'.tmp',create),tenant=await deliveryDirectory(tmp,s.enterprise_id,create);return deliveryDirectory(tenant,s.id,create);}
 private partName(s:Session,index:number){return `part_${index}_${s.manifest[index]}`;}
 private async audit(tx:PoolClient,s:Session,subject:string,operation:string,detail:unknown){await tx.query('INSERT INTO enterprise_workflow.delivery_upload_audit(enterprise_id,session_id,subject,operation,detail)VALUES($1,$2,$3,$4,$5)',[s.enterprise_id,s.id,subject,operation,detail]);}
 private async dto(tx:PoolClient,s:Session){
  const parts=(await tx.query('SELECT part,sha256,bytes FROM enterprise_workflow.delivery_upload_parts WHERE enterprise_id=$1 AND session_id=$2 ORDER BY part',[s.enterprise_id,s.id])).rows;
  return {id:s.id,orderId:s.order_id,taskId:s.task_id,name:s.name,bytes:Number(s.bytes),parts:s.manifest,received:parts.map(p=>p.part as number),receivedBytes:parts.reduce((sum,p)=>sum+Number(p.bytes),0),state:s.state,expired:s.state==='open'&&+new Date(s.expires_at)<=+this.now(),expiresAt:new Date(s.expires_at).toISOString(),createdAt:new Date(s.created_at).toISOString(),sha256:s.final_sha256,cleanupPending:s.state!=='open'&&Number(s.reserved_bytes)>0,reservedBytes:Number(s.reserved_bytes)};
 }
 async create(p:Principal,raw:unknown){const c=uploadSessionSchema.parse(raw),fingerprint=digest(c);return this.tx(p,async(tx,a)=>{
  await this.locks(tx,a.enterpriseId,c.orderId,c.sessionId);const o=await this.order(tx,a,c.orderId);
  const prior=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND id=$2 FOR UPDATE',[a.enterpriseId,c.sessionId])).rows[0] as Session|undefined;
  if(prior){this.owner(a,prior);ensure(prior.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT');return {session:await this.dto(tx,prior),replayed:true};}
  this.writable(a,o,c.taskId,c.expectedVersion);
  ensure(!(await tx.query('SELECT 1 FROM enterprise_workflow.delivery_assets WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.sessionId])).rowCount,'IDEMPOTENCY_CONFLICT');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`asset-quota:${a.enterpriseId}`]);
  const counts=(await tx.query("SELECT count(*) n,count(*) FILTER(WHERE subject=$2) own FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND state='open'",[a.enterpriseId,a.subject])).rows[0];ensure(Number(counts.own)<2&&Number(counts.n)<4,'UPLOAD_SESSION_LIMIT',429);
  const {used,reserved}=await deliveryUsage(tx,a.enterpriseId);ensure(used+reserved+c.bytes<=this.delivery.tenantQuota,'ASSET_QUOTA_EXCEEDED',413);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['multipart-disk-reservations']);
  const allReserved=Number((await tx.query('SELECT COALESCE(sum(reserved_bytes),0) n FROM enterprise_workflow.delivery_upload_sessions')).rows[0].n);
  await deliveryDirectory(this.delivery.root,'.tmp',true);const disk=await statfs(this.delivery.root);ensure(disk.bavail*disk.bsize>=(allReserved+c.bytes)*3+64*1024*1024,'UPLOAD_DISK_SPACE_LOW',507);
  const s=(await tx.query('INSERT INTO enterprise_workflow.delivery_upload_sessions(enterprise_id,id,team_id,subject,identity_hash,order_id,task_id,name,bytes,manifest,fingerprint,reserved_bytes,expires_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$9,$12) RETURNING *',[a.enterpriseId,c.sessionId,a.teamId,a.subject,identity(a),c.orderId,c.taskId,c.name,c.bytes,JSON.stringify(c.parts),fingerprint,new Date(+this.now()+86400000)])).rows[0] as Session;
  const dir=await this.directory(s,true);ensure((await readdir(dir)).length===0,'UPLOAD_STORAGE_OCCUPIED');await this.audit(tx,s,a.subject,'create',{bytes:c.bytes,parts:c.parts.length,expectedVersion:c.expectedVersion});return {session:await this.dto(tx,s),replayed:false};
 });}
 async get(p:Principal,sessionId:string){id.parse(sessionId);return this.tx(p,async(tx,a)=>({session:await this.dto(tx,(await this.session(tx,a,sessionId)).s)}));}
 async list(p:Principal,raw:unknown){const q=listSchema.parse(raw);return this.tx(p,async(tx,a)=>{
  const o=await this.order(tx,a,q.orderId);ensure(o.tasks.some(t=>t.id===q.taskId),'TASK_NOT_FOUND',404);
  const args=[a.enterpriseId,a.teamId,a.subject,identity(a),q.orderId,q.taskId];const where='enterprise_id=$1 AND team_id=$2 AND subject=$3 AND identity_hash=$4 AND order_id=$5 AND task_id=$6';
  const rows=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_sessions WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET $7',[...args,(q.page-1)*30])).rows as Session[];
  return {sessions:await Promise.all(rows.map(s=>this.dto(tx,s))),total:Number((await tx.query('SELECT count(*) n FROM enterprise_workflow.delivery_upload_sessions WHERE '+where,args)).rows[0].n),page:q.page,pageSize:30,partBytes:PART_BYTES,maxBytes:MAX_MULTIPART_BYTES};
 });}
 async put(p:Principal,sessionId:string,index:number,input:AsyncIterable<Uint8Array>|Iterable<Uint8Array>){
  z.number().int().min(0).max(127).parse(index);return this.io(p,sessionId,async client=>{
   const s=await this.tx(p,async(tx,a)=>{const {s,o}=await this.session(tx,a,sessionId);this.active(s);this.writable(a,o,s.task_id);ensure(index<s.manifest.length,'INVALID_PART',400);return s;},client);
   const dir=await this.directory(s),tmp=join(dir,'tmp_'+randomUUID()),expected=partBytes(Number(s.bytes),index);let seen=0;const hash=createHash('sha256');
   try{
    const meter=new Transform({transform(chunk,_enc,done){seen+=chunk.length;if(seen>expected)return done(new WorkflowError(413,'PART_SIZE_MISMATCH'));hash.update(chunk);done(null,chunk);}});
    await pipeline(Readable.from(input),meter,createWriteStream(tmp,{flags:'wx',mode:0o600}));ensure(seen===expected,'PART_SIZE_MISMATCH',400);ensure(hash.digest('hex')===s.manifest[index],'PART_HASH_MISMATCH',400);
    const handle=await open(tmp,'r+');try{await handle.sync();}finally{await handle.close();}
    return await this.tx(p,async(tx,a)=>{
     const current=await this.session(tx,a,sessionId,true);this.active(current.s);this.writable(a,current.o,s.task_id);
     const prior=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_parts WHERE enterprise_id=$1 AND session_id=$2 AND part=$3',[a.enterpriseId,sessionId,index])).rows[0];const target=join(await this.directory(s),this.partName(s,index));
     if(prior){ensure(prior.sha256===s.manifest[index]&&Number(prior.bytes)===expected,'PART_RECEIPT_CONFLICT');const h=await verifiedPath(target,s.manifest[index],expected);await h.close();return {part:index,replayed:true};}
     try{await link(tmp,target);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const h=await verifiedPath(target,s.manifest[index],expected);await h.close();}
     await tx.query('INSERT INTO enterprise_workflow.delivery_upload_parts(enterprise_id,session_id,part,sha256,bytes)VALUES($1,$2,$3,$4,$5)',[a.enterpriseId,sessionId,index,s.manifest[index],expected]);await this.audit(tx,s,a.subject,'part',{part:index,sha256:s.manifest[index],bytes:expected});return {part:index,replayed:false};
    },client);
   }finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  });
 }
 async complete(p:Principal,sessionId:string,expectedVersion:number){
  z.number().int().positive().parse(expectedVersion);
  const result=await this.io(p,sessionId,async client=>{
   const s=await this.tx(p,async(tx,a)=>{const {s,o}=await this.session(tx,a,sessionId);if(s.state!=='completed'){this.active(s);this.writable(a,o,s.task_id,expectedVersion);}return s;},client);
   const command={assetId:sessionId,orderId:s.order_id,taskId:s.task_id,expectedVersion,name:s.name};
   if(s.state==='completed')return this.delivery.multipartReplay(p,command,async(tx,a)=>{const current=await this.session(tx,a,sessionId);ensure(current.s.state==='completed','UPLOAD_NOT_COMPLETED');});
   const rows=await this.tx(p,async(tx,a)=>{await this.session(tx,a,sessionId);return (await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_parts WHERE enterprise_id=$1 AND session_id=$2 ORDER BY part',[a.enterpriseId,sessionId])).rows;},client);
   ensure(rows.length===s.manifest.length&&rows.every((r,i)=>r.part===i&&r.sha256===s.manifest[i]&&Number(r.bytes)===partBytes(Number(s.bytes),i)),'UPLOAD_PARTS_MISSING');
   const dir=await this.directory(s),self=this;
   const input=async function*(){for(let i=0;i<s.manifest.length;i++){const handle=await verifiedPath(join(dir,self.partName(s,i)),s.manifest[i],partBytes(Number(s.bytes),i));try{const hash=createHash('sha256');let seen=0;for await(const b of handle.createReadStream({start:0,autoClose:false})){hash.update(b);seen+=b.length;ensure(seen<=partBytes(Number(s.bytes),i),'PART_SIZE_MISMATCH');yield b;}ensure(seen===partBytes(Number(s.bytes),i)&&hash.digest('hex')===s.manifest[i],'PART_HASH_MISMATCH');}finally{await handle.close();}}};
   return this.delivery.uploadMultipart(p,command,input(),{
    sessionId,directory:()=>this.directory(s),
    authorize:async(tx,a,final)=>{const {s:current,o}=await this.session(tx,a,sessionId,final);if(current.state!=='completed'){this.active(current);this.writable(a,o,current.task_id,expectedVersion);}},
    completed:async(tx,a,asset)=>{const {s:current,o}=await this.session(tx,a,sessionId,true);this.active(current);this.writable(a,o,current.task_id,expectedVersion);ensure(asset.bytes===Number(current.bytes),'UPLOAD_BYTES_CHANGED');await tx.query("UPDATE enterprise_workflow.delivery_upload_sessions SET state='completed',final_sha256=$3,completed_at=$4 WHERE enterprise_id=$1 AND id=$2",[a.enterpriseId,sessionId,asset.sha256,this.now()]);await this.audit(tx,current,a.subject,'complete',{assetId:asset.id,sha256:asset.sha256,bytes:asset.bytes,expectedVersion});}
   });
  });
  // Cleanup failure never changes a successfully committed candidate into a failed upload.
  let cleanupPending=true;try{cleanupPending=(await this.cleanup(p,sessionId)).session.cleanupPending;}catch{}
  return {...result,cleanupPending};
 }
 async cancel(p:Principal,sessionId:string){id.parse(sessionId);await this.tx(p,async(tx,a)=>{const {s}=await this.session(tx,a,sessionId,true);ensure(s.state!=='completed','UPLOAD_ALREADY_COMPLETED');if(s.state==='open'){await tx.query("UPDATE enterprise_workflow.delivery_upload_sessions SET state='cancelled',reason='owner-cancel' WHERE enterprise_id=$1 AND id=$2",[a.enterpriseId,sessionId]);await this.audit(tx,s,a.subject,'cancel',{});}});return this.cleanup(p,sessionId);}
 private async cleanIn(tx:PoolClient,s:Session,subject:string){
  ensure(s.state!=='open','UPLOAD_NOT_ENDED');if(Number(s.reserved_bytes)===0)return;
  const held=(await tx.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) ok',[this.ioKey(s.enterprise_id,s.id)])).rows[0].ok;
  if(!held)return; // An in-flight writer still owns its files; quota stays reserved.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`asset-quota:${s.enterprise_id}`]);
  // Do not create a missing directory while cleaning. A missing leaf is valid after a
  // crash between rmdir and commit. Existing parents must still pass link checks.
  const tmp=await deliveryDirectory(this.delivery.root,'.tmp'),tenant=await deliveryDirectory(tmp,s.enterprise_id),path=join(tenant,s.id);
  const exists=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(exists){const dir=await this.directory(s),names=await readdir(dir);const recognized=new Set(s.manifest.map((_,i)=>this.partName(s,i)));
   for(const name of names){const st=await lstat(join(dir,name));if(!st.isFile()||st.isSymbolicLink()||(!recognized.has(name)&&!(name.startsWith('tmp_')&&id.safeParse(name.slice(4)).success))){await this.audit(tx,s,subject,'cleanup-pending',{reason:'UNRECOGNIZED_STAGING_ENTRY'});return;}}
   for(const name of names)await unlink(join(dir,name));await rmdir(dir);
  }
  await tx.query('UPDATE enterprise_workflow.delivery_upload_sessions SET reserved_bytes=0 WHERE enterprise_id=$1 AND id=$2',[s.enterprise_id,s.id]);s.reserved_bytes=0;await this.audit(tx,s,subject,'cleanup',{releasedBytes:Number(s.bytes)});
 }
 async cleanup(p:Principal,sessionId:string){id.parse(sessionId);return this.tx(p,async(tx,a)=>{const {s}=await this.session(tx,a,sessionId,true);if(s.state==='open'&&+new Date(s.expires_at)<=+this.now()){await tx.query("UPDATE enterprise_workflow.delivery_upload_sessions SET state='expired',reason='expired' WHERE enterprise_id=$1 AND id=$2",[a.enterpriseId,sessionId]);s.state='expired';await this.audit(tx,s,a.subject,'expire',{});}await this.cleanIn(tx,s,a.subject);return {session:await this.dto(tx,s)};});}
 // Internal maintenance method. Runtime CLI must authenticate installation/config and
 // the explicit allowed enterprise before calling. Never expose it on employee HTTP.
 async expireAndClean(enterpriseId:string,limit:number,reason:string){id.parse(enterpriseId);z.number().int().min(1).max(20).parse(limit);z.string().trim().min(3).max(200).parse(reason);
  const rows=(await this.pool.query("SELECT id,order_id FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND reserved_bytes>0 AND (state<>'open' OR expires_at<=$2) ORDER BY created_at,id LIMIT $3",[enterpriseId,this.now(),limit])).rows;const results=[];
  for(const row of rows){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");await this.locks(tx,enterpriseId,row.order_id,row.id);const s=(await tx.query('SELECT * FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND id=$2 FOR UPDATE',[enterpriseId,row.id])).rows[0] as Session;
    if(s.state==='open'&&+new Date(s.expires_at)<=+this.now()){await tx.query("UPDATE enterprise_workflow.delivery_upload_sessions SET state='expired',reason=$3 WHERE enterprise_id=$1 AND id=$2",[enterpriseId,s.id,reason]);s.state='expired';await this.audit(tx,s,'system-expiry','expire',{reason});}
    await this.cleanIn(tx,s,'system-expiry');await tx.query('COMMIT');results.push({id:s.id,cleanupPending:Number(s.reserved_bytes)>0});
   }catch{await tx.query('ROLLBACK');results.push({id:row.id,cleanupPending:true});}finally{tx.release();}}
  return {processed:results.length,results};
 }
}
