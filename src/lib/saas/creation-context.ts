import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {getPool,dbEnabled} from '@/lib/db';
import {enterpriseCreationRead} from '@/lib/enterprise/server';
import {TeamError} from '@/lib/teams/server';
import {ensureCreationSchema} from './creation-schema';
import {settingsSecret} from '@/lib/settings-secret';
import {requestRequirement,TOOL_ACCESS,allows,type AccessPolicy} from '@/lib/feature-access/catalog';
import {userFeaturePolicy} from '@/lib/feature-access/server';

export type CreationContext={actorEmail:string;scopeKind:'personal'|'tenant';tenantId:string|null;creationId?:string;requestText?:string;parameters?:Record<string,unknown>;sourcePath?:string;parentContext?:string;workspaceExplicit?:boolean;evidencePending?:boolean;originalInputs?:{storageRef:string;mime:string;role:string;position:number}[]};
const storage=new AsyncLocalStorage<CreationContext>();
export const currentCreationContext=()=>storage.getStore();
export function withFrozenCreation<T>(value:CreationContext|undefined,run:()=>Promise<T>){return value?storage.run(value,run):storage.exit(run);}
/** Legacy sources must not inherit a tenant from the request resuming them. */
export function withoutCreationContext<T>(run:()=>Promise<T>){return storage.exit(run);}
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
/** Bind only a server-authorized actual project. A new root is attested by its
 * owning transaction; old projects require immutable output evidence. */
