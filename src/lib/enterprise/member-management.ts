import {prepareIdentityEvents,identityAccountEvent} from './identity/events';
import 'server-only';
import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {accountIdentifierSchema} from '@/lib/account-identity-schema';
import {hashPassword} from '@/lib/pw';
import {settingsSecret} from '@/lib/settings-secret';
import {enterpriseSiteIdentity} from '@/lib/site-control/identity';
import {supabaseEnabled} from '@/lib/auth-mode';
import {getBillingRuntime} from '@/lib/billing/runtime';
import {BillingError} from '@/lib/billing/types';
import {TeamError} from '@/lib/teams/errors';
import type {TeamActor} from '@/lib/teams/grants';
import {enterpriseManageTransaction,validateHierarchy} from './server';
import {USER_POSITIONS} from '@/lib/accounts/positions';

const common={id:z.string().uuid(),enterpriseId:z.string().uuid(),email:accountIdentifierSchema,reason:z.string().trim().min(3).max(500)};
const version={expectedVersion:z.number().int().nonnegative(),expectedUserVersion:z.number().int().nonnegative()};
const password=z.string().min(8).max(128);
const profile={name:z.string().trim().min(1).max(80),phone:z.string().trim().max(40),note:z.string().trim().max(1000)};
const months=z.number().int().min(1).max(120).optional();
export const enterpriseMemberCommandSchema=z.discriminatedUnion('action',[
 z.object({...common,...version,action:z.literal('position'),position:z.enum(USER_POSITIONS)}).strict(),
 z.object({...common,action:z.literal('create'),...profile,password,initialCredits:z.number().int().min(0).max(1000000),months,roleId:z.string().uuid(),supervisorEmail:accountIdentifierSchema,employment:z.enum(['permanent','intern']),expiresAt:z.string().datetime({offset:true}).nullable()}).strict(),
 z.object({...common,...version,action:z.literal('profile'),...profile,position:z.enum(USER_POSITIONS).optional()}).strict(),
 z.object({...common,...version,action:z.literal('reset-password'),password}).strict(),
 z.object({...common,...version,action:z.literal('adjust'),delta:z.number().int().min(-1000000).max(1000000).refine(x=>x!==0),months}).strict(),
]);
export type EnterpriseMemberCommand=z.infer<typeof enterpriseMemberCommandSchema>;

