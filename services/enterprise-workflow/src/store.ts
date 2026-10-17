import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { commandSchema,batchPreviewSchema,calendarDate, WorkflowError, type Actor, type Principal, type WorkOrder, type Command } from './contracts';
import type { Workbook } from './scheduling-contracts';
import { canRead, evolve } from './domain';
const sourceSchema=z.strictObject({sourceHash:z.string().regex(/^[a-f0-9]{64}$/),row:z.number().int().min(2).max(10001),expectedVersion:z.number().int().positive(),intent:z.literal('standalone'),confirmed:z.literal(true)});
const intakeSchema=z.strictObject({command:commandSchema,source:sourceSchema});
const listSchema=z.strictObject({query:z.string().max(120).default(''),status:z.enum(['','draft','submitted','approved','active','completed','cancelled','archived']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});
const tasksSchema=z.strictObject({query:z.string().max(120).default(''),status:z.enum(['','open','assigned','claimed','in_progress','blocked','review','rework','accepted']).default(''),scope:z.enum(['all','mine','claimable','handover']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1),assignee:z.string().max(254).default('')});
const assigneeSchema=z.strictObject({query:z.string().max(120).default(''),kind:z.enum(['','design','artwork']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});

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
  constructor(readonly pool: Pool, private resolveActor: ResolveActor, private validateAssets: ValidateAssets, private localOwner?:{enterpriseId:string;subject:string},private verifySource?:VerifySource,private now=()=>new Date()) {}
  async ready() {
    const result = await this.pool.query('SELECT version FROM enterprise_workflow.schema_version WHERE version=1');
    if (result.rowCount !== 1) throw new WorkflowError(503, 'MIGRATION_REQUIRED');
  }
  private async actor(tx: PoolClient, principal: Principal) {
    const actor = await this.resolveActor(tx, principal);
    if (!actor || actor.enterpriseId !== principal.enterpriseId || actor.subject !== principal.subject || actor.teamId !== principal.teamId) throw new WorkflowError(403, 'MEMBERSHIP_REQUIRED');
    return actor;
  }
  private async transaction<T>(run: (tx: PoolClient) => Promise<T>) {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      const value = await run(tx); await tx.query('COMMIT'); return value;
    }
    catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  }
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
      const values=[principal.enterpriseId,actor.teamId??null,actor.permissions.some(p=>['manage','dispatch','review'].includes(p)),actor.subject,actor.permissions.includes('execute'),actor.workKinds,q.status,q.query];
      const where=`enterprise_id=$1 AND (document->>'teamId') IS NOT DISTINCT FROM $2::text
        AND ($3::boolean OR document->>'requester'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tasks') t WHERE (t->>'assignee'=$4 OR t->'pendingHandover'->>'to'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(t->'handoverHistory','[]'::jsonb)) h WHERE h->>'outcome'='accepted' AND (h->>'from'=$4 OR h->>'to'=$4))))
          OR ($5::boolean AND document->>'status'='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tasks') t WHERE t->>'status'='open' AND t->>'kind'=ANY($6::text[]))))
        AND ($7='' OR document->>'status'=$7) AND ($8='' OR strpos(lower(document->>'title'),lower($8))>0)`;
      const rows=await tx.query(`SELECT document,count(*) OVER() AS total FROM enterprise_workflow.orders WHERE ${where} ORDER BY updated_at DESC,id LIMIT 30 OFFSET $9`,[...values,(q.page-1)*30]);
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
      return {order,events,source};
    });
  }
  async tasks(principal:Principal,raw:unknown={}){
    const q=tasksSchema.parse(raw);
    return this.transaction(async tx=>{
      const a=await this.actor(tx,principal),v=[a.enterpriseId,a.teamId??null,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,q.status,q.scope,q.query,q.assignee];
      const where=`o.enterprise_id=$1 AND (o.document->>'teamId') IS NOT DISTINCT FROM $2::text
       AND ($3::boolean OR o.document->>'requester'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE (x->>'assignee'=$4 OR x->'pendingHandover'->>'to'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(x->'handoverHistory','[]'::jsonb)) h WHERE h->>'outcome'='accepted' AND (h->>'from'=$4 OR h->>'to'=$4))))
        OR ($5::boolean AND o.document->>'status'='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'status'='open' AND x->>'kind'=ANY($6::text[]))))
       AND ($7='' OR t->>'status'=$7) AND ($8='all' OR $8='mine' AND (t->>'assignee'=$4 OR t->'pendingHandover'->>'to'=$4) OR $8='handover' AND o.document->>'status'='active' AND t->'pendingHandover'->>'to'=$4 OR $8='claimable' AND $5::boolean AND o.document->>'status'='active' AND t->>'status'='open' AND t->>'kind'=ANY($6::text[]) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(t->'dependencyIds') d WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'id'=d AND x->>'status'='accepted')))
       AND ($9='' OR strpos(lower((o.document->>'title')||' '||(t->>'title')),lower($9))>0) AND ($10='' OR t->>'assignee'=$10)`;
      const from='FROM enterprise_workflow.orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->\'tasks\') t';
      const result=await tx.query(`SELECT o.document,t AS task,count(*) OVER() AS total ${from} WHERE ${where} ORDER BY (t->>'dueAt')::timestamptz,o.id,t->>'id' LIMIT 30 OFFSET $11`,[...v,(q.page-1)*30]);
      const total=result.rows.length?Number(result.rows[0].total):Number((await tx.query(`SELECT count(*) AS n ${from} WHERE ${where}`,v)).rows[0].n);
      return {tasks:result.rows.filter(r=>canRead(a,r.document)).map(r=>{const o=r.document as WorkOrder;return {order:{id:o.id,title:o.title,status:o.status,version:o.version,requester:o.requester,brief:o.brief},task:r.task};}),total,page:q.page,pageSize:30,viewer:{subject:a.subject,permissions:a.permissions,workKinds:a.workKinds}};
    });
  }
  async week(principal:Principal,raw:unknown){
    const q=z.strictObject({start:calendarDate,assignee:z.string().max(254).default('')}).parse(raw),end=new Date(Date.parse(q.start)+6*86400000).toISOString().slice(0,10);
    return this.transaction(async tx=>{const a=await this.actor(tx,principal),values=[a.enterpriseId,a.teamId??null,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,q.assignee,q.start,end];
      const where=`o.enterprise_id=$1 AND (o.document->>'teamId') IS NOT DISTINCT FROM $2::text
       AND ($3::boolean OR o.document->>'requester'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE (x->>'assignee'=$4 OR x->'pendingHandover'->>'to'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(x->'handoverHistory','[]'::jsonb)) h WHERE h->>'outcome'='accepted' AND (h->>'from'=$4 OR h->>'to'=$4)))) OR ($5::boolean AND o.document->>'status'='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'status'='open' AND x->>'kind'=ANY($6::text[]))))
       AND o.document->>'status' IN ('approved','active','completed') AND ($7='' OR t->>'assignee'=$7)`;
      const from="FROM enterprise_workflow.orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->'tasks') t";
      const rows=(await tx.query(`SELECT o.document,t AS task ${from} WHERE ${where} AND t->>'planStart'<=$9 AND t->>'planEnd'>=$8 ORDER BY t->>'planStart',o.id,t->>'id' LIMIT 1001`,values)).rows;
      if(rows.length>1000)throw new WorkflowError(422,'WEEK_RANGE_TOO_LARGE');
      const unplanned=Number((await tx.query(`SELECT count(*) AS n ${from} WHERE ${where} AND (t->>'planStart') IS NULL`,values.slice(0,7))).rows[0].n);
      const days=Array.from({length:7},(_,i)=>new Date(Date.parse(q.start)+i*86400000).toISOString().slice(0,10));const loads:Record<string,Record<string,number>>={};
      const tasks=rows.filter(r=>canRead(a,r.document)).map(r=>{const o=r.document as WorkOrder,t=r.task as WorkOrder['tasks'][number],who=t.assignee||'__unassigned';loads[who]??={};const count=(Date.parse(t.planEnd!)-Date.parse(t.planStart!))/86400000+1;for(const day of days)if(day>=t.planStart!&&day<=t.planEnd!)loads[who][day]=(loads[who][day]||0)+(t.estimatedHours||0)/count;return {order:{id:o.id,title:o.title,status:o.status,version:o.version,requester:o.requester},task:t};});
      return {tasks,days,loads,unplanned,timezone:'Asia/Shanghai',distribution:'calendar-day-even',referenceDailyHours:8};
    });
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
  private async executeCommand(principal: Principal, raw: unknown, source?:z.infer<typeof sourceSchema>,dryRun=false,proof='') {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new WorkflowError(400, 'INVALID_COMMAND');
    const command = parsed.data;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal);
      // Fixed lock order; tenant-scoped command dedupe also covers concurrent reuse across orders.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`command:${principal.enterpriseId}:${command.commandId}`]);
      if(command.action.type==='accept-delivery')await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`performance:${principal.enterpriseId}:${principal.teamId}`]);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`order:${principal.enterpriseId}:${command.orderId}`]);
      const fingerprint = createHash('sha256').update(stable({ principal, command,...(source?{source}:{}) })).digest('hex');
      let sourceRow;
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
      const action=command.action;
      const assignment=action.type==='assign'||action.type==='propose-handover'?{subject:action.assignee,ids:[action.taskId]}:action.type==='batch-tasks'&&action.operation.type==='assign'?{subject:action.operation.assignee,ids:action.taskIds}:null;
      if(assignment){
        if(!previous||!canRead(actor,previous)||!actor.permissions.includes('dispatch'))throw new WorkflowError(403,'FORBIDDEN');
        const target=await this.resolveActor(tx,{enterpriseId:principal.enterpriseId,subject:assignment.subject,...(principal.teamId?{teamId:principal.teamId}:{})});
        if(!target&&action.type==='assign')throw new WorkflowError(403,'MEMBERSHIP_REQUIRED');
        if(!target||target.enterpriseId!==principal.enterpriseId||target.teamId!==principal.teamId||target.subject!==assignment.subject||!target.permissions.includes('execute')||assignment.ids.some(id=>{const task=previous.tasks.find(t=>t.id===id);return !task||!target.workKinds.includes(task.kind);}))throw new WorkflowError(action.type==='assign'?403:409,'INVALID_ASSIGNEE');
      }
      const { order, event } = evolve(previous ?? null, actor, command, this.now().toISOString());
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
      if(command.action.type==='accept-delivery'){const action=command.action;const task=previous?.tasks.find(t=>t.id===action.taskId);if(!task||!await this.validateAssets(tx,actor,task.assetIds,{orderId:command.orderId,taskId:task.id}))throw new WorkflowError(403,'INVALID_ASSETS');}
      await tx.query(`INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document) VALUES($1,$2,$3,$4)
        ON CONFLICT(enterprise_id,id) DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document,updated_at=now()`, [principal.enterpriseId, order.id, order.version, order]);
      await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event) VALUES($1,$2,$3,$4,$5)', [principal.enterpriseId, event.id, order.id, order.version, event]);
      await tx.query('INSERT INTO enterprise_workflow.commands(enterprise_id,id,subject,order_id,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)', [principal.enterpriseId, command.commandId, principal.subject, order.id, fingerprint, order]);
      if(source){
        const row=sourceRow!.document;
        const snapshot={intent:source.intent,title:row.title,requesterName:row.raw['需求方']||'',designerName:row.raw['设计师']||'',status:row.raw['任务完成情况']||'',parentLabel:row.parentLabel,parentResolution:sourceRow!.resolution,identityTransferred:false,statusTransferred:false};
        await tx.query('INSERT INTO enterprise_workflow.order_sources(enterprise_id,order_id,source_hash,row_number,source_version,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[principal.enterpriseId,order.id,source.sourceHash,source.row,source.expectedVersion,snapshot]);
      }
      return { order, replayed: false };
    });
  }
}
