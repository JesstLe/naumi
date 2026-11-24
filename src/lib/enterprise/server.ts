import {assertAccountCanJoinEnterprise} from "../accounts/creation-policy-store";
import {prepareIdentityEvents,identityAccountEvent} from './identity/events';
import {administeredSite,siteAdministrators} from './site-administrator';
import {enterpriseSiteIdentity} from '@/lib/site-control/identity';
import {workflowPermissionsSchema,DEFAULT_WORKFLOW_PERMISSIONS} from './workflow-permissions';
import {ensureEnterpriseSchema} from "@/lib/enterprise/schema";
export {ensureEnterpriseSchema};
import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import { TeamError } from "@/lib/teams/errors";


import {activeTeamGrant,requireTeamGrant,type TeamActor} from '@/lib/teams/grants';
import {getPool} from "@/platform/db/pool";
import {checkReadClientSocket, withOwnedReadClient, withOwnedReportClient} from "@/platform/db/owned-read-client";
import {settingsSecret} from '@/lib/settings-secret';
import type {ContentPage} from '@/lib/teams/contracts';
import type {EnterpriseIdentity,EnterpriseMember,EnterpriseRole,EnterpriseSnapshot} from './contracts';
import {pinnedEnterpriseIds,IntegrationError} from './integration/policy';
import {descendantScope,validateHierarchy,type HierarchyNode,type HierarchyRole} from './hierarchy';
export {validateHierarchy} from './hierarchy';



// Legacy teams belonging to an activated enterprise cannot bypass ERP scope or content restrictions.
export async function enterpriseManaged(email: string) {
  await ensureEnterpriseSchema();
  if(await administeredSite(getPool(),email))return true;
  return !!(await getPool().query(`SELECT 1 FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id
    WHERE t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=s.team_id AND m.email=$1)`,[email])).rowCount;
}
async function transaction<T>(run: (tx: PoolClient)=>Promise<T>) {
  await ensureEnterpriseSchema();await prepareIdentityEvents();const tx=await getPool().connect();
  try {await tx.query('BEGIN');const result=await run(tx);await tx.query('COMMIT');return result}
  catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
async function enterprisePickerRead<T>(run:(tx:PoolClient)=>Promise<T>,signal?:AbortSignal) {
  signal?.throwIfAborted();
  await ensureEnterpriseSchema();await prepareIdentityEvents();
  return withOwnedReportClient(getPool(),async tx=>{
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+(signal?checkReadClientSocket:''));
    const result=await run(tx);await tx.query('COMMIT');return result;
  },signal);
}
type Node = { email: string; supervisor_email: string; role_id: string|null; employment: 'permanent'|'intern'; version:number; membership_status?:'active'|'suspended';membership_expires_at?:string|null; global_active?:boolean };
type Scope = { team: EnterpriseIdentity; teamVersion:number; owner:boolean; level:number; manageMembers:boolean; viewRecords:boolean; canManageIdentity:boolean; roles:EnterpriseRole[]; nodes:Node[]; visible:Set<string>; manageable:Set<string>; entitlement:{name:string|null;seatLimit:number|null;featurePolicy:Record<string,boolean>} };
const activeMembership=(node:Node)=>node.global_active!==false&&node.membership_status!=='suspended'&&(!node.membership_expires_at||new Date(node.membership_expires_at).getTime()>Date.now());
const canManageWorkspace=(role:HierarchyRole|undefined)=>!!role&&(role.manage_members||role.view_records);
async function scope(tx:PoolClient,actor:TeamActor,id:string,allowSelf=false,lock:'share'|'snapshot'='share'):Promise<Scope> {
  const share=(of?:string)=>lock==='snapshot'?'':of?' FOR SHARE OF '+of:' FOR SHARE';
  try {const pinned=pinnedEnterpriseIds();if(pinned.length&&!pinned.includes(id))throw new TeamError('企业不存在',404);}
  catch(e){if(e instanceof IntegrationError)throw new TeamError('企业部署范围尚未配置',503);throw e;}
  const team=(await tx.query(`SELECT t.id,t.name,t.version,t.owner_email,t.authorized_until,t.enabled,s.enabled AS enterprise_enabled
    FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id WHERE s.team_id=$1${share('s,t')}`,[id])).rows[0];
  if(!team)throw new TeamError('企业不存在',404);
  // Activated enterprises use the entry lifecycle grant as the single source of
  // access expiry. The legacy team cap is only for legacy subaccount management.
  // A null grant expiry is permanent, not an expired Unix epoch.
  let accessExpiry:string|null=team.authorized_until;
  if(!actor.admin){
    const current=(await tx.query('SELECT banned,account_expires_at FROM app_users WHERE email=$1'+share(),[actor.email])).rows[0];
    if(!current||current.banned||current.account_expires_at&&new Date(current.account_expires_at).getTime()<=Date.now())throw new TeamError('账号已停用或到期');
    if(!team.enabled||!team.enterprise_enabled)throw new TeamError('企业授权已关闭或到期');
    // Every descendant uses the live sponsoring owner's entry grant, not a copied/evergreen capability.
    const grant=await requireTeamGrant(tx,{email:team.owner_email,admin:false},lock);
    if(team.authorized_until&&new Date(team.authorized_until).getTime()<=Date.now())throw new TeamError('企业授权已到期');
    accessExpiry=grant!.expires_at;
  }else{
    const grant=(await tx.query('SELECT expires_at FROM app_team_access_grants WHERE email=$1'+share(),[team.owner_email])).rows[0];
    if(grant)accessExpiry=grant.expires_at;
  }
  const roles=(await tx.query('SELECT id,name,level,manage_members,view_records,workflow_permissions,version FROM app_enterprise_roles WHERE enterprise_id=$1'+share(),[id])).rows as EnterpriseRole[];
  const nodes=(await tx.query(`SELECT m.email,m.supervisor_email,m.role_id,m.employment,m.version,m.membership_status,m.membership_expires_at,
    (NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now())) AS global_active
    FROM app_enterprise_members m JOIN app_users u ON u.email=m.email WHERE m.enterprise_id=$1${share('m,u')}`,[id])).rows as Node[];
  validateHierarchy(team.owner_email,nodes,roles);
  const siteAdmin=(await administeredSite(tx,actor.email,lock))===id;
  const owner=actor.admin||team.owner_email===actor.email||siteAdmin;
  const centralTitle=process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED==='1'
    ?(await tx.query(`SELECT o.organization->>'title' AS title FROM app_identity_organizations o JOIN app_identity_subjects i ON i.subject_id=o.subject_id WHERE o.enterprise_id=$1 AND i.account_email=$2`,[id,actor.email])).rows[0]?.title:undefined;
  const canManageIdentity=team.owner_email===actor.email||centralTitle==='administrator';
  const node=nodes.find(m=>m.email===actor.email),role=roles.find(r=>r.id===node?.role_id);
  if(!owner&&(!node||!activeMembership(node)||!allowSelf&&!canManageWorkspace(role)&&!canManageIdentity))throw new TeamError('当前企业身份已停用、到期或岗位没有管理权限');
  const entitlementRow=(await tx.query('SELECT entitlement_name,seat_limit,feature_policy FROM app_tenant_entitlements WHERE tenant_id=$1'+share(),[id])).rows[0];
  const entitlement={name:entitlementRow?.entitlement_name??null,seatLimit:entitlementRow?.seat_limit??null,featurePolicy:entitlementRow?.feature_policy??{}};
  if(!actor.admin&&entitlement.featurePolicy.team===false)throw new TeamError('企业管理功能已停用');
  const {visible,manageable}=owner?{
    visible:new Set(nodes.filter(activeMembership).map(m=>m.email)),
    manageable:new Set(nodes.map(m=>m.email)),
  }:descendantScope(nodes,actor.email,!allowSelf||!!role?.view_records,!!role?.manage_members,activeMembership);
  if(owner){const administrators=await siteAdministrators(tx,id,lock);if(administrators.length){for(const email of administrators)visible.add(email);visible.add(team.owner_email);}}
  return {team:{id:team.id,name:team.name,owner_email:team.owner_email,authorized_until:accessExpiry,owner},teamVersion:team.version,owner,canManageIdentity,level:owner?0:role?.level??999,manageMembers:owner||!!role?.manage_members,viewRecords:owner||!!role?.view_records,roles,nodes,visible,manageable,entitlement};
}
/** Workflow creation picker: ordinary employees get self only; never elevates existing analytics routes. */
/** Read-only snapshot: membership rows are share-locked under REPEATABLE READ, so a
 * concurrent committed update to the same row (e.g. app_users) raises 40001.
 * Every caller only SELECTs and asserts, so the whole snapshot is retried. */
