/** Operator-collected read model. No source credentials or source writes, not an employee login adapter. */
import {lstat,readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join,relative,resolve} from 'node:path';
import type {Pool} from 'pg';
import {z} from 'zod';
import {id,sourceAccountSubject,calendarDate,WorkflowError} from './contracts';
const hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().max(20000).nullable();
const ref=z.strictObject({instanceId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),enterpriseId:id,kind:z.string().min(1).max(80),id:z.string().min(1).max(1000)});
const amount=z.number().finite().nullable();
const record=z.object({ref,account:z.object({sourceKey:z.string(),email:sourceAccountSubject,name:z.string().nullable()}),createdAt:z.string().datetime(),title:text,prompt:text,status:text,operation:text,sourceLabel:text,provenance:text,
 taskRefs:z.object({imageJobId:text,canvasTaskId:text,videoTaskId:text,billingOperationId:text}),credits:z.object({quoted:amount,charged:amount,reserved:amount,delta:amount,refunded:amount.optional(),settled:z.boolean().nullable(),evidence:z.enum(['linked-ledger','ledger-entry','unrecorded'])}),ledgerKind:text,
 ownership:z.enum(['legacy-unconfirmed','frozen-tenant']),attribution:z.object({visibility:z.literal('current-enterprise-scope'),businessOwnership:z.literal('unconfirmed'),workflowTaskId:z.null()}),media:z.object({available:z.boolean(),href:z.string().nullable()})});
const limit=z.object({total:z.number().int().nonnegative(),truncated:z.boolean()});
const mediaFields={id:z.string().max(1000),email:sourceAccountSubject,mime:z.literal('image/webp'),sha256:hash};
const mediaItem=z.union([z.strictObject({...mediaFields,base64:z.string().max(1400000)}),z.strictObject({...mediaFields,file:hash}).refine(m=>m.file===m.sha256)]);
const dataSchema=z.object({version:z.literal(1),type:z.literal('enterprise-source-snapshot-v1'),instanceId:z.string(),enterpriseId:id,enterpriseName:z.string(),origin:z.string().url(),observedAt:z.string().datetime(),from:calendarDate,to:calendarDate,
 members:z.array(z.object({email:sourceAccountSubject,name:z.string().nullable()})).max(100),rows:z.object({artworks:z.array(record).max(1000),generations:z.array(record).max(1000),ledger:z.array(record).max(1000)}),limits:z.object({artworks:limit,generations:limit,ledger:limit}),sourceReadOnly:z.literal(true),sourceWrites:z.literal(0),
 media:z.array(mediaItem).max(1000).default([]),mediaRoot:z.string().refine(isAbsolute).optional()});
