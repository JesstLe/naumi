import type {Pool,PoolClient} from 'pg';
import type {Actor,Principal} from './contracts';
import type {ResolveActor} from './store';
import type {Period} from './performance-contracts';
import type {Correction} from './correction-contracts';
import {ensure,digest} from './performance-domain';
import {appealCommand,appealQuery,type Appeal,type AppealBasis} from './appeal-contracts';
import {readWorkflowSnapshot} from './read-transaction';
const manager=(a:Actor)=>a.permissions.includes('manage');
const open=(a:Appeal)=>a.status==='submitted'||a.status==='in_review';
const confirmed="document->>'status'='confirmed' AND document->'snapshot' IS NOT NULL AND document->'snapshot'<>'null'::jsonb";
type PeriodSnapshot=NonNullable<Period['snapshot']>;
type AppealReadScope={ids:string[];includeAll:boolean;includeAssigned:boolean};
export class AppealStore{
 constructor(private pool:Pool,private resolveActor:ResolveActor,readonly enabled=true,private now=()=>new Date()){}
 private async available(tx:PoolClient,a:Actor){ensure(a.teamId,'MEMBERSHIP_REQUIRED',403);ensure(this.enabled,'APPEALS_NOT_ENABLED',503);ensure((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=27')).rowCount,'APPEALS_MIGRATION_REQUIRED',503);}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s'");const a=await this.resolveActor(tx,p);ensure(a&&a.subject===p.subject&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId,'MEMBERSHIP_REQUIRED',403);await this.available(tx,a);const r=await fn(tx,a);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async row(tx:PoolClient,a:Actor,id:string){return(await tx.query('SELECT document FROM enterprise_workflow.performance_appeals WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,id])).rows[0]?.document as Appeal|undefined;}
 private visible(a:Actor,l:Appeal){return l.enterpriseId===a.enterpriseId&&l.teamId===a.teamId&&(a.subject===l.subject||manager(a)||a.permissions.includes('review')&&l.reviewer===a.subject);}
 private async context(tx:PoolClient,a:Actor,periodId:string,factId:string,subject:string){
  const {rows:[period]}=await tx.query<{title:string;ruleVersion:number;version:number;rule:PeriodSnapshot['rule'];createdBy:string;confirmedBy:string|null;row:PeriodSnapshot['rows'][number]|null}>(`SELECT document->>'title' title,document->'ruleVersion' "ruleVersion",document->'version' version,document#>'{snapshot,rule}' rule,document->>'createdBy' "createdBy",document->>'confirmedBy' "confirmedBy",
   (SELECT r FROM jsonb_array_elements(document#>'{snapshot,rows}') WITH ORDINALITY x(r,ord) WHERE r#>>'{fact,id}'=$4 ORDER BY ord LIMIT 1) AS "row"
   FROM enterprise_workflow.performance_periods WHERE enterprise_id=$1 AND team_id=$2 AND id=$3 AND ${confirmed}`,[a.enterpriseId,a.teamId,periodId,factId]);
  ensure(period,'PERIOD_NOT_FOUND',404);const row=period.row,part=row?.parts.find(p=>p.subject===subject);ensure(row&&part,'APPEAL_FACT_NOT_FOUND',404);
  ensure((await tx.query('SELECT 1 FROM enterprise_workflow.performance_claims WHERE enterprise_id=$1 AND team_id=$2 AND period_id=$3 AND fact_id=$4',[a.enterpriseId,a.teamId,periodId,factId])).rowCount,'APPEAL_CLAIM_MISMATCH');
  const {rows:corrections}=await tx.query<{latest:Correction|null;proposedBy:string;reviewedBy:string|null}>(`SELECT CASE WHEN row_number() OVER(ORDER BY applied_revision DESC)=1 THEN document END latest,
   document->>'proposedBy' "proposedBy",document->>'reviewedBy' "reviewedBy" FROM enterprise_workflow.performance_corrections WHERE enterprise_id=$1 AND team_id=$2 AND period_id=$3 AND fact_id=$4 AND state='approved' ORDER BY applied_revision DESC LIMIT 5001`,[a.enterpriseId,a.teamId,periodId,factId]);
  ensure(corrections.length<=5000,'APPEAL_HISTORY_TOO_LARGE',422);
  const latest=corrections[0]?.latest??undefined,current=latest?.afterParts.find(p=>p.subject===subject)??part;
  const simple=(s:typeof part)=>({bps:s.bps,baseMilli:s.baseMilli,scoreMilli:s.scoreMilli});
  const basis:AppealBasis={periodId,periodTitle:period.title,factId,taskTitle:row.fact.taskTitle,ruleVersion:period.ruleVersion,subject,original:simple(part),current:simple(current),correctionId:latest?.id??null,correctionRevision:latest?.appliedRevision??0,basisHash:digest({periodId,version:period.version,rule:period.rule,row,latest:latest??null,subject})};
  const allocation=(await tx.query("SELECT document->>'proposedBy' \"proposedBy\",document->>'reviewedBy' \"reviewedBy\" FROM enterprise_workflow.performance_allocations WHERE enterprise_id=$1 AND team_id=$2 AND fact_id=$3",[a.enterpriseId,a.teamId,factId])).rows[0];
  const conflicts=new Set([subject,...row.fact.participants,row.fact.actor,period.createdBy,period.confirmedBy,period.rule.authoredBy,period.rule.publishedBy,row.allocationApprovedBy,allocation?.proposedBy,allocation?.reviewedBy,...corrections.flatMap(c=>[c.proposedBy,c.reviewedBy])].filter((s):s is string=>!!s));
  return {basis,conflicts,latest};
 }
 private async reviewer(tx:PoolClient,a:Actor,subject:string,conflicts:Set<string>,snapshot=false){const lookup=snapshot?this.resolveActor.readSnapshot!:this.resolveActor,r=await lookup(tx,{enterpriseId:a.enterpriseId,teamId:a.teamId,subject});return !!r?.permissions.includes('review')&&!conflicts.has(subject);}
 private async projection(tx:PoolClient,a:Actor,l:Appeal,snapshot=false){ensure(this.visible(a,l),'APPEAL_NOT_FOUND',404);const c=await this.context(tx,a,l.periodId,l.factId,l.subject);return {appeal:l,currentBasis:c.basis,canSupplement:open(l)&&l.subject===a.subject,canAssign:open(l)&&manager(a),canResolve:open(l)&&l.reviewer===a.subject&&await this.reviewer(tx,a,a.subject,c.conflicts,snapshot),overdue:open(l)&&!!l.dueAt&&Date.parse(l.dueAt)<+this.now()};}
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=appealQuery.parse(raw);
  const result=await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
   await this.available(tx,a);
   if(q.action==='basis')return {data:{basis:(await this.context(tx,a,q.periodId,q.factId,a.subject)).basis}};
   if(q.action==='list'){
    const team=q.scope==='team';
    ensure((await tx.query(`SELECT 1 FROM enterprise_workflow.performance_periods WHERE enterprise_id=$1 AND team_id=$2 AND id=$3 AND ${confirmed}
      AND ($4::boolean OR document#>'{snapshot,results}' @> jsonb_build_array(jsonb_build_object('subject',$5::text)))`,[a.enterpriseId,a.teamId,q.periodId,team,a.subject])).rowCount,'PERIOD_NOT_FOUND',404);
    if(team)ensure(manager(a)||a.permissions.includes('review'),'APPEAL_TEAM_FORBIDDEN',403);
    const includeAll=team&&manager(a),includeAssigned=team&&a.permissions.includes('review'),offset=(q.page-1)*30;
    const where="enterprise_id=$1 AND team_id=$2 AND period_id=$3 AND ($4='all' OR status=$4) AND ($5::boolean OR subject=$6 OR $7::boolean AND document->>'reviewer'=$6)",args=[a.enterpriseId,a.teamId,q.periodId,q.state,includeAll,a.subject,includeAssigned];
    const total=Number((await tx.query('SELECT count(*) n FROM enterprise_workflow.performance_appeals WHERE '+where,args)).rows[0].n);
    const {rows:items}=offset<total?await tx.query<Pick<Appeal,'id'|'subject'|'status'|'version'|'reviewer'|'dueAt'|'updatedAt'>&{taskTitle:string}>(`SELECT id,subject,status,version,document#>>'{basis,taskTitle}' "taskTitle",document->>'reviewer' reviewer,document->>'dueAt' "dueAt",document->>'updatedAt' "updatedAt"
     FROM enterprise_workflow.performance_appeals WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET $8`,[...args,offset]):{rows:[]};
    return {data:{items:items.map(l=>({...l,overdue:(l.status==='submitted'||l.status==='in_review')&&!!l.dueAt&&Date.parse(l.dueAt)<+this.now()})),total,page:q.page,canManage:manager(a)},scope:{ids:items.map(l=>l.id),includeAll,includeAssigned}};
   }
   const l=await this.row(tx,a,q.id);ensure(l&&this.visible(a,l),'APPEAL_NOT_FOUND',404);
   const scope:AppealReadScope={ids:[l.id],includeAll:manager(a),includeAssigned:a.permissions.includes('review')};
   if(q.action==='detail')return {data:await this.projection(tx,a,l,snapshot),scope};
   const offset=(q.page-1)*30;
   if(q.action==='history')return {data:{events:offset<l.version?(await tx.query('SELECT revision,actor,action,reason,document,created_at FROM enterprise_workflow.appeal_revisions WHERE enterprise_id=$1 AND appeal_id=$2 ORDER BY revision DESC LIMIT 30 OFFSET $3',[a.enterpriseId,l.id,offset])).rows:[],total:l.version,page:q.page},scope};
   ensure(manager(a),'APPEAL_ASSIGN_FORBIDDEN',403);const c=await this.context(tx,a,l.periodId,l.factId,l.subject);
   const where="m.enterprise_id=$1 AND m.team_id=$2 AND m.enabled AND a.enabled AND t.enabled AND (m.expires_at IS NULL OR m.expires_at>now()) AND (a.expires_at IS NULL OR a.expires_at>now()) AND m.permissions ? 'review' AND NOT(m.subject=ANY($3::text[]))",args=[a.enterpriseId,a.teamId,[...c.conflicts]],from=' FROM enterprise_workflow.team_members m JOIN enterprise_workflow.accounts a USING(enterprise_id,subject) JOIN enterprise_workflow.teams t USING(enterprise_id,team_id) WHERE '+where;
   const total=Number((await tx.query('SELECT count(*) n'+from,args)).rows[0].n);
   const members=offset<total?(await tx.query('SELECT m.subject'+from+' ORDER BY m.subject LIMIT 30 OFFSET $4',[...args,offset])).rows:[];
   return {data:{members,total,page:q.page},scope};
  },{legacyRepeatable:true,statementTimeoutMs:15000,signal,checkCurrent:async(tx,a,{scope})=>{
   if(!scope?.ids.length)return;
   const {rowCount}=await tx.query("SELECT id FROM enterprise_workflow.performance_appeals WHERE enterprise_id=$1 AND team_id=$2 AND id=ANY($3::uuid[]) AND ($4::boolean OR subject=$5 OR $6::boolean AND document->>'reviewer'=$5)",[a.enterpriseId,a.teamId,scope.ids,scope.includeAll,a.subject,scope.includeAssigned]);
   ensure(rowCount===scope.ids.length,q.action==='list'?'APPEAL_SCOPE_CHANGED':'APPEAL_NOT_FOUND',q.action==='list'?409:404);
  }});
  return result.data;
 }
 async execute(p:Principal,raw:unknown){const c=appealCommand.parse(raw);return this.tx(p,async(tx,a)=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`appeal-command:${a.enterpriseId}:${c.commandId}`]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`performance:${a.enterpriseId}:${a.teamId}`]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`appeal:${a.enterpriseId}:${c.id}`]);
  const old=await this.row(tx,a,c.id),action=c.action;if(old)ensure(this.visible(a,old),'APPEAL_NOT_FOUND',404);else ensure(action.type==='create','APPEAL_NOT_FOUND',404);
  if(action.type==='assign')ensure(manager(a),'APPEAL_ASSIGN_FORBIDDEN',403);
  else if(action.type==='resolve'){ensure(old&&old.reviewer===a.subject&&a.permissions.includes('review'),'APPEAL_REVIEWER_REQUIRED',403);const ctx=await this.context(tx,a,old.periodId,old.factId,old.subject);ensure(!ctx.conflicts.has(a.subject),'APPEAL_INDEPENDENT_REVIEW_REQUIRED',403);}
  else ensure(!old||old.subject===a.subject,'APPEAL_SELF_REQUIRED',403);
  const fp=digest({p,c}),prior=(await tx.query('SELECT fingerprint,applied_version FROM enterprise_workflow.appeal_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];if(prior){ensure(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');ensure(old,'APPEAL_NOT_FOUND',404);return {...await this.projection(tx,a,old),replayed:true,appliedVersion:prior.applied_version};}
  ensure((old?.version??0)===c.expectedVersion,'APPEAL_VERSION_CONFLICT');const at=this.now().toISOString();let l:Appeal;
  if(action.type==='create'){
   ensure(!old,'APPEAL_EXISTS');const ctx=await this.context(tx,a,action.periodId,action.factId,a.subject);ensure(ctx.basis.basisHash===action.basisHash,'APPEAL_BASIS_CHANGED');
   ensure(!(await tx.query("SELECT 1 FROM enterprise_workflow.performance_appeals WHERE enterprise_id=$1 AND team_id=$2 AND period_id=$3 AND fact_id=$4 AND subject=$5 AND status IN ('submitted','in_review')",[a.enterpriseId,a.teamId,action.periodId,action.factId,a.subject])).rowCount,'APPEAL_ALREADY_OPEN');
   if(action.previousId){const prev=await this.row(tx,a,action.previousId);ensure(prev&&prev.teamId===a.teamId&&prev.subject===a.subject&&prev.periodId===action.periodId&&prev.factId===action.factId&&!open(prev),'APPEAL_PREVIOUS_INVALID',404);}
   l={id:c.id,enterpriseId:a.enterpriseId,teamId:a.teamId!,subject:a.subject,periodId:action.periodId,factId:action.factId,version:1,status:'submitted',reason:c.reason,expectedOutcome:action.expectedOutcome,evidence:action.evidence,basis:ctx.basis,...(action.previousId?{previousId:action.previousId}:{}),createdAt:at,updatedAt:at,supplements:[],reviewer:null,dueAt:null};
  }else{
   ensure(old&&open(old),'APPEAL_TERMINAL');l={...structuredClone(old),version:old.version+1,updatedAt:at};
   if(action.type==='supplement'){ensure(l.supplements.length<100,'APPEAL_SUPPLEMENT_LIMIT',422);l.supplements.push({by:a.subject,at,evidence:action.evidence});}
   else if(action.type==='withdraw')l.status='withdrawn';
   else if(action.type==='assign'){const ctx=await this.context(tx,a,l.periodId,l.factId,l.subject);ensure(await this.reviewer(tx,a,action.reviewer,ctx.conflicts),'APPEAL_INDEPENDENT_REVIEW_REQUIRED',403);l.reviewer=action.reviewer;l.dueAt=action.dueAt;l.status='in_review';}
   else if(action.type==='resolve'){
    const ctx=await this.context(tx,a,l.periodId,l.factId,l.subject);ensure(ctx.basis.basisHash===action.basisHash,'APPEAL_BASIS_CHANGED');
    if(action.outcome==='corrected')ensure(action.correctionId&&ctx.latest?.id===action.correctionId&&ctx.basis.correctionRevision>l.basis.correctionRevision&&Date.parse(ctx.latest.reviewedAt!)>=Date.parse(l.createdAt)&&digest(ctx.basis.current)!==digest(l.basis.current),'APPEAL_CORRECTION_REQUIRED');
    else ensure(!action.correctionId,'APPEAL_UNEXPECTED_CORRECTION',400);
    l.status='resolved';l.resolution={by:a.subject,at,reason:c.reason,outcome:action.outcome,basis:ctx.basis,...(action.correctionId?{correctionId:action.correctionId}:{})};
   }
  }
  await tx.query('INSERT INTO enterprise_workflow.appeal_commands(enterprise_id,id,team_id,appeal_id,subject,fingerprint,applied_version)VALUES($1,$2,$3,$4,$5,$6,$7)',[a.enterpriseId,c.commandId,a.teamId,l.id,a.subject,fp,l.version]);
  await tx.query('INSERT INTO enterprise_workflow.performance_appeals(enterprise_id,team_id,id,period_id,fact_id,subject,version,status,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(enterprise_id,id)DO UPDATE SET version=EXCLUDED.version,status=EXCLUDED.status,document=EXCLUDED.document,updated_at=now()',[a.enterpriseId,a.teamId,l.id,l.periodId,l.factId,l.subject,l.version,l.status,l]);
  await tx.query('INSERT INTO enterprise_workflow.appeal_revisions(enterprise_id,appeal_id,revision,command_id,actor,action,reason,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.enterpriseId,l.id,l.version,c.commandId,a.subject,action.type,c.reason,l]);
  await tx.query('INSERT INTO enterprise_workflow.performance_audit(enterprise_id,team_id,subject,operation,detail)VALUES($1,$2,$3,$4,$5)',[a.enterpriseId,a.teamId,a.subject,'appeal-'+action.type,{id:l.id,version:l.version,commandId:c.commandId,periodId:l.periodId,state:l.status}]);
  return {...await this.projection(tx,a,l),replayed:false,appliedVersion:l.version};
 });}
}