/** Dedicated installations own native account credentials. Shared tenants do not. */
export async function manageEnterpriseMember(actor:TeamActor,command:EnterpriseMemberCommand){
 await prepareIdentityEvents();
 const site=enterpriseSiteIdentity();
 if(!site||site.enterpriseId!==command.enterpriseId||supabaseEnabled)throw new TeamError('此账号维护入口仅用于本站独立企业的原生账号',403);
 const runtime=await getBillingRuntime(),billing=await runtime.config.current();
 const fingerprint=createHmac('sha256',settingsSecret()).update(JSON.stringify(command)).digest('hex');
 const passwordHash='password'in command?hashPassword(command.password):null;
 try{return await enterpriseManageTransaction(actor,command.enterpriseId,async(tx,s)=>{
  const old=(await tx.query('SELECT actor,fingerprint,result FROM app_enterprise_audit WHERE id=$1',[command.id])).rows[0];
  if(old){if(old.actor!==actor.email||old.fingerprint!==fingerprint)throw new TeamError('操作编号已用于其他请求',409);return {...old.result,replayed:true};}
  if(command.email===actor.email||command.email===s.team.owner_email)throw new TeamError('请在个人安全设置中管理负责人账号',403);
  let user=(await tx.query('SELECT email,name,phone,note,position,role,banned,account_expires_at,management_version,credits_used FROM app_users WHERE email=$1 FOR UPDATE',[command.email])).rows[0];
  const before=user?{name:user.name,phone:user.phone,note:user.note,position:user.position,managementVersion:user.management_version}:null;
  if(command.action==='create'){
   if(user)throw new TeamError('该账号已存在，未修改原账号或企业归属',409);
   const selectedRole=s.roles.find(r=>r.id===command.roleId);
   if(!selectedRole)throw new TeamError('岗位不属于本企业',400);
   if(command.employment==='permanent'&&command.expiresAt!==null)throw new TeamError('正式员工不设置企业身份到期时间',400);
   if(command.employment==='intern'&&(!command.expiresAt||Date.parse(command.expiresAt)<=Date.now()||s.team.authorized_until&&Date.parse(command.expiresAt)>Date.parse(s.team.authorized_until)))throw new TeamError('实习生有效期须在企业授权期限内',400);
   if(s.entitlement.seatLimit!==null){const active=s.nodes.filter(n=>n.global_active!==false&&n.membership_status!=='suspended'&&(!n.membership_expires_at||Date.parse(n.membership_expires_at)>Date.now())).length;if(active+2>s.entitlement.seatLimit)throw new TeamError('企业有效成员已达席位上限',409);}
   const member={email:command.email,supervisor_email:command.supervisorEmail,role_id:command.roleId,employment:command.employment,version:0};
   validateHierarchy(s.team.owner_email,[...s.nodes,member],s.roles);
   await tx.query("INSERT INTO app_users(email,name,phone,note,plan,credits_total,credits_used,renews_at,password_hash) VALUES($1,$2,NULLIF($3,''),$4,'starter',0,0,now()+interval '1 month',$5)",[command.email,command.name,command.phone,command.note,passwordHash]);
   await tx.query('INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment,membership_expires_at) VALUES($1,$2,$3,$4,$5,$6)',[command.enterpriseId,command.email,command.supervisorEmail,command.roleId,command.employment,command.expiresAt]);
   user={credits_used:0,management_version:0};
  }else{
   const member=s.nodes.find(n=>n.email===command.email);
   if(!member||!s.manageable.has(command.email)||!user||user.role!=='user')throw new TeamError('仅可维护本企业的普通成员账号',403);
   if(member.version!==command.expectedVersion||user.management_version!==command.expectedUserVersion)throw new TeamError('成员资料已更新，请刷新后重试',409);
  }
  const delta=command.action==='adjust'?command.delta:command.action==='create'?command.initialCredits:0;
  let balance:Record<string,number>|undefined;
  if(delta){
   const principal=Number((await tx.query('SELECT COALESCE(sum(remaining),0) AS n FROM app_credit_batches WHERE email=$1 AND remaining>0 AND expires_at>now()',[command.email])).rows[0].n);
   const available=Math.max(0,principal-Number(user.credits_used));
   await runtime.service.adjustTx(tx,{id:`enterprise-member-${command.id}`,email:command.email,amount:delta,source:'admin',reason:'管理员调整积分',expiry:'months'in command&&command.months?{unit:'months',value:command.months}:billing.config.credits.admin,ledgerId:`led-enterprise-member-${command.id}`,actor:actor.email,fingerprint,debitOrder:billing.config.credits.debitOrder});
   balance={delta,availableBefore:available,availableAfter:available+delta};
  }
  if(command.action==='position')await tx.query('UPDATE app_users SET position=$2 WHERE email=$1',[command.email,command.position]);
  if(command.action==='profile')await tx.query("UPDATE app_users SET name=$2,phone=NULLIF($3,''),note=$4,position=$5 WHERE email=$1",[command.email,command.name,command.phone,command.note,command.position??user.position??'']);
  if(command.action==='reset-password')await tx.query('UPDATE app_users SET password_hash=$2,auth_revoked_before=clock_timestamp() WHERE email=$1',[command.email,passwordHash]);
  await tx.query('UPDATE app_users SET management_version=management_version+1 WHERE email=$1',[command.email]);
  const after=(await tx.query('SELECT name,phone,note,position,management_version FROM app_users WHERE email=$1',[command.email])).rows[0];
  const result={ok:true,replayed:false,email:command.email,version:after.management_version};
  await tx.query('INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result,changes) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[command.id,command.enterpriseId,actor.email,`account-${command.action}`,command.email,fingerprint,JSON.stringify(result),JSON.stringify({before,after,reason:command.reason,...balance,...(command.action==='reset-password'?{sessionsRevoked:true}:{})})]);
  await identityAccountEvent(tx,command.email,'account-'+command.action,command.enterpriseId);
  return result;
 });}catch(error){if(error instanceof BillingError)throw new TeamError(error.message,error.status);if((error as {code?:string}).code==='23505')throw new TeamError((error as {constraint?:string}).constraint==='app_users_phone_idx'?'该手机号已被其他账号使用':'账号或操作记录已存在，请刷新核对',409);throw error;}
}

