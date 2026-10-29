import 'server-only';
import type { Pool, PoolClient } from 'pg';

// Dedicated namespace, existing business pool. No core/auth/billing migration.
export const RATE_LIMIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_rate_limit_buckets (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  hits bigint[] NOT NULL,
  window_ms bigint NOT NULL CHECK (window_ms > 0),
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS app_rate_limit_expiry ON app_rate_limit_buckets (expires_at, key_hash);`;

export const RATE_LIMIT_CLEANUP_SQL = `
WITH candidates AS MATERIALIZED (
  SELECT ctid AS tid FROM app_rate_limit_buckets WHERE expires_at < $1
  ORDER BY expires_at, key_hash LIMIT 64
), unlocked AS MATERIALIZED (
  SELECT b.ctid AS tid FROM candidates c CROSS JOIN LATERAL (
    SELECT ctid FROM app_rate_limit_buckets WHERE ctid = c.tid
    FOR UPDATE SKIP LOCKED
  ) b
)
DELETE FROM app_rate_limit_buckets WHERE ctid = ANY(ARRAY(SELECT tid FROM unlocked))`;

// ctid is used only inside this one statement, never persisted. First bound
// candidates by the expiry index, then do TID lookups/locks/deletes. Joining
// key_hash back to the table allowed PostgreSQL to choose full hash/seq scans.
// A concurrently changed/locked candidate can be skipped until a later sweep.
const storeKey = Symbol.for('naumi.rate-limit.store.v1');
type StoreState = {
  schemas: WeakMap<Pool, Promise<void>>; pending: WeakMap<Pool, number>; sweptAt: WeakMap<Pool, number>;
};
const storeHolder = process as typeof process & { [storeKey]?: StoreState };
const { schemas, pending, sweptAt } = storeHolder[storeKey] ||= {
  schemas: new WeakMap<Pool, Promise<void>>(), pending: new WeakMap<Pool, number>(), sweptAt: new WeakMap<Pool, number>(),
};

/** pg Pool has no per-checkout cancellation. Bound both caller wait and the
 * number of unresolved checkouts; a late client is returned without any SQL.
 * This is infrastructure backpressure (503), not a new business quota (429).
 */
async function checkout(pool: Pool): Promise<PoolClient> {
  const count = pending.get(pool) || 0;
  if (count >= 64) throw new Error('RATE_LIMIT_STORE_BUSY');
  pending.set(pool, count + 1);
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('RATE_LIMIT_CHECKOUT_TIMEOUT')); }, 1000);
    pool.connect().then(client => {
      pending.set(pool, (pending.get(pool) || 1) - 1);
      clearTimeout(timer);
      if (expired) client.release(); else resolve(client);
    }, () => {
      pending.set(pool, (pending.get(pool) || 1) - 1);
      clearTimeout(timer);
      if (!expired) reject(new Error('RATE_LIMIT_CONNECT_FAILED'));
    });
  });
}

/** One short transaction; no connection crosses into the business request.
 * Destroy on failure/deadline rather than return an aborted/in-flight client.
 * Disconnect rolls back an open transaction. An uncertain COMMIT may consume
 * a hit, but never starts business work or retries the admission operation.
 */
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await checkout(pool);
  let released = false;
  const timer = setTimeout(() => { released = true; client.release(true); }, 2500);
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '1500ms'; SET LOCAL lock_timeout = '1000ms'");
    const result = await run(client);
    await client.query('COMMIT');
    if (released) throw new Error('RATE_LIMIT_TRANSACTION_TIMEOUT');
    return result;
  } catch (error) {
    if (!released) { released = true; client.release(true); }
    throw error;
  } finally {
    clearTimeout(timer);
    if (!released) client.release();
  }
}

async function ensureSchema(pool: Pool): Promise<void> {
  let ready = schemas.get(pool);
  if (!ready) {
    ready = transaction(pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || current_schema() || ':rate-limit-schema-v1', 0))");
      await client.query(RATE_LIMIT_SCHEMA_SQL);
    }).catch(error => { schemas.delete(pool); throw error; });
    schemas.set(pool, ready);
  }
  await ready;
}

export async function consumePostgresRateLimit(pool: Pool, digest: string, limit: number, windowMs: number): Promise<boolean> {
  await ensureSchema(pool);
  return transaction(pool, async client => {
    // ON CONFLICT locks the existing row before RETURNING evaluates the DB
    // clock. Concurrent calls cannot base admission on a pre-lock timestamp.
    const { rows: [bucket] } = await client.query<{ hits: string[]; window_ms: string; now: string }>(`
      INSERT INTO app_rate_limit_buckets (key_hash, hits, window_ms, expires_at) VALUES ($1, '{}', $2, 0)
      ON CONFLICT (key_hash) DO UPDATE SET key_hash = EXCLUDED.key_hash
      RETURNING hits, window_ms, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now`, [digest, windowMs]);
    const now = Number(bucket.now), retention = Math.max(Number(bucket.window_ms), windowMs);
    const hits = bucket.hits.map(Number).filter(hit => hit >= now - retention);
    const allowed = hits.filter(hit => hit >= now - windowMs).length < limit;
    if (allowed) hits.push(now);
    await client.query('UPDATE app_rate_limit_buckets SET hits=$2::bigint[], window_ms=$3, expires_at=$4 WHERE key_hash=$1',
      [digest, hits, retention, hits[hits.length - 1] + retention]);
    // At most one indexed batch per process/pool per minute, including denied
    // requests. SKIP LOCKED avoids waiting behind another active key.
    if (now - (sweptAt.get(pool) ?? -Infinity) >= 60_000) {
      sweptAt.set(pool, now);
      await client.query(RATE_LIMIT_CLEANUP_SQL, [now]);
    }
    return allowed;
  });
}
