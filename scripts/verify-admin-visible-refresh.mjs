import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleVisibleRefresh } from '../src/lib/visible-refresh.ts';

test('hidden admin pages skip polling and focus cannot duplicate a slow in-flight read', async t => {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'hidden';
  let tick, removed = false, time = 0, calls = 0;
  window.setInterval = fn => { tick = fn; return 1; };
  window.clearInterval = timer => { assert.equal(timer, 1); removed = true; };
  for (const [name, value] of Object.entries({ window, document, performance: { now: () => time } })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
  }
  let resolve;
  const stop = scheduleVisibleRefresh(() => { calls++; return new Promise(r => { resolve = r; }); }, 30_000, true);
  assert.equal(calls, 0);
  await tick();
  assert.equal(calls, 0);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  time += 30_000;
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 1);
  resolve();
  await Promise.resolve();
  window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 2);
  resolve();
  await Promise.resolve();
  window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 2, 'focus bursts do not restart just-completed reads');
  stop();
  assert(removed);
  time += 30_000;
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(calls, 2);
});
