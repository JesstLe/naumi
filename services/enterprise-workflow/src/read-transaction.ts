import type {Pool, PoolClient} from 'pg';
import {WorkflowError, type Actor, type Principal, type WorkOrder} from './contracts';
import {canRead} from './domain';
import type {ResolveActor} from './store';

async function requireActor(tx: PoolClient, resolve: ResolveActor, principal: Principal) {
  const actor = await resolve(tx, principal);
  if (!actor || actor.enterpriseId !== principal.enterpriseId || actor.teamId !== principal.teamId || actor.subject !== principal.subject) {
    throw new WorkflowError(403, 'MEMBERSHIP_REQUIRED');
  }
  return actor;
}

function equalSet(a: readonly string[], b: readonly string[]) {
  const right = new Set(b);
  return new Set(a).size === right.size && a.every(value => right.has(value));
}

/** Keep the projection consistent without blocking writes, then check current scope for its bounded response. */
export async function readWithCurrentScope<T>(
  pool: Pool,
  resolve: ResolveActor,
  principal: Principal,
  project: (tx: PoolClient, actor: Actor, snapshot: boolean) => Promise<T>,
  orderIds: (result: T) => readonly string[],
  options: {missing?: 'NOT_FOUND' | 'READ_SCOPE_CHANGED'; legacyRepeatable?: boolean} = {},
): Promise<T> {
  const tx = await pool.connect();
  const snapshot = resolve.readSnapshot;
  const {missing = 'READ_SCOPE_CHANGED', legacyRepeatable = true} = options;
  const begin = snapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : legacyRepeatable ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN';
  let discard = false;
  const run = async <R>(fn: () => Promise<R>): Promise<R> => {
    try {
      await tx.query(begin);
      await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
      const result = await fn();
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      try { await tx.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    }
  };
  try {
    const {actor, result} = await run(async () => {
      const actor = await requireActor(tx, snapshot ?? resolve, principal);
      return {actor, result: await project(tx, actor, !!snapshot)};
    });
    // Custom resolvers without snapshot support retain their existing locked authorization path.
    if (snapshot) await run(async () => {
      const current = await requireActor(tx, snapshot, principal);
      if (!equalSet(actor.permissions, current.permissions) || !equalSet(actor.workKinds, current.workKinds)) {
        throw new WorkflowError(403, 'MEMBERSHIP_REQUIRED');
      }
      const ids = [...new Set(orderIds(result))];
      if (!ids.length) return;
      const rows = (await tx.query<{document: WorkOrder}>(
        'SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=ANY($2)', [current.enterpriseId, ids],
      )).rows;
      if (rows.length !== ids.length || rows.some(row => !canRead(current, row.document))) {
        throw new WorkflowError(missing === 'NOT_FOUND' ? 404 : 409, missing);
      }
    });
    return result;
  } finally {
    tx.release(discard);
  }
}