const ENTERPRISE_READ_ATTEMPTS=3;
export async function enterpriseCreationRead<T>(email:string,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>){
 await ensureEnterpriseSchema();
 for(let attempt=1;;attempt++){
  const tx=await getPool().connect();
  try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await tx.query("SET LOCAL statement_timeout='10s'");const s=await scope(tx,{email,admin:false},id,true);if(s.owner)s.visible.add(s.team.owner_email);const result=await run(tx,s);await tx.query('COMMIT');return result;}
  catch(e){
   await tx.query('ROLLBACK').catch(()=>{});
   const code=(e as {code?:unknown})?.code;
   if((code==='40001'||code==='40P01')&&attempt<ENTERPRISE_READ_ATTEMPTS){await new Promise(r=>setTimeout(r,15*attempt+Math.floor(Math.random()*20)));continue;}
   throw e;
  }finally{tx.release();}
 }
}
/** General enterprise access also serves mutations; retain its authorization locks. */
export async function enterpriseRead<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>) {
  await ensureEnterpriseSchema();await prepareIdentityEvents();const tx=await getPool().connect();
  try {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await tx.query("SET LOCAL statement_timeout='20s'");
    const s=await scope(tx,actor,id);
    if(!s.viewRecords)throw new TeamError('当前岗位没有经营数据查看权限');
    const result=await run(tx,s);await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}

// Compare both read and management scope: the workspace also lists paused
// members, exposes private account fields to owners and renders role controls.
function projectionScopeKey(s: Scope) {
  const byId = (a: string, b: string) => a < b ? -1 : a === b ? 0 : 1;
  return JSON.stringify([
    s.team.id,s.team.owner_email,s.owner,s.level,s.manageMembers,s.viewRecords,s.canManageIdentity,
    [...s.visible].sort(),[...s.manageable].sort(),
    s.nodes.slice().sort((a,b)=>byId(a.email,b.email)).map(n=>[
      n.email,n.supervisor_email,n.role_id,n.version,n.membership_status,n.membership_expires_at,n.global_active,
    ]),
    s.roles.slice().sort((a,b)=>byId(a.id,b.id)).map(r=>[r.id,r.level,r.version,r.manage_members,r.view_records]),
  ]);
}

/**
 * Heavy read-only reports must never retain account/grant row locks while
 * aggregating. Authorize the data snapshot first, then check a fresh scope in a
 * short transaction before any result leaves the server.
 */
async function enterpriseProjectionRead<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>,requireRecords:boolean,allowSelf=false,signal?:AbortSignal,checkout=withOwnedReadClient) {
  signal?.throwIfAborted();
  await ensureEnterpriseSchema();await prepareIdentityEvents();
  try {
    return await checkout(getPool(), async tx=>{
      const cancellation=signal?checkReadClientSocket:'';
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+cancellation);
      const s=await scope(tx,actor,id,allowSelf,'snapshot');
      if(requireRecords&&!s.viewRecords)throw new TeamError('当前岗位没有经营数据查看权限');
      const key=projectionScopeKey(s);
      const result=await run(tx,s);
      signal?.throwIfAborted();
      await tx.query('COMMIT');
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await tx.query("SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'"+cancellation);
      const current=await scope(tx,actor,id,allowSelf);
      if(requireRecords&&!current.viewRecords)throw new TeamError('当前岗位没有经营数据查看权限');
      if(key!==projectionScopeKey(current))throw new TeamError('企业成员范围已变化，请刷新后重试',409);
      await tx.query('COMMIT');
      return result;
    },signal);
  } catch(error) {
    const code=(error as {code?:string})?.code;
    if(code==='57014'||code==='55P03'||code==='40001'||code==='40P01') {
      throw new TeamError('企业数据暂不可读取，请稍后重试',503);
    }
    throw error;
  }
}

