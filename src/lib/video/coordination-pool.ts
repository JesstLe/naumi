import "server-only";
import process from "node:process";
import { Pool, type PoolClient } from "pg";
import { getPool } from "../db";
import { videoCoordinationPoolLimit } from "../db/connection";

// Media polling and workflow resumption share a budgeted session-lock pool
// per Node process, including separately bundled copies of this module. Web and
// Worker processes have independent pools; PostgreSQL still arbitrates the same
// advisory keys across them. Business SQL stays on getPool(). The connection
// owner reserves all pools together; the compatible video default remains two.
const poolKey = Symbol.for("naumi.video.coordination.pg.v1");
const slotsKey = Symbol.for("naumi.video.coordination.slots.v1");
const runtime = process as typeof process & { [poolKey]?: Pool };

/** Checkout rejected before a client or lock query existed. This is an explicit
 * infrastructure failure, not a busy slot and not ambiguous business execution. */
export class VideoCoordinationCheckoutError extends Error {
  readonly code = "VIDEO_COORDINATION_UNAVAILABLE";
  readonly status = 503;
  constructor(readonly coordinationKey: string, cause: unknown) {
    super("视频任务连接暂不可用，请稍后重试", { cause });
    this.name = "VideoCoordinationCheckoutError";
  }
}

export function getVideoCoordinationPool(): Pool {
  if (!runtime[poolKey]) {
    const options = getPool().options;
    const pool = new Pool({
      ...options,
      // pg-pool makes password non-enumerable; spread alone loses it. Keep the
      // original SSL object as well, including any non-enumerable private key.
      password: options.password,
      ssl: options.ssl,
      max: videoCoordinationPoolLimit(),
      min: 0,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 5_000,
    });
    // pg-pool already removes a failed idle client before emitting this event.
    // An idle coordination socket must not terminate the application process.
    pool.on("error", () => {});
    runtime[poolKey] = pool;
  }
  return runtime[poolKey];
}

export async function acquireVideoCoordinationLock(key: string): Promise<{
  acquired: boolean;
  release: () => Promise<void>;
}> {
  const pool = getVideoCoordinationPool() as Pool & { [slotsKey]?: number };
  // Reserve synchronously across bundles before awaiting checkout. Busy polls
  // are read-only, not failed workflow claims: no SQL or supplier work started.
  // Never queue behind holders that may await long-running supplier I/O. Read
  // the instantiated pool, not a mutable environment value on every claim.
  if ((pool[slotsKey] || 0) >= pool.options.max!) return { acquired: false, release: async () => {} };
  pool[slotsKey] = (pool[slotsKey] || 0) + 1;
  const releaseSlot = () => { pool[slotsKey] = (pool[slotsKey] || 1) - 1; };
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    releaseSlot();
    throw new VideoCoordinationCheckoutError(key, error);
  }
  let failed = false;
  const onError = () => { failed = true; };
  client.on("error", onError);
  const releaseClient = (discard = false) => {
    try { client.release(discard || failed); }
    finally { client.removeListener("error", onError); releaseSlot(); }
  };
  let acquired: boolean;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [key]);
    const value: unknown = result.rows[0]?.acquired;
    if (typeof value !== "boolean") throw new Error("Invalid video coordination lock acknowledgement");
    acquired = value;
  } catch (error) {
    // A lost acknowledgement can leave the session holding the lock.
    releaseClient(true);
    throw error;
  }
  if (!acquired) {
    releaseClient();
    return { acquired: false, release: async () => {} };
  }
  let released = false;
  return {
    acquired: true,
    async release() {
      if (released) return;
      released = true;
      let discard = true;
      try {
        const result = await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
        discard = result.rows[0]?.pg_advisory_unlock !== true;
      } catch {
        // Preserve the caller's result/error, but never pool a still-locked
        // or indeterminate session. Closing it releases its advisory locks.
      } finally {
        releaseClient(discard);
      }
    },
  };
}
