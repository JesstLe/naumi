import 'server-only';
import { createHmac } from 'node:crypto';
import { getPool } from './db/connection';
import { settingsSecret } from './settings-secret';
import { consumePostgresRateLimit } from './rate-limit-store';

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
function consumeLocal(key: string, limit: number, windowMs: number): boolean {
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
  if (bucket.hits.filter(hit => hit >= now - windowMs).length >= limit) return false;
  bucket.hits.push(now);
  return true;
}

/** true=admitted, false=quota exhausted; infrastructure failure rejects with
 * RateLimitUnavailableError. Every caller must await, and map failure to 503.
 * A repeated admitted call is another hit; this is not a business/idempotency
 * receipt and must not retry or replay accepted supplier/paid operations.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError('INVALID_RATE_LIMIT_PARAMETERS');
  }
  if (!(process.env.DATABASE_URL || '').trim()) return consumeLocal(key, limit, windowMs);
  try {
    const digest = createHmac('sha256', settingsSecret()).update('rate-limit:v1:').update(key).digest('hex');
    return await consumePostgresRateLimit(getPool(), digest, limit, windowMs);
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