export async function bindActualCreationProject(email:string,id:string,options:{tx?:PoolClient;newRoot?:boolean;receipt?:boolean}={}) {
 const context=currentCreationContext();if(!dbEnabled||!context)return context;
 if(context.actorEmail!==email.toLowerCase()||id.length>240||!/^[a-zA-Z0-9_:.\-]+$/.test(id))throw new TeamError('项目上下文无效',400);
 if(options.newRoot&&!options.tx)throw new TeamError('首次项目绑定必须与创建事务一致',409);
 await ensureCreationSchema();const tx=options.tx||getPool();
 if(!options.newRoot){
  let physical=false;
  for(const table of ['app_canvas_video_projects','app_canvas_video_nodes','app_canvas_text_nodes']){
   if(!(await tx.query('SELECT to_regclass($1) AS name',[table])).rows[0].name)continue;
   if((await tx.query(`SELECT 1 FROM ${table} WHERE email=$1 AND project_key=$2 LIMIT 1`,[email.toLowerCase(),id])).rowCount){physical=true;break;}
  }
  const at=id.indexOf(':'),kind=id.slice(0,at),root=id.slice(at+1);
  if(!physical)physical=!!(await tx.query("SELECT 1 FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND (($2='tree' AND (id=$3 OR group_id=$3)) OR ($2='batch' AND batch_id=$3)) LIMIT 1",[email.toLowerCase(),kind,root])).rowCount;
  if(!physical)throw new TeamError('画布项目不存在或无权访问',404);
 }
 const old=(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[email.toLowerCase(),id])).rows[0];
 let proof=old;
 if(!proof){const at=id.indexOf(':'),kind=id.slice(0,at),root=id.slice(at+1);
  const rows=(await tx.query(`SELECT DISTINCT c.scope_kind,c.tenant_id FROM app_artworks a
   JOIN app_creation_links l ON l.target_type='artwork' AND l.target_id=a.id AND l.relation='output'
   JOIN app_creation_records c ON c.id=l.creation_id AND c.actor_email=a.email
   WHERE a.email=$1 AND a.deleted_at IS NULL AND c.scope_kind IN('personal','tenant')
   AND (($2='tree' AND (a.id=$3 OR a.group_id=$3)) OR ($2='batch' AND a.batch_id=$3))`,[email.toLowerCase(),kind,root])).rows;
  if(rows.length>1)throw new TeamError('项目归属存在冲突，请新建项目',409);proof=rows[0];
 }
 if(proof){
  if(context.scopeKind!==proof.scope_kind||context.tenantId!==proof.tenant_id){
   if(context.workspaceExplicit||context.creationId)throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
   context.scopeKind=proof.scope_kind;context.tenantId=proof.tenant_id;
   if(context.tenantId){const policy=options.receipt?undefined:await userFeaturePolicy(email);await enterpriseCreationRead(email,context.tenantId,async(_tx,s)=>{if(!options.receipt)assertCreationFeature(s.entitlement.featurePolicy,context.sourcePath||'/api/video/generate','POST',undefined,policy);});}
  }
 }else if(!options.newRoot){
  if(context.tenantId)throw new TeamError('现有项目归属未记录，请在企业空间新建项目',409);
  // Physical ownership was checked above. Uploaded-image, text and video
  // personal canvases all keep the same project before and after first output.
  // Receipt reads authorize that project without creating a binding row.
 }
 if(!options.receipt)await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,$3,$4) ON CONFLICT DO NOTHING",[email.toLowerCase(),id,context.scopeKind,context.tenantId]);
 const saved=options.receipt?proof:(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[email.toLowerCase(),id])).rows[0];
 if(saved&&(saved.scope_kind!==context.scopeKind||saved.tenant_id!==context.tenantId))throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
 context.parentContext=id;return context;
}
/** Validate referenced text/video projects without changing the destination. */
export async function assertCreationProjectInput(email:string,id:string){
 const context=currentCreationContext();if(!dbEnabled||!context)return;
 await ensureCreationSchema();const row=(await getPool().query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[email.toLowerCase(),id])).rows[0];
 if(row?.scope_kind==='tenant'&&row.tenant_id!==context.tenantId)throw new TeamError('不能直接引用其他企业的素材',403);
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
export async function withCreationRequest<T extends Response>(request:Request,email:string,run:()=>Promise<T>,options:{receipt?:boolean}={}):Promise<T>{
 if(!dbEnabled||request.method==='GET'&&!options.receipt)return run();
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
  const accountPolicy=options.receipt?undefined:await userFeaturePolicy(email);
  tenantId=parsed.data;await enterpriseCreationRead(email,tenantId,async(tx,s)=>{
   // Membership/grant and tenant status are checked in the existing authoritative scope.
   const policy=(s as typeof s&{entitlement?:{featurePolicy:Record<string,boolean>}}).entitlement?.featurePolicy;
   if(!options.receipt)assertCreationFeature(policy||{},new URL(request.url).pathname,request.method,undefined,accountPolicy);
   return s.team.id;
  });
 }
 const context:CreationContext={actorEmail:email.toLowerCase(),scopeKind:tenantId?'tenant':'personal',tenantId,sourcePath:new URL(request.url).pathname,workspaceExplicit:request.headers.has('x-naumi-workspace')};
 if(parent){if(parent.length>240||!/^[a-zA-Z0-9_:.\-]+$/.test(parent))throw new TeamError('项目上下文无效',400);
  if(old&&(old.scope_kind!==context.scopeKind||old.tenant_id!==tenantId))throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
  if(!old&&!request.headers.has('x-naumi-project-context')&&!body?.projectKey){const existing=(await getPool().query(`SELECT 1 FROM app_agent_sessions WHERE id=$1 AND email=$2 UNION ALL SELECT 1 FROM app_project_names WHERE key=$1 AND email=$2 LIMIT 1`,[parent,context.actorEmail])).rows[0];if(existing&&tenantId)throw new TeamError('现有项目归属未记录，请在企业空间新建项目',409);}
  context.parentContext=parent;
 }
 if(body){
  if(body&&typeof body==='object'){
   for(const key of ['userPrompt','prompt','instruction','message','text','requirements','idea','description','newText'])if(typeof body[key]==='string'){context.requestText=body[key].slice(0,50000);break;}
   context.parameters=Object.fromEntries(['parameters','ratio','resolution','quality','count','size','seconds','mode','output','intent'].filter(k=>Object.hasOwn(body!,k)).map(k=>[k,body![k]]));
  }
 }
 return storage.run(context,async()=>{
  if(request.headers.has('x-naumi-project-context'))await bindActualCreationProject(email,parent,{receipt:options.receipt});
  else if(body?.projectKey){
   // The owning video-node transaction alone can attest its genuinely new root.
   const creatingRoot=['/api/canvas/video-nodes','/api/canvas/director-nodes'].includes(new URL(request.url).pathname)&&body.expectedRevision===0&&body.projectKey===`tree:${body.id}`;
   if(!creatingRoot)await bindActualCreationProject(email,body.projectKey,{receipt:options.receipt});
  }
  return run();
 });
}
export function creationId(){return `cr-${randomUUID()}`;}
/** Non-model local/import routes share scope validation without selecting models. */
export async function withCreationRoute(request:Request,run:()=>Promise<Response>,options:{receipt?:boolean}={}):Promise<Response>{
 if(!dbEnabled)return run();
 const {resolveUserEmail}=await import('@/lib/admin-auth');const email=await resolveUserEmail(request);if(!email)return run();
 try{return await withCreationRequest(request,email,run,options);}catch(error){if(error instanceof TeamError)return Response.json({error:error.message},{status:error.status,headers:{'cache-control':'private, no-store'}});throw error;}
}
/** Existing-operation reads still authorize membership and project scope, but a
 * revoked new-creation capability must not hide an already accepted receipt. */
export const withCreationReceiptRoute=(request:Request,run:()=>Promise<Response>)=>withCreationRoute(request,run,{receipt:true});
/** A receipt-aware entry must call this only when accepting genuinely new work. */
export async function assertCurrentCreationFeature(path:string,method='POST'){
 const context=currentCreationContext();if(!dbEnabled||!context?.tenantId)return;
 const accountPolicy=await userFeaturePolicy(context.actorEmail);
 await enterpriseCreationRead(context.actorEmail,context.tenantId,async(_tx,s)=>assertCreationFeature(s.entitlement.featurePolicy,path,method,undefined,accountPolicy));
}