const querySchema=z.strictObject({op:z.enum(['context','members','records','media']),enterpriseId:id.optional(),kind:z.enum(['artworks','generations','ledger']).optional(),email:z.preprocess(v=>v===''?undefined:v,sourceAccountSubject.optional()),id:z.string().max(1000).optional(),from:calendarDate.optional(),to:calendarDate.optional(),page:z.coerce.number().int().min(1).max(10000).default(1)});
const ensure=(v:unknown,code:string,status=409):void=>{if(!v)throw new WorkflowError(status,code);};
export class LocalSourceSnapshot{
 constructor(private pool:Pool,private enterpriseId:string,private file?:string,private registry?:{instance:string;enterpriseId:string;enterpriseName:string;origin:string}){}
 private async load(){
  ensure(this.file,'LOCAL_SOURCE_SNAPSHOT_NOT_CONFIGURED',503);
  const info=await stat(this.file!).catch(()=>null);ensure(info?.isFile()&&info.size<=64*1024*1024,'LOCAL_SOURCE_SNAPSHOT_UNAVAILABLE',503);
  const raw=JSON.parse(await readFile(this.file!,'utf8'));ensure(typeof raw.sha256==='string'&&createHash('sha256').update(JSON.stringify(raw.data)).digest('hex')===raw.sha256,'SOURCE_SNAPSHOT_DIGEST_MISMATCH');
  const data=dataSchema.parse(raw.data),emails=new Set(data.members.map(m=>m.email));
  ensure(data.from<=data.to&&Date.parse(data.to)-Date.parse(data.from)<30*86400000&&emails.size===data.members.length,'SOURCE_SNAPSHOT_INVALID');
  const registry=this.registry||JSON.parse(await readFile(new URL('../../../docs/enterprise/config/source47-identity.json',import.meta.url),'utf8'));
  ensure(data.instanceId===registry.instance&&data.enterpriseId===registry.enterpriseId&&data.origin===registry.origin&&data.enterpriseName===registry.enterpriseName,'SOURCE_REGISTRY_MISMATCH');
  for(const kind of ['artworks','generations','ledger'] as const){const seen=new Set(),limits=data.limits[kind];ensure(limits.total>=data.rows[kind].length&&limits.truncated===(limits.total>data.rows[kind].length),'SOURCE_SNAPSHOT_COUNT_MISMATCH');for(const row of data.rows[kind]){const key=JSON.stringify(row.ref);ensure(row.ref.instanceId===data.instanceId&&row.ref.enterpriseId===data.enterpriseId&&emails.has(row.account.email)&&row.account.sourceKey===JSON.stringify([data.instanceId,row.account.email])&&!seen.has(row.ref.id+':'+row.ref.kind),'SOURCE_SNAPSHOT_SCOPE_MISMATCH');
    ensure(kind==='artworks'?row.ref.kind==='artwork':kind==='ledger'?row.ref.kind==='ledger':['image-job','canvas-task','video-task'].includes(row.ref.kind),'SOURCE_SNAPSHOT_KIND_MISMATCH');
    ensure(Date.parse(row.createdAt)>=Date.parse(data.from+'T00:00:00+08:00')&&Date.parse(row.createdAt)<Date.parse(data.to+'T00:00:00+08:00')+86400000,'SOURCE_SNAPSHOT_RECORD_DATE');seen.add(row.ref.id+':'+row.ref.kind);}}
  const artworks=new Set(data.rows.artworks.map(r=>JSON.stringify([r.account.email,r.ref.id]))),seenMedia=new Set<string>();
  for(const item of data.media){const key=JSON.stringify([item.email,item.id]);ensure(artworks.has(key)&&!seenMedia.has(key),'SOURCE_SNAPSHOT_MEDIA_SCOPE_MISMATCH');ensure(!('file' in item)||data.mediaRoot,'SOURCE_MEDIA_ROOT_REQUIRED');seenMedia.add(key);}
  const profiles=(await this.pool.query('SELECT person_id,real_name,nickname,source_subject FROM enterprise_workflow.person_profiles WHERE enterprise_id=$1 AND source_instance=$2 AND source_enterprise=$3 AND enabled',[this.enterpriseId,data.instanceId,data.enterpriseId])).rows;
  const people=new Map(profiles.map(p=>[p.source_subject,{id:p.person_id,realName:p.real_name,nickname:p.nickname}]));
  return {data,people,digest:raw.sha256};
 }
 private async mediaBytes(data:z.infer<typeof dataSchema>,item:z.infer<typeof mediaItem>){
  let bytes:Buffer;
  if('base64' in item)bytes=Buffer.from(item.base64,'base64');
  else{
   const root=resolve(data.mediaRoot!),file=join(root,item.file),rootInfo=await lstat(root).catch(()=>null),fileInfo=await lstat(file).catch(()=>null);
   ensure(rootInfo?.isDirectory()&&!rootInfo.isSymbolicLink()&&fileInfo?.isFile()&&!fileInfo.isSymbolicLink(),'SOURCE_MEDIA_UNAVAILABLE',503);
   const rootReal=await realpath(root).catch(()=>null),fileReal=await realpath(file).catch(()=>null);
   ensure(rootReal&&fileReal&&relative(rootReal,fileReal)===item.file,'SOURCE_MEDIA_PATH_INVALID');
   ensure(fileInfo!.size<=1024*1024,'SOURCE_MEDIA_DIGEST_MISMATCH');
   const content=await readFile(fileReal!).catch(()=>null);ensure(content,'SOURCE_MEDIA_UNAVAILABLE',503);bytes=content!;
  }
  ensure(bytes.length<=1024*1024&&createHash('sha256').update(bytes).digest('hex')===item.sha256,'SOURCE_MEDIA_DIGEST_MISMATCH');
  ensure(bytes.length>=12&&bytes.subarray(0,4).equals(Buffer.from('RIFF'))&&bytes.subarray(8,12).equals(Buffer.from('WEBP')),'SOURCE_MEDIA_INVALID_WEBP');
  return bytes;
 }
 async read(params:Record<string,string>){
  const q=querySchema.parse(params),{data,people,digest}=await this.load();
  if(q.op!=='context')ensure(q.enterpriseId===data.enterpriseId,'SOURCE_ENTERPRISE_NOT_FOUND',404);
  const mediaItems=data.media.filter(m=>people.has(m.email));
  const preview={transport:'local-snapshot',observedAt:data.observedAt,from:data.from,to:data.to,limits:data.limits,ownership:'legacy-unconfirmed-and-frozen-tenant',sha256:digest,sourceReadOnly:true,sourceWrites:0,loginVerified:false,media:{available:mediaItems.length>0,records:mediaItems.length,total:data.rows.artworks.filter(r=>people.has(r.account.email)).length}};
  if(q.op==='context')return {json:{version:1,source:'naumi',instanceId:data.instanceId,mode:'dedicated',viewer:{email:'local-owner@workflow.local',name:'本机项目管理员'},enterprises:[{id:data.enterpriseId,name:data.enterpriseName}],preview}};
  if(q.email)ensure(people.has(q.email)&&data.members.some(m=>m.email===q.email),'SOURCE_MEMBER_NOT_FOUND',404);
  if(q.op==='members')return {json:{enterprise:{id:data.enterpriseId,name:data.enterpriseName},members:data.members.filter(m=>people.has(m.email)).map(m=>({...m,person:people.get(m.email)})),preview}};
  if(q.op==='media'){
   const artwork=data.rows.artworks.find(r=>r.ref.id===q.id&&r.account.email===q.email&&people.has(r.account.email));
   ensure(artwork,'SOURCE_MEDIA_NOT_FOUND',404);const item=mediaItems.find(m=>m.id===q.id&&m.email===q.email);ensure(item,'SOURCE_MEDIA_NOT_COLLECTED',404);
   const bytes=await this.mediaBytes(data,item!);
   return {bytes,mime:'image/webp'};
  }
  ensure(q.kind,'SOURCE_KIND_REQUIRED',400);const from=q.from||data.from,to=q.to||data.to;
  ensure(from<=to&&from>=data.from&&to<=data.to,'SOURCE_SNAPSHOT_DATE_RANGE',400);
  const start=Date.parse(from+'T00:00:00+08:00'),end=Date.parse(to+'T00:00:00+08:00')+86400000;
  const rows=data.rows[q.kind!].filter(r=>people.has(r.account.email)&&(!q.email||r.account.email===q.email)&&Date.parse(r.createdAt)>=start&&Date.parse(r.createdAt)<end);
  const size=25,media=new Set(mediaItems.map(m=>JSON.stringify([m.email,m.id])));
  return {json:{version:1,source:'naumi',instanceId:data.instanceId,enterpriseId:data.enterpriseId,kind:q.kind,total:rows.length,page:q.page,size,generatedAt:data.observedAt,consistency:'source-read',attribution:'current-membership-not-historical-ownership',preview,
   rows:rows.slice((q.page-1)*size,q.page*size).map(r=>({...r,account:{...r.account,person:people.get(r.account.email)},media:{available:q.kind==='artworks'&&media.has(JSON.stringify([r.account.email,r.ref.id])),href:q.kind==='artworks'&&media.has(JSON.stringify([r.account.email,r.ref.id]))?'/api/enterprise/imports?'+new URLSearchParams({action:'source-snapshot',op:'media',enterpriseId:data.enterpriseId,email:r.account.email,id:r.ref.id}):null}}))}};
 }
}
