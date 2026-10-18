import {PublicationStore} from './publication-store';
import {isChangeAction,changeCanApprove,changeControls,changeBusiness,changeExecution,changeImpact,changeBaseline} from './change-domain';
import {changePreview} from './change-contracts';
import {GuidelineStore} from './guideline-store';
import {ProjectStore} from './project-store';
import {AppealStore} from './appeal-store';
import {CapacityStore} from './capacity-store';
import {SlaStore} from './sla-store';
import {NotificationStore as LocalNotifications} from './notification-store';
import {ReviewStore,type ReviewImage} from './review-store';
import {WorklogStore} from './worklog-store';
import type {DemandAssetStore} from './demand-asset-store';
import {DemandBatchStore} from './demand-batch-store';
import {FormStore} from './form-store';
import {CatalogStore} from './catalog-store';
import {moveInput,previewMove} from './plan-move';
import {AvailabilityStore,loadAvailability,availabilityKey,capacityMinutes} from './availability-store';
import {readScope} from './read-scope';
import {readDashboard} from './dashboard';
import {sourceAssetSchema,sourceDigest,type SourceAsset} from './source-files';
import {CalendarStore,loadCalendars} from './calendar-store';
import {allocateHours,dayMinutes,legacyCalendar} from './calendar';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { commandSchema,batchPreviewSchema,calendarDate, WorkflowError, type Actor, type Principal, type WorkOrder, type Command } from './contracts';
import type {NotificationStore} from './notification-store';
import type {RoutingStore} from './routing-store';
import type { Workbook } from './scheduling-contracts';
import { canRead, evolve } from './domain';
const sourceSchema=z.strictObject({sourceHash:z.string().regex(/^[a-f0-9]{64}$/),row:z.number().int().min(2).max(10001),expectedVersion:z.number().int().positive(),intent:z.literal('standalone'),confirmed:z.literal(true),sourceAssetIds:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50).optional()});
const intakeSchema=z.strictObject({command:commandSchema,source:sourceSchema});
const listSchema=z.strictObject({query:z.string().max(120).default(''),status:z.enum(['','draft','submitted','approved','active','completed','cancelled','archived']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});
const tasksSchema=z.strictObject({query:z.string().max(120).default(''),status:z.enum(['','open','assigned','claimed','in_progress','blocked','review','rework','accepted']).default(''),scope:z.enum(['all','mine','claimable','handover']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1),assignee:z.string().max(254).default('')});
const assigneeSchema=z.strictObject({query:z.string().max(120).default(''),kind:z.enum(['','design','artwork']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});

// Same authorization as canRead: request-side access never grants execution writes.
export {readScope} from './read-scope';
// Must check live membership, enabled/expiry, entry grant, feature policy and business permissions.
// It is also called for an assignment target; role display names and client headers are not authority.
export type ResolveActor = (tx: PoolClient, principal: Principal) => Promise<Actor | null>;
// Must verify tenant ownership and usability of each immutable deliverable revision.
export type ValidateAssets = (tx: PoolClient, actor: Actor, assetIds: string[], context?:{orderId:string;taskId:string}) => Promise<boolean>;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export type VerifySource=(proof:string,actor:Actor,command:Command)=>Promise<{sourceSubject:string}>;
export class WorkflowStore {
  readonly worklogs:WorklogStore;
  readonly reviews:ReviewStore;
  readonly sla:SlaStore;
  readonly capacity:CapacityStore;
  readonly appeals:AppealStore;
  readonly projects:ProjectStore;
  readonly guidelines:GuidelineStore;
  readonly publications:PublicationStore;
  readonly demandBatches:DemandBatchStore;
  readonly forms:FormStore;
  readonly catalog:CatalogStore;
  readonly calendars:CalendarStore;
  readonly availability:AvailabilityStore;
  constructor(readonly pool: Pool, private resolveActor: ResolveActor, private validateAssets: ValidateAssets, private localOwner?:{enterpriseId:string;subject:string},private verifySource?:VerifySource,private now=()=>new Date(),private routing?:RoutingStore,private notifications?:NotificationStore,private availabilityEnabled=true,catalogEnabled=true,formsEnabled=true,demandBatchEnabled=true,readonly demandAssets?:DemandAssetStore,worklogsEnabled=true,reviewsEnabled=true,reviewImage?:ReviewImage,slaEnabled=true,capacityEnabled=true,appealsEnabled=true,projectsEnabled=true,guidelinesEnabled=true,publicationsEnabled=true,readonly changesEnabled=false) {this.guidelines=new GuidelineStore(pool,resolveActor,guidelinesEnabled,now);this.projects=new ProjectStore(pool,resolveActor,projectsEnabled,now);this.appeals=new AppealStore(pool,resolveActor,appealsEnabled,now);this.capacity=new CapacityStore(pool,resolveActor,capacityEnabled);const n=notifications??new LocalNotifications(pool,resolveActor);this.sla=new SlaStore(pool,resolveActor,n,slaEnabled,now);n.reminderGuard=(tx,row)=>this.sla.deliveryCurrent(tx,row);this.reviews=new ReviewStore(pool,resolveActor,validateAssets,reviewsEnabled,now,reviewImage,this.guidelines);this.worklogs=new WorklogStore(pool,resolveActor,worklogsEnabled,now);this.forms=new FormStore(pool,resolveActor,formsEnabled,!!demandAssets);this.catalog=new CatalogStore(pool,resolveActor,catalogEnabled);this.publications=new PublicationStore(pool,resolveActor,validateAssets,this.catalog,this.guidelines,publicationsEnabled,now);this.demandBatches=new DemandBatchStore(pool,resolveActor,this.forms,this.catalog,demandBatchEnabled);this.calendars=new CalendarStore(pool,resolveActor);this.availability=new AvailabilityStore(pool,resolveActor,availabilityEnabled);}
  async ready() {
    const result = await this.pool.query('SELECT version FROM enterprise_workflow.schema_version WHERE version=1');
    if (result.rowCount !== 1) throw new WorkflowError(503, 'MIGRATION_REQUIRED');
  }
  private async actor(tx: PoolClient, principal: Principal) {
    const actor = await this.resolveActor(tx, principal);
    if (!actor || actor.enterpriseId !== principal.enterpriseId || actor.subject !== principal.subject || actor.teamId !== principal.teamId) throw new WorkflowError(403, 'MEMBERSHIP_REQUIRED');
    return actor;
  }
  private async transaction<T>(run: (tx: PoolClient) => Promise<T>,repeatable=false) {
    const tx = await this.pool.connect();
    try {
      await tx.query(repeatable?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');
      await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      const value = await run(tx); await tx.query('COMMIT'); return value;
    }
    catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  }
  async dashboard(principal:Principal,raw:unknown={}){return readDashboard(this.pool,this.resolveActor,principal,raw,this.now);}
  async get(principal: Principal, orderId: string) {
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal);
      const order = (await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2', [principal.enterpriseId, orderId])).rows[0]?.document as WorkOrder | undefined;
      if (!order || !canRead(actor, order)) throw new WorkflowError(404, 'NOT_FOUND');
      return order;
    });
  }
  async list(principal:Principal,raw:unknown={}) {
    const q=listSchema.parse(raw);
    return this.transaction(async tx=>{
      const actor=await this.actor(tx,principal);
      // Mirror canRead in SQL so authorization precedes pagination/counting.
      const values=[principal.enterpriseId,actor.teamId??null,actor.permissions.some(p=>['manage','dispatch','review'].includes(p)),actor.subject,actor.permissions.includes('execute'),actor.workKinds,q.status,q.query,actor.permissions.some(p=>['manage','dispatch'].includes(p))];
      const where=`enterprise_id=$1 AND ${readScope('document','$9')}
        AND ($7='' OR document->>'status'=$7) AND ($8='' OR strpos(lower(document->>'title'),lower($8))>0)`;
      const rows=await tx.query(`SELECT document,count(*) OVER() AS total FROM enterprise_workflow.orders WHERE ${where} ORDER BY updated_at DESC,id LIMIT 30 OFFSET $10`,[...values,(q.page-1)*30]);
      const total=rows.rows.length?Number(rows.rows[0].total):Number((await tx.query(`SELECT count(*) AS n FROM enterprise_workflow.orders WHERE ${where}`,values)).rows[0].n);
      return {orders:rows.rows.map(r=>r.document as WorkOrder).filter(o=>canRead(actor,o)),total,page:q.page,pageSize:30,viewer:{subject:actor.subject,permissions:actor.permissions,teamId:actor.teamId??null}};
    });
  }
  async detail(principal:Principal,orderId:string) {
    return this.transaction(async tx=>{
      const actor=await this.actor(tx,principal);
      // Prevent mutation between document and its event snapshot.
      const order=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[principal.enterpriseId,orderId])).rows[0]?.document as WorkOrder|undefined;
      if(!order||!canRead(actor,order))throw new WorkflowError(404,'NOT_FOUND');
      const events=(await tx.query('SELECT event FROM enterprise_workflow.events WHERE enterprise_id=$1 AND order_id=$2 ORDER BY aggregate_version DESC LIMIT 100',[principal.enterpriseId,orderId])).rows.map(r=>r.event);
      const source=(await tx.query('SELECT source_hash AS "sourceHash",row_number AS row,source_version AS "sourceVersion",snapshot FROM enterprise_workflow.order_sources WHERE enterprise_id=$1 AND order_id=$2',[principal.enterpriseId,orderId])).rows[0]??null;
      return {order,events,source,changeControl:changeControls(actor,order,this.changesEnabled)};
    });
  }
  async tasks(principal:Principal,raw:unknown={}){
    const q=tasksSchema.parse(raw);
    return this.transaction(async tx=>{
      const a=await this.actor(tx,principal),v=[a.enterpriseId,a.teamId??null,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,q.status,q.scope,q.query,q.assignee,a.permissions.some(p=>['manage','dispatch'].includes(p))];
      const where=`o.enterprise_id=$1 AND ${readScope('o.document','$11')}
       AND ($7='' OR t->>'status'=$7) AND ($8='all' OR $8='mine' AND (t->>'assignee'=$4 OR t->'pendingHandover'->>'to'=$4) OR $8='handover' AND o.document->>'status'='active' AND t->'pendingHandover'->>'to'=$4 OR $8='claimable' AND (o.document->>'teamId') IS NOT DISTINCT FROM $2::text AND $5::boolean AND o.document->>'status'='active' AND t->>'status'='open' AND t->>'kind'=ANY($6::text[]) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(t->'dependencyIds') d WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'id'=d AND x->>'status'='accepted')))
       AND ($9='' OR strpos(lower((o.document->>'title')||' '||(t->>'title')),lower($9))>0) AND ($10='' OR t->>'assignee'=$10)`;
      const from='FROM enterprise_workflow.orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->\'tasks\') t';
      const result=await tx.query(`SELECT o.document,t AS task,count(*) OVER() AS total ${from} WHERE ${where} ORDER BY (t->>'dueAt')::timestamptz,o.id,t->>'id' LIMIT 30 OFFSET $12`,[...v,(q.page-1)*30]);
      const total=result.rows.length?Number(result.rows[0].total):Number((await tx.query(`SELECT count(*) AS n ${from} WHERE ${where}`,v)).rows[0].n);
      return {tasks:result.rows.filter(r=>canRead(a,r.document)).map(r=>{const o=r.document as WorkOrder;return {order:{id:o.id,teamId:o.teamId,requestTeamId:o.requestTeamId,title:o.title,status:o.status,version:o.version,requester:o.requester,brief:o.brief},task:r.task};}),total,page:q.page,pageSize:30,viewer:{subject:a.subject,permissions:a.permissions,workKinds:a.workKinds}};
    });
  }
  async movePreview(principal:Principal,raw:unknown){const input=moveInput.parse(raw);return this.transaction(async tx=>previewMove(tx,await this.actor(tx,principal),input,this.availabilityEnabled,this.capacity.enabled),true);}
  async week(principal:Principal,raw:unknown){
    const q=z.strictObject({start:calendarDate,assignee:z.string().max(254).default('')}).parse(raw),end=new Date(Date.parse(q.start)+6*86400000).toISOString().slice(0,10);
    if(!calendarDate.safeParse(end).success)throw new WorkflowError(400,'INVALID_WEEK_RANGE');
    return this.transaction(async tx=>{const a=await this.actor(tx,principal),values=[a.enterpriseId,a.teamId??null,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,q.assignee,q.start,end,a.permissions.some(p=>['manage','dispatch'].includes(p))];
      const where=`o.enterprise_id=$1 AND ${readScope('o.document','$10')}
       AND o.document->>'status' IN ('approved','active','completed') AND ($7='' OR t->>'assignee'=$7)`;
      const from="FROM enterprise_workflow.orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->'tasks') t";
      const rows=(await tx.query(`SELECT o.document,t AS task ${from} WHERE ${where} AND t->>'planStart'<=$9 AND t->>'planEnd'>=$8 ORDER BY t->>'planStart',o.id,t->>'id' LIMIT 1001`,values)).rows;
      if(rows.length>1000)throw new WorkflowError(422,'WEEK_RANGE_TOO_LARGE');
      const unplanned=Number((await tx.query(`SELECT count(*) AS n ${from} WHERE ${where} AND (t->>'planStart') IS NULL AND $8::text IS NOT NULL AND $9::text IS NOT NULL`,values)).rows[0].n);
      const days=Array.from({length:7},(_,i)=>new Date(Date.parse(q.start)+i*86400000).toISOString().slice(0,10));const loads:Record<string,Record<string,number>>={};
      const visible=rows.filter(r=>canRead(a,r.document)),teamIds=[...new Set(visible.map(r=>(r.document as WorkOrder).teamId).filter((x):x is string=>!!x))],calendars=await loadCalendars(tx,a.enterpriseId,teamIds);
      const personalEnabled=this.availabilityEnabled&&!!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=17')).rowCount;
      const personal=await loadAvailability(tx,a.enterpriseId,visible.flatMap(r=>r.document.teamId&&r.task.assignee?[{teamId:r.document.teamId,subject:r.task.assignee}]:[]),personalEnabled);
      const names=new Map((await tx.query('SELECT team_id,name FROM enterprise_workflow.teams WHERE enterprise_id=$1 AND team_id=ANY($2::uuid[])',[a.enterpriseId,teamIds])).rows.map(r=>[r.team_id,r.name]));
      const groups=new Map<string,{key:string;teamId:string|null;teamName:string;subject:string;calendarRevision:number;configured:boolean;availabilityRevision:number;personalMinutes:Record<string,number|null>;teamCapacities:Record<string,number>;capacities:Record<string,number>;loads:Record<string,number>}>(),noWorkingDayTasks:{orderId:string;taskId:string;title:string;estimatedHours:number}[]=[];
      const tasks=visible.map(r=>{const o=r.document as WorkOrder,t=r.task as WorkOrder['tasks'][number],who=t.assignee||'__unassigned',calendar=calendars.get(o.teamId||'')??legacyCalendar(),key=JSON.stringify([o.teamId??null,who]);loads[who]??={};const individual=personal.get(availabilityKey(o.teamId||'',who));
        if(!groups.has(key))groups.set(key,{key,teamId:o.teamId??null,teamName:names.get(o.teamId)||'未指定团队',subject:who,calendarRevision:calendar.revision,configured:calendar.configured,availabilityRevision:individual?.revision||0,personalMinutes:Object.fromEntries(days.map(d=>[d,capacityMinutes(dayMinutes(calendar.config,d),individual,d).personalMinutes])),teamCapacities:Object.fromEntries(days.map(d=>[d,dayMinutes(calendar.config,d)/60])),capacities:Object.fromEntries(days.map(d=>[d,capacityMinutes(dayMinutes(calendar.config,d),individual,d).minutes/60])),loads:{}});
        const group=groups.get(key)!,allocation=allocateHours(calendar.config,t.planStart!,t.planEnd!,t.estimatedHours||0);
        if(allocation.noWorkingDay)noWorkingDayTasks.push({orderId:o.id,taskId:t.id,title:t.title,estimatedHours:t.estimatedHours||0});
        for(const day of days){const hours=allocation.byDay[day]||0;loads[who][day]=(loads[who][day]||0)+hours;group.loads[day]=(group.loads[day]||0)+hours;}
        return {order:{id:o.id,teamId:o.teamId,requestTeamId:o.requestTeamId,title:o.title,status:o.status,version:o.version,requester:o.requester},task:t,loadGroup:key,calendarRevision:calendar.revision,noWorkingDay:allocation.noWorkingDay};});
      return {tasks,days,loads,workloads:[...groups.values()],noWorkingDayTasks,unplanned,timezone:'Asia/Shanghai',distribution:[...groups.values()].some(g=>g.configured)?'team-working-minutes':'calendar-day-even',referenceDailyHours:8,availabilityEnabled:personalEnabled,capacityScope:'execution-team-person'};
    },true);
  }
  async facts(principal:Principal,raw:unknown={}){
    const q=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(raw);
    return this.transaction(async tx=>{const a=await this.actor(tx,principal),manager=a.permissions.some(p=>['manage','dispatch','review'].includes(p));
      const where="e.enterprise_id=$1 AND (e.event->>'teamId') IS NOT DISTINCT FROM $2::text AND e.event->>'type'='workflow.task.accepted.v1' AND ($3::boolean OR e.event->'data'->>'contributor'=$4 OR e.event->'data'->'participants' ? $4)";
      const values=[a.enterpriseId,a.teamId??null,manager,a.subject];const rows=(await tx.query(`SELECT e.event,count(*) OVER() AS total FROM enterprise_workflow.events e WHERE ${where} ORDER BY e.created_at DESC,e.id LIMIT 30 OFFSET $5`,[...values,(q.page-1)*30])).rows;const total=rows.length?Number(rows[0].total):Number((await tx.query(`SELECT count(*) AS n FROM enterprise_workflow.events e WHERE ${where}`,values)).rows[0].n);
      return {facts:rows.map(r=>r.event),total,page:q.page,pageSize:30,finalScore:false};
    });
  }
  async assignees(principal:Principal,raw:unknown={}){
    const q=assigneeSchema.parse(raw);
    return this.transaction(async tx=>{
      const a=await this.actor(tx,principal);if(!a.permissions.includes('dispatch')||!a.teamId)throw new WorkflowError(403,'DISPATCH_REQUIRED');
      const values=[a.enterpriseId,a.teamId,q.kind,q.query,principal.sourceBinding?.sourceInstance??'',principal.sourceBinding?.sourceEnterprise??null];
      const from=`FROM enterprise_workflow.team_members m JOIN enterprise_workflow.accounts a USING(enterprise_id,subject)
       LEFT JOIN LATERAL (SELECT p.nickname FROM enterprise_workflow.source_identities i JOIN enterprise_workflow.source_enterprises e USING(source_instance,source_enterprise,enterprise_id) JOIN enterprise_workflow.person_profiles p ON p.enterprise_id=i.enterprise_id AND p.source_instance=i.source_instance AND p.source_enterprise=i.source_enterprise AND p.source_subject=i.source_subject WHERE i.enterprise_id=m.enterprise_id AND i.subject=m.subject AND i.source_instance=$5 AND i.source_enterprise=$6::uuid AND i.enabled AND e.enabled AND p.enabled LIMIT 1) p ON true`;
      const where=`m.enterprise_id=$1 AND m.team_id=$2 AND m.enabled AND a.enabled AND (m.expires_at IS NULL OR m.expires_at>now()) AND (a.expires_at IS NULL OR a.expires_at>now()) AND m.permissions ? 'execute' AND ($3='' OR m.work_kinds ? $3) AND ($4='' OR strpos(lower(m.subject||' '||COALESCE(p.nickname,'')),lower($4))>0)`;
      const result=await tx.query(`SELECT m.subject,m.work_kinds AS "workKinds",COALESCE(p.nickname,'') AS nickname,count(*) OVER() AS total ${from} WHERE ${where} ORDER BY m.subject LIMIT 30 OFFSET $7`,[...values,(q.page-1)*30]);
      const total=result.rows.length?Number(result.rows[0].total):Number((await tx.query(`SELECT count(*) AS n ${from} WHERE ${where}`,values)).rows[0].n);
      return {members:result.rows.map(({subject,workKinds,nickname})=>({subject,workKinds,nickname})),total,page:q.page,pageSize:30};
    });
  }
  async history(principal:Principal,orderId:string,before:number){
    return this.transaction(async tx=>{const a=await this.actor(tx,principal),o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,orderId])).rows[0]?.document as WorkOrder|undefined;
      if(!o||!canRead(a,o))throw new WorkflowError(404,'NOT_FOUND');
      const events=(await tx.query('SELECT event FROM enterprise_workflow.events WHERE enterprise_id=$1 AND order_id=$2 AND aggregate_version<$3 ORDER BY aggregate_version DESC LIMIT 100',[a.enterpriseId,orderId,before])).rows.map(r=>r.event);
      return {events,nextBefore:events.length===100?events.at(-1).aggregateVersion:null};
    });
  }
  async batchReceipts(principal:Principal){
    return this.transaction(async tx=>{const a=await this.actor(tx,principal);if(!a.permissions.includes('dispatch'))throw new WorkflowError(403,'FORBIDDEN');
      const rows=(await tx.query(`SELECT c.id,c.order_id,e.event FROM enterprise_workflow.commands c JOIN enterprise_workflow.events e ON e.enterprise_id=c.enterprise_id AND e.order_id=c.order_id AND e.aggregate_version=(c.result->>'version')::int JOIN enterprise_workflow.orders o ON o.enterprise_id=c.enterprise_id AND o.id=c.order_id WHERE c.enterprise_id=$1 AND c.subject=$2 AND (o.document->>'teamId') IS NOT DISTINCT FROM $3::text AND e.event->>'type'='workflow.batch-tasks.v1' ORDER BY e.created_at DESC,e.id LIMIT 30`,[a.enterpriseId,a.subject,a.teamId??null])).rows;
      return {receipts:rows.map(r=>({commandId:r.id,orderId:r.order_id,event:r.event})),limit:30};
    });
  }
  async previewBatch(principal:Principal,raw:unknown){
    const b=batchPreviewSchema.parse(raw),keys=b.items.map(i=>i.orderId+':'+i.taskId);if(new Set(keys).size!==keys.length)throw new WorkflowError(400,'DUPLICATE_TASK');
    // Check batch permission even if no group is visible. Groups are independent snapshots, not reservations.
    await this.transaction(async tx=>{const a=await this.actor(tx,principal);if(!a.permissions.includes('dispatch'))throw new WorkflowError(403,'FORBIDDEN');});
    const grouped=new Map<string,typeof b.items>();for(const i of b.items){const g=grouped.get(i.orderId)??[];g.push(i);grouped.set(i.orderId,g);}
    const groups=[];
    for(const [orderId,items] of grouped){
      const hex=createHash('sha256').update(stable({principal,batchId:b.batchId,orderId})).digest('hex');const commandId=hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
      const command={commandId,orderId,expectedVersion:items[0].expectedVersion,action:{type:'batch-tasks' as const,batchId:b.batchId,taskIds:items.map(i=>i.taskId),operation:b.operation,reason:b.reason}};
      try{if(items.some(i=>i.expectedVersion!==command.expectedVersion))throw new WorkflowError(409,'VERSION_CONFLICT');const result=await this.executeCommand(principal,command,undefined,true);groups.push({command,ok:true,orderTitle:result.order.title,before:result.before,after:result.order.tasks.filter(t=>command.action.taskIds.includes(t.id)).map(t=>({taskId:t.id,title:t.title,assignee:t.assignee,status:t.status,scheduleTag:t.scheduleTag??''}))});}
      catch(e){if(!(e instanceof WorkflowError))throw e;groups.push({command,ok:false,error:e.code,status:e.status});}
    }
    return {batchId:b.batchId,groups,atomicity:'per-order' as const};
  }
  async promote(principal:Principal,raw:unknown){
    const c=intakeSchema.parse(raw);
    if(c.command.action.type!=='create'||c.command.expectedVersion!==0)throw new WorkflowError(400,'INTAKE_REQUIRES_CREATE');
    return this.executeCommand(principal,c.command,c.source);
  }
  async execute(principal: Principal, raw: unknown,proof='') {
    return this.executeCommand(principal,raw,undefined,false,proof);
  }
  private async changeReady(tx:PoolClient){
    if(!this.changesEnabled)throw new WorkflowError(503,'CHANGES_NOT_ENABLED');
    if(!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=33')).rowCount)throw new WorkflowError(503,'CHANGES_MIGRATION_REQUIRED');
    await tx.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('enterprise-runtime:migrate',0))");
    const f=(await tx.query('SELECT changes_enabled,minimum_reader,minimum_writer FROM enterprise_workflow.runtime_installation WHERE singleton')).rows[0];
    if(!f?.changes_enabled||f.minimum_reader<33||f.minimum_writer<33)throw new WorkflowError(503,'CHANGES_ACTIVATION_REQUIRED');
  }
  async previewChange(p:Principal,raw:unknown){const q=changePreview.parse(raw);return this.transaction(async tx=>{const a=await this.actor(tx,p);await this.changeReady(tx);const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,q.orderId])).rows[0]?.document as WorkOrder|undefined;if(!o||!canRead(a,o))throw new WorkflowError(404,'NOT_FOUND');if(o.version!==q.expectedVersion)throw new WorkflowError(409,'VERSION_CONFLICT');if(!changeBusiness(a,o)&&!changeExecution(a,o))throw new WorkflowError(403,'CHANGE_PROPOSE_FORBIDDEN');return {orderId:o.id,version:o.version,baselineHash:changeBaseline(o),impact:changeImpact(o,q.patch,this.now().toISOString())};});}
  private async batchActor(tx:PoolClient,p:Principal){
    const a=await this.actor(tx,p);
    if(!a.teamId||!a.permissions.includes('dispatch'))throw new WorkflowError(403,'DISPATCH_REQUIRED');
    if(!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=13')).rowCount)throw new WorkflowError(503,'BATCH_MIGRATION_REQUIRED');
    return a;
  }
  private async batchRow(tx:PoolClient,p:Principal,batchId:string,lock=''){
    const a=await this.batchActor(tx,p);
    const row=(await tx.query('SELECT * FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND id=$2 AND team_id=$3 AND subject=$4 AND identity_hash=$5 '+lock,[a.enterpriseId,batchId,a.teamId,a.subject,sourceDigest(p)])).rows[0];
    if(!row)throw new WorkflowError(404,'BATCH_NOT_FOUND');return row;
  }
  async planBatch(p:Principal,raw:unknown){
    const b=batchPreviewSchema.parse(raw),inputHash=sourceDigest(b);
    const prior=await this.transaction(async tx=>{const a=await this.batchActor(tx,p);return (await tx.query('SELECT * FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,b.batchId])).rows[0];});
    if(prior){if(prior.identity_hash!==sourceDigest(p)||prior.team_id!==p.teamId||prior.subject!==p.subject)throw new WorkflowError(404,'BATCH_NOT_FOUND');if(prior.input_hash!==inputHash)throw new WorkflowError(409,'BATCH_INPUT_CONFLICT');return this.getBatch(p,b.batchId);}
    const preview=await this.previewBatch(p,b),planHash=sourceDigest({identity:p,preview});
    await this.transaction(async tx=>{
      const a=await this.batchActor(tx,p);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`batch-owner:${a.enterpriseId}:${a.teamId}:${a.subject}`]);
      const again=(await tx.query('SELECT * FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,b.batchId])).rows[0];
      if(again){if(again.identity_hash!==sourceDigest(p))throw new WorkflowError(404,'BATCH_NOT_FOUND');if(again.input_hash!==inputHash)throw new WorkflowError(409,'BATCH_INPUT_CONFLICT');return;}
      if(Number((await tx.query('SELECT count(*) AS n FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 AND closed_at IS NULL',[a.enterpriseId,a.teamId,a.subject])).rows[0].n)>=100)throw new WorkflowError(409,'BATCH_OPEN_LIMIT');
      await tx.query('INSERT INTO enterprise_workflow.batch_plans(enterprise_id,id,team_id,subject,identity_hash,input_hash,plan_hash,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.enterpriseId,b.batchId,a.teamId,a.subject,sourceDigest(p),inputHash,planHash,preview]);
    });
    return this.getBatch(p,b.batchId);
  }
  async listBatches(p:Principal,raw:unknown={}){
    const q=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(raw);
    return this.transaction(async tx=>{const a=await this.batchActor(tx,p),values=[a.enterpriseId,a.teamId,a.subject,sourceDigest(p)];
      const total=Number((await tx.query('SELECT count(*) AS n FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 AND identity_hash=$4',values)).rows[0].n);
      const rows=(await tx.query('SELECT id,created_at,closed_at,jsonb_array_length(document->\'groups\') AS groups FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 AND identity_hash=$4 ORDER BY created_at DESC,id LIMIT 30 OFFSET $5',[...values,(q.page-1)*30])).rows;
      return {batches:rows,total,page:q.page,pageSize:30};
    });
  }
  async getBatch(p:Principal,batchId:string){
    z.string().uuid().parse(batchId);
    const row=await this.transaction(tx=>this.batchRow(tx,p,batchId));
    const plan=row.document as Awaited<ReturnType<WorkflowStore['previewBatch']>>,groups=[];
    for(const g of plan.groups){
      try{
        const o=await this.get(p,g.command.orderId);
        if(o.teamId!==p.teamId)throw new WorkflowError(404,'NOT_FOUND');
        const prior=await this.transaction(async tx=>{await this.batchActor(tx,p);return (await tx.query('SELECT fingerprint,result FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2',[p.enterpriseId,g.command.commandId])).rows[0];});
        if(prior){if(prior.fingerprint!==sourceDigest({principal:p,command:g.command}))throw new WorkflowError(409,'IDEMPOTENCY_CONFLICT');groups.push({...g,state:'success',version:prior.result.version});continue;}
        if(!g.ok){groups.push({...g,state:'skipped'});continue;}
        if(row.closed_at){groups.push({...g,state:'closed'});continue;}
        try{const r=await this.executeCommand(p,g.command,undefined,true);groups.push({...g,state:r.replayed?'success':'ready',...(r.replayed?{version:r.order.version}:{})});}
        catch(e){if(!(e instanceof WorkflowError))throw e;groups.push({...g,state:'stale',error:e.code});}
      }catch(e){if(!(e instanceof WorkflowError))throw e;groups.push({orderId:g.command.orderId,command:null,state:'unavailable',error:e.code,ok:false});}
    }
    // Recheck the current identity after multi-order inspection; no automatic mutations.
    const current=await this.transaction(tx=>this.batchRow(tx,p,batchId));
    return {batchId,planHash:row.plan_hash,createdAt:row.created_at,closedAt:current.closed_at,closeReason:current.close_reason,groups:current.closed_at?groups.map(g=>g.state==='ready'?{...g,state:'closed'}:g):groups,atomicity:'per-order',persisted:true};
  }
  async runBatch(p:Principal,raw:unknown){
    const q=z.strictObject({batchId:z.string().uuid(),orderId:z.string().uuid(),planHash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(raw);
    const row=await this.transaction(tx=>this.batchRow(tx,p,q.batchId));
    if(row.plan_hash!==q.planHash)throw new WorkflowError(409,'BATCH_PLAN_CHANGED');
    const g=(row.document as Awaited<ReturnType<WorkflowStore['previewBatch']>>).groups.find(g=>g.command.orderId===q.orderId);
    if(!g?.ok)throw new WorkflowError(409,'BATCH_GROUP_NOT_READY');
    return this.executeCommand(p,g.command,undefined,false,'',q);
  }
  async closeBatch(p:Principal,raw:unknown){
    const q=z.strictObject({batchId:z.string().uuid(),planHash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(2000)}).parse(raw);
    return this.transaction(async tx=>{const row=await this.batchRow(tx,p,q.batchId,'FOR UPDATE');
      if(row.plan_hash!==q.planHash)throw new WorkflowError(409,'BATCH_PLAN_CHANGED');
      if(row.closed_at){if(row.close_reason!==q.reason)throw new WorkflowError(409,'BATCH_CLOSE_CONFLICT');return {closed:true,replayed:true};}
      await tx.query('UPDATE enterprise_workflow.batch_plans SET closed_at=now(),close_reason=$3 WHERE enterprise_id=$1 AND id=$2',[p.enterpriseId,q.batchId,q.reason]);return {closed:true,replayed:false};
    });
  }
  private async executeCommand(principal: Principal, raw: unknown, source?:z.infer<typeof sourceSchema>,dryRun=false,proof='',batchGuard?:{batchId:string;planHash:string}) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new WorkflowError(400, 'INVALID_COMMAND');
    const command = parsed.data;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal);
      // Legacy command endpoint must not bypass a persisted plan's closure or frozen body.
      if(isChangeAction(command.action.type))await this.changeReady(tx);
      if(!batchGuard&&command.action.type==='batch-tasks'&&(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=13')).rowCount){const saved=(await tx.query('SELECT plan_hash FROM enterprise_workflow.batch_plans WHERE enterprise_id=$1 AND id=$2',[principal.enterpriseId,command.action.batchId])).rows[0];if(saved)batchGuard={batchId:command.action.batchId,planHash:saved.plan_hash};}
      if(batchGuard){const row=await this.batchRow(tx,principal,batchGuard.batchId,'FOR SHARE');if(row.closed_at)throw new WorkflowError(409,'BATCH_CLOSED');if(row.plan_hash!==batchGuard.planHash)throw new WorkflowError(409,'BATCH_PLAN_CHANGED');const group=row.document.groups.find((g:{command:Command;ok:boolean})=>g.command.orderId===command.orderId);if(!group?.ok||sourceDigest(group.command)!==sourceDigest(command))throw new WorkflowError(409,'BATCH_COMMAND_CHANGED');}
      // Fixed lock order; tenant-scoped command dedupe also covers concurrent reuse across orders.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`command:${principal.enterpriseId}:${command.commandId}`]);
      if(command.action.type==='accept-delivery')await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`performance:${principal.enterpriseId}:${principal.teamId}`]);
      const orderLocks=command.action.type==='operations-followup'?[command.orderId,command.action.followupId].sort():[command.orderId];for(const oid of new Set(orderLocks))await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${principal.enterpriseId}:${oid}`]);
      const fingerprint = createHash('sha256').update(stable({ principal, command,...(source?{source}:{}) })).digest('hex');
      let sourceRow;let referenceAssets:SourceAsset[]|undefined;
      if(source){
        if(!actor.permissions.includes('manage')||!actor.permissions.includes('request'))throw new WorkflowError(403,'SOURCE_INTAKE_FORBIDDEN');
        // Imported names are tenant-wide private data; team management alone is insufficient.
        const local=this.localOwner?.enterpriseId===principal.enterpriseId&&this.localOwner?.subject===principal.subject;
        if(!local&&(await tx.query('SELECT 1 FROM enterprise_workflow.person_directory_admins WHERE enterprise_id=$1 AND subject=$2 AND enabled FOR SHARE',[principal.enterpriseId,principal.subject])).rowCount!==1)throw new WorkflowError(403,'DIRECTORY_ADMIN_REQUIRED');
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`intake:${principal.enterpriseId}:${source.sourceHash}:${source.row}`]);
        const batch=await tx.query('SELECT 1 FROM enterprise_workflow.import_batches WHERE enterprise_id=$1 AND source_hash=$2 AND active FOR SHARE',[principal.enterpriseId,source.sourceHash]);
        sourceRow=(await tx.query('SELECT document,version,resolution FROM enterprise_workflow.import_rows WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3 FOR SHARE',[principal.enterpriseId,source.sourceHash,source.row])).rows[0];
        if(!batch.rowCount||!sourceRow)throw new WorkflowError(404,'SOURCE_NOT_FOUND');
      }
      const prior = (await tx.query('SELECT fingerprint,result FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2', [principal.enterpriseId, command.commandId])).rows[0];
      const previous = (await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR UPDATE', [principal.enterpriseId, command.orderId])).rows[0]?.document as WorkOrder | undefined;
      if(command.action.type==='link-source'){
        if(!previous||!canRead(actor,previous))throw new WorkflowError(404,'NOT_FOUND');
        if(!this.verifySource||!actor.sourceBinding)throw new WorkflowError(503,'SOURCE_PROOF_NOT_CONFIGURED');
        const verified=await this.verifySource(proof,actor,command);
        if(!actor.permissions.includes('dispatch')&&verified.sourceSubject!==actor.sourceBinding.sourceSubject)throw new WorkflowError(403,'SOURCE_SELF_ONLY');
      }
      if(['set-demand-catalog','set-demand-form','set-demand-assets','set-demand-guideline'].includes(command.action.type)&&(!actor.permissions.includes('request')||!previous||actor.teamId!==previous.teamId||actor.subject!==previous.requester&&!actor.permissions.includes('manage')))throw new WorkflowError(403,'FORBIDDEN');
      if(command.action.type==='move-task-plan'&&(!actor.permissions.includes('dispatch')||!previous||actor.teamId!==previous.teamId))throw new WorkflowError(403,'FORBIDDEN');
      // Revoked permissions cannot recover historical command snapshots via idempotency replay.
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new WorkflowError(409, 'IDEMPOTENCY_CONFLICT');
        if (!previous || !canRead(actor, previous)) throw new WorkflowError(403, 'FORBIDDEN');
        return { order: prior.result as WorkOrder, replayed: true };
      }
      if(source){
        if(sourceRow!.version!==source.expectedVersion)throw new WorkflowError(409,'SOURCE_VERSION_CONFLICT');
        if((await tx.query('SELECT 1 FROM enterprise_workflow.order_sources WHERE enterprise_id=$1 AND source_hash=$2 AND row_number=$3',[principal.enterpriseId,source.sourceHash,source.row])).rowCount)throw new WorkflowError(409,'SOURCE_ALREADY_PROMOTED');
      }
      if(source?.sourceAssetIds!==undefined){const ids=source.sourceAssetIds;if(new Set(ids).size!==ids.length)throw new WorkflowError(400,'DUPLICATE_SOURCE_ASSET');const rowAssets=new Set<string>((sourceRow!.document.attachments??[]).flatMap((x:{assets:string[]})=>x.assets));if(ids.some(x=>!rowAssets.has(x)))throw new WorkflowError(400,'SOURCE_ASSET_NOT_IN_ROW');const docs=(await tx.query('SELECT asset_id,document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2 AND asset_id=ANY($3::text[]) FOR SHARE',[principal.enterpriseId,source.sourceHash,ids])).rows;const assets=new Map(docs.map(x=>[x.asset_id,x.document]));referenceAssets=ids.map(id=>{const parsed=sourceAssetSchema.safeParse(assets.get(id));if(!parsed.success||parsed.data.id!==id)throw new WorkflowError(409,'SOURCE_ASSET_UNAVAILABLE');return parsed.data;});}
      const action=command.action;
      if(isChangeAction(action.type)){
        if(action.type==='apply-change'){
          if(!previous||!canRead(actor,previous))throw new WorkflowError(404,'NOT_FOUND');
          const change=previous.changes?.find(c=>c.id===action.changeId);
          if(!change)throw new WorkflowError(404,'CHANGE_NOT_FOUND');
          for(const approval of change.approvals){
            const current=await this.resolveActor(tx,{enterpriseId:actor.enterpriseId,subject:approval.subject,teamId:approval.teamId,...(approval.sourceBinding?{sourceBinding:approval.sourceBinding}:{})});
            if(!current||current.subject!==approval.subject||current.teamId!==approval.teamId||!changeCanApprove(current,previous,change,approval.side))throw new WorkflowError(409,'CHANGE_APPROVER_UNAVAILABLE');
          }
        }
      }
      const assignment=action.type==='assign'||action.type==='propose-handover'?{subject:action.assignee,ids:[action.taskId]}:action.type==='batch-tasks'&&action.operation.type==='assign'?{subject:action.operation.assignee,ids:action.taskIds}:null;
      if(assignment){
        if(!previous||!canRead(actor,previous)||!actor.permissions.includes('dispatch'))throw new WorkflowError(403,'FORBIDDEN');
        const target=await this.resolveActor(tx,{enterpriseId:principal.enterpriseId,subject:assignment.subject,...(principal.teamId?{teamId:principal.teamId}:{})});
        if(!target&&action.type==='assign')throw new WorkflowError(403,'MEMBERSHIP_REQUIRED');
        if(!target||target.enterpriseId!==principal.enterpriseId||target.teamId!==principal.teamId||target.subject!==assignment.subject||!target.permissions.includes('execute')||assignment.ids.some(id=>{const task=previous.tasks.find(t=>t.id===id);return !task||!target.workKinds.includes(task.kind);}))throw new WorkflowError(action.type==='assign'?403:409,'INVALID_ASSIGNEE');
      }
      let moveImpact;
      if(action.type==='move-task-plan'){moveImpact=await previewMove(tx,actor,{orderId:command.orderId,taskId:action.taskId,expectedVersion:command.expectedVersion,targetStart:action.targetStart,reason:action.reason},this.availabilityEnabled,this.capacity.enabled);if(moveImpact.previewHash!==action.previewHash)throw new WorkflowError(409,'PLAN_MOVE_PREVIEW_CHANGED');}
      const { order, event } = evolve(previous ?? null, actor, command, this.now().toISOString());
      // Leave space for approvals/withdrawal on all bounded pending proposals.
      if(isChangeAction(action.type)&&Buffer.byteLength(JSON.stringify(order),'utf8')>(action.type==='propose-change'?768:1024)*1024)throw new WorkflowError(409,'CHANGE_DOCUMENT_LIMIT');
      await this.capacity.guard(tx,actor,previous??null,order);
      if(action.type==='set-demand-assets'){if(!this.demandAssets)throw new WorkflowError(503,'DEMAND_ASSETS_NOT_ENABLED');order.demandAssets=await this.demandAssets.selection(tx,actor,order,action.assetIds);event.data.demandAssets=order.demandAssets;}
      if(action.type==='submit-requirement'&&(order.demandAssets?.length||order.form?.definition.attachmentRules)){if(!this.demandAssets)throw new WorkflowError(503,'DEMAND_ASSETS_NOT_ENABLED');await this.demandAssets.validateSubmission(tx,actor,order);}
      if(action.type==='set-demand-guideline'){await this.guidelines.available(tx);order.guideline=action.selection?await this.guidelines.selection(tx,actor,order,action.selection):null;event.data.guideline=order.guideline;}
      if(action.type==='set-demand-form'){await this.forms.available(tx);order.form=action.selection?await this.forms.selection(tx,actor,action.selection):null;event.data.form=order.form;}
      if(action.type==='submit-requirement'&&order.form)await this.forms.validateSubmission(tx,actor,order);
      if(action.type==='set-demand-catalog'){await this.catalog.available(tx);await this.catalog.lock(tx,actor.enterpriseId);order.catalog=action.selection?await this.catalog.select(tx,actor,action.selection.shopId,action.selection.skuId,action.selection.revisions):null;event.data.catalog=order.catalog;}
      if(action.type==='submit-requirement'&&order.catalog){await this.catalog.lock(tx,actor.enterpriseId);const s=order.catalog.selection;await this.catalog.select(tx,actor,s.shopId,s.skuId,s.revisions);}
      if(['submit-requirement','approve-requirement','publish','apply-change'].includes(action.type)&&order.guideline)await this.guidelines.validateOrder(tx,actor,order);
      if(moveImpact)event.data.planMove={previewHash:moveImpact.previewHash,calendarRevision:moveImpact.calendarRevision,availabilityRevision:moveImpact.availabilityRevision,conflictDays:moveImpact.impact.conflictDays,noWorkingDay:moveImpact.impact.noWorkingDay,afterDue:moveImpact.impact.afterDue,dependencies:moveImpact.impact.dependencies,capacityReservation:false};
      if(action.type==='submit-requirement'&&this.routing){await this.routing.submitted(tx,actor,order,event.occurredAt);event.teamId=order.teamId;if(order.routing)event.data.routing=order.routing;}
      if(action.type==='operations-signoff'||action.type==='operations-followup')for(const task of order.tasks)if(!await this.validateAssets(tx,actor,task.assetIds,{orderId:order.id,taskId:task.id}))throw new WorkflowError(403,'INVALID_ASSETS');
      if(action.type==='operations-followup'){
        if(action.followupId===order.id)throw new WorkflowError(400,'INVALID_FOLLOWUP');
        // followup UUID is client-stable; insertion/old-order decision/dual events commit together.
        if((await tx.query('SELECT 1 FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[actor.enterpriseId,action.followupId])).rowCount)throw new WorkflowError(409,'FOLLOWUP_EXISTS');
        const follow:WorkOrder={id:action.followupId,enterpriseId:order.enterpriseId,teamId:order.requestTeamId??order.teamId,requestTeamId:order.requestTeamId??order.teamId,requester:actor.subject,title:action.title,brief:action.brief,acceptance:action.acceptance,...(order.routingFields?{routingFields:order.routingFields}:{}),followsOrderId:order.id,status:'draft',version:1,createdAt:event.occurredAt,updatedAt:event.occurredAt,tasks:[]};
        await tx.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)VALUES($1,$2,1,$3)',[actor.enterpriseId,follow.id,follow]);
        const followEvent={...event,id:createHash('sha256').update(event.id+':followup').digest('hex'),orderId:follow.id,teamId:follow.teamId,aggregateVersion:1,type:'workflow.operations-followup-created.v1',data:{action:{type:'operations-followup-created',originalOrderId:order.id,reason:action.reason}}};
        await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event)VALUES($1,$2,$3,1,$4)',[actor.enterpriseId,followEvent.id,follow.id,followEvent]);
      }
      const tag=action.type==='set-task-tag'?action.scheduleTag:action.type==='batch-tasks'&&action.operation.type==='set-task-tag'?action.operation.scheduleTag:null;
      if(tag!==null){const w=(await tx.query('SELECT document FROM enterprise_workflow.schedule_workbooks WHERE enterprise_id=$1 AND team_id=$2 FOR SHARE',[actor.enterpriseId,actor.teamId])).rows[0]?.document as Workbook|undefined;if(!w)throw new WorkflowError(409,'WORKBOOK_NOT_FOUND');if(tag&&!w.options.some(o=>o.id===tag))throw new WorkflowError(400,'INVALID_SCHEDULE_TAG');}
      if(dryRun)return {order,replayed:false,before:previous!.tasks.filter(t=>action.type==='batch-tasks'&&action.taskIds.includes(t.id)).map(t=>({taskId:t.id,assignee:t.assignee,status:t.status,scheduleTag:t.scheduleTag??''}))};
      if(command.action.type==='set-task-plan'){
        const action=command.action,w=(await tx.query('SELECT document FROM enterprise_workflow.schedule_workbooks WHERE enterprise_id=$1 AND team_id=$2 FOR SHARE',[actor.enterpriseId,actor.teamId])).rows[0]?.document as Workbook|undefined;
        if(!w)throw new WorkflowError(409,'WORKBOOK_NOT_FOUND');if(action.scheduleTag&&!w.options.some(o=>o.id===action.scheduleTag))throw new WorkflowError(400,'INVALID_SCHEDULE_TAG');
        for(const [key,value] of Object.entries(action.customValues)){const field=w.fields.find(f=>f.id===key&&!f.archived);if(!field)throw new WorkflowError(400,'INVALID_CUSTOM_FIELD');if(value===null)continue;
          const valid=field.type==='number'?typeof value==='number':field.type==='date'?calendarDate.safeParse(value).success:field.type==='select'?typeof value==='string'&&field.options.includes(value):typeof value==='string';if(!valid)throw new WorkflowError(400,'INVALID_CUSTOM_VALUE');}
      }
      if (command.action.type === 'submit-delivery' && !await this.validateAssets(tx, actor, command.action.assetIds,{orderId:command.orderId,taskId:command.action.taskId})) throw new WorkflowError(403, 'INVALID_ASSETS');
      if(command.action.type==='accept-delivery'){const action=command.action;const task=previous?.tasks.find(t=>t.id===action.taskId);if(!task||!await this.validateAssets(tx,actor,task.assetIds,{orderId:command.orderId,taskId:task.id}))throw new WorkflowError(403,'INVALID_ASSETS');await this.guidelines.validateOrder(tx,actor,previous!);await this.reviews.assertAcceptance(tx,actor,previous!,task);}
      await tx.query(`INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document) VALUES($1,$2,$3,$4)
        ON CONFLICT(enterprise_id,id) DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document,updated_at=now()`, [principal.enterpriseId, order.id, order.version, order]);
      await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event) VALUES($1,$2,$3,$4,$5)', [principal.enterpriseId, event.id, order.id, order.version, event]);
      await this.notifications?.publish(tx,order,event);
      await tx.query('INSERT INTO enterprise_workflow.commands(enterprise_id,id,subject,order_id,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)', [principal.enterpriseId, command.commandId, principal.subject, order.id, fingerprint, order]);
      if(source){
        const row=sourceRow!.document;
        const snapshot={intent:source.intent,title:row.title,requesterName:row.raw['需求方']||'',designerName:row.raw['设计师']||'',status:row.raw['任务完成情况']||'',parentLabel:row.parentLabel,parentResolution:sourceRow!.resolution,identityTransferred:false,statusTransferred:false,...(referenceAssets===undefined?{}:{referenceAssets,referenceRowHash:sourceDigest(row)})};
        await tx.query('INSERT INTO enterprise_workflow.order_sources(enterprise_id,order_id,source_hash,row_number,source_version,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[principal.enterpriseId,order.id,source.sourceHash,source.row,source.expectedVersion,snapshot]);
      }
      return { order, replayed: false };
    },command.action.type==='move-task-plan');
  }
}
