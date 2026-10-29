import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { WorkflowError, sourceAccountSubject } from './contracts';
import type { SourceIdentity } from './source-identity';

export type NativeTeamBinding={enterpriseId:string;sourceInstance:string;sourceEnterprise:string;nativeTeamId?:string};
/** Opt-in at installation time for one native company team. Only a verified,
 * short-lived BFF assertion of current membership may create a missing binding.
 * Existing service-side suspensions and explicit mappings are never overwritten. */
export async function enrollNativeMember(tx:PoolClient,source:SourceIdentity,binding:NativeTeamBinding) {
  if(!binding.nativeTeamId)return;
  if(!source.sourcePermissions?.length||!source.sourceName||!sourceAccountSubject.safeParse(source.sourceSubject).success)throw new WorkflowError(403,'NATIVE_MEMBERSHIP_ASSERTION_REQUIRED');
  const enterprise=binding.enterpriseId,team=binding.nativeTeamId;
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`native-member:${source.sourceInstance}:${source.sourceEnterprise}:${source.sourceSubject}`]);
  const existing=await tx.query('SELECT 1 FROM enterprise_workflow.source_identities WHERE source_instance=$1 AND source_enterprise=$2 AND source_subject=$3',[source.sourceInstance,source.sourceEnterprise,source.sourceSubject]);
  if(existing.rowCount)return;
  const active=await tx.query(`SELECT 1 FROM enterprise_workflow.source_enterprises e JOIN enterprise_workflow.teams t ON t.enterprise_id=e.enterprise_id
    WHERE e.source_instance=$1 AND e.source_enterprise=$2 AND e.enterprise_id=$3 AND e.enabled AND t.team_id=$4 AND t.enabled FOR SHARE OF e,t`,[source.sourceInstance,source.sourceEnterprise,enterprise,team]);
  if(!active.rowCount)throw new WorkflowError(403,'NATIVE_TEAM_NOT_READY');
  const subject='native:'+createHash('sha256').update(source.sourceInstance+'\0'+source.sourceEnterprise+'\0'+source.sourceSubject).digest('hex');
  // A disabled/colliding pre-existing account requires explicit review.
  const created=await tx.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING subject',[enterprise,subject]);
  if(!created.rowCount)throw new WorkflowError(409,'NATIVE_ACCOUNT_MAPPING_CONFLICT');
  await tx.query(`INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,'["request","dispatch","execute","review","manage"]','["design","artwork"]')`,[enterprise,team,subject]);
  await tx.query('INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject) VALUES($1,$2,$3,$4,$5)',[source.sourceInstance,source.sourceEnterprise,enterprise,source.sourceSubject,subject]);
  await tx.query(`INSERT INTO enterprise_workflow.person_profiles(enterprise_id,person_id,real_name,nickname,source_instance,source_enterprise,source_subject,enabled,version) VALUES($1,$2,$3,'',$4,$5,$6,true,1) ON CONFLICT DO NOTHING`,[enterprise,randomUUID(),source.sourceName,source.sourceInstance,source.sourceEnterprise,source.sourceSubject]);
  await tx.query('INSERT INTO enterprise_workflow.identity_binding_audit(id,enterprise_id,actor,operation,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),enterprise,subject,'native-enrollment',{sourceInstance:source.sourceInstance,sourceEnterprise:source.sourceEnterprise,sourceSubject:source.sourceSubject,teamId:team}]);
}
