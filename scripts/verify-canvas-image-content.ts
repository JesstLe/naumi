import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VerifiedImageContentPool, verifiedImageContentKey } from '../src/lib/browser-image-content';

const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
const hash = createHash('sha256').update(new Uint8Array([1, 2, 3, 4])).digest('hex');
const info = { account: 'owner', source: '/media/a.png', version: hash, bytes: 4, contentType: 'image/png', fetchUrl: '/media/a.png' };
const key = verifiedImageContentKey(info, 'owner', 1)!;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; }

async function main() {
  assert.ok(key);
  assert.equal(verifiedImageContentKey({ ...info, version: 'local:4:1' }, 'owner', 1), null);
  for (const bytes of [0, -1, NaN, 1.5]) assert.equal(verifiedImageContentKey({ ...info, bytes }, 'owner', 1), null);
  assert.equal(verifiedImageContentKey({ ...info, account: 'other' }, 'owner', 1), null);
  assert.notEqual(key, verifiedImageContentKey({ ...info, account: 'other' }, 'other', 1));
  assert.notEqual(key, verifiedImageContentKey(info, 'owner', 2));
  assert.notEqual(key, verifiedImageContentKey({ ...info, bytes: 5 }, 'owner', 1));
  assert.notEqual(key, verifiedImageContentKey({ ...info, contentType: 'image/webp' }, 'owner', 1));

  const pool = new VerifiedImageContentPool(8, 2); let calls = 0;
  const gate = deferred<Blob>(); let sharedSignal!: AbortSignal;
  const first = new AbortController(), second = new AbortController();
  const a = pool.acquire(key, 'a', async signal => { calls++; sharedSignal = signal; return gate.promise; }, first.signal);
  const aResult = a.then(() => false, () => true);
  const b = pool.acquire(key, 'b', async () => { throw new Error('duplicate transfer'); }, second.signal);
  await Promise.resolve(); first.abort(); assert.equal(sharedSignal.aborted, false, 'one cancellation must not cancel another source');
  gate.resolve(blob); assert.equal(await aResult, true); assert.equal(await b, blob); assert.equal(calls, 1);
  assert.equal(await pool.acquire(key, 'c', async () => { throw new Error('duplicate ready transfer'); }, new AbortController().signal), blob);

  pool.clear(); const failed = deferred<Blob>(); let recovery = 0;
  const original = pool.acquire(key, 'bad-source', async () => failed.promise, new AbortController().signal).catch(() => 'denied');
  const other = pool.acquire(key, 'good-source', async () => { recovery++; return blob; }, new AbortController().signal);
  failed.reject(new Error('resource-scoped403')); assert.equal(await original, 'denied'); assert.equal(await other, blob); assert.equal(recovery, 1);

  pool.clear(); const stale = deferred<Blob>();
  const old = pool.acquire(key, 'old', async () => stale.promise, new AbortController().signal).catch(() => 'cancelled');
  await Promise.resolve(); pool.clear(); stale.resolve(blob); assert.equal(await old, 'cancelled');
  let refreshed = 0; await pool.acquire(key, 'new', async () => { refreshed++; return blob; }, new AbortController().signal); assert.equal(refreshed, 1, 'cleared flight cannot repopulate bytes');

  pool.remember('one', blob); pool.remember('two', blob); let evicted = 0;
  await pool.acquire(key, 'evicted', async () => { evicted++; return blob; }, new AbortController().signal); assert.equal(evicted, 1, 'byte/item LRU bounds');
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(pool.acquire(key, 'cancelled', async () => blob, cancelled.signal), { name: 'AbortError' });
  console.log('VERIFIED_CONTENT_POOL=PASS SHA256_LENGTH_MIME_ACCOUNT_EPOCH_PARTITIONS CANCEL_ONE_RETAINS_OTHERS RESOURCE_SCOPED_FAILURE_RETRIES_AUTHORIZED_SOURCE CLEAR_NO_STALE_BYTES BOUNDED_LRU');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
