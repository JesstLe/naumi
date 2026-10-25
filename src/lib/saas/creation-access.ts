import 'server-only';
import type {PoolClient} from 'pg';
import {getPool,dbEnabled} from '@/platform/db/pool';
import {enterpriseCreationRead} from '@/lib/enterprise/server';
import {TeamError} from '@/lib/teams/server';
import {requestRequirement,TOOL_ACCESS,allows,type AccessPolicy} from '@/lib/feature-access/catalog';
import {userFeaturePolicy} from '@/lib/feature-access/repository';
import {ensureCreationSchema} from './creation-schema';
import {currentCreationContext,type CreationContext} from './creation-scope';

// Project/media ownership and effective feature access, independent of HTTP authentication.

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
  // An owned text-only personal canvas has no artwork output proof yet.
  // Fix its destination before quoting/acceptance so completion cannot change
  // a frozen null parent into a different receipt scope. Legacy receipt reads
  // remain non-binding, and an unproven tenant project is still rejected above.
  const textProject=!options.receipt&&(await tx.query("SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2 LIMIT 1",[email.toLowerCase(),id])).rowCount;
  if(!textProject){delete context.parentContext;return context;}
 }
 if(!options.receipt)await tx.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,$3,$4) ON CONFLICT DO NOTHING",[email.toLowerCase(),id,context.scopeKind,context.tenantId]);
 const saved=options.receipt?proof:(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2",[email.toLowerCase(),id])).rows[0];
 if(saved.scope_kind!==context.scopeKind||saved.tenant_id!==context.tenantId)throw new TeamError('当前项目的工作空间已固定，请新建项目',409);
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
/** A receipt-aware entry must call this only when accepting genuinely new work. */
export async function assertCurrentCreationFeature(path:string,method='POST'){
 const context=currentCreationContext();if(!dbEnabled||!context?.tenantId)return;
 const accountPolicy=await userFeaturePolicy(context.actorEmail);
 await enterpriseCreationRead(context.actorEmail,context.tenantId,async(_tx,s)=>assertCreationFeature(s.entitlement.featurePolicy,path,method,undefined,accountPolicy));
}
