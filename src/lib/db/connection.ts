import 'server-only';
import { Pool, type PoolClient, type PoolConfig } from 'pg';

// Process-wide, including separate Next bundles and development module reloads.
// Only connection infrastructure lives here; business transactions keep getPool().
const key = Symbol.for('naumi.database.pools.v1');
type Pools = {
  business?: Pool; tick?: Pool; closing?: Promise<void>;
  config?: { options: PoolConfig; budget: ReturnType<typeof databasePoolBudget> };
};
const holder = process as typeof process & { [key]?: Pools };
const pools = holder[key] ||= {};
const fixedOtherConnections = 2 + 4; // release + image coordination

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const value = env[name];
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`INVALID_DATABASE_POOL_CONFIG:${name}`);
  }
  return Number(value);
}

/** Per Node process, not per deployment or per container. Other current pools:
 * release=2, image coordination=4, video coordination defaults to 2. Reserve all three even
 * when lazily unused. Additional processes/preload clients need a site budget;
 * this check deliberately does not pretend to know PostgreSQL's free capacity. */
export function databasePoolBudget(env: NodeJS.ProcessEnv = process.env) {
  const business = positiveInteger(env, 'PGPOOL_MAX', 5);
  const tick = positiveInteger(env, 'NAUMI_TICK_POOL_MAX', 2);
  const budget = positiveInteger(env, 'NAUMI_DB_POOL_BUDGET', 15);
  const video = positiveInteger(env, 'NAUMI_VIDEO_COORDINATION_POOL_MAX', 2);
  const other = fixedOtherConnections + video;
  const total = business + tick + other;
  if (total > budget) throw new Error('DATABASE_POOL_BUDGET_EXCEEDED');
  return { business, tick, other, total, budget };
}

function connectionOptions(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  const cs = connectionString || '';
  const noSsl = /sslmode=disable/.test(cs)
    || /@(localhost|127\.0\.0\.1|db|postgres|nv-postgres|host\.docker\.internal)[:/]/.test(cs)
    || /@(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(cs);
  return { connectionString, ssl: noSsl ? false : { rejectUnauthorized: false } };
}

function configuration() {
  if (pools.closing) throw new Error('DATABASE_POOLS_CLOSING');
  return pools.config ||= { options: connectionOptions(), budget: databasePoolBudget() };
}

/** Same frozen generation as the business/tick pools; late lazy construction or
 * a second Next bundle cannot reserve a different video budget. */
export function videoCoordinationPoolLimit(): number {
  // Preserve the existing public budget shape and older HMR generations (other
  // was eight). Never let undefined select pg's default ten on lazy creation.
  return configuration().budget.other - fixedOtherConnections;
}

function pool(kind: 'business' | 'tick'): Pool {
  if (pools.closing) throw new Error('DATABASE_POOLS_CLOSING');
  if (!pools[kind]) {
    // Configuration is immutable for this pool generation, including HMR.
    // A later lazy tick pool must not silently connect to a different database.
    const { options, budget } = configuration();
    const created = new Pool({
      ...options, max: budget[kind],
      ...(kind === 'tick' ? {
        application_name: 'naumi-worker-tick',
        connectionTimeoutMillis: 3000, idleTimeoutMillis: 15000,
        // Bounds apply from BEGIN (before SET LOCAL) and to a stalled wire reply.
        statement_timeout: 3000, query_timeout: 4000,
        allowExitOnIdle: true,
      } : {}),
    });
    if (kind === 'tick') {
      // pg removes the failed idle connection first. Never log connection details.
      created.on('error', () => console.error('[worker-tick] idle database connection lost'));
    } else {
      // pg's idle listener is removed on checkout. Install once per physical
      // client, before any borrower runs, and retain through release/end races.
      // pg still rejects queries and evicts non-queryable clients on release;
      // this handler must not release someone else's transaction or retry it.
      const reported = new WeakSet<PoolClient>();
      const report = (_error: Error, client: PoolClient) => {
        if (reported.has(client)) return;
        reported.add(client);
        // Never serialize the error/client (credentials, SQL and large params).
        console.error('[database] connection lost');
      };
      created.on('connect', client => client.on('error', error => report(error, client)));
      // Idle failures are also forwarded as Pool errors; report only once.
      created.on('error', report);
    }
    pools[kind] = created;
  }
  return pools[kind]!;
}

export function getPool(): Pool { return pool('business'); }
/** Receipt SQL only: never run scan/business callbacks on this connection pool. */
export function getWorkerTickPool(): Pool { return pool('tick'); }

/** Explicit drained-process/test teardown. No signal handler competes with the
 * Web/Worker drain protocol. HMR reuses pools instead of opening replacements.
 * Callers must first drain requests and close any other dedicated pools. */
export function closeDatabasePools(): Promise<void> {
  if (pools.closing) return pools.closing;
  const current = [pools.business, pools.tick].filter((value): value is Pool => !!value);
  pools.closing = Promise.allSettled(current.map(value => value.end())).then(results => {
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    // Failed close remains fenced; do not allocate replacement capacity on top.
    if (failed) throw failed.reason;
    delete pools.business; delete pools.tick; delete pools.config; delete pools.closing;
  });
  return pools.closing;
}
