import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { requireAdmin, resolveUserEmail } from '@/lib/admin-auth';
import { dbEnabled, getPool } from '@/lib/db';
import { ensureEnterpriseSchema, validateHierarchy } from '@/lib/enterprise/server';
import { TeamError } from '@/lib/teams/server';
import { teamJson } from '@/lib/teams/access';
import type { TeamActor } from '@/lib/teams/grants';
import { createTenantSchema, updateTenantSchema, tenantMemberSchema, type TenantFilters, type TenantList, type TenantSummary } from './tenant-contracts';

let ready: Promise<void>|null = null;
export async function ensureTenantSchema() {
  await ensureEnterpriseSchema();
  if (!ready) ready = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_tenant_entitlements(
      tenant_id uuid PRIMARY KEY REFERENCES app_account_teams(id),
      entitlement_name text, seat_limit integer CHECK(seat_limit IS NULL OR seat_limit>0),
      feature_policy jsonb NOT NULL DEFAULT '{}', updated_by text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_tenant_commands(
      command_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES app_account_teams(id),
      actor text NOT NULL, fingerprint text NOT NULL, action text NOT NULL,
      result jsonb NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_tenant_commands_tenant ON app_tenant_commands(tenant_id,created_at DESC);
    ALTER TABLE app_account_teams ALTER COLUMN authorized_until DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS app_account_teams_name ON app_account_teams(lower(name),id);
  `).then(()=>{}).catch(e=>{ready=null;throw e;});
  await ready;
}
export async function tenantAuthorize(request:Request) {
  if (!await requireAdmin(request) || process.env.FLEET_PORTAL_ONLY==='1' || process.env.NAUMI_AUTH_LOGIN_ONLY==='1') return teamJson({error:'需要平台管理权限',code:'PLATFORM_ACCESS_REQUIRED'},403);
  if (!dbEnabled) return teamJson({error:'数据库未配置',code:'DATABASE_UNAVAILABLE'},503);
  return {email:await resolveUserEmail(request)||'local-admin',admin:true,consoleAdmin:true} satisfies TeamActor;
}
export function tenantFailure(error:unknown) {
  if(error instanceof TeamError)return teamJson({error:error.message,code:`TENANT_${error.status}`},error.status);
  return teamJson({error:'服务暂不可用，请使用原操作编号核对结果',code:'TENANT_UNAVAILABLE',uncertain:true},503);
}
async function transaction<T>(run:(tx:PoolClient)=>Promise<T>) {
  await ensureTenantSchema(); const tx=await getPool().connect();
  try {await tx.query('BEGIN');await tx.query("SET LOCAL statement_timeout='20s'");const result=await run(tx);await tx.query('COMMIT');return result;}
  catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
const projection=`SELECT t.id,t.name,t.owner_email,u.name AS owner_name,t.authorized_until,t.enabled,t.version,t.created_at,t.updated_at,
  COALESCE(s.enabled,true) AS enterprise_enabled,e.entitlement_name,e.seat_limit,COALESCE(e.feature_policy,'{}') AS feature_policy,
  CASE WHEN NOT t.enabled OR NOT COALESCE(s.enabled,true) THEN 'suspended'
    WHEN t.authorized_until IS NOT NULL AND t.authorized_until<=now() THEN 'expired' ELSE 'active' END AS status,
  (CASE WHEN NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()) THEN 1 ELSE 0 END+
    (SELECT count(*) FROM app_enterprise_members m JOIN app_users mu ON mu.email=m.email
      WHERE m.enterprise_id=t.id AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())
        AND NOT mu.banned AND (mu.account_expires_at IS NULL OR mu.account_expires_at>now())))::int AS active_members
  FROM app_account_teams t JOIN app_users u ON u.email=t.owner_email
  JOIN app_enterprise_settings s ON s.team_id=t.id LEFT JOIN app_tenant_entitlements e ON e.tenant_id=t.id`;
const iso=(value:Date|string|null):string|null=>value===null?null:new Date(value).toISOString();
function summary(r:Record<string,any>):TenantSummary {
  return {tenantId:r.id,name:r.name,owner:{email:r.owner_email,name:r.owner_name},status:r.status,
    entitlementName:r.entitlement_name??null,validUntil:iso(r.authorized_until),seatLimit:r.seat_limit??null,
    featurePolicy:r.feature_policy,version:r.version,activeMembers:r.active_members,
    createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,creationCount:null,lastActivityAt:null};
}
async function creationTable(tx:PoolClient) {return !!(await tx.query("SELECT to_regclass('app_creation_records') IS NOT NULL AS present")).rows[0].present;}
async function attachTenantActivity(tx:PoolClient,items:TenantSummary[],filters:TenantFilters) {
  if(!items.length||!await creationTable(tx))return;
  const dates=tenantDates(filters);
  const rows=(await tx.query(`SELECT tenant_id,count(*) FILTER(WHERE accepted_at>=$2 AND accepted_at<$3)::int AS n,max(accepted_at) AS last
    FROM app_creation_records WHERE scope_kind='tenant' AND parent_id IS NULL AND tenant_id=ANY($1::uuid[]) GROUP BY tenant_id`,[items.map(t=>t.tenantId),dates.start,dates.end])).rows;
  for(const tenant of items){const row=rows.find(r=>r.tenant_id===tenant.tenantId);tenant.creationCount=row?.n??0;tenant.lastActivityAt=iso(row?.last??null);}
}
export function tenantDates(filters:Pick<TenantFilters,'from'|'to'>) {
  const day=86400000,today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const to=filters.to||today,from=filters.from||new Date(Date.parse(to)-6*day).toISOString().slice(0,10);
  if(from>to||Date.parse(to)-Date.parse(from)>366*day)throw new TeamError('日期范围须在一年内',400);
  return {from,to,start:new Date(`${from}T00:00:00+08:00`).toISOString(),end:new Date(Date.parse(`${to}T00:00:00+08:00`)+day).toISOString()};
}
export async function listTenants(filters:TenantFilters):Promise<TenantList> {
  return transaction(async tx=>{
    tenantDates(filters);
    const q=`%${filters.q.replace(/[\\%_]/g,'\\$&')}%`;
    const source=`WITH tenants AS (${projection}) SELECT * FROM tenants WHERE (name ILIKE $1 OR owner_email ILIKE $1 OR owner_name ILIKE $1) AND ($2::text IS NULL OR status=$2)`;
    const params=[q,filters.status||null];
    const total=Number((await tx.query(`SELECT count(*)::int n FROM (${source}) filtered`,params)).rows[0].n);
    const order=filters.sort==='name'?'lower(name),id':'created_at DESC,id';
    const rows=(await tx.query(`${source} ORDER BY ${order} LIMIT $3 OFFSET $4`,[...params,filters.size,(filters.page-1)*filters.size])).rows;
    const items=rows.map(summary);await attachTenantActivity(tx,items,filters);
    return {items,total,page:filters.page,size:filters.size,appliedFilters:filters,generatedAt:new Date().toISOString(),scope:'platform',availability:'available'};
  });
}
export async function tenantDetail(id:string) {
  return transaction(async tx=>{
    const row=(await tx.query(`${projection} WHERE t.id=$1`,[id])).rows[0];
    if(!row)throw new TeamError('租户不存在',404);
    const members=(await tx.query(`SELECT m.email,u.name,m.supervisor_email,m.role_id,COALESCE(r.name,'员工') role_name,
      m.employment,m.membership_status,m.membership_expires_at,m.joined_at,m.left_at,m.version,
      u.banned,u.account_expires_at,u.management_version
      FROM app_enterprise_members m JOIN app_users u ON u.email=m.email
      LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
      WHERE m.enterprise_id=$1 ORDER BY u.name,m.email`,[id])).rows;
    const roles=(await tx.query('SELECT id,name,level,manage_members,view_records,version FROM app_enterprise_roles WHERE enterprise_id=$1 ORDER BY level,id',[id])).rows;
    const audit=(await tx.query(`SELECT command_id AS id,actor,action,changes,created_at FROM app_tenant_commands WHERE tenant_id=$1
      UNION ALL SELECT id,actor,action,changes,created_at FROM app_enterprise_audit WHERE enterprise_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 100`,[id])).rows;
    const tenant=summary(row);await attachTenantActivity(tx,[tenant],{q:'',page:1,size:20,sort:'createdAt'});
    let consumedCredits:number|null=null;
    if(await creationTable(tx)&&(await tx.query("SELECT to_regclass('app_creation_links') IS NOT NULL AS present")).rows[0].present){
      const money=(await tx.query(`SELECT sum(b.charged_credits)::int AS n FROM app_billing_operations b
        WHERE b.state='settled' AND EXISTS(SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
          WHERE c.tenant_id=$1 AND c.scope_kind='tenant' AND l.target_type='billing' AND l.target_id=b.id AND c.payer_account_id=b.email)`,[id])).rows[0];
      consumedCredits=money.n??null;
    }
    return {tenant,members,roles,audit,usage:{confirmedCreations:tenant.creationCount,consumedCredits},generatedAt:new Date().toISOString()};
  });
}
export async function tenantCommandResult(actor:TeamActor,commandId:string) {
  await ensureTenantSchema();
  const row=(await getPool().query('SELECT actor,result FROM app_tenant_commands WHERE command_id=$1',[commandId])).rows[0];
  if(!row||row.actor!==actor.email)throw new TeamError('操作结果尚未记录，请使用原操作编号重试',404);
  return {...row.result,replayed:true};
}
async function replay(tx:PoolClient,actor:TeamActor,id:string,fingerprint:string) {
  const old=(await tx.query('SELECT actor,fingerprint,result FROM app_tenant_commands WHERE command_id=$1',[id])).rows[0];
  if(!old)return null;
  if(old.actor!==actor.email||old.fingerprint!==fingerprint)throw new TeamError('操作编号已用于其他请求',409);
  return {...old.result,replayed:true};
}
export async function createTenant(actor:TeamActor,command:z.infer<typeof createTenantSchema>) {
  if(!actor.admin)throw new TeamError('需要平台管理权限');
  const fingerprint=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const oldResult=await replay(tx,actor,command.commandId,fingerprint);if(oldResult)return oldResult;
    if(command.validUntil&&Date.parse(command.validUntil)<=Date.now())throw new TeamError('新授权期限须晚于当前时间',400);
    const owner=(await tx.query('SELECT email,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE',[command.ownerEmail])).rows[0];
    if(!owner||owner.banned||owner.account_expires_at&&new Date(owner.account_expires_at).getTime()<=Date.now())throw new TeamError('负责人须为有效的已有账号',400);
    if((await tx.query('SELECT 1 FROM app_account_team_members WHERE email=$1',[command.ownerEmail])).rowCount)throw new TeamError('负责人已有旧团队子账号身份，请先解除原归属',409);
    if((await tx.query('SELECT 1 FROM app_enterprise_members WHERE email=$1',[command.ownerEmail])).rowCount)throw new TeamError('负责人已有企业成员身份，请先明确解除原归属',409);
    const existing=(await tx.query('SELECT id,name FROM app_account_teams WHERE owner_email=$1 FOR UPDATE',[command.ownerEmail])).rows[0];
    if(existing&&command.reuseTeamId!==existing.id)throw new TeamError(`负责人已有团队，请明确选择复用：${existing.id}`,409);
    if(!existing&&command.reuseTeamId)throw new TeamError('所选团队与负责人不匹配',409);
    const tenantId=existing?.id||randomUUID();
    if(existing&&(await tx.query('SELECT 1 FROM app_enterprise_settings WHERE team_id=$1',[tenantId])).rowCount)throw new TeamError('该团队已开通企业，请进入租户详情维护',409);
    const legacy=(await tx.query('SELECT email FROM app_account_team_members WHERE team_id=$1',[tenantId])).rows;
    if(legacy.length)throw new TeamError('既有团队包含成员，请先使用企业初始化流程确认组织关系',409);
    if(existing)await tx.query('UPDATE app_account_teams SET name=$2,authorized_until=$3,enabled=true,version=version+1,updated_at=now() WHERE id=$1',[tenantId,command.name,command.validUntil]);
    else await tx.query('INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,$2,$3,$4)',[tenantId,command.name,command.ownerEmail,command.validUntil]);
    await tx.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[tenantId]);
    await tx.query(`INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by) VALUES($1,'owned',$2,$3,$3)
      ON CONFLICT(email) DO UPDATE SET expires_at=excluded.expires_at,enabled=true,revoked_at=NULL,starts_at=now(),version=app_team_access_grants.version+1,updated_by=excluded.updated_by,updated_at=now()`,[command.ownerEmail,command.validUntil,actor.email]);
    await tx.query('INSERT INTO app_tenant_entitlements(tenant_id,entitlement_name,seat_limit,feature_policy,updated_by) VALUES($1,$2,$3,$4::jsonb,$5)',[tenantId,command.entitlementName,command.seatLimit,JSON.stringify(command.featurePolicy),actor.email]);
    const version=(await tx.query('SELECT version FROM app_account_teams WHERE id=$1',[tenantId])).rows[0].version;
    const result={ok:true,tenantId,replayed:false,version};
    await tx.query("INSERT INTO app_tenant_commands(command_id,tenant_id,actor,fingerprint,action,result,changes) VALUES($1,$2,$3,$4,'create',$5::jsonb,$6::jsonb)",[command.commandId,tenantId,actor.email,fingerprint,JSON.stringify(result),JSON.stringify({before:null,after:command})]);
    return result;
  });
}
export async function updateTenant(actor:TeamActor,id:string,command:z.infer<typeof updateTenantSchema>) {
  if(!actor.admin)throw new TeamError('需要平台管理权限');
  const fingerprint=createHash('sha256').update(JSON.stringify({id,...command})).digest('hex');
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const oldResult=await replay(tx,actor,command.commandId,fingerprint);if(oldResult)return oldResult;
    await tx.query('SELECT id FROM app_account_teams WHERE id=$1 FOR UPDATE',[id]);
    const before=(await tx.query(`${projection} WHERE t.id=$1`,[id])).rows[0];if(!before)throw new TeamError('租户不存在',404);
    if(before.version!==command.expectedVersion)throw new TeamError('租户资料已更新，请刷新后重试',409);
    if(command.seatLimit!==null&&command.seatLimit<before.active_members)throw new TeamError(`席位不能少于当前有效人数 ${before.active_members}`,409);
    if(command.status==='active'&&command.validUntil&&Date.parse(command.validUntil)<=Date.now())throw new TeamError('恢复前须更新授权期限',409);
    await tx.query('UPDATE app_account_teams SET name=$2,authorized_until=$3,enabled=$4,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id,command.name,command.validUntil,command.status==='active']);
    await tx.query('UPDATE app_enterprise_settings SET enabled=$2 WHERE team_id=$1',[id,command.status==='active']);
    await tx.query(`INSERT INTO app_tenant_entitlements(tenant_id,entitlement_name,seat_limit,feature_policy,updated_by) VALUES($1,$2,$3,$4::jsonb,$5)
      ON CONFLICT(tenant_id) DO UPDATE SET entitlement_name=excluded.entitlement_name,seat_limit=excluded.seat_limit,feature_policy=excluded.feature_policy,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,[id,command.entitlementName,command.seatLimit,JSON.stringify(command.featurePolicy),actor.email]);
    await tx.query(`UPDATE app_team_access_grants SET expires_at=$2,version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE email=$1`,[before.owner_email,command.validUntil,actor.email]);
    const result={ok:true,tenantId:id,version:before.version+1,replayed:false};
    await tx.query("INSERT INTO app_tenant_commands(command_id,tenant_id,actor,fingerprint,action,result,changes) VALUES($1,$2,$3,$4,'update',$5::jsonb,$6::jsonb)",[command.commandId,id,actor.email,fingerprint,JSON.stringify(result),JSON.stringify({before:summary(before),after:command,reason:command.reason})]);
    return result;
  });
}
export async function mutateTenantMember(actor:TeamActor,id:string,command:z.infer<typeof tenantMemberSchema>) {
  if(!actor.admin)throw new TeamError('需要平台管理权限');
  const fingerprint=createHash('sha256').update(JSON.stringify({id,...command})).digest('hex');
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const replayed=await replay(tx,actor,command.commandId,fingerprint);if(replayed)return replayed;
    const team=(await tx.query('SELECT * FROM app_account_teams WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!team||(await tx.query('SELECT 1 FROM app_enterprise_settings WHERE team_id=$1',[id])).rowCount===0)throw new TeamError('租户不存在',404);
    if(command.email===team.owner_email)throw new TeamError('不能通过成员操作修改最后所有者身份',409);
    const old=(await tx.query('SELECT * FROM app_enterprise_members WHERE email=$1 FOR UPDATE',[command.email])).rows[0];
    if(old&&old.enterprise_id!==id)throw new TeamError('账号已有其他企业身份；本版本不自动迁移归属',409);
    if((old?.version??null)!==command.expectedVersion)throw new TeamError('成员身份已更新，请刷新后重试',409);
    if(command.action==='remove'){
      if(!old)throw new TeamError('成员不存在',404);
      await tx.query("UPDATE app_enterprise_members SET membership_status='suspended',left_at=clock_timestamp(),version=version+1 WHERE enterprise_id=$1 AND email=$2",[id,command.email]);
    }else{
      if(old?.membership_status==='active')throw new TeamError('成员已在企业，请使用组织和岗位编辑',409);
      const user=(await tx.query('SELECT email,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE',[command.email])).rows[0];
      if(!user||user.banned||user.account_expires_at&&new Date(user.account_expires_at).getTime()<=Date.now())throw new TeamError('只能加入有效的已有账号',400);
      if((await tx.query('SELECT 1 FROM app_account_teams WHERE owner_email=$1',[command.email])).rowCount)throw new TeamError('企业所有者不能同时作为成员',409);
      const legacy=(await tx.query('SELECT team_id FROM app_account_team_members WHERE email=$1',[command.email])).rows[0];
      if(legacy&&legacy.team_id!==id)throw new TeamError('账号存在旧团队身份，须先明确处理原归属',409);
      const entitlement=(await tx.query('SELECT seat_limit FROM app_tenant_entitlements WHERE tenant_id=$1',[id])).rows[0];
      const current=(await tx.query(`${projection} WHERE t.id=$1`,[id])).rows[0];
      if(entitlement?.seat_limit!==null&&entitlement?.seat_limit!==undefined&&current.active_members>=entitlement.seat_limit)throw new TeamError('企业有效成员已达席位上限',409);
      if(command.employment==='permanent'&&command.expiresAt!==null)throw new TeamError('正式员工企业身份有效期须为永久',400);
      if(command.employment==='intern'&&(!command.expiresAt||Date.parse(command.expiresAt)<=Date.now()||team.authorized_until&&Date.parse(command.expiresAt)>new Date(team.authorized_until).getTime()))throw new TeamError('实习生须设置企业授权范围内的未来有效期',400);
      const nodes=(await tx.query('SELECT email,supervisor_email,role_id,employment,version FROM app_enterprise_members WHERE enterprise_id=$1',[id])).rows;
      const roles=(await tx.query('SELECT id,name,level,manage_members,view_records,version FROM app_enterprise_roles WHERE enterprise_id=$1',[id])).rows;
      const next={email:command.email,supervisor_email:command.supervisorEmail,role_id:command.roleId,employment:command.employment,version:(old?.version??-1)+1};
      validateHierarchy(team.owner_email,[...nodes.filter(n=>n.email!==command.email),next],roles);
      await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment,membership_expires_at)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(enterprise_id,email) DO UPDATE SET supervisor_email=excluded.supervisor_email,
        role_id=excluded.role_id,employment=excluded.employment,membership_expires_at=excluded.membership_expires_at,
        membership_status='active',left_at=NULL,version=app_enterprise_members.version+1`,[id,command.email,command.supervisorEmail,command.roleId,command.employment,command.expiresAt]);
    }
    const result={ok:true,tenantId:id,email:command.email,replayed:false,version:(old?.version??-1)+1};
    const after=(await tx.query('SELECT email,supervisor_email,role_id,employment,membership_status,membership_expires_at,version FROM app_enterprise_members WHERE enterprise_id=$1 AND email=$2',[id,command.email])).rows[0];
    await tx.query('INSERT INTO app_tenant_commands(command_id,tenant_id,actor,fingerprint,action,result,changes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[command.commandId,id,actor.email,fingerprint,'member-'+command.action,JSON.stringify(result),JSON.stringify({before:old??null,after,reason:command.reason})]);
    return result;
  });
}
export async function saasOverview(filters:TenantFilters) {
  const tenants=await listTenants({...filters,size:10});
  await ensureTenantSchema();
  const totals=(await getPool().query(`WITH tenants AS (${projection}) SELECT count(*)::int total,
    count(*) FILTER(WHERE status='active' AND authorized_until>now() AND authorized_until<=now()+interval '7 days')::int expiring FROM tenants`)).rows[0];
  const dates=tenantDates(filters),metrics={tenants:totals.total,activeTenants:null as number|null,creations:null as number|null,needsReview:null as number|null,failed:null as number|null,expiring:totals.expiring};
  let trend:{date:string;count:number}[]|null=null;
  const pool=getPool(),present=(await pool.query("SELECT to_regclass('app_creation_records') IS NOT NULL AS present")).rows[0].present;
  if(present){
    const counts=(await pool.query(`SELECT count(*)::int creations,count(DISTINCT tenant_id)::int active,
      count(*) FILTER(WHERE status='needs_review')::int review,count(*) FILTER(WHERE status='failed')::int failed
      FROM app_creation_records WHERE parent_id IS NULL AND accepted_at>=$1 AND accepted_at<$2`,[dates.start,dates.end])).rows[0];
    Object.assign(metrics,{activeTenants:counts.active,creations:counts.creations,needsReview:counts.review,failed:counts.failed});
    trend=(await pool.query(`SELECT to_char(d,'YYYY-MM-DD') AS date,COALESCE(c.n,0)::int AS count FROM generate_series($1::date,$2::date,'1 day') d
      LEFT JOIN(SELECT (accepted_at AT TIME ZONE 'Asia/Shanghai')::date AS date_key,count(*)::int n FROM app_creation_records
      WHERE parent_id IS NULL AND accepted_at>=$3 AND accepted_at<$4 GROUP BY date_key)c ON c.date_key=d::date ORDER BY d`,[dates.from,dates.to,dates.start,dates.end])).rows;
  }
  return {metrics,trend,tenants,generatedAt:new Date().toISOString()};
}
