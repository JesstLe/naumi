import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { commandSchema, WorkflowError, type Actor, type Principal, type WorkOrder } from './contracts';
import { canRead, evolve } from './domain';

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
  constructor(readonly pool: Pool, private resolveActor: ResolveActor, private validateAssets: ValidateAssets) {}
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
  async execute(principal: Principal, raw: unknown) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new WorkflowError(400, 'INVALID_COMMAND');
    const command = parsed.data;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal);
      // Fixed lock order; tenant-scoped command dedupe also covers concurrent reuse across orders.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`command:${principal.enterpriseId}:${command.commandId}`]);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`order:${principal.enterpriseId}:${command.orderId}`]);
      const fingerprint = createHash('sha256').update(stable({ principal, command })).digest('hex');
      const prior = (await tx.query('SELECT fingerprint,result FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2', [principal.enterpriseId, command.commandId])).rows[0];
      const previous = (await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR UPDATE', [principal.enterpriseId, command.orderId])).rows[0]?.document as WorkOrder | undefined;
      // Revoked permissions cannot recover historical command snapshots via idempotency replay.
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new WorkflowError(409, 'IDEMPOTENCY_CONFLICT');
        if (!previous || !canRead(actor, previous)) throw new WorkflowError(403, 'FORBIDDEN');
        return { order: prior.result as WorkOrder, replayed: true };
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
      return { order, replayed: false };
    });
  }
}
