import 'server-only';
import { createPrivateKey,randomUUID,sign } from 'node:crypto';
import { resolveUserEmail } from '@/lib/admin-auth';
import { getPool } from '@/lib/db';
import { ensureEnterpriseSchema } from '@/lib/enterprise/server';
import { requireTeamGrant } from '@/lib/teams/grants';
import { TeamError } from '@/lib/teams/server';
import { userFeaturePolicy } from '@/lib/feature-access/server';
import { allows } from '@/lib/feature-access/catalog';
import { assertEnterpriseAllowed,deploymentPolicy,IntegrationError } from './integration/policy';

/** Login identity and membership only. Does NOT grant enterprise-records/admin visibility. */
export async function workflowSourceIdentity(request:Request,enterpriseId:string){
 const email=await resolveUserEmail(request);if(!email)throw new TeamError('请先登录',401);
 const policy=deploymentPolicy();assertEnterpriseAllowed(policy,enterpriseId);
 if(!allows(await userFeaturePolicy(email),'team'))throw new TeamError('企业协作功能尚未授权',403);
 await ensureEnterpriseSchema();const tx=await getPool().connect();
 try{
  await tx.query('BEGIN');
  const user=(await tx.query('SELECT banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE',[email])).rows[0];
  if(!user||user.banned||user.account_expires_at&&new Date(user.account_expires_at).getTime()<=Date.now())throw new TeamError('账号已停用或到期',403);
  const team=(await tx.query(`SELECT t.id,t.owner_email,t.enabled,s.enabled AS enterprise_enabled FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id WHERE t.id=$1 FOR SHARE OF t,s`,[enterpriseId])).rows[0];
  if(!team||!team.enabled||!team.enterprise_enabled)throw new TeamError('企业不存在或已停用',403);
  const member=team.owner_email===email||(await tx.query('SELECT 1 FROM app_enterprise_members WHERE enterprise_id=$1 AND email=$2 FOR SHARE',[enterpriseId,email])).rowCount===1;
  if(!member)throw new TeamError('账号不属于此企业',403);
  await requireTeamGrant(tx,{email:team.owner_email,admin:false});
  await tx.query('COMMIT');return {sourceInstance:policy.sourceInstanceId,sourceEnterprise:enterpriseId,sourceSubject:email};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
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
export function workflowIdentityToken(identity:{sourceInstance:string;sourceEnterprise:string;sourceSubject:string},config:ReturnType<typeof workflowBridgeConfig>,teamId?:string){
 const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:'EdDSA',typ:'JWT',kid:config.kid})+'.'+encode({iss:'naumi-workflow-bff',aud:'enterprise-workflow-source',...identity,...(teamId?{teamId}:{}),iat:now,exp:now+45,jti:randomUUID()});
 return unsigned+'.'+sign(null,Buffer.from(unsigned),config.key).toString('base64url');
}
