import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sourceSite,SourceAuditError} from './enterprise-source-audit.mjs';
const uuid=z.string().uuid().transform(v=>v.toLowerCase()),label=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1).max(100).refine(s=>!/[\u0000-\u001f\u007f]/.test(s));
const account=z.string().max(254).regex(/^[^\s@\u0000-\u001f\u007f]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/).refine(s=>s===s.trim().toLowerCase());
const requestSchema=z.strictObject({version:z.literal(1),commandId:uuid,reason:text,target:z.strictObject({enterpriseId:uuid,sourceInstance:label,sourceEnterprise:uuid}),teams:z.array(z.strictObject({teamId:uuid,name:text})).min(1).max(20),people:z.array(z.strictObject({sourceSubject:account,alias:text,realName:text,workflowSubject:label,personId:uuid,expectedVersion:z.number().int().nonnegative(),teamId:uuid,permissions:z.array(z.enum(['request','dispatch','execute','review','manage'])).min(1).max(5),workKinds:z.array(z.enum(['design','artwork'])).max(2),confirmed:z.literal(true)})).min(1).max(100)});
const need=(v,code)=>{if(!v)throw new SourceAuditError(code);};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function preparePilot(rawSite,rawRequest,summary,roster,now=new Date()){
 const site=sourceSite(rawSite),parsed=requestSchema.safeParse(rawRequest);need(parsed.success,'PILOT_REQUEST_INVALID');const r=parsed.data;
 need(summary?.version===1&&roster?.version===1&&summary.sourceReadOnly===true&&summary.sourceWrites===0,'PILOT_READONLY_SNAPSHOT_REQUIRED');
 need(summary.adminUrl===site.adminUrl&&summary.enterpriseId===site.enterpriseId&&summary.enterpriseName===site.expectedEnterpriseName&&r.target.sourceEnterprise===site.enterpriseId,'PILOT_SOURCE_SCOPE_MISMATCH');
 need(summary.enterpriseEnabled===true&&summary.ownerGrantActive===true,'PILOT_SOURCE_ENTERPRISE_UNAVAILABLE');
 need(roster.site?.adminUrl===site.adminUrl&&roster.site?.enterpriseId===site.enterpriseId&&roster.site?.expectedEnterpriseName===site.expectedEnterpriseName,'PILOT_ROSTER_SCOPE_MISMATCH');
 need(hash.safeParse(summary.snapshotSha256).success&&summary.snapshotSha256===roster.snapshotSha256&&summary.observedAt===roster.observedAt,'PILOT_SNAPSHOT_MISMATCH');
 const at=Date.parse(summary.observedAt),current=+now;need(Number.isFinite(at)&&at<=current+5000&&current-at<15*60*1000,'PILOT_SNAPSHOT_EXPIRED');
 need(Array.isArray(roster.rows)&&roster.rows.length<=2001&&roster.rows.length===summary.accountCount,'PILOT_ROSTER_INCOMPLETE');
 need(!summary.sourceInstanceId||summary.sourceInstanceId===r.target.sourceInstance,'PILOT_SOURCE_INSTANCE_MISMATCH');need(roster.sourceInstanceId===summary.sourceInstanceId,'PILOT_SOURCE_INSTANCE_MISMATCH');
 const unique=(values,code)=>need(new Set(values).size===values.length,code);
 unique(r.teams.map(t=>t.teamId),'PILOT_DUPLICATE_TEAM');unique(r.teams.map(t=>t.name),'PILOT_DUPLICATE_TEAM_NAME');
 for(const key of ['sourceSubject','workflowSubject','personId'])unique(r.people.map(p=>p[key]),'PILOT_DUPLICATE_IDENTITY');
 const accounts=r.people.map(p=>{
  const found=roster.rows.filter(x=>x.sourceSubject===p.sourceSubject);need(found.length===1,'PILOT_EXACT_ACCOUNT_REQUIRED');const src=found[0];need(src.accountAvailable===true,'PILOT_SOURCE_ACCOUNT_UNAVAILABLE');need(src.alias===p.alias,'PILOT_ALIAS_CHANGED');need(r.teams.some(t=>t.teamId===p.teamId),'PILOT_TEAM_REQUIRED');unique(p.permissions,'PILOT_DUPLICATE_PERMISSION');unique(p.workKinds,'PILOT_DUPLICATE_WORK_KIND');need(!p.permissions.includes('execute')||p.workKinds.length>0,'PILOT_EXECUTOR_KIND_REQUIRED');
  return {subject:p.workflowSubject,sourceSubject:p.sourceSubject,enabled:true,directoryAdmin:false,catalogAdmin:false,profile:{personId:p.personId,expectedVersion:p.expectedVersion,realName:p.realName,nickname:p.alias},memberships:[{teamId:p.teamId,permissions:[...p.permissions].sort(),workKinds:[...p.workKinds].sort(),enabled:true}]};
 });
 const sourceReview={version:1,sourceInstance:r.target.sourceInstance,sourceEnterprise:site.enterpriseId,observedAt:new Date(at).toISOString(),expiresAt:new Date(at+15*60*1000).toISOString(),snapshotSha256:summary.snapshotSha256,confirmedMappings:true};
 const provision={commandId:r.commandId,reason:r.reason,confirmedSourceSubjects:true,enterprises:[{enterpriseId:r.target.enterpriseId,sourceReview,teams:r.teams.map(t=>({...t,enabled:true})),accounts}]};
 const notices=['NATIVE_EMPLOYEE_LOGIN_REQUIRED','WORKFLOW_PROVISION_PREVIEW_REQUIRED','NO_EXCEL_ROW_AUTO_BINDING'];if(!summary.sourceInstanceId)notices.push('SOURCE_INSTANCE_PROPOSED_NOT_CONFIGURED');if(!summary.bridge?.serviceOriginValid||!summary.bridge?.signingKeyValid)notices.push('WORKFLOW_BRIDGE_NOT_CONFIGURED');if(r.people.some(p=>p.permissions.includes('execute')&&p.permissions.includes('review')))notices.push('INDEPENDENT_REVIEWER_REQUIRED_FOR_OWN_WORK');
 return {provision,review:{version:1,site,confirmedPeople:r.people,sourceReview,sourceRoleCopied:false,sourceAccountContentRead:false,sourceInstanceStatus:summary.sourceInstanceId?'existing':'proposed',notices},summary:{version:1,preparedAt:now.toISOString(),accounts:accounts.length,teams:r.teams.length,profiles:accounts.length,expiresAt:sourceReview.expiresAt,requestSha256:digest(r),provisionSha256:digest(provision),sourceSnapshotSha256:summary.snapshotSha256,notices,sourceWrites:0,targetWrites:0,employeeReady:false,scope:'operator-reviewed-snapshot-not-live-employee-session'}};
}
