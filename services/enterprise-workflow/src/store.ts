import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { commandSchema, WorkflowError, type Actor, type Principal, type WorkOrder } from './contracts';
import { canRead, evolve } from './domain';
const sourceSchema=z.strictObject({sourceHash:z.string().regex(/^[a-f0-9]{64}$/),row:z.number().int().min(2).max(10001),expectedVersion:z.number().int().positive(),intent:z.literal('standalone'),confirmed:z.literal(true)});
const intakeSchema=z.strictObject({command:commandSchema,source:sourceSchema});
const listSchema=z.strictObject({query:z.string().max(120).default(''),status:z.enum(['','draft','submitted','approved','active','completed','cancelled','archived']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});

// Must check live membership, enabled/expiry, entry grant, feature policy and business permissions.
// It is also called for an assignment target; role display names and client headers are not authority.
export type ResolveActor = (tx: PoolClient, principal: Principal) => Promise<Actor | null>;
// Must verify tenant ownership and usability of each immutable deliverable revision.
export type ValidateAssets = (tx: PoolClient, actor: Actor, assetIds: string[]) => Promise<boolean>;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export class WorkflowStore {
  constructor(readonly pool: Pool, private resolveActor: ResolveActor, private validateAssets: ValidateAssets, private localOwner?:{enterpriseId:string;subject:string}) {}
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
        AND ($3::boolean OR document->>'requester'=$4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tasks') t WHERE t->>'assignee'=$4)
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
  async promote(principal:Principal,raw:unknown){
    const c=intakeSchema.parse(raw);
    if(c.command.action.type!=='create'||c.command.expectedVersion!==0)throw new WorkflowError(400,'INTAKE_REQUIRES_CREATE');
    return this.executeCommand(principal,c.command,c.source);
  }
  async execute(principal: Principal, raw: unknown) {
    return this.executeCommand(principal,raw);
  }
  private async executeCommand(principal: Principal, raw: unknown, source?:z.infer<typeof sourceSchema>) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new WorkflowError(400, 'INVALID_COMMAND');
    const command = parsed.data;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal);
      // Fixed lock order; tenant-scoped command dedupe also covers concurrent reuse across orders.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`command:${principal.enterpriseId}:${command.commandId}`]);
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
      if (command.action.type === 'assign') {
        const action = command.action;
        const target = await this.actor(tx, { enterpriseId: principal.enterpriseId, subject: action.assignee, ...(principal.teamId ? { teamId: principal.teamId } : {}) });
        const task = previous?.tasks.find(t => t.id === action.taskId);
        if (!task || !target.permissions.includes('execute') || !target.workKinds.includes(task.kind)) throw new WorkflowError(403, 'INVALID_ASSIGNEE');
      }
      if (command.action.type === 'submit-delivery' && !await this.validateAssets(tx, actor, command.action.assetIds)) throw new WorkflowError(403, 'INVALID_ASSETS');
      const { order, event } = evolve(previous ?? null, actor, command, new Date().toISOString());
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