export function enterpriseReportRead<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>,signal?:AbortSignal) {
  return enterpriseProjectionRead(actor,id,run,true,false,signal);
}

export function enterpriseHeavyReportRead<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>,signal?:AbortSignal) {
  return enterpriseProjectionRead(actor,id,run,true,false,signal,withOwnedReportClient);
}

/** A workflow evidence picker grants self visibility to ordinary employees,
 * but must not retain authorization locks while reading historical evidence. */
export function enterpriseCreationProjectionRead<T>(email:string,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>) {
  return enterpriseProjectionRead({email,admin:false},id,(tx,s)=>{
    if(s.owner)s.visible.add(s.team.owner_email);
    return run(tx,s);
  },false,true);
}

type PickerRow=Omit<EnterpriseIdentity,'owner'>&{
  enabled:boolean;enterprise_enabled:boolean;actor_active:boolean;team_policy:unknown;
  sponsor_email:string|null;sponsor_enabled:boolean|null;starts_at:string|null;expires_at:string|null;
  revoked_at:string|null;sponsor_banned:boolean|null;sponsor_account_expires_at:string|null;
  member_email:string|null;membership_status:Node['membership_status']|null;membership_expires_at:string|null;role_id:string|null;
};
export async function enterpriseList(actor:TeamActor,allowSelf=false,allowedIds?:readonly string[],signal?:AbortSignal):Promise<EnterpriseIdentity[]> {
  return enterprisePickerRead(async tx=>{
    let pinned:string[];try{pinned=pinnedEnterpriseIds()}catch{throw new TeamError('企业部署范围尚未配置',503)}
    const requested=allowedIds?.length?allowedIds:null;
    const tenantIds=pinned.length?pinned.filter(id=>!requested||requested.includes(id)):requested;
    if(tenantIds?.length===0)return [];
    const siteId=await administeredSite(tx,actor.email,'snapshot');
    // The picker returns tenant identities only. Batch its authorization facts,
    // without calculating each tenant's record visibility or locking accounts.
    const rows=(await tx.query<PickerRow>(`SELECT t.id,t.name,t.owner_email,t.authorized_until,t.enabled,s.enabled AS enterprise_enabled,
      g.email AS sponsor_email,g.enabled AS sponsor_enabled,g.starts_at,g.expires_at,g.revoked_at,
      sponsor.banned AS sponsor_banned,sponsor.account_expires_at AS sponsor_account_expires_at,
      (actor.email IS NOT NULL AND NOT actor.banned AND (actor.account_expires_at IS NULL OR actor.account_expires_at>now())) AS actor_active,
      m.email AS member_email,m.membership_status,m.membership_expires_at,m.role_id,
      e.feature_policy->'team' AS team_policy
      FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id
      LEFT JOIN app_enterprise_members m ON m.enterprise_id=t.id AND m.email=$1
      LEFT JOIN app_users actor ON actor.email=$1
      LEFT JOIN app_team_access_grants g ON g.email=t.owner_email
      LEFT JOIN app_users sponsor ON sponsor.email=t.owner_email
      LEFT JOIN app_tenant_entitlements e ON e.tenant_id=t.id
      WHERE ($4::uuid[] IS NULL OR t.id=ANY($4)) AND ($2 OR t.id=$3::uuid OR t.owner_email=$1 OR m.email IS NOT NULL)
      ORDER BY t.name,t.id`,[actor.email,actor.admin,siteId,tenantIds])).rows;
    const isOwner=(t:PickerRow)=>actor.admin||t.owner_email===actor.email||siteId===t.id;
    const now=Date.now();
    const eligible=rows.filter(t=>actor.admin||(
      t.actor_active&&t.enabled&&t.enterprise_enabled&&t.team_policy!==false&&
      (!t.authorized_until||new Date(t.authorized_until).getTime()>now)&&
      activeTeamGrant(t.starts_at&&t.sponsor_banned!==null?{
        enabled:t.sponsor_enabled===true,starts_at:t.starts_at,expires_at:t.expires_at,revoked_at:t.revoked_at,
        banned:t.sponsor_banned,account_expires_at:t.sponsor_account_expires_at,
      }:undefined,now)&&(isOwner(t)||(t.member_email&&t.membership_status!=='suspended'&&
        (!t.membership_expires_at||new Date(t.membership_expires_at).getTime()>now)))));
    if(!eligible.length)return [];
    const ids=eligible.map(t=>t.id);
    const roleRows=(await tx.query<HierarchyRole&{enterprise_id:string}>(
      'SELECT enterprise_id,id,level,manage_members,view_records FROM app_enterprise_roles WHERE enterprise_id=ANY($1::uuid[])',[ids])).rows;
    const nodeRows=(await tx.query<HierarchyNode&{enterprise_id:string}>(
      'SELECT m.enterprise_id,m.email,m.supervisor_email,m.role_id FROM app_enterprise_members m JOIN app_users u ON u.email=m.email WHERE m.enterprise_id=ANY($1::uuid[])',[ids])).rows;
    const group=<T extends {enterprise_id:string}>(items:T[])=>{
      const byTenant=new Map<string,T[]>();
      for(const item of items){const group=byTenant.get(item.enterprise_id);if(group)group.push(item);else byTenant.set(item.enterprise_id,[item]);}
      return byTenant;
    };
    const roles=group(roleRows),nodes=group(nodeRows);
    const identityAdmins=process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED==='1'
      ?new Set((await tx.query(`SELECT o.enterprise_id FROM app_identity_organizations o JOIN app_identity_subjects i ON i.subject_id=o.subject_id WHERE i.account_email=$1 AND o.organization->>'title'='administrator'`,[actor.email])).rows.map(r=>r.enterprise_id)):new Set<string>();
    const result:EnterpriseIdentity[]=[];
    for(const t of eligible){
      const owner=isOwner(t),tenantRoles=roles.get(t.id)??[];
      if(!owner&&!allowSelf&&!canManageWorkspace(tenantRoles.find(r=>r.id===t.role_id))&&!identityAdmins.has(t.id))continue;
      try{validateHierarchy(t.owner_email,nodes.get(t.id)??[],tenantRoles);}
      catch(e){if(!(e instanceof TeamError)||actor.admin)throw e;continue;}
      result.push({id:t.id,name:t.name,owner_email:t.owner_email,authorized_until:t.sponsor_email?t.expires_at:t.authorized_until,owner});
    }
    return result;
  },signal).catch(error=>{
    if(['57014','55P03'].includes((error as {code?:string})?.code??''))throw new TeamError('企业列表暂不可读取，请稍后重试',503);
    throw error;
  });
}
async function memberRows(tx:PoolClient,s:Scope):Promise<EnterpriseMember[]> {
  const selected=[...(s.manageMembers?s.manageable:s.visible)];
  const metrics=s.viewRecords?selected.filter(email=>s.visible.has(email)):[];
  const site=enterpriseSiteIdentity()?.enterpriseId===s.team.id;
  // Users allowed to manage the directory may still have no records access.
  // Their member query must not open billing or media relations at all.
  // Compiling the grouped projections costs more than executing them for
  // interactive directories. This setting is limited to this read snapshot.
  if(metrics.length)await tx.query('SET LOCAL jit=off');
  const metricCtes=metrics.length?`WITH metric_members AS MATERIALIZED (SELECT unnest($5::text[]) AS email),
    principal AS (SELECT b.email,sum(b.remaining) AS total FROM app_credit_batches b JOIN metric_members m USING (email)
      WHERE b.expires_at>now() AND b.remaining>0 GROUP BY b.email),
    consumed AS (SELECT l.email,-sum(l.delta) AS total FROM app_ledger l JOIN metric_members m USING (email)
      WHERE l.kind='consume' AND l.delta<0 GROUP BY l.email),
    artwork AS (SELECT a.email,count(*) AS total FROM app_artworks a JOIN metric_members m USING (email)
      WHERE a.deleted_at IS NULL GROUP BY a.email)`:'';
  const metricFields=metrics.length?`
    CASE WHEN metric.email IS NOT NULL THEN GREATEST(0,COALESCE(b.total,0)-u.credits_used)::int ELSE NULL END AS available,
    CASE WHEN metric.email IS NOT NULL THEN COALESCE(l.total,0)::int ELSE NULL END AS consumed,
    CASE WHEN metric.email IS NOT NULL THEN COALESCE(a.total,0)::int ELSE NULL END AS artworks,
    CASE WHEN metric.email IS NOT NULL THEN 'recorded' ELSE 'restricted' END AS legacy_metrics_state`:
    "NULL::int AS available,NULL::int AS consumed,NULL::int AS artworks,'restricted' AS legacy_metrics_state";
  const metricJoins=metrics.length?`
    LEFT JOIN metric_members metric ON metric.email=m.email
    LEFT JOIN principal b ON b.email=metric.email LEFT JOIN consumed l ON l.email=metric.email
    LEFT JOIN artwork a ON a.email=metric.email`:'';
  const rows=(await tx.query(`${metricCtes} SELECT m.email,u.name,u.role AS account_role,CASE WHEN $4::boolean THEN u.position ELSE NULL END AS position,CASE WHEN $3::boolean THEN u.phone ELSE NULL END AS phone,CASE WHEN $3::boolean THEN u.note ELSE NULL END AS note,m.supervisor_email,m.role_id,m.employment,m.version,m.membership_status,m.membership_expires_at,m.joined_at,m.left_at,u.management_version,u.banned,u.account_expires_at,
    COALESCE(r.name,'员工') AS role_name,COALESCE(r.level,999)::int AS level,
    ${metricFields}
    FROM app_enterprise_members m JOIN app_users u ON u.email=m.email LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
    ${metricJoins}
    WHERE m.enterprise_id=$1 AND m.email=ANY($2::text[]) ORDER BY COALESCE(r.level,999),u.name,u.email`,
    [s.team.id,selected,s.owner&&site,site,...(metrics.length?[metrics]:[])])).rows;
  return rows.map(m=>({...m,canManage:m.account_role==='user'&&s.manageMembers&&m.email!==s.team.owner_email&&m.email!==undefined&&m.level>s.level}));
}
export async function enterpriseSnapshot(actor:TeamActor,id:string,signal?:AbortSignal):Promise<EnterpriseSnapshot> {
  return enterpriseProjectionRead(actor,id,async(tx,s)=>{const members=await memberRows(tx,s);
    const ownerAvailable=s.owner?Number((await tx.query(`SELECT GREATEST(0,COALESCE((SELECT sum(remaining) FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0),0)-u.credits_used)::int AS n FROM app_users u WHERE email=$1`,[s.team.owner_email])).rows[0]?.n||0):null;
    return {enterprise:s.team,members,roles:s.owner?s.roles:[],actor:{owner:s.owner,canManageIdentity:s.canManageIdentity,manageMembers:s.manageMembers,viewRecords:s.viewRecords,level:s.level,scopeLabel:s.owner?'本企业':'当前下级'},ownerAvailable,entitlement:s.entitlement};
  },false,false,signal,withOwnedReportClient);
}
const common={id:z.string().uuid(),enterpriseId:z.string().uuid()};
const target={...common,email:z.string().trim().min(1).max(254).transform(s=>s.toLowerCase()),expectedVersion:z.number().int().nonnegative(),expectedUserVersion:z.number().int().nonnegative()};
const instant=z.string().datetime({offset:true});
export const enterpriseCommandSchema=z.discriminatedUnion('action',[
  z.object({...common,action:z.literal('delete-role'),roleId:z.string().uuid(),expectedVersion:z.number().int().nonnegative()}).strict(),
  z.object({...common,action:z.literal('role'),roleId:z.string().uuid(),expectedVersion:z.number().int().nonnegative().nullable(),name:z.string().trim().min(1).max(60),level:z.number().int().min(1).max(998),manageMembers:z.boolean(),viewRecords:z.boolean(),workflowPermissions:workflowPermissionsSchema.optional()}).strict(),
  z.object({...target,action:z.literal('organization'),roleId:z.string().uuid().nullable(),supervisorEmail:z.string().trim().min(1).max(254).transform(s=>s.toLowerCase()),employment:z.enum(['permanent','intern']),expiresAt:instant.nullable()}).strict(),
  z.object({...target,action:z.literal('expiry'),expiresAt:instant.nullable()}).strict(),
  z.object({...target,action:z.literal('status'),banned:z.boolean()}).strict(),
  z.object({...target,action:z.literal('reset-password'),password:z.string().min(8).max(128)}).strict(),
]);
export async function mutateEnterprise(actor:TeamActor,command:z.infer<typeof enterpriseCommandSchema>) {
  await prepareIdentityEvents();
  const fingerprint=createHmac('sha256',settingsSecret()).update(JSON.stringify(command)).digest('hex');
  if(command.action==='reset-password')throw new TeamError('企业管理不允许修改全站登录密码，请使用账号安全流程',403);
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const s=await scope(tx,actor,command.enterpriseId);
    if(!s.manageMembers)throw new TeamError('当前岗位没有成员管理权限');
    if((command.action==='role'||command.action==='delete-role'||command.action==='organization')&&!s.owner)throw new TeamError('岗位与组织关系由企业老板设置');
    if(command.action!=='role'&&command.action!=='delete-role'){
      const m=s.nodes.find(n=>n.email===command.email),role=s.roles.find(r=>r.id===m?.role_id),level=role?.level??999;
      if(!m||!s.manageable.has(m.email)||m.email===actor.email||level<=s.level)throw new TeamError('仅可管理本企业范围内的下级');
    }
    const previous=(await tx.query('SELECT actor,fingerprint,result FROM app_enterprise_audit WHERE id=$1',[command.id])).rows[0];
    if(previous){if(previous.actor!==actor.email||previous.fingerprint!==fingerprint)throw new TeamError('操作编号已用于其他请求',409);return {...previous.result,replayed:true}}
    let changes:unknown={};
    if(command.action==='delete-role'){
      const old=s.roles.find(r=>r.id===command.roleId);
      if(!old)throw new TeamError('岗位不存在',404);
      if(old.version!==command.expectedVersion)throw new TeamError('岗位已更新，请刷新后重试',409);
      if(s.nodes.some(n=>n.role_id===command.roleId))throw new TeamError('岗位仍有成员引用，请先调整成员岗位',409);
      await tx.query('DELETE FROM app_enterprise_roles WHERE enterprise_id=$1 AND id=$2 AND version=$3',[command.enterpriseId,command.roleId,command.expectedVersion]);
      changes={before:old,after:null};
    }else if(command.action==='role'){
      const old=s.roles.find(r=>r.id===command.roleId);
      if((old?.version??null)!==command.expectedVersion)throw new TeamError('岗位已更新，请刷新后重试',409);
      const next={id:command.roleId,name:command.name,level:command.level,manage_members:command.manageMembers,view_records:command.viewRecords,workflow_permissions:command.workflowPermissions??old?.workflow_permissions??DEFAULT_WORKFLOW_PERMISSIONS,version:(old?.version??-1)+1};
      validateHierarchy(s.team.owner_email,s.nodes,[...s.roles.filter(r=>r.id!==next.id),next]);
      changes={before:old||null,after:next};
      await tx.query(`INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records,workflow_permissions) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(enterprise_id,id) DO UPDATE SET name=excluded.name,level=excluded.level,manage_members=excluded.manage_members,view_records=excluded.view_records,workflow_permissions=excluded.workflow_permissions,version=app_enterprise_roles.version+1`,[command.enterpriseId,command.roleId,command.name,command.level,command.manageMembers,command.viewRecords,JSON.stringify(next.workflow_permissions)]);
    }else{
      const m=s.nodes.find(n=>n.email===command.email)!;
      const u=(await tx.query('SELECT role,management_version,banned,account_expires_at FROM app_users WHERE email=$1 FOR UPDATE',[m.email])).rows[0];
      if(!u||u.role!=='user')throw new TeamError('目标必须为普通企业账号',409);
      if(m.version!==command.expectedVersion||u.management_version!==command.expectedUserVersion)throw new TeamError('成员已更新，请刷新后重试',409);
      if(command.action==='organization'||command.action==='expiry'){
        const becomingActive=m.membership_status==='active'&&!activeMembership(m)&&(command.expiresAt===null||Date.parse(command.expiresAt)>Date.now());
        if(becomingActive&&s.entitlement.seatLimit!==null){const active=s.nodes.filter(activeMembership).length+1;if(active>=s.entitlement.seatLimit)throw new TeamError('企业有效成员已达席位上限',409);}

        const employment=command.action==='organization'?command.employment:m.employment;
        if(employment==='permanent'&&command.expiresAt!==null)throw new TeamError('正式员工不设置企业身份到期时间',400);
        if(employment==='intern'&&(!command.expiresAt||s.team.authorized_until!==null&&new Date(command.expiresAt).getTime()>new Date(s.team.authorized_until).getTime()))throw new TeamError('实习生须设置企业授权范围内的有效期',400);
        if(command.action==='organization'){
          const updated={...m,supervisor_email:command.supervisorEmail,role_id:command.roleId,employment};
          validateHierarchy(s.team.owner_email,s.nodes.map(n=>n.email===m.email?updated:n),s.roles);
          changes={before:{...m,expiresAt:m.membership_expires_at},after:{...updated,expiresAt:command.expiresAt}};
          await tx.query('UPDATE app_enterprise_members SET supervisor_email=$3,role_id=$4,employment=$5 WHERE enterprise_id=$1 AND email=$2',[command.enterpriseId,m.email,command.supervisorEmail,command.roleId,employment]);
        }
        if(command.action==='expiry')changes={before:m.membership_expires_at,after:command.expiresAt};
        await tx.query('UPDATE app_enterprise_members SET membership_expires_at=$3 WHERE enterprise_id=$1 AND email=$2',[command.enterpriseId,m.email,command.expiresAt]);
      }else if(command.action==='status'){
        if(!command.banned&&m.membership_expires_at&&new Date(m.membership_expires_at).getTime()<=Date.now())throw new TeamError('先设置未来有效期再启用企业身份',409);
        if(!command.banned&&s.entitlement.seatLimit!==null){
          const count=Number((await tx.query(`SELECT 1+(SELECT count(*) FROM app_enterprise_members em JOIN app_users eu ON eu.email=em.email WHERE em.enterprise_id=$1 AND em.email<>$2 AND em.membership_status='active' AND (em.membership_expires_at IS NULL OR em.membership_expires_at>now()) AND NOT eu.banned AND (eu.account_expires_at IS NULL OR eu.account_expires_at>now())) AS n`,[command.enterpriseId,m.email])).rows[0].n);
          if(count+1>s.entitlement.seatLimit)throw new TeamError('企业有效成员已达席位上限',409);
        }
        await tx.query("UPDATE app_enterprise_members SET membership_status=$3,left_at=CASE WHEN $3='suspended' THEN clock_timestamp() ELSE NULL END WHERE enterprise_id=$1 AND email=$2",[command.enterpriseId,m.email,command.banned?'suspended':'active']);
        changes={before:m.membership_status,after:command.banned?'suspended':'active',scope:'membership'};
      }
      await tx.query('UPDATE app_enterprise_members SET version=version+1 WHERE enterprise_id=$1 AND email=$2',[command.enterpriseId,m.email]);
    }
    const result={ok:true,replayed:false};
    await tx.query('INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result,changes) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[command.id,command.enterpriseId,actor.email,command.action,'email'in command?command.email:command.roleId,fingerprint,JSON.stringify(result),JSON.stringify(changes)]);
    if('email' in command&&typeof command.email==='string')await identityAccountEvent(tx,command.email,'enterprise-'+command.action,command.enterpriseId);
    return result;
  });
}
function assertContentScope(s:Scope,email:string) {
  const node=s.nodes.find(n=>n.email===email);
  if(node&&!activeMembership(node))throw new TeamError('该成员的历史企业归属未确认，企业身份失效后不再允许读取',404);
  if(!s.viewRecords||!(s.visible.has(email)||s.owner&&email===s.team.owner_email))throw new TeamError('没有该成员内容的查看权限');
}
const sources={artworks:'SELECT id,title,status,image_url,created_at FROM app_artworks WHERE email=$1 AND deleted_at IS NULL',tasks:`SELECT id,kind,COALESCE(snapshot->>'status','unknown') AS status,COALESCE(payload->'p'->>'userPrompt',payload->'p'->>'prompt',payload->>'prompt','') AS prompt,cost,created_at FROM app_image_jobs WHERE email=$1
  UNION ALL SELECT id,'canvas-'||kind,status,COALESCE(parameters->>'prompt',parameters->>'newText',''),cost,created_at FROM app_canvas_image_tasks WHERE email=$1
  UNION ALL SELECT id,'video',status,prompt,cost,created_at FROM app_video_tasks WHERE email=$1`};
