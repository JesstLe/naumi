import 'server-only';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {enterpriseIdentityTransaction} from '../server';
import {deploymentPolicy,assertEnterpriseAllowed} from '../integration/policy';
import {requireTeamGrant,type TeamActor} from '@/lib/teams/grants';
import {consumersSchema} from './consumer-config';
import {TeamError} from '@/lib/teams/errors';
import {getPool} from '@/platform/db/pool';
import {ensureIdentitySchema} from './schema';
import {identityCommandSchema,organizationSchema,assertGrantForOrganization,type IdentityCommand} from './contracts';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function authority(){
  if(process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED!=='1')throw new TeamError('统一组织管理尚未启用',503);
  try{return deploymentPolicy();}catch{throw new TeamError('统一组织管理部署范围尚未配置',503);}
}
function boundEnterprise(policy:ReturnType<typeof authority>,id:string){
  try{assertEnterpriseAllowed(policy,id);}catch{throw new TeamError('企业不在当前部署范围',404);}
}
function protectedTitle(title?:string){return ['system_admin','administrator','design_director'].includes(title||'');}

export async function mutateIdentity(actor:TeamActor,input:IdentityCommand){
  const c=identityCommandSchema.parse(input),policy=authority();boundEnterprise(policy,c.enterpriseId);
  await ensureIdentitySchema();
  return enterpriseIdentityTransaction(actor,c.enterpriseId,async(tx,scope)=>{
    // Existing enterprise authorization remains required. A platform cookie is
    // not an alternate identity for this customer-only entry point.
    if(actor.admin||actor.consoleAdmin)throw new TeamError('请使用企业账号维护组织',403);
    const fingerprint=hash(c),previous=(await tx.query('SELECT * FROM app_identity_receipts WHERE id=$1',[c.id])).rows[0];
    if(previous){
      if(previous.enterprise_id!==c.enterpriseId||previous.actor!==actor.email||previous.fingerprint!==fingerprint)throw new TeamError('操作编号已用于其他请求',409);
      const current=c.action==='organization'
        ?(await tx.query('SELECT version FROM app_identity_organizations WHERE enterprise_id=$1 AND subject_id=$2',[c.enterpriseId,previous.result.subjectId])).rows[0]
        :(await tx.query('SELECT version FROM app_identity_product_grants WHERE enterprise_id=$1 AND subject_id=$2 AND product_id=$3',[c.enterpriseId,previous.result.subjectId,c.productId])).rows[0];
      return {...previous.result,replayed:true,currentVersion:current?.version??0,currentStateMatchesReceipt:current?.version===previous.result.version};
    }
    const target=(await tx.query(`SELECT u.email,u.role,u.banned,u.account_expires_at,m.membership_status,m.membership_expires_at,r.manage_members AS legacy_manage_members,r.view_records AS legacy_view_records FROM app_users u
      LEFT JOIN app_enterprise_members m ON m.email=u.email AND m.enterprise_id=$2
      LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
      WHERE u.email=$1 AND (m.email IS NOT NULL OR u.email=$3) FOR SHARE OF u`,[c.email,c.enterpriseId,scope.team.owner_email])).rows[0];
    if(!target)throw new TeamError('账号不属于当前企业',404);
    if(target.banned||target.account_expires_at&&new Date(target.account_expires_at).getTime()<=Date.now()||target.membership_status==='suspended'||target.membership_expires_at&&new Date(target.membership_expires_at).getTime()<=Date.now())throw new TeamError('目标账号已停用或到期',409);
    let subject=(await tx.query('SELECT subject_id FROM app_identity_subjects WHERE account_email=$1',[c.email])).rows[0]?.subject_id;
    if(!subject){subject=randomUUID();await tx.query('INSERT INTO app_identity_subjects(subject_id,account_email) VALUES($1,$2)',[subject,c.email]);}
    const old=(await tx.query('SELECT organization,version FROM app_identity_organizations WHERE enterprise_id=$1 AND subject_id=$2 FOR UPDATE',[c.enterpriseId,subject])).rows[0];
    const root=scope.team.owner_email===actor.email;
    const legacyPrivileged=target.role==='admin'||target.legacy_manage_members||target.legacy_view_records;
    if(c.action==='organization'){
      if((old?.version??0)!==c.expectedVersion)throw new TeamError('组织资料已更新，请刷新',409);
      if(c.email===scope.team.owner_email&&c.organization.title!=='system_admin')throw new TeamError('负责人须保留最高系统管理身份',403);
      if(c.organization.title==='system_admin'&&c.email!==scope.team.owner_email)throw new TeamError('最高系统管理员须为企业负责人',403);
      if(!root&&(legacyPrivileged||c.email===actor.email||c.email===scope.team.owner_email||protectedTitle(old?.organization?.title)||protectedTitle(c.organization.title)))throw new TeamError('此管理身份须由企业负责人维护',403);
      const version=(old?.version??0)+1;
      await tx.query(`INSERT INTO app_identity_organizations(enterprise_id,subject_id,organization,version) VALUES($1,$2,$3,$4)
        ON CONFLICT(enterprise_id,subject_id) DO UPDATE SET organization=EXCLUDED.organization,version=EXCLUDED.version,updated_at=now()`,[c.enterpriseId,subject,JSON.stringify(c.organization),version]);
      if(c.productConfiguration){
        const configuration=c.productConfiguration;
        const grant=(await tx.query("SELECT version FROM app_identity_product_grants WHERE enterprise_id=$1 AND subject_id=$2 AND product_id='design-ops' FOR UPDATE",[c.enterpriseId,subject])).rows[0];
        if((grant?.version??0)!==configuration.expectedVersion)throw new TeamError('产品授权已更新，请刷新',409);
        if(configuration.enabled!==!!configuration.roles.length)throw new TeamError('产品启停与角色不匹配',400);
        try{assertGrantForOrganization(c.organization,configuration.roles);}catch{throw new TeamError('产品角色超出职务或专业范围',400);}
        await tx.query(`INSERT INTO app_identity_product_grants(enterprise_id,subject_id,product_id,enabled,roles,version) VALUES($1,$2,'design-ops',$3,$4,$5)
          ON CONFLICT(enterprise_id,subject_id,product_id) DO UPDATE SET enabled=EXCLUDED.enabled,roles=EXCLUDED.roles,version=EXCLUDED.version,updated_at=now()`,[c.enterpriseId,subject,configuration.enabled,JSON.stringify(configuration.roles),(grant?.version??0)+1]);
      }
      // Remove grants that no longer fit the new job. Never leave a stale
      // administrator/reviewer role behind after an organization downgrade.
      for(const grant of (await tx.query('SELECT product_id,roles FROM app_identity_product_grants WHERE enterprise_id=$1 AND subject_id=$2 FOR UPDATE',[c.enterpriseId,subject])).rows){
        try{assertGrantForOrganization(c.organization,grant.roles);}catch{
          await tx.query("UPDATE app_identity_product_grants SET enabled=false,roles='[]',version=version+1,updated_at=now() WHERE enterprise_id=$1 AND subject_id=$2 AND product_id=$3",[c.enterpriseId,subject,grant.product_id]);
        }
      }
      return record({subjectId:subject,version},old??null,{organization:c.organization,productConfiguration:c.productConfiguration??null});
    }
    if(!old)throw new TeamError('请先配置组织身份',409);
    if(!root&&(legacyPrivileged||c.email===actor.email||c.email===scope.team.owner_email||protectedTitle(old.organization.title)))throw new TeamError('此管理账号的产品授权须由企业负责人维护',403);
    const grant=(await tx.query('SELECT roles,enabled,version FROM app_identity_product_grants WHERE enterprise_id=$1 AND subject_id=$2 AND product_id=$3 FOR UPDATE',[c.enterpriseId,subject,c.productId])).rows[0];
    if((grant?.version??0)!==c.expectedVersion)throw new TeamError('产品授权已更新，请刷新',409);
    if(c.enabled&&!c.roles.length)throw new TeamError('启用产品须配置角色',400);
    if(!c.enabled&&c.roles.length)throw new TeamError('停用产品时角色应为空',400);
    try{assertGrantForOrganization(organizationSchema.parse(old.organization),c.roles);}catch{throw new TeamError('产品角色超出组织身份或审核范围',400);}
    const version=(grant?.version??0)+1;
    await tx.query(`INSERT INTO app_identity_product_grants(enterprise_id,subject_id,product_id,enabled,roles,version) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(enterprise_id,subject_id,product_id) DO UPDATE SET enabled=EXCLUDED.enabled,roles=EXCLUDED.roles,version=EXCLUDED.version,updated_at=now()`,[c.enterpriseId,subject,c.productId,c.enabled,JSON.stringify(c.roles),version]);
    return record({subjectId:subject,version},grant??null,{enabled:c.enabled,roles:c.roles});

    async function record(result:{subjectId:string;version:number},before:unknown,after:unknown){
      const eventId=randomUUID();
      const event=(await tx.query('INSERT INTO app_identity_outbox(event_id,enterprise_id,subject_id,product_id,event_type) VALUES($1,$2,$3,$4,$5) RETURNING sequence',[eventId,c.enterpriseId,subject,c.action==='product-grant'?c.productId:null,c.action])).rows[0];
      const body={...result,eventId,sequence:String(event.sequence)};
      await tx.query('INSERT INTO app_identity_receipts(id,enterprise_id,actor,fingerprint,result,changes,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[c.id,c.enterpriseId,actor.email,fingerprint,JSON.stringify(body),JSON.stringify({before,after}),c.reason]);
      return body;
    }
  });
}

export async function identityDirectory(actor:TeamActor,enterpriseId:string){
  boundEnterprise(authority(),enterpriseId);await ensureIdentitySchema();
  if(actor.admin||actor.consoleAdmin)throw new TeamError('请使用企业账号',403);
  return enterpriseIdentityTransaction(actor,enterpriseId,async(tx,s)=>{
    const rows=(await tx.query(`SELECT u.email,u.name,u.banned,u.management_version AS account_version,i.subject_id,o.organization,o.version AS organization_version,g.roles,g.enabled,g.version AS grant_version
      FROM app_users u LEFT JOIN app_identity_subjects i ON i.account_email=u.email
      LEFT JOIN app_identity_organizations o ON o.subject_id=i.subject_id AND o.enterprise_id=$1
      LEFT JOIN app_identity_product_grants g ON g.subject_id=i.subject_id AND g.enterprise_id=$1 AND g.product_id='design-ops'
      WHERE u.email=$2 OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=$1 AND m.email=u.email) ORDER BY u.name,u.email`,[enterpriseId,s.team.owner_email])).rows;
    const sync=(await tx.query('SELECT product_id,last_success_at,applied_members,last_error FROM app_identity_consumer_acks WHERE enterprise_id=$1',[enterpriseId])).rows;
    return {enterpriseId,members:rows,sync,canManageProtected:s.team.owner_email===actor.email};
  });
}

/** Service audience is fixed by its configured credential, never a query role. */
export function identityConsumer(authorization:string|null){
  const token=authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if(!token)throw new TeamError('产品服务认证失败',401);
  let consumers:unknown;try{consumers=JSON.parse(process.env.NAUMI_IDENTITY_CONSUMERS||'[]');}catch{throw new TeamError('产品服务认证尚未配置',503);}
  const parsed=consumersSchema.safeParse(consumers);if(!parsed.success)throw new TeamError('产品服务认证尚未配置',503);
  const digest=createHash('sha256').update(token).digest('hex');
  const match=parsed.data.find(entry=>timingSafeEqual(Buffer.from(entry.tokenSha256,'hex'),Buffer.from(digest,'hex')));
  if(!match)throw new TeamError('产品服务认证失败',401);
  boundEnterprise(authority(),match.enterpriseId);return match;
}

export async function identityProjection(consumer:ReturnType<typeof identityConsumer>,subjectId?:string){
  const policy=authority();boundEnterprise(policy,consumer.enterpriseId);await ensureIdentitySchema();
  const tx=await getPool().connect();
  try{
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.query("SET LOCAL statement_timeout='5s'");
    const team=(await tx.query(`SELECT t.owner_email,t.enabled,s.enabled AS enterprise_enabled,t.authorized_until FROM app_enterprise_settings s
      JOIN app_account_teams t ON t.id=s.team_id WHERE s.team_id=$1`,[consumer.enterpriseId])).rows[0];
    if(!team?.enabled||!team.enterprise_enabled)throw new TeamError('企业已停用',403);
    if(team.authorized_until&&new Date(team.authorized_until).getTime()<=Date.now())throw new TeamError('企业授权已到期',403);
    await requireTeamGrant(tx,{email:team.owner_email,admin:false},'snapshot');
    const entitlement=(await tx.query('SELECT feature_policy FROM app_tenant_entitlements WHERE tenant_id=$1',[consumer.enterpriseId])).rows[0];
    if(entitlement?.feature_policy?.team===false)throw new TeamError('企业管理功能已停用',403);
    const members=(await tx.query(`SELECT i.subject_id AS "subjectId",u.email,u.name,o.organization,o.version AS "organizationVersion",g.roles,g.enabled AS "productEnabled",g.version AS "grantVersion",
      COALESCE((NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()) AND
      (u.email=$3 OR (m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())))),false) AS "accountActive",
      u.auth_revoked_before AS "revokedBefore",u.management_version AS "accountVersion"
      FROM app_identity_product_grants g JOIN app_identity_subjects i ON i.subject_id=g.subject_id
      JOIN app_users u ON u.email=i.account_email JOIN app_identity_organizations o ON o.enterprise_id=g.enterprise_id AND o.subject_id=g.subject_id
      LEFT JOIN app_enterprise_members m ON m.enterprise_id=g.enterprise_id AND m.email=u.email
      WHERE g.enterprise_id=$1 AND g.product_id=$2 AND ($4::uuid IS NULL OR i.subject_id=$4::uuid) ORDER BY i.subject_id`,[consumer.enterpriseId,consumer.productId,team.owner_email,subjectId??null])).rows;
    const revision=hash(members);
    const sequence=(await tx.query('SELECT COALESCE(max(sequence),0)::text sequence FROM app_identity_outbox WHERE enterprise_id=$1',[consumer.enterpriseId])).rows[0].sequence;
    const body={schemaVersion:1,authority:policy.sourceInstanceId,enterpriseId:consumer.enterpriseId,productId:consumer.productId,revision,members,complete:!subjectId,sequence,issuedAt:new Date().toISOString()};
    await tx.query('COMMIT');return body;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
