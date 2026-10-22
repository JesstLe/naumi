import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {currentCreationContext,creationId,type CreationContext} from './creation-context';
import {creationStatus} from './creation-contracts';
import {currentModelExecution} from '@/lib/model-config/context';
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const key=(...values:string[])=>createHash('sha256').update(values.join('\0')).digest('hex');
export async function creationEventTx(tx:PoolClient,id:string,eventKey:string,type:string,status:string,summary:string){
 await tx.query(`INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(creation_id,event_key) DO NOTHING`,[`ev-${key(id,eventKey)}`,id,eventKey,type,status,summary.slice(0,1000)]);
}
export async function creationLinkTx(tx:PoolClient,id:string,actor:string,type:string,target:string,relation='execution'){
 await tx.query(`INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id,relation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[id,actor,type,target,relation]);
}
export async function acceptCreationTx(tx:PoolClient,kind:string,sourceId:string,email:string,payload:unknown={},frozen?:CreationContext){
 const context=frozen||currentCreationContext();
 if(!context)return null; // Legacy recovery never derives a tenant from today's membership.
 if(context.actorEmail!==email.toLowerCase())throw new Error('创作操作者不一致');
 if(context.parentContext){
  await tx.query(`INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,$3,$4) ON CONFLICT DO NOTHING`,[email.toLowerCase(),context.parentContext,context.scopeKind,context.tenantId]);
  const frozen=(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2 FOR SHARE",[email.toLowerCase(),context.parentContext])).rows[0];
  if(frozen.scope_kind!==context.scopeKind||frozen.tenant_id!==context.tenantId)throw new Error('项目创作归属不一致');
 }
 const existing=(await tx.query('SELECT id,tenant_id,scope_kind FROM app_creation_records WHERE source_kind=$1 AND source_id=$2 AND actor_email=$3',[kind,sourceId,email.toLowerCase()])).rows[0];
 if(existing){if(existing.tenant_id!==context.tenantId||existing.scope_kind!==context.scopeKind)throw new Error('创作归属不一致');return existing.id as string;}
 const p=obj(payload),plan=obj(p.plan),request=obj(plan.request||obj(p.p).imagegen?.request),publicParams=publicCreationParameters(context.parameters||request.parameters||{});
 const prompt=context.requestText??request.prompt??obj(p.p).prompt??p.prompt;
 const id=creationId(),parent=context.creationId||null;
 const model=currentModelExecution('image')||currentModelExecution('text');const label=model?.frontendModel?.label;
 await tx.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,parent_id,request_snapshot,parameters_snapshot,model_snapshot)
 VALUES($1,$2,$3,$4,$2,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,[id,email.toLowerCase(),context.scopeKind,context.tenantId,kind,sourceId,parent,JSON.stringify(typeof prompt==='string'?{state:'recorded',text:prompt.slice(0,50000)}:{state:'not_recorded'}),JSON.stringify(Object.keys(publicParams).length?{state:'recorded',values:publicParams}:{state:'not_recorded'}),JSON.stringify(label?{state:'recorded',label,configVersion:model?.frozen.modelVersion}:{state:'not_recorded'})]);
 await creationEventTx(tx,id,'accepted','accepted','queued','已接受创作请求');
 await creationLinkTx(tx,id,email.toLowerCase(),kind,sourceId);
 // Each accepted request has one top-level record; child tools inherit its immutable ID.
 if(!parent)context.creationId=id;
 const refs=Array.isArray(request.inputs)?request.inputs:[];
 for(const [i,ref] of refs.entries())if(typeof ref.artworkId==='string'){
  const foreign=(await tx.query(`SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id WHERE l.target_type='artwork' AND l.target_id=$1 AND (c.actor_email<>$2 OR c.tenant_id IS NOT NULL AND c.tenant_id IS DISTINCT FROM $3::uuid) LIMIT 1`,[ref.artworkId,email.toLowerCase(),context.tenantId])).rows[0];
  if(foreign)throw new Error('不能直接引用其他企业的素材');
  await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'input',String(i))}`,direction:'input',role:String(ref.role||'reference'),position:i,variant:'original',storageRef:`artwork:${ref.artworkId}`});
 }
 const buffers=Array.isArray(obj(p.p).images)?obj(p.p).images:Array.isArray(p.images)?p.images:[];
 for(const [i,input] of buffers.entries()){const url=obj(obj(input).buf).$imageJobBuffer;if(typeof url==='string')await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'processed',String(i))}`,direction:'input',role:'reference',position:i,variant:'processed',storageRef:url});}
 return id;
}
export async function addCreationAssetTx(tx:PoolClient,id:string,email:string,a:{id?:string;direction:'input'|'output';role:string;position:number;variant?:string;storageRef:string;mime?:string;mediaType?:string;text?:string}){
 await tx.query(`INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,position,variant,storage_ref,mime,media_type,text_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(creation_id,direction,role,position,variant) DO NOTHING`,[a.id||`ca-${randomUUID()}`,id,email,a.direction,a.role,a.position,a.variant||'original',a.storageRef,a.mime||null,a.mediaType||'image',a.text||null]);
}
export function publicCreationParameters(value:unknown):Record<string,unknown>{
 const p=obj(value),allowed=['ratio','resolution','quality','count','quantity','size','seconds','mode','width','height','inputFidelity','moderation','format','compression','background','compressionMode','flattenColor','downscaleMaxDim'];
 const out:Record<string,unknown>={};for(const k of allowed)if(Object.hasOwn(p,k)&&['string','number','boolean'].includes(typeof p[k]))out[k]=typeof p[k]==='string'?p[k].slice(0,120):p[k];
 for(const k of ['parameters','output','intent'])if(p[k]&&typeof p[k]==='object'){const nested=publicCreationParameters(p[k]);if(Object.keys(nested).length)out[k]=nested;}
 return out;
}
export async function attachBillingCreationTx(tx:PoolClient,id:string,email:string,feature:string,reserved:number){
 const context=currentCreationContext();if(!context)return;
 const record=context.creationId||await acceptCreationTx(tx,feature,id,email);if(record){await creationLinkTx(tx,record,email,'billing',id);await tx.query("UPDATE app_creation_links SET reserved_credits=$3 WHERE creation_id=$1 AND target_type='billing' AND target_id=$2",[record,id,reserved]);}
}
export async function recordImageStateTx(tx:PoolClient,jobId:string,snapshot:unknown){
 const rows=(await tx.query("SELECT c.id,c.actor_email FROM app_creation_records c JOIN app_creation_links l ON l.creation_id=c.id WHERE l.target_id=$1 AND l.target_type LIKE 'image:%'",[jobId])).rows;
 const s=obj(snapshot),result=obj(s.result),status=creationStatus(result.status||s.status);
 for(const row of rows){
  await tx.query('UPDATE app_creation_records SET status=$2,updated_at=now() WHERE id=$1',[row.id,status]);
  await creationEventTx(tx,row.id,`state:${status}:${String(result.stage||s.stage||'')}`,'execution',status,status==='needs_review'?'执行结果需要核查':`任务状态：${status}`);
  const works=Array.isArray(result.artifacts)?result.artifacts:Array.isArray(s.images)?s.images:Array.isArray(s.shots)?s.shots:[];
  for(const [i,work] of works.entries()){const target=work.artworkId||work.id;if(typeof target==='string'){
   await creationLinkTx(tx,row.id,row.actor_email,'artwork',target,'output');
   await addCreationAssetTx(tx,row.id,row.actor_email,{id:`ca-${key(row.id,'output',target)}`,direction:'output',role:'result',position:i,storageRef:`artwork:${target}`});
  }}
 }
}
