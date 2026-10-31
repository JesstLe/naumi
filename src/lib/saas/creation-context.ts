import {enterpriseSiteIdentity} from "../site-control/identity";
import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getPool,dbEnabled} from '@/platform/db/pool';
import {enterpriseCreationRead} from '@/lib/enterprise/server';
import { TeamError } from "@/lib/teams/errors";
import {ensureCreationSchema} from './creation-schema';
import {settingsSecret} from '@/lib/settings-secret';
import {userFeaturePolicy} from '@/lib/feature-access/repository';
import {creationStorage as storage,currentCreationContext,type CreationContext} from './creation-scope';
import {bindActualCreationProject,assertCreationFeature} from './creation-access';

// HTTP ingress/continuation adapter. Legacy exports refer to the same owner functions.
export {currentCreationContext,withFrozenCreation,withoutCreationContext,frozenCreationScope,creationId} from './creation-scope';
export type {CreationContext} from './creation-scope';
export {assertCreationFeature,bindCreationParent,bindActualCreationProject,assertCreationProjectInput,bindCreationMedia,assertCurrentCreationFeature} from './creation-access';

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
 const site=enterpriseSiteIdentity();
 const selected=site?(old?old.scope_kind==='tenant'?old.tenant_id:'personal':site.enterpriseId):request.headers.get('x-naumi-workspace')||(old?.scope_kind==='tenant'?old.tenant_id:'personal');
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
 const context:CreationContext={actorEmail:email.toLowerCase(),scopeKind:tenantId?'tenant':'personal',tenantId,sourcePath:new URL(request.url).pathname,workspaceExplicit:!site&&request.headers.has('x-naumi-workspace')};
 if(parent){if(parent.length>240||!/^[a-zA-Z0-9_:.\-]+$/.test(parent))throw new TeamError('项目上下文无效',400);
  if(old&&(old.scope_kind!==context.scopeKind||old.tenant_id!==tenantId))throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
  if(!old&&!request.headers.has('x-naumi-project-context')&&!body?.projectKey){const existing=(await getPool().query(`SELECT 1 FROM app_agent_sessions WHERE id=$1 AND email=$2 UNION ALL SELECT 1 FROM app_project_names WHERE key=$1 AND email=$2 LIMIT 1`,[parent,context.actorEmail])).rows[0];if(existing&&tenantId){if(site){context.scopeKind='personal';context.tenantId=null;}else throw new TeamError('现有项目归属未记录，请在企业空间新建项目',409);}}
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
   const creatingRoot=['/api/canvas/video-nodes','/api/canvas/director-nodes','/api/canvas/character-nodes','/api/canvas/scene-nodes','/api/canvas/audio-nodes','/api/canvas/timeline-nodes'].includes(new URL(request.url).pathname)&&body.expectedRevision===0&&body.projectKey===`tree:${body.id}`;
   if(!creatingRoot)await bindActualCreationProject(email,body.projectKey,{receipt:options.receipt});
  }
  return run();
 });
}
/** Non-model local/import routes share scope validation without selecting models. */
/** The callback receives a server-authenticated actor, or null for known
 * anonymous. Undefined preserves the no-DB unresolved-authentication adapter. */
export async function withCreationRoute(request:Request,run:(authenticatedActor?:string|null)=>Promise<Response>,options:{receipt?:boolean}={}):Promise<Response>{
 if(!dbEnabled)return run();
 const {resolveUserEmail}=await import('@/lib/admin-auth');const email=await resolveUserEmail(request);if(!email)return run(null);
 try{return await withCreationRequest(request,email,()=>run(email),options);}catch(error){if(error instanceof TeamError)return Response.json({error:error.message},{status:error.status,headers:{'cache-control':'private, no-store'}});throw error;}
}
/** Existing-operation reads still authorize membership and project scope, but a
 * revoked new-creation capability must not hide an already accepted receipt. */
export const withCreationReceiptRoute=(request:Request,run:()=>Promise<Response>)=>withCreationRoute(request,run,{receipt:true});
