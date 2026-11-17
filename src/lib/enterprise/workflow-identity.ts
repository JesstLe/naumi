import {administeredSite} from './site-administrator';
import {WORKFLOW_PERMISSIONS,DEFAULT_WORKFLOW_PERMISSIONS,workflowPermissionsSchema,type WorkflowPermission} from './workflow-permissions';
import { assertWorkflowProfileAccess,assertWorkflowSiteAccess } from '@/lib/site-control/workflow-access';
import { siteProfile } from '@/lib/site-control/store';
import 'server-only';
import { createPrivateKey,randomUUID,sign } from 'node:crypto';
import { enterpriseUserEmail } from './access';
import { getPool } from "@/platform/db/pool";
import {ensureEnterpriseSchema} from "@/lib/enterprise/schema";

import { activeTeamGrant,requireTeamGrant } from '@/lib/teams/grants';
import { TeamError } from "@/lib/teams/errors";
import {userFeaturePolicy} from "@/lib/feature-access/repository";
import { allows } from '@/lib/feature-access/catalog';
import { assertEnterpriseAllowed,deploymentPolicy,IntegrationError } from './integration/policy';

/** Login identity and membership only. Does NOT grant enterprise-records/admin visibility. */
export async function workflowSourceIdentity(request:Request,enterpriseId:string){
 if(request.method==='GET'&&request.signal.aborted)throw new IntegrationError('WORKFLOW_SERVICE_UNAVAILABLE');
 const email=await enterpriseUserEmail(request);if(!email)throw new TeamError('请先登录',401);
 await assertWorkflowSiteAccess(request);
 const expected=request.headers.get('x-workflow-viewer');if(expected&&expected!==email)throw new IntegrationError('ACCOUNT_CHANGED',409);
 const policy=deploymentPolicy();assertEnterpriseAllowed(policy,enterpriseId);
 if(!allows(await userFeaturePolicy(email),'team'))throw new TeamError('企业协作功能尚未授权',403);
 await ensureEnterpriseSchema();const tx=await getPool().connect();
 try{
  await tx.query('BEGIN');
  const user=(await tx.query('SELECT name,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE',[email])).rows[0];
  if(!user||user.banned||user.account_expires_at&&new Date(user.account_expires_at).getTime()<=Date.now())throw new TeamError('账号已停用或到期',403);
  const team=(await tx.query(`SELECT t.id,t.owner_email,t.enabled,t.authorized_until,s.enabled AS enterprise_enabled,e.feature_policy FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id LEFT JOIN app_tenant_entitlements e ON e.tenant_id=t.id WHERE t.id=$1 FOR SHARE OF t,s`,[enterpriseId])).rows[0];
  if(!team||!team.enabled||!team.enterprise_enabled||team.authorized_until&&new Date(team.authorized_until).getTime()<=Date.now()||team.feature_policy?.team===false)throw new TeamError('企业不存在或已停用',403);
  const manager=team.owner_email===email||(await administeredSite(tx,email))===enterpriseId;
  const member=manager?null:(await tx.query("SELECT m.role_id FROM app_enterprise_members m WHERE m.enterprise_id=$1 AND m.email=$2 AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now()) FOR SHARE OF m",[enterpriseId,email])).rows[0];
  if(!manager&&!member)throw new TeamError('账号不属于此企业',403);
  await requireTeamGrant(tx,{email:team.owner_email,admin:false});
  const role=member?.role_id?(await tx.query('SELECT workflow_permissions FROM app_enterprise_roles WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[enterpriseId,member.role_id])).rows[0]:null;
  const permissions=manager?[...WORKFLOW_PERMISSIONS]:workflowPermissionsSchema.parse(role?.workflow_permissions??DEFAULT_WORKFLOW_PERMISSIONS);
  await tx.query('COMMIT');return {sourceInstance:policy.sourceInstanceId,sourceEnterprise:enterpriseId,sourceSubject:email,...(policy.mode==='dedicated'?{sourcePermissions:permissions,sourceName:(user.name||email).slice(0,100)}:{})};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
/** Current user's memberships, never an analytics/admin enterprise directory. */
export async function workflowDiscovery(request:Request){
 if(request.signal.aborted)throw new IntegrationError('WORKFLOW_SERVICE_UNAVAILABLE');
 const email=await enterpriseUserEmail(request);if(!email)throw new TeamError('请先登录',401);
 if(!allows(await userFeaturePolicy(email),'team'))throw new TeamError('企业协作功能尚未授权',403);
 const policy=deploymentPolicy();await ensureEnterpriseSchema();
 const user=(await getPool().query('SELECT name,banned,account_expires_at FROM app_users WHERE email=$1',[email])).rows[0];
 if(!user||user.banned||user.account_expires_at&&new Date(user.account_expires_at).getTime()<=Date.now())throw new TeamError('账号已停用或到期',403);
 const site=await siteProfile();
 let siteOpen=true;
 try{assertWorkflowProfileAccess(site,request);}catch(error){if(!(error instanceof TeamError&&error.status===403))throw error;siteOpen=false;}
 const enterprises:{id:string;name:string}[]=[];
 if(siteOpen){
  // Directory reads return identities only. Qualify all allowed memberships
  // at once; switching into a workspace still uses live scoped authorization.
  const rows=(await getPool().query(`SELECT t.id,t.name,(t.owner_email=$1 OR (t.id=$3::uuid AND viewer.role='admin')) AS manager,
    r.workflow_permissions,g.enabled,g.starts_at,g.expires_at,g.revoked_at,owner.banned,owner.account_expires_at
   FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id
   JOIN app_users viewer ON viewer.email=$1
   JOIN app_users owner ON owner.email=t.owner_email JOIN app_team_access_grants g ON g.email=t.owner_email
   LEFT JOIN app_tenant_entitlements e ON e.tenant_id=t.id
   LEFT JOIN app_enterprise_members m ON m.enterprise_id=t.id AND m.email=$1 AND m.membership_status='active'
    AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())
   LEFT JOIN app_enterprise_roles r ON r.enterprise_id=t.id AND r.id=m.role_id
   WHERE NOT viewer.banned AND (viewer.account_expires_at IS NULL OR viewer.account_expires_at>now()) AND t.enabled AND s.enabled
   AND (t.authorized_until IS NULL OR t.authorized_until>now()) AND (e.feature_policy->'team') IS DISTINCT FROM 'false'::jsonb
   AND (t.owner_email=$1 OR (t.id=$3::uuid AND viewer.role='admin') OR m.email IS NOT NULL)
   AND (cardinality($2::uuid[])=0 OR t.id=ANY($2::uuid[])) ORDER BY t.name,t.id LIMIT 101`,
   [email,policy.allowedEnterpriseIds,site.mode==='enterprise'?site.policy.enterpriseId:null])).rows;
  if(rows.length>100)throw new IntegrationError('WORKSPACE_DIRECTORY_TOO_LARGE');
  const expected=request.headers.get('x-workflow-viewer');
  if(rows.length&&expected&&expected!==email)throw new IntegrationError('ACCOUNT_CHANGED',409);
  for(const row of rows)if(activeTeamGrant(row)){
   if(!row.manager)workflowPermissionsSchema.parse(row.workflow_permissions??DEFAULT_WORKFLOW_PERMISSIONS);
   enterprises.push({id:row.id,name:row.name});
  }
 }
 return {version:1,instanceId:policy.sourceInstanceId,mode:policy.mode,viewer:{email,name:user.name||email},enterprises,...(site.mode==='enterprise'?{sitePolicy:{brand:site.policy.brand,revision:site.policy.revision,workspaceModules:site.policy.workspaceModules}}:{})};
}
export function workflowBridgeConfig(env:NodeJS.ProcessEnv=process.env){
 try{
  const url=new URL(env.NAUMI_WORKFLOW_SERVICE_URL||'');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))throw Error();
  const key=createPrivateKey(env.NAUMI_WORKFLOW_SIGNING_KEY||'');if(key.asymmetricKeyType!=='ed25519'||key.type!=='private')throw Error();
  const kid=env.NAUMI_WORKFLOW_SIGNING_KID;if(!kid||!/^[a-zA-Z0-9._-]{1,80}$/.test(kid))throw Error();
  return {origin:url.origin,key,kid};
 }catch{throw new IntegrationError('WORKFLOW_BRIDGE_NOT_CONFIGURED');}
}
export function workflowIdentityToken(identity:{sourceInstance:string;sourceEnterprise:string;sourceSubject:string;sourcePermissions?:WorkflowPermission[];sourceName?:string},config:ReturnType<typeof workflowBridgeConfig>,teamId?:string){
 const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:'EdDSA',typ:'JWT',kid:config.kid})+'.'+encode({iss:'naumi-workflow-bff',aud:'enterprise-workflow-source',...identity,...(teamId?{teamId}:{}),iat:now,exp:now+45,jti:randomUUID()});
 return unsigned+'.'+sign(null,Buffer.from(unsigned),config.key).toString('base64url');
}
