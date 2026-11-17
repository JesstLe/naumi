import 'server-only';
import { createHmac } from 'node:crypto';
import { getPool } from '@/platform/db/pool';
import { settingsSecret } from './settings-secret';
import { consumePostgresRateLimitUpTo } from './rate-limit-store';

type Bucket = { hits: number[]; windowMs: number };
const stateKey = Symbol.for('naumi.rate-limit.v1');
type State = { buckets: Map<string, Bucket>; sweep?: IterableIterator<[string, Bucket]>; loggedAt?: number };
const holder = process as typeof process & { [stateKey]?: State };
const state: State = holder[stateKey] ||= { buckets: new Map<string, Bucket>() };

export class RateLimitUnavailableError extends Error {
  readonly code = 'RATE_LIMIT_UNAVAILABLE';
  constructor() { super('请求频率校验暂不可用，请稍后重试'); }
}

/** Local-only fallback when DATABASE_URL is absent, never on a database error.
 * Hits exactly at now-windowMs still count, as in the original sliding window.
 * Keys share history even when limits differ. Retain the longest window seen
 * for that live key, so a shorter call/sweep cannot erase a longer window.
 */
function consumeLocal(key: string, limit: number, windowMs: number, requested: number): number {
  const now = Date.now();
  state.sweep ||= state.buckets.entries();
  for (let i = 0; i < 64; i++) {
    const item = state.sweep.next();
    if (item.done) { state.sweep = undefined; break; }
    const [id, bucket] = item.value;
    if (!bucket.hits.length || bucket.hits[bucket.hits.length - 1] + bucket.windowMs < now) state.buckets.delete(id);
  }
  const bucket = state.buckets.get(key) || { hits: [], windowMs };
  bucket.windowMs = Math.max(bucket.windowMs, windowMs);
  bucket.hits = bucket.hits.filter(hit => hit >= now - bucket.windowMs);
  state.buckets.set(key, bucket);
  const allowed = Math.min(requested, Math.max(0, limit - bucket.hits.filter(hit => hit >= now - windowMs).length));
  for (let i=0;i<allowed;i++) bucket.hits.push(now);
  return allowed;
}

/** true=admitted, false=quota exhausted; infrastructure failure rejects with
 * RateLimitUnavailableError. Every caller must await, and map failure to 503.
 * A repeated admitted call is another hit; this is not a business/idempotency
 * receipt and must not retry or replay accepted supplier/paid operations.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await rateLimitUpTo(key,limit,windowMs,1))===1;
}

/** Admit a bounded prefix and count each admitted item against the same budget. */
export async function rateLimitUpTo(key: string, limit: number, windowMs: number, requested: number): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 ||
      !Number.isSafeInteger(requested) || requested < 1 || requested > 64) {
    throw new RangeError('INVALID_RATE_LIMIT_PARAMETERS');
  }
  if (!(process.env.DATABASE_URL || '').trim()) return consumeLocal(key, limit, windowMs, requested);
  try {
    const digest = createHmac('sha256', settingsSecret()).update('rate-limit:v1:').update(key).digest('hex');
    return await consumePostgresRateLimitUpTo(getPool(), digest, limit, windowMs, requested);
  } catch {
    const now = Date.now();
    if (state.loggedAt === undefined || now - state.loggedAt >= 30_000) {
      state.loggedAt = now;
      // Do not log key, IP, email, SQL, error message or connection credentials.
      console.error('[rate-limit] shared store unavailable');
    }
    throw new RateLimitUnavailableError();
  }
}
