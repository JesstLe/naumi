import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {WorkflowError,id,type Actor,type Principal,type WorkOrder} from './contracts';
import type {ResolveActor} from './store';
import {readWorkflowSnapshot} from './read-transaction';
import {sourceDigest} from './source-files';
import {calendarConfigSchema,calendarDays,minuteReader,legacyCalendar,type TeamCalendar} from './calendar';
const inputSchema=z.strictObject({expectedRevision:z.number().int().min(0),config:calendarConfigSchema,reason:z.string().trim().min(1).max(2000)});
const saveSchema=inputSchema.extend({commandId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/)});
export async function loadCalendars(tx:PoolClient,enterpriseId:string,teamIds:string[]){
 const result=new Map<string,TeamCalendar>();for(const t of teamIds)result.set(t,legacyCalendar());
 if(!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=14')).rowCount)return result;
 const rows=(await tx.query('SELECT DISTINCT ON(team_id) team_id,revision,document FROM enterprise_workflow.team_calendar_versions WHERE enterprise_id=$1 AND team_id=ANY($2::uuid[]) ORDER BY team_id,revision DESC',[enterpriseId,teamIds])).rows;
 for(const r of rows)result.set(r.team_id,{revision:r.revision,configured:true,config:calendarConfigSchema.parse(r.document)});return result;
}
export class CalendarStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor){}
 private async tx<T>(fn:(tx:PoolClient)=>Promise<T>){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");const r=await fn(tx);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async requireReady(tx:PoolClient,a:Actor,manager:boolean){if(!a.teamId)throw new WorkflowError(403,'MEMBERSHIP_REQUIRED');if(manager&&!a.permissions.some(x=>['manage','dispatch'].includes(x)))throw new WorkflowError(403,'CALENDAR_MANAGER_REQUIRED');if(!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=14')).rowCount)throw new WorkflowError(503,'CALENDAR_MIGRATION_REQUIRED');}
 private async actor(tx:PoolClient,p:Principal){const a=await this.resolveActor(tx,p);if(!a||a.enterpriseId!==p.enterpriseId||a.teamId!==p.teamId||a.subject!==p.subject)throw new WorkflowError(403,'MEMBERSHIP_REQUIRED');await this.requireReady(tx,a,true);return a;}
 async get(p:Principal){return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{await this.requireReady(tx,a,false);return {calendar:(await loadCalendars(tx,a.enterpriseId,[a.teamId!])).get(a.teamId!)!};});}
 async history(p:Principal,raw:unknown={}){const q=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{await this.requireReady(tx,a,true);const rows=(await tx.query('SELECT revision,document AS config,subject,reason,created_at FROM enterprise_workflow.team_calendar_versions WHERE enterprise_id=$1 AND team_id=$2 ORDER BY revision DESC LIMIT 30 OFFSET $3',[a.enterpriseId,a.teamId,(q.page-1)*30])).rows;const total=Number((await tx.query('SELECT count(*) n FROM enterprise_workflow.team_calendar_versions WHERE enterprise_id=$1 AND team_id=$2',[a.enterpriseId,a.teamId])).rows[0].n);return {versions:rows,total,page:q.page,pageSize:30};});}
 private async plan(tx:PoolClient,p:Principal,input:z.infer<typeof inputSchema>,lock=true){
  const current=(await loadCalendars(tx,p.enterpriseId,[p.teamId!])).get(p.teamId!)!;if(current.revision!==input.expectedRevision)throw new WorkflowError(409,'CALENDAR_VERSION_CONFLICT');
  const rows=(await tx.query(`SELECT id,version,document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND document->>'teamId'=$2 AND document->>'status' IN ('approved','active','completed') AND EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tasks') t WHERE t->>'planStart' IS NOT NULL) ORDER BY id LIMIT 1001${lock?' FOR SHARE':''}`,[p.enterpriseId,p.teamId])).rows;
  if(rows.length>1000)throw new WorkflowError(422,'CALENDAR_IMPACT_TOO_LARGE');
  const readBefore=minuteReader(current.config),readAfter=minuteReader(input.config);let plannedTasks=0,changedCapacityTasks=0,noWorkingDayTasks=0;for(const r of rows)for(const t of (r.document as WorkOrder).tasks){if(!t.planStart||!t.planEnd)continue;if(++plannedTasks>5000)throw new WorkflowError(422,'CALENDAR_IMPACT_TOO_LARGE');let changed=false,working=false;for(const day of calendarDays(t.planStart,t.planEnd)){const next=readAfter(day);if(readBefore(day)!==next)changed=true;if(next!==0)working=true;}if(changed)changedCapacityTasks++;if(!working)noWorkingDayTasks++;}
  const impact={plannedTasks,changedCapacityTasks,noWorkingDayTasks},previewHash=sourceDigest({principal:p,input,current,plans:rows.map(r=>({id:r.id,version:r.version}))});
  return {previewHash,current,proposed:input.config,impact};
 }
 async preview(p:Principal,raw:unknown){const input=inputSchema.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{await this.requireReady(tx,a,true);return this.plan(tx,p,input,!snapshot);});}
 async save(p:Principal,raw:unknown){const command=saveSchema.parse(raw),input=inputSchema.parse({expectedRevision:command.expectedRevision,config:command.config,reason:command.reason});return this.tx(async tx=>{
  const a=await this.actor(tx,p);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`calendar-command:${p.enterpriseId}:${command.commandId}`]);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`calendar:${p.enterpriseId}:${p.teamId}`]);const fingerprint=sourceDigest({principal:p,command}),prior=(await tx.query('SELECT revision,document,fingerprint FROM enterprise_workflow.team_calendar_versions WHERE enterprise_id=$1 AND command_id=$2',[p.enterpriseId,command.commandId])).rows[0];
  if(prior){if(prior.fingerprint!==fingerprint)throw new WorkflowError(409,'IDEMPOTENCY_CONFLICT');return {calendar:{revision:prior.revision,configured:true,config:prior.document},replayed:true};}
  const plan=await this.plan(tx,p,input);if(plan.previewHash!==command.previewHash)throw new WorkflowError(409,'CALENDAR_PREVIEW_CHANGED');const revision=command.expectedRevision+1;
  await tx.query('INSERT INTO enterprise_workflow.team_calendar_versions(enterprise_id,team_id,revision,document,command_id,fingerprint,subject,reason)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p.enterpriseId,p.teamId,revision,command.config,command.commandId,fingerprint,a.subject,command.reason]);return {calendar:{revision,configured:true,config:command.config},replayed:false};
 });}
}
