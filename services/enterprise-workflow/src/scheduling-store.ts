import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { WorkflowError, type Actor, type Principal } from './contracts';
import type { ResolveActor } from './store';
import { schedulingCommandSchema, type Layout, type Workbook } from './scheduling-contracts';
import { ensure, evolveWorkbook, validateLayout, workbookForReader } from './scheduling-domain';

type Personal = { version: number; baseRevision: number; config: Layout | null };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export class SchedulingStore {
  constructor(readonly pool: Pool, private resolveActor: ResolveActor) {}
  async ready() {
    ensure((await this.pool.query('SELECT version FROM enterprise_workflow.schema_version WHERE version=2')).rowCount === 1, 'MIGRATION_REQUIRED', 503);
  }
  private async transaction<T>(fn: (tx: PoolClient) => Promise<T>) {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN'); await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      const result = await fn(tx); await tx.query('COMMIT'); return result;
    } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  }
  private async actor(tx: PoolClient, principal: Principal, teamId: string) {
    // Signed team scope is mandatory; never fall back to an enterprise-wide actor.
    ensure(principal.teamId === teamId, 'NOT_FOUND', 404);
    const actor = await this.resolveActor(tx, principal);
    ensure(actor && actor.enterpriseId === principal.enterpriseId && actor.subject === principal.subject && actor.teamId === teamId && actor.permissions.length, 'MEMBERSHIP_REQUIRED', 403);
    return actor;
  }
  private manager(actor: Actor) { return actor.permissions.some(p => p === 'manage' || p === 'dispatch'); }
  private async workbook(tx: PoolClient, principal: Principal, teamId: string) {
    return (await tx.query('SELECT document FROM enterprise_workflow.schedule_workbooks WHERE enterprise_id=$1 AND team_id=$2', [principal.enterpriseId,teamId])).rows[0]?.document as Workbook | undefined;
  }
  async get(principal: Principal, teamId: string) {
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal, teamId), w = await this.workbook(tx, principal, teamId);
      ensure(w, 'WORKBOOK_NOT_FOUND', 404); return { workbook: workbookForReader(w, this.manager(actor)) };
    });
  }
  async personal(principal: Principal, teamId: string, viewId: string) {
    return this.transaction(async tx => {
      await this.actor(tx, principal, teamId);
      const w = await this.workbook(tx, principal, teamId), view = w?.views.find(v => v.id === viewId && !v.archived);
      ensure(view, 'VIEW_NOT_FOUND', 404);
      const p = (await tx.query('SELECT document FROM enterprise_workflow.schedule_personal WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 AND view_id=$4',
        [principal.enterpriseId,teamId,principal.subject,viewId])).rows[0]?.document as Personal | undefined;
      return { personal: p ?? { version: 0, baseRevision: view.revision, config: null }, currentViewRevision: view.revision,
        stale: !!p?.config && p.baseRevision !== view.revision };
    });
  }
  async audit(principal: Principal, teamId: string) {
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal, teamId); ensure(this.manager(actor), 'FORBIDDEN', 403);
      return { events: (await tx.query(`SELECT id,subject,operation,scope,revision,detail,created_at FROM enterprise_workflow.schedule_audit
        WHERE enterprise_id=$1 AND team_id=$2 AND (scope='team' OR subject=$3) ORDER BY created_at DESC,id DESC LIMIT 100`,
      [principal.enterpriseId,teamId,principal.subject])).rows };
    });
  }
  async execute(principal: Principal, raw: unknown) {
    const parsed = schedulingCommandSchema.safeParse(raw); ensure(parsed.success, 'INVALID_SCHEDULING_COMMAND', 400);
    const command = parsed.data;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, principal, command.teamId), a = command.action;
      const personal = a.type === 'save-personal' || a.type === 'reset-personal';
      ensure(personal || this.manager(actor), 'FORBIDDEN', 403);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`schedule-command:${principal.enterpriseId}:${command.commandId}`]);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`schedule-workbook:${principal.enterpriseId}:${command.teamId}`]);
      const fingerprint = createHash('sha256').update(stable({ principal, command })).digest('hex');
      const prior = (await tx.query('SELECT fingerprint,result FROM enterprise_workflow.schedule_commands WHERE enterprise_id=$1 AND id=$2', [principal.enterpriseId,command.commandId])).rows[0];
      // Authorization precedes replay; key reuse by another subject/team or changed input is a conflict.
      if (prior) { ensure(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT'); return { ...prior.result, replayed: true }; }
      const w = await this.workbook(tx, principal, command.teamId);
      let result: { workbook?: Workbook; personal?: Personal }, revision: number;
      if (personal) {
        const view = w?.views.find(v => v.id === a.viewId && !v.archived); ensure(view && w, 'VIEW_NOT_FOUND', 404);
        const p = (await tx.query('SELECT document FROM enterprise_workflow.schedule_personal WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 AND view_id=$4',
          [principal.enterpriseId,command.teamId,principal.subject,a.viewId])).rows[0]?.document as Personal | undefined;
        ensure((p?.version ?? 0) === command.expectedVersion, 'VERSION_CONFLICT');
        if (a.type === 'save-personal') {
          ensure(a.baseRevision === view.revision, 'VIEW_VERSION_CONFLICT'); validateLayout(a.config, w.fields);
        }
        const next: Personal = { version: (p?.version ?? 0) + 1, baseRevision: view.revision, config: a.type === 'save-personal' ? a.config : null };
        await tx.query(`INSERT INTO enterprise_workflow.schedule_personal(enterprise_id,team_id,subject,view_id,version,document) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(enterprise_id,team_id,subject,view_id) DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document`,
        [principal.enterpriseId,command.teamId,principal.subject,a.viewId,next.version,next]);
        result = { personal: next }; revision = next.version;
      } else {
        const next = evolveWorkbook(w ?? null, command, principal.subject, new Date().toISOString());
        await tx.query(`INSERT INTO enterprise_workflow.schedule_workbooks(enterprise_id,team_id,version,document) VALUES($1,$2,$3,$4)
          ON CONFLICT(enterprise_id,team_id) DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document,updated_at=now()`,
        [principal.enterpriseId,command.teamId,next.version,next]);
        result = { workbook: next }; revision = next.version;
      }
      // All three writes share one transaction. Audit contains no private layout/filter content.
      await tx.query(`INSERT INTO enterprise_workflow.schedule_audit(enterprise_id,id,team_id,subject,operation,scope,revision,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [principal.enterpriseId,command.commandId,command.teamId,principal.subject,a.type,personal ? 'personal' : 'team',revision,
          { reason: command.reason, ...('viewId' in a ? { viewId: a.viewId } : {}) }]);
      await tx.query(`INSERT INTO enterprise_workflow.schedule_commands(enterprise_id,id,team_id,subject,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)`,
        [principal.enterpriseId,command.commandId,command.teamId,principal.subject,fingerprint,result]);
      return { ...result, replayed: false };
    });
  }
}
