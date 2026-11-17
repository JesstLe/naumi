import 'server-only';
import type { Pool, PoolClient } from 'pg';

// PostgreSQL 16/Linux detects a disconnected socket during a running statement.
// Apply inside each transaction so it cannot affect a subsequent borrower.
export const checkReadClientSocket = "; SET LOCAL client_connection_check_interval='250ms'";

function acquire(pool: Pool, signal?: AbortSignal): Promise<PoolClient> {
  if (!signal) return pool.connect();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void pool.connect().then(client => {
      signal.removeEventListener('abort', abort);
      // pg cannot unlink an abandoned waiter through its public interface.
      if (signal.aborted) client.release();
      else resolve(client);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

/** Owns the physical connection; the callback controls its read transactions.
 * Never wrap a borrowed grant transaction or a command with side effects. */
export async function withOwnedReadClient<T>(pool: Pool, run: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const client = await acquire(pool, signal);
  let held = true;
  const release = (discard = false) => {
    if (!held) return;
    held = false;
    client.release(discard);
  };
  const abort = () => release(true);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const result = await run(client);
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    if (held && !signal?.aborted) {
      try { await client.query('ROLLBACK'); }
      catch { release(true); }
    }
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    release();
  }
}

export class ReportReadBusy extends Error {
  constructor() { super('报表查询较多，请稍后重试'); this.name = 'ReportReadBusy'; }
}

type ReportSlot = () => void;
type ReportWaiter = { admit: () => boolean };
type ReportBudget = { running: number; waiting: ReportWaiter[] };
const reportBudgetKey = Symbol.for('naumi.db.report-read-admission.v1');
const processState = process as typeof process & { [reportBudgetKey]?: WeakMap<Pool, ReportBudget> };
const reportBudgets = processState[reportBudgetKey] ??= new WeakMap<Pool, ReportBudget>();

function reportSlot(pool: Pool, signal?: AbortSignal): Promise<ReportSlot> {
  signal?.throwIfAborted();
  const max = pool.options.max ?? 5;
  // Reserve at least half the business connections for other paths whenever
  // the deployment has more than one connection. No additional database pool.
  const limit = Math.max(1, Math.floor(max / 2));
  let state = reportBudgets.get(pool);
  if (!state) reportBudgets.set(pool, state = { running: 0, waiting: [] });
  const budget = state;
  const admit = () => {
    budget.running++;
    return () => {
      budget.running--;
      for (let next = budget.waiting.shift(); next; next = budget.waiting.shift()) {
        if (next.admit()) break;
      }
    };
  };
  if (budget.running < limit) return Promise.resolve(admit());
  if (budget.waiting.length >= max) return Promise.reject(new ReportReadBusy());

  // Waiting reports only hold this in-process ticket, never a pg connection.
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + 1_000;
    const waiter = { admit: () => {
      cleanup();
      if (signal?.aborted) { reject(signal.reason); return false; }
      if (performance.now() >= deadline) { reject(new ReportReadBusy()); return false; }
      resolve(admit());
      return true;
    } };
    const abort = () => { remove(); reject(signal!.reason); };
    const timeout = setTimeout(() => { remove(); reject(new ReportReadBusy()); }, 1_000);
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    const remove = () => {
      cleanup();
      const index = budget.waiting.indexOf(waiter);
      if (index !== -1) budget.waiting.splice(index, 1);
    };
    budget.waiting.push(waiter);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Put expensive owned reads behind a shared, bounded queue before checkout. */
export async function withOwnedReportClient<T>(pool: Pool, run: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const release = await reportSlot(pool, signal);
  try { return await withOwnedReadClient(pool, run, signal); }
  finally { release(); }
}