export async function enterpriseContent(actor:TeamActor,id:string,email:string,section:keyof typeof sources,page:number):Promise<ContentPage> {
  return enterpriseReportRead(actor,id,async(tx,s)=>{assertContentScope(s,email);const source=sources[section];
    const total=Number((await tx.query(`SELECT count(*)::int AS n FROM (${source}) s`,[email])).rows[0].n);
    const rows=(await tx.query(`SELECT * FROM (${source}) s ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[email,(page-1)*20])).rows;
    return {rows,total,page,size:20};
  });
}
export async function enterpriseArtwork(actor:TeamActor,enterpriseId:string,email:string,id:string,signal?:AbortSignal) {
  const lookup=async(tx:PoolClient,s:Scope)=>{
    if(!s.visible.has(email))throw new TeamError('没有该成员内容的查看权限');
    const row=(await tx.query('SELECT image_url FROM app_artworks WHERE email=$1 AND id=$2',[email,id])).rows[0];
    if(!row)throw new TeamError('作品不存在',404);return row;
  };
  if(!signal)return enterpriseRead(actor,enterpriseId,lookup);
  signal.throwIfAborted();await ensureEnterpriseSchema();
  return withOwnedReadClient(getPool(),async tx=>{
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+checkReadClientSocket);
    const s=await scope(tx,actor,enterpriseId);
    if(!s.viewRecords)throw new TeamError('当前岗位没有经营数据查看权限');
    const row=await lookup(tx,s);signal.throwIfAborted();await tx.query('COMMIT');return row;
  },signal);
}

export async function enterpriseArtworkPreviewSources(actor:TeamActor,enterpriseId:string,refs:readonly {email:string;id:string}[],signal:AbortSignal) {
  if(!refs.length)return new Map<number,string|null>();
  if(refs.length>64)throw new TeamError('素材数量过多',400);
  return enterpriseReportRead(actor,enterpriseId,async(tx,s)=>{
    const visible=refs.map((ref,index)=>({...ref,index})).filter(ref=>s.visible.has(ref.email));
    if(!visible.length)return new Map<number,string|null>();
    // Keep the batch narrow even when legacy artworks contain inline images.
    // A null value is an authorized reference that needs the single-item read.
    const limit=4096;
    const {rows}=await tx.query<{index:number;prefix:string}>(`SELECT wanted.index,left(a.image_url,$4) AS prefix
      FROM unnest($1::text[],$2::text[],$3::int[]) wanted(email,id,index)
      JOIN app_artworks a ON a.id=wanted.id AND a.email=wanted.email`,
    [visible.map(ref=>ref.email),visible.map(ref=>ref.id),visible.map(ref=>ref.index),limit+1]);
    return new Map(rows.map(row=>[row.index,row.prefix.length>limit?null:row.prefix]));
  },signal);
}

/** One-time explicit, transactional activation of existing identities. Never recreates users/media/credits. */
export async function activateEnterprise(actor:TeamActor,teamId:string,directorEmail:string,subTeamIds:string[]) {
  if(!actor.consoleAdmin)throw new TeamError('初始化企业需要站点管理员');
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const root=(await tx.query('SELECT * FROM app_account_teams WHERE id=$1 FOR UPDATE',[teamId])).rows[0];
    if(!root)throw new TeamError('企业团队不存在',404);
    if((await tx.query('SELECT 1 FROM app_enterprise_settings WHERE team_id=$1',[teamId])).rowCount)return {ok:true,replayed:true};
    const permanent=(await tx.query(`SELECT u.email,u.role,u.account_expires_at FROM app_account_team_members m JOIN app_users u ON u.email=m.email WHERE m.team_id=$1 FOR UPDATE OF m,u`,[teamId])).rows;
    if(!permanent.some(m=>m.email===directorEmail)||permanent.some(m=>m.role!=='user'))throw new TeamError('正式员工或总监账号校验失败',409);
    const existing=(await tx.query('SELECT email FROM app_enterprise_members WHERE email=ANY($1::text[])',[[root.owner_email,...permanent.map(m=>m.email)]])).rows;
    if(existing.length)throw new TeamError('账号已归属其他企业',409);
    const director=randomUUID(),leader=randomUUID(),employee=randomUUID();
    const roles:EnterpriseRole[]=[{id:director,name:'设计美工总监',level:10,manage_members:true,view_records:true,version:0},{id:leader,name:'团队负责人',level:20,manage_members:true,view_records:true,version:0},{id:employee,name:'正式员工',level:100,manage_members:false,view_records:false,version:0}];
    const leaders=new Set<string>(),interns:{email:string;supervisor_email:string}[]=[];
    for(const id of subTeamIds){
      const sub=(await tx.query('SELECT * FROM app_account_teams WHERE id=$1 FOR SHARE',[id])).rows[0];
      if(!sub||!permanent.some(m=>m.email===sub.owner_email)||sub.owner_email===directorEmail)throw new TeamError('小团队负责人必须是本企业正式员工',409);
      leaders.add(sub.owner_email);
      const children=(await tx.query(`SELECT u.email,u.role,u.account_expires_at FROM app_account_team_members m JOIN app_users u ON u.email=m.email WHERE m.team_id=$1 FOR UPDATE OF m,u`,[id])).rows;
      for(const m of children){if(m.role!=='user'||!m.account_expires_at||permanent.some(x=>x.email===m.email))throw new TeamError('实习生账号或有效期校验失败',409);interns.push({email:m.email,supervisor_email:sub.owner_email})}
    }
    if(new Set(interns.map(m=>m.email)).size!==interns.length)throw new TeamError('实习生组织关系重复',409);
    for(const email of new Set([root.owner_email,...permanent.map(m=>m.email),...interns.map(m=>m.email)]))await assertAccountCanJoinEnterprise(tx,email);
    await tx.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[teamId]);
    for(const r of roles)await tx.query('INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,$3,$4,$5,$6)',[teamId,r.id,r.name,r.level,r.manage_members,r.view_records]);
    for(const m of permanent){
      await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')`,[teamId,m.email,m.email===directorEmail?root.owner_email:directorEmail,m.email===directorEmail?director:leaders.has(m.email)?leader:employee]);
    }
    for(const m of interns)await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment,membership_expires_at) SELECT $1,$2,$3,'intern',account_expires_at FROM app_users WHERE email=$2`,[teamId,m.email,m.supervisor_email]);
    const result={ok:true,replayed:false,permanent:permanent.length,interns:interns.length};
    await tx.query(`INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,fingerprint,result) VALUES($1,$2,$3,'activate','',$4::jsonb)`,[randomUUID(),teamId,actor.email,JSON.stringify(result)]);
    return result;
  });
}

/** Narrow owner-management transaction; authorization and writes share one snapshot. */
export async function enterpriseManageTransaction<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>):Promise<T>{
 return transaction(async tx=>{
  await tx.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
  const current=await scope(tx,actor,id);
  if(!current.owner||!current.manageMembers)throw new TeamError('仅企业负责人或本站管理员可维护成员账号',403);
  return run(tx,current);
 });
}

/** Central organization authority is independent of legacy native business hierarchy. */
export async function enterpriseIdentityTransaction<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>){
 await prepareIdentityEvents();
 return transaction(async tx=>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
  const s=await scope(tx,actor,id,true);
  if(actor.admin||actor.consoleAdmin||!s.canManageIdentity)throw new TeamError('需要中央账号管理权限',403);
  return run(tx,s);
 });
}
