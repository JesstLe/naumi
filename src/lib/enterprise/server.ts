import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ensureTeamSchema, TeamError } from '@/lib/teams/server';
import { requireTeamGrant, type TeamActor } from '@/lib/teams/grants';
import { getPool } from '@/lib/db';
import { settingsSecret } from '@/lib/settings-secret';
import { hashPassword } from '@/lib/pw';
import type { ContentPage } from '@/lib/teams/contracts';
import type { EnterpriseIdentity, EnterpriseMember, EnterpriseRole, EnterpriseSnapshot } from './contracts';
import { pinnedEnterpriseIds,IntegrationError } from './integration/policy';

let ready: Promise<void> | null = null;
export async function ensureEnterpriseSchema() {
  await ensureTeamSchema();
  if (!ready) ready = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_enterprise_settings(
      team_id uuid PRIMARY KEY REFERENCES app_account_teams(id), enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_enterprise_roles(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), id uuid NOT NULL,
      name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60), level integer NOT NULL CHECK(level BETWEEN 1 AND 998),
      manage_members boolean NOT NULL DEFAULT false, view_records boolean NOT NULL DEFAULT false,
      version integer NOT NULL DEFAULT 0, PRIMARY KEY(enterprise_id,id));
    CREATE TABLE IF NOT EXISTS app_enterprise_members(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), email text NOT NULL REFERENCES app_users(email),
      supervisor_email text NOT NULL REFERENCES app_users(email), role_id uuid,
      employment text NOT NULL CHECK(employment IN ('permanent','intern')), version integer NOT NULL DEFAULT 0,
      PRIMARY KEY(enterprise_id,email), UNIQUE(email), CHECK(email<>supervisor_email),
      FOREIGN KEY(enterprise_id,role_id) REFERENCES app_enterprise_roles(enterprise_id,id));
    CREATE INDEX IF NOT EXISTS app_enterprise_members_supervisor ON app_enterprise_members(enterprise_id,supervisor_email);
    CREATE TABLE IF NOT EXISTS app_enterprise_audit(
      id uuid PRIMARY KEY, enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id), actor text NOT NULL,
      action text NOT NULL, target text NOT NULL DEFAULT '', fingerprint text NOT NULL, result jsonb NOT NULL, changes jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE app_enterprise_audit ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '{}';
  `).then(()=>{}).catch(e=>{ready=null;throw e});
  await ready;
}
// Legacy teams belonging to an activated enterprise cannot bypass ERP scope or content restrictions.
export async function enterpriseManaged(email: string) {
  await ensureEnterpriseSchema();
  return !!(await getPool().query(`SELECT 1 FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id
    WHERE t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=s.team_id AND m.email=$1)`,[email])).rowCount;
}
async function transaction<T>(run: (tx: PoolClient)=>Promise<T>) {
  await ensureEnterpriseSchema();const tx=await getPool().connect();
  try {await tx.query('BEGIN');const result=await run(tx);await tx.query('COMMIT');return result}
  catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
type Node = { email: string; supervisor_email: string; role_id: string|null; employment: 'permanent'|'intern'; version:number };
type Scope = { team: EnterpriseIdentity; owner:boolean; level:number; manageMembers:boolean; viewRecords:boolean; roles:EnterpriseRole[]; nodes:Node[]; visible:Set<string> };
export function validateHierarchy(owner:string,nodes:Node[],roles:EnterpriseRole[]) {
  const map=new Map(nodes.map(n=>[n.email,n])),r=new Map(roles.map(x=>[x.id,x]));
  if(map.has(owner))throw new TeamError('老板不能同时作为企业成员',409);
  for(const node of nodes){
    const level=node.role_id?r.get(node.role_id)?.level:999;
    if(level===undefined)throw new TeamError('岗位不属于当前企业',409);
    let at=node.supervisor_email;const seen=new Set([node.email]);
    while(at!==owner){if(seen.has(at)||seen.size>100)throw new TeamError('组织关系存在循环或层级过深',409);seen.add(at);const parent=map.get(at);if(!parent)throw new TeamError('上级不属于当前企业',409);at=parent.supervisor_email}
    if(node.supervisor_email!==owner){const parent=map.get(node.supervisor_email)!;const pr=parent.role_id?r.get(parent.role_id):null;
      if(!pr?.manage_members||pr.level>=level)throw new TeamError('上级必须具有管理权限且等级高于成员',409)}
  }
}
async function scope(tx:PoolClient,actor:TeamActor,id:string,allowSelf=false):Promise<Scope> {
  try {const pinned=pinnedEnterpriseIds();if(pinned.length&&!pinned.includes(id))throw new TeamError('企业不存在',404);}
  catch(e){if(e instanceof IntegrationError)throw new TeamError('企业部署范围尚未配置',503);throw e;}
  const team=(await tx.query(`SELECT t.id,t.name,t.owner_email,t.authorized_until,t.enabled,s.enabled AS enterprise_enabled
    FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id WHERE s.team_id=$1 FOR SHARE OF s,t`,[id])).rows[0];
  if(!team)throw new TeamError('企业不存在',404);
  // Activated enterprises use the entry lifecycle grant as the single source of
  // access expiry. The legacy team cap is only for legacy subaccount management.
  // A null grant expiry is permanent, not an expired Unix epoch.
  let accessExpiry:string|null=team.authorized_until;
  if(!actor.admin){
    const current=(await tx.query('SELECT banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE',[actor.email])).rows[0];
    if(!current||current.banned||current.account_expires_at&&new Date(current.account_expires_at).getTime()<=Date.now())throw new TeamError('账号已停用或到期');
    if(!team.enabled||!team.enterprise_enabled)throw new TeamError('企业授权已关闭或到期');
    // Every descendant uses the live sponsoring owner's entry grant, not a copied/evergreen capability.
    const grant=await requireTeamGrant(tx,{email:team.owner_email,admin:false});
    accessExpiry=grant!.expires_at;
  }else{
    const grant=(await tx.query('SELECT expires_at FROM app_team_access_grants WHERE email=$1 FOR SHARE',[team.owner_email])).rows[0];
    if(grant)accessExpiry=grant.expires_at;
  }
  const roles=(await tx.query('SELECT id,name,level,manage_members,view_records,version FROM app_enterprise_roles WHERE enterprise_id=$1 FOR SHARE',[id])).rows as EnterpriseRole[];
  const nodes=(await tx.query('SELECT email,supervisor_email,role_id,employment,version FROM app_enterprise_members WHERE enterprise_id=$1 FOR SHARE',[id])).rows as Node[];
  validateHierarchy(team.owner_email,nodes,roles);
  const owner=actor.admin||team.owner_email===actor.email;
  const node=nodes.find(m=>m.email===actor.email),role=roles.find(r=>r.id===node?.role_id);
  if(!owner&&(!node||!allowSelf&&(!role||!role.manage_members&&!role.view_records)))throw new TeamError('当前岗位没有企业管理权限');
  const visible=new Set<string>();if(owner)for(const m of nodes)visible.add(m.email);
  else {visible.add(actor.email);let changed=!allowSelf||!!role?.view_records;while(changed){changed=false;for(const m of nodes)if(visible.has(m.supervisor_email)&&!visible.has(m.email)){visible.add(m.email);changed=true}}}
  return {team:{id:team.id,name:team.name,owner_email:team.owner_email,authorized_until:accessExpiry,owner},owner,level:owner?0:role?.level??999,manageMembers:owner||!!role?.manage_members,viewRecords:owner||!!role?.view_records,roles,nodes,visible};
}
/** Workflow creation picker: ordinary employees get self only; never elevates existing analytics routes. */
export async function enterpriseCreationRead<T>(email:string,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>){
 await ensureEnterpriseSchema();const tx=await getPool().connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await tx.query("SET LOCAL statement_timeout='10s'");const s=await scope(tx,{email,admin:false},id,true);if(s.owner)s.visible.add(s.team.owner_email);const result=await run(tx,s);await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
/** Analytics never trusts client member lists. Recheck the live hierarchy/grant in
 * the same consistent snapshot used for every aggregate and export. Shared
 * authorization locks require a read-write transaction; analytics only SELECTs. */
export async function enterpriseRead<T>(actor:TeamActor,id:string,run:(tx:PoolClient,s:Scope)=>Promise<T>) {
  await ensureEnterpriseSchema();const tx=await getPool().connect();
  try {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await tx.query("SET LOCAL statement_timeout='20s'");
    const s=await scope(tx,actor,id);
    if(!s.viewRecords)throw new TeamError('当前岗位没有经营数据查看权限');
    const result=await run(tx,s);await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
export async function enterpriseList(actor:TeamActor):Promise<EnterpriseIdentity[]> {
  return transaction(async tx=>{
    let pinned:string[];try{pinned=pinnedEnterpriseIds()}catch{throw new TeamError('企业部署范围尚未配置',503)}
    const rows=(await tx.query(`SELECT t.id,t.name,t.owner_email,t.authorized_until FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id
      WHERE $2 OR t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=s.team_id AND m.email=$1) ORDER BY t.name`,[actor.email,actor.admin])).rows;
    const result:EnterpriseIdentity[]=[];
    for(const t of rows){if(pinned.length&&!pinned.includes(t.id))continue;try{result.push((await scope(tx,actor,t.id)).team)}catch(e){if(!(e instanceof TeamError)||actor.admin)throw e}}
    return result;
  });
}
async function memberRows(tx:PoolClient,s:Scope):Promise<EnterpriseMember[]> {
  const rows=(await tx.query(`SELECT m.email,u.name,m.supervisor_email,m.role_id,m.employment,m.version,u.management_version,u.banned,u.account_expires_at,
    COALESCE(r.name,'员工') AS role_name,COALESCE(r.level,999)::int AS level,
    GREATEST(0,COALESCE(b.principal,0)-u.credits_used)::int AS available,COALESCE(l.consumed,0)::int AS consumed,COALESCE(a.n,0)::int AS artworks
    FROM app_enterprise_members m JOIN app_users u ON u.email=m.email LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
    LEFT JOIN LATERAL(SELECT sum(remaining) AS principal FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0)b ON true
    LEFT JOIN LATERAL(SELECT -sum(delta) AS consumed FROM app_ledger WHERE email=u.email AND kind='consume' AND delta<0)l ON true
    LEFT JOIN LATERAL(SELECT count(*) AS n FROM app_artworks WHERE email=u.email AND deleted_at IS NULL)a ON true
    WHERE m.enterprise_id=$1 AND m.email=ANY($2::text[]) ORDER BY COALESCE(r.level,999),u.name,u.email`,[s.team.id,[...s.visible]])).rows;
  return rows.map(m=>({...m,canManage:s.manageMembers&&m.email!==s.team.owner_email&&m.email!==undefined&&m.level>s.level}));
}
export async function enterpriseSnapshot(actor:TeamActor,id:string):Promise<EnterpriseSnapshot> {
  return transaction(async tx=>{const s=await scope(tx,actor,id);const members=await memberRows(tx,s);
    const ownerAvailable=s.owner?Number((await tx.query(`SELECT GREATEST(0,COALESCE((SELECT sum(remaining) FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0),0)-u.credits_used)::int AS n FROM app_users u WHERE email=$1`,[s.team.owner_email])).rows[0]?.n||0):null;
    return {enterprise:s.team,members,roles:s.owner?s.roles:[],actor:{owner:s.owner,manageMembers:s.manageMembers,viewRecords:s.viewRecords,level:s.level},ownerAvailable};
  });
}
const common={id:z.string().uuid(),enterpriseId:z.string().uuid()};
const target={...common,email:z.string().trim().min(1).max(254).transform(s=>s.toLowerCase()),expectedVersion:z.number().int().nonnegative(),expectedUserVersion:z.number().int().nonnegative()};
const instant=z.string().datetime({offset:true});
export const enterpriseCommandSchema=z.discriminatedUnion('action',[
  z.object({...common,action:z.literal('role'),roleId:z.string().uuid(),expectedVersion:z.number().int().nonnegative().nullable(),name:z.string().trim().min(1).max(60),level:z.number().int().min(1).max(998),manageMembers:z.boolean(),viewRecords:z.boolean()}).strict(),
  z.object({...target,action:z.literal('organization'),roleId:z.string().uuid().nullable(),supervisorEmail:z.string().trim().min(1).max(254).transform(s=>s.toLowerCase()),employment:z.enum(['permanent','intern']),expiresAt:instant.nullable()}).strict(),
  z.object({...target,action:z.literal('expiry'),expiresAt:instant.nullable()}).strict(),
  z.object({...target,action:z.literal('status'),banned:z.boolean()}).strict(),
  z.object({...target,action:z.literal('reset-password'),password:z.string().min(8).max(128)}).strict(),
]);
export async function mutateEnterprise(actor:TeamActor,command:z.infer<typeof enterpriseCommandSchema>) {
  const fingerprint=createHmac('sha256',settingsSecret()).update(JSON.stringify(command)).digest('hex');
  const passwordHash=command.action==='reset-password'?hashPassword(command.password):null;
  return transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const s=await scope(tx,actor,command.enterpriseId);
    if(!s.manageMembers)throw new TeamError('当前岗位没有成员管理权限');
    if((command.action==='role'||command.action==='organization')&&!s.owner)throw new TeamError('岗位与组织关系由企业老板设置');
    if(command.action!=='role'){
      const m=s.nodes.find(n=>n.email===command.email),role=s.roles.find(r=>r.id===m?.role_id),level=role?.level??999;
      if(!m||!s.visible.has(m.email)||m.email===actor.email||level<=s.level)throw new TeamError('仅可管理本企业范围内的下级');
    }
    const previous=(await tx.query('SELECT actor,fingerprint,result FROM app_enterprise_audit WHERE id=$1',[command.id])).rows[0];
    if(previous){if(previous.actor!==actor.email||previous.fingerprint!==fingerprint)throw new TeamError('操作编号已用于其他请求',409);return {...previous.result,replayed:true}}
    let changes:unknown={};
    if(command.action==='role'){
      const old=s.roles.find(r=>r.id===command.roleId);
      if((old?.version??null)!==command.expectedVersion)throw new TeamError('岗位已更新，请刷新后重试',409);
      const next={id:command.roleId,name:command.name,level:command.level,manage_members:command.manageMembers,view_records:command.viewRecords,version:(old?.version??-1)+1};
      validateHierarchy(s.team.owner_email,s.nodes,[...s.roles.filter(r=>r.id!==next.id),next]);
      changes={before:old||null,after:next};
      await tx.query(`INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(enterprise_id,id) DO UPDATE SET name=excluded.name,level=excluded.level,manage_members=excluded.manage_members,view_records=excluded.view_records,version=app_enterprise_roles.version+1`,[command.enterpriseId,command.roleId,command.name,command.level,command.manageMembers,command.viewRecords]);
    }else{
      const m=s.nodes.find(n=>n.email===command.email)!;
      const u=(await tx.query('SELECT role,management_version,banned,account_expires_at FROM app_users WHERE email=$1 FOR UPDATE',[m.email])).rows[0];
      if(!u||u.role!=='user')throw new TeamError('目标必须为普通企业账号',409);
      if(m.version!==command.expectedVersion||u.management_version!==command.expectedUserVersion)throw new TeamError('成员已更新，请刷新后重试',409);
      if(command.action==='organization'||command.action==='expiry'){
        const employment=command.action==='organization'?command.employment:m.employment;
        if(employment==='permanent'&&command.expiresAt!==null)throw new TeamError('正式员工不设置账号到期时间',400);
        if(employment==='intern'&&(!command.expiresAt||s.team.authorized_until!==null&&new Date(command.expiresAt).getTime()>new Date(s.team.authorized_until).getTime()))throw new TeamError('实习生须设置企业授权范围内的有效期',400);
        if(command.action==='organization'){
          const updated={...m,supervisor_email:command.supervisorEmail,role_id:command.roleId,employment};
          validateHierarchy(s.team.owner_email,s.nodes.map(n=>n.email===m.email?updated:n),s.roles);
          changes={before:{...m,expiresAt:u.account_expires_at},after:{...updated,expiresAt:command.expiresAt}};
          await tx.query('UPDATE app_enterprise_members SET supervisor_email=$3,role_id=$4,employment=$5 WHERE enterprise_id=$1 AND email=$2',[command.enterpriseId,m.email,command.supervisorEmail,command.roleId,employment]);
        }
        if(command.action==='expiry')changes={before:u.account_expires_at,after:command.expiresAt};
        await tx.query('UPDATE app_users SET account_expires_at=$2 WHERE email=$1',[m.email,command.expiresAt]);
      }else if(command.action==='status'){
        if(!command.banned&&u.account_expires_at&&new Date(u.account_expires_at).getTime()<=Date.now())throw new TeamError('先设置未来有效期再启用实习生',409);
        await tx.query('UPDATE app_users SET banned=$2,auth_revoked_before=clock_timestamp() WHERE email=$1',[m.email,command.banned]);
        changes={before:u.banned,after:command.banned};
      }else if(command.action==='reset-password'){
        await tx.query('UPDATE app_users SET password_hash=$2,auth_revoked_before=clock_timestamp() WHERE email=$1',[m.email,passwordHash]);
        changes={passwordReset:true,oldSessionsRevoked:true};
      }
      await tx.query('UPDATE app_users SET management_version=management_version+1 WHERE email=$1',[m.email]);
      await tx.query('UPDATE app_enterprise_members SET version=version+1 WHERE enterprise_id=$1 AND email=$2',[command.enterpriseId,m.email]);
    }
    const result={ok:true,replayed:false};
    await tx.query('INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result,changes) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[command.id,command.enterpriseId,actor.email,command.action,'email'in command?command.email:command.roleId,fingerprint,JSON.stringify(result),JSON.stringify(changes)]);
    return result;
  });
}
async function contentScope(tx:PoolClient,actor:TeamActor,id:string,email:string) {
  const s=await scope(tx,actor,id);
  if(!s.viewRecords||!(s.visible.has(email)||s.owner&&email===s.team.owner_email))throw new TeamError('没有该成员内容的查看权限');
  return s;
}
const sources={artworks:'SELECT id,title,status,image_url,created_at FROM app_artworks WHERE email=$1 AND deleted_at IS NULL',tasks:`SELECT id,kind,COALESCE(snapshot->>'status','unknown') AS status,COALESCE(payload->'p'->>'userPrompt',payload->'p'->>'prompt',payload->>'prompt','') AS prompt,cost,created_at FROM app_image_jobs WHERE email=$1
  UNION ALL SELECT id,'canvas-'||kind,status,COALESCE(parameters->>'prompt',parameters->>'newText',''),cost,created_at FROM app_canvas_image_tasks WHERE email=$1
  UNION ALL SELECT id,'video',status,prompt,cost,created_at FROM app_video_tasks WHERE email=$1`};
export async function enterpriseContent(actor:TeamActor,id:string,email:string,section:keyof typeof sources,page:number):Promise<ContentPage> {
  return transaction(async tx=>{await contentScope(tx,actor,id,email);const source=sources[section];
    const total=Number((await tx.query(`SELECT count(*)::int AS n FROM (${source}) s`,[email])).rows[0].n);
    const rows=(await tx.query(`SELECT * FROM (${source}) s ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[email,(page-1)*20])).rows;
    return {rows,total,page,size:20};
  });
}
export async function enterpriseArtwork(actor:TeamActor,enterpriseId:string,email:string,id:string) {
  return enterpriseRead(actor,enterpriseId,async(tx,s)=>{
    if(!s.visible.has(email))throw new TeamError('没有该成员内容的查看权限');
    const row=(await tx.query('SELECT image_url FROM app_artworks WHERE email=$1 AND id=$2',[email,id])).rows[0];
    if(!row)throw new TeamError('作品不存在',404);return row;
  });
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
    await tx.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[teamId]);
    for(const r of roles)await tx.query('INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,$3,$4,$5,$6)',[teamId,r.id,r.name,r.level,r.manage_members,r.view_records]);
    for(const m of permanent){
      await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')`,[teamId,m.email,m.email===directorEmail?root.owner_email:directorEmail,m.email===directorEmail?director:leaders.has(m.email)?leader:employee]);
      await tx.query('UPDATE app_users SET account_expires_at=NULL,management_version=management_version+1 WHERE email=$1',[m.email]);
    }
    for(const m of interns)await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'intern')`,[teamId,m.email,m.supervisor_email]);
    const result={ok:true,replayed:false,permanent:permanent.length,interns:interns.length};
    await tx.query(`INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,fingerprint,result) VALUES($1,$2,$3,'activate','',$4::jsonb)`,[randomUUID(),teamId,actor.email,JSON.stringify(result)]);
    return result;
  });
}
