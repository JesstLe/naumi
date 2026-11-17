import type {Pool, PoolClient} from 'pg';
import {WorkflowError, type Actor, type Principal} from './contracts';
import {readScope} from './read-scope';
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

// pg has no cancellable pool waiter. Reject the caller immediately and return
// any client assigned to the abandoned waiter without starting a transaction.
function acquire(pool:Pool,signal?:AbortSignal):Promise<PoolClient>{
  if(!signal)return pool.connect();
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    void pool.connect().then(client=>{
      signal.removeEventListener('abort',abort);
      if(signal.aborted)client.release();else resolve(client);
    },error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}

/** Keep the projection consistent without blocking writes, then verify the actor in a fresh snapshot. */
export async function readWorkflowSnapshot<T>(
  pool: Pool,
  resolve: ResolveActor,
  principal: Principal,
  project: (tx: PoolClient, actor: Actor, snapshot: boolean) => Promise<T>,
  options: {legacyRepeatable?: boolean; statementTimeoutMs?: 10000 | 15000 | 20000; signal?: AbortSignal; betweenSnapshots?: (result: T) => Promise<void>; checkCurrent?: (tx: PoolClient, actor: Actor, result: T) => Promise<void>} = {},
): Promise<T> {
  const signal=options.signal;
  let tx = await acquire(pool,signal), ownsClient = true;
  const snapshot = resolve.readSnapshot;
  const {legacyRepeatable = false, statementTimeoutMs = 10000, checkCurrent} = options;
  const begin = snapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : legacyRepeatable ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN';
  let discard = false;
  const release=(remove=false)=>{if(ownsClient){ownsClient=false;tx.release(remove||discard);}};
  // Never return a client with an abandoned statement/transaction to the pool.
  const abort=()=>release(true);
  signal?.addEventListener('abort',abort,{once:true});
  const run = async <R>(fn: () => Promise<R>): Promise<R> => {
    try {
      signal?.throwIfAborted();
      await tx.query(begin);
      await tx.query(`SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='${statementTimeoutMs}ms'`);
      const result = await fn();
      signal?.throwIfAborted();
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      if(ownsClient)try { await tx.query('ROLLBACK'); } catch { discard = true; }
      signal?.throwIfAborted();
      throw error;
    }
  };
  try {
    const {actor, result} = await run(async () => {
      const actor = await requireActor(tx, snapshot ?? resolve, principal);
      return {actor, result: await project(tx, actor, !!snapshot)};
    });
    // Custom resolvers without snapshot support retain their existing locked authorization path.
    if (snapshot && options.betweenSnapshots) {
      release();
      signal?.throwIfAborted();
      await options.betweenSnapshots(result);
      tx = await acquire(pool,signal); ownsClient = true; discard = false;
    }
    if (snapshot) await run(async () => {
      const current = await requireActor(tx, snapshot, principal);
      if (!equalSet(actor.permissions, current.permissions) || !equalSet(actor.workKinds, current.workKinds)) {
        throw new WorkflowError(403, 'MEMBERSHIP_REQUIRED');
      }
      await checkCurrent?.(tx, current, result);
    });
    signal?.throwIfAborted();return result;
  } finally {
    signal?.removeEventListener('abort',abort);release();
  }
}

/** Recheck only the bounded order IDs in the response; do not hydrate their documents a second time. */
export function readWithCurrentScope<T>(
  pool: Pool,
  resolve: ResolveActor,
  principal: Principal,
  project: (tx: PoolClient, actor: Actor, snapshot: boolean) => Promise<T>,
  orderIds: (result: T) => readonly string[],
  options: {missing?: 'NOT_FOUND' | 'READ_SCOPE_CHANGED'; legacyRepeatable?: boolean} = {},
): Promise<T> {
  const {missing = 'READ_SCOPE_CHANGED', legacyRepeatable = true} = options;
  return readWorkflowSnapshot(pool, resolve, principal, project, {legacyRepeatable, checkCurrent: async (tx, actor, result) => {
    const ids = [...new Set(orderIds(result))];
    if (!ids.length) return;
    const values = [actor.enterpriseId, actor.teamId ?? null, actor.permissions.some(p => ['manage','dispatch','review'].includes(p)), actor.subject,
      actor.permissions.includes('execute'), actor.workKinds, actor.permissions.some(p => ['manage','dispatch'].includes(p)), ids];
    const {rowCount} = await tx.query(`SELECT id FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=ANY($8) AND ${readScope('document','$7')}`, values);
    if (rowCount !== ids.length) throw new WorkflowError(missing === 'NOT_FOUND' ? 404 : 409, missing);
  }});
}
