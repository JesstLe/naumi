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
