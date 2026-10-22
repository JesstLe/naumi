import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getPool,dbEnabled} from '@/lib/db';
import {enterpriseCreationRead} from '@/lib/enterprise/server';
import {TeamError} from '@/lib/teams/server';
import {ensureCreationSchema} from './creation-schema';
import {settingsSecret} from '@/lib/settings-secret';
import {requestRequirement,TOOL_ACCESS,allows,type AccessPolicy} from '@/lib/feature-access/catalog';
import {userFeaturePolicy} from '@/lib/feature-access/server';

export type CreationContext={actorEmail:string;scopeKind:'personal'|'tenant';tenantId:string|null;creationId?:string;requestText?:string;parameters?:Record<string,unknown>;sourcePath?:string;parentContext?:string;evidencePending?:boolean;originalInputs?:{storageRef:string;mime:string;role:string;position:number}[]};
const storage=new AsyncLocalStorage<CreationContext>();
export const currentCreationContext=()=>storage.getStore();
export function withFrozenCreation<T>(value:CreationContext|undefined,run:()=>Promise<T>){return value?storage.run(value,run):run();}
export function frozenCreationScope(value:unknown,email?:string):CreationContext|undefined {
 const parsed=z.object({actorEmail:z.string().min(1).max(254),scopeKind:z.enum(['personal','tenant']),tenantId:z.string().uuid().nullable(),creationId:z.string().max(200).optional(),requestText:z.string().max(50000).optional(),parameters:z.record(z.string(),z.unknown()).optional(),sourcePath:z.string().optional(),parentContext:z.string().max(240).optional()}).safeParse(value);
 if(!parsed.success)return undefined;const c=parsed.data;if(email&&c.actorEmail!==email.toLowerCase()||(c.scopeKind==='tenant')!==(c.tenantId!==null))throw new TeamError('冻结创作归属无效',409);return c;
}
export function assertCreationFeature(policy:Record<string,boolean>,path:string,method='POST',tool?:string,accountPolicy?:AccessPolicy) {
 const requirement=requestRequirement(path,method),effective=(id:string)=>policy[id]!==false&&(!accountPolicy||allows(accountPolicy,id));
 // Intersect account and tenant capability first, then preserve the catalogue's
 // shared-endpoint alternatives. A request body never grants a capability.
 if(policy.creation===false||(requirement?.all||[]).some(id=>!effective(id))||requirement?.any&&!requirement.any.some(effective)||tool&&TOOL_ACCESS[tool]&&!effective(TOOL_ACCESS[tool]))throw new TeamError('企业创作权益已关闭',403);
}
export async function bindCreationParent(context:CreationContext,id:string) {
 if(!dbEnabled)return context;
 if(id.length>240||!/^[a-zA-Z0-9_:.\-]+$/.test(id))throw new TeamError('项目上下文无效',400);
 await ensureCreationSchema();
 const old=(await getPool().query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[context.actorEmail,id])).rows[0];
 if(old&&(old.scope_kind!==context.scopeKind||old.tenant_id!==context.tenantId))throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
 context.parentContext=id;return context;
}
export async function bindCreationMedia(email:string,reference:string) {
 const scope=currentCreationContext();if(!dbEnabled||!scope)return;
 if(scope.actorEmail!==email.toLowerCase())throw new TeamError('素材操作者不一致',403);
 await ensureCreationSchema();
 await getPool().query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,$3,$4) ON CONFLICT DO NOTHING",[scope.actorEmail,reference,scope.scopeKind,scope.tenantId]);
 const old=(await getPool().query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[scope.actorEmail,reference])).rows[0];
 if(old?.scope_kind==='tenant'&&old.tenant_id!==scope.tenantId)throw new TeamError('不能引用其他企业的素材',403);
}
export function creationContinuationHeader():Record<string,string>{const c=currentCreationContext();if(!c?.creationId)return {};const value=Buffer.from(JSON.stringify({actor:c.actorEmail,id:c.creationId})).toString('base64url');return {'x-naumi-creation-context':`${value}.${createHmac('sha256',settingsSecret()).update(value).digest('hex')}`};}
/** Never buffer unbounded media JSON before the owning route enforces its limit. */
async function boundedSummary(request:Request):Promise<Record<string,any>|null>{
 if(Number(request.headers.get('content-length')||0)>65536)return null;
 const reader=request.clone().body?.getReader();if(!reader)return null;const parts:Uint8Array[]=[];let bytes=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536)return null;parts.push(chunk.value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return null;}finally{void reader.cancel().catch(()=>{});}
}
export async function withCreationRequest<T extends Response>(request:Request,email:string,run:()=>Promise<T>):Promise<T>{
 if(!dbEnabled||request.method==='GET')return run();
 if(storage.getStore())return run();
 await ensureCreationSchema();
 const continuation=request.headers.get('x-naumi-creation-context');
 if(continuation){
  const [value,mac]=continuation.split('.'),expected=createHmac('sha256',settingsSecret()).update(value||'').digest('hex');
  if(!value||!/^[a-f0-9]{64}$/.test(mac||'')||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw new TeamError('创作上下文无效',403);
  const parsed=JSON.parse(Buffer.from(value,'base64url').toString());
  const row=(await getPool().query('SELECT id,actor_email,scope_kind,tenant_id FROM app_creation_records WHERE id=$1 AND actor_email=$2',[parsed.id,email.toLowerCase()])).rows[0];
  if(!row||parsed.actor!==email.toLowerCase())throw new TeamError('创作上下文无效',403);
  return storage.run({actorEmail:row.actor_email,scopeKind:row.scope_kind,tenantId:row.tenant_id,creationId:row.id},run);
 }
 let body:Record<string,any>|null=null;
 if(request.headers.get('content-type')?.includes('application/json'))body=await boundedSummary(request);
 const parent=request.headers.get('x-naumi-project-context')||body?.projectKey||body?.sessionId;
 const old=parent?(await getPool().query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[email.toLowerCase(),parent])).rows[0]:null;
 const selected=request.headers.get('x-naumi-workspace')||(old?.scope_kind==='tenant'?old.tenant_id:'personal');
 let tenantId:string|null=null;
 if(selected!=='personal'){
  const parsed=z.string().uuid().safeParse(selected);if(!parsed.success)throw new TeamError('工作空间参数无效',400);
  const accountPolicy=await userFeaturePolicy(email);
  tenantId=parsed.data;await enterpriseCreationRead(email,tenantId,async(tx,s)=>{
   // Membership/grant and tenant status are checked in the existing authoritative scope.
   const policy=(s as typeof s&{entitlement?:{featurePolicy:Record<string,boolean>}}).entitlement?.featurePolicy;
   assertCreationFeature(policy||{},new URL(request.url).pathname,request.method,undefined,accountPolicy);
   return s.team.id;
  });
 }
 const context:CreationContext={actorEmail:email.toLowerCase(),scopeKind:tenantId?'tenant':'personal',tenantId,sourcePath:new URL(request.url).pathname};
 if(parent){if(parent.length>240||!/^[a-zA-Z0-9_:.\-]+$/.test(parent))throw new TeamError('项目上下文无效',400);
  if(old&&(old.scope_kind!==context.scopeKind||old.tenant_id!==tenantId))throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
  if(!old){const existing=(await getPool().query(`SELECT 1 FROM app_agent_sessions WHERE id=$1 AND email=$2 UNION ALL SELECT 1 FROM app_project_names WHERE key=$1 AND email=$2 LIMIT 1`,[parent,context.actorEmail])).rows[0];if(existing&&tenantId)throw new TeamError('现有项目归属未记录，请在企业空间新建项目',409);}
  context.parentContext=parent;
 }
 if(body){
  if(body&&typeof body==='object'){
   for(const key of ['userPrompt','prompt','instruction','message','text','requirements','idea','description','newText'])if(typeof body[key]==='string'){context.requestText=body[key].slice(0,50000);break;}
   context.parameters=Object.fromEntries(['parameters','ratio','resolution','quality','count','size','seconds','mode','output','intent'].filter(k=>Object.hasOwn(body!,k)).map(k=>[k,body![k]]));
  }
 }
 return storage.run(context,run);
}
export function creationId(){return `cr-${randomUUID()}`;}
/** Non-model local/import routes share scope validation without selecting models. */
export async function withCreationRoute(request:Request,run:()=>Promise<Response>):Promise<Response>{
 if(!dbEnabled)return run();
 const {resolveUserEmail}=await import('@/lib/admin-auth');const email=await resolveUserEmail(request);if(!email)return run();
 try{return await withCreationRequest(request,email,run);}catch(error){if(error instanceof TeamError)return Response.json({error:error.message},{status:error.status,headers:{'cache-control':'private, no-store'}});throw error;}
}
