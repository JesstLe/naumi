// Run with the exact deployed Hub modules. All 80 tasks use an isolated DB and
// in-memory adapters; this never contacts an upstream or the production DB.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '/app/dist/src/config.js';
import { Queue } from '/app/dist/src/queue.js';
import { Store } from '/app/dist/src/store.js';
import { engineDigest } from '/app/dist/src/crypto.js';

const mode = process.argv[2];
assert.ok(['BASELINE', 'MODIFIED', 'ROLLBACK'].includes(mode));
const dir = mkdtempSync(join(tmpdir(), 'hub-capacity-fixture-'));
let store, queue;
const releases = [], starts = [];
try {
  const file = join(dir, 'config.json');
  writeFileSync(file, process.env.FIXTURE_CONFIG);
  const config = loadConfig({ HUB_CONFIG: file, HUB_DATA_DIR: dir,
    HUB_ADMIN_TOKEN: 'fixture-admin-not-a-live-credential', HUB_MASTER_KEY: 'ab'.repeat(32) });
  const expected = mode === 'MODIFIED' ? 8 : 1;
  assert.equal(config.engines.find(e => e.id === 'jimeng').concurrency, expected);
  const adapters = config.engines.map(spec => ({ spec,
    execute: async request => {
      starts.push(request.operation_id);
      await new Promise(resolve => releases.push(resolve));
      return { choices: [{ message: { content: 'fixture-result' }, finish_reason: 'stop' }] };
    }, models: async () => [], health: async () => ({ state: 'online', detail: 'fixture' }) }));
  store = new Store(dir, config.masterKey);
  queue = new Queue(store, adapters, config);
  const spec = config.engines.find(e => e.id === 'jimeng');
  const tasks = [];
  for (let i = 0; i < 80; i++) {
    const request = { operation_id: `fixture-${i}`, provider: 'jimeng', model: 'fixture',
      operation: 'chat.completions', parameters: { prompt: 'non-upstream-fixture' } };
    const task = store.create('fixture-scope', 'jimeng', request, 'fixture', engineDigest(spec)).task;
    tasks.push(task.id);
    assert.equal(store.create('fixture-scope', 'jimeng', request).replay, true);
  }
  queue.tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts.length, expected);
  assert.equal(queue.snapshot().engines.find(e => e.id === 'jimeng').queued, 80 - expected);
  let peak = starts.length;
  for (let round = 0; round < 85; round++) {
    const snapshot = queue.snapshot();
    peak = Math.max(peak, snapshot.engines.find(e => e.id === 'jimeng').active);
    assert.ok(snapshot.global.active <= config.scheduling.maxConcurrentJobs);
    assert.ok(snapshot.browser.active <= config.scheduling.maxBrowserJobs);
    releases.splice(0).forEach(release => release());
    await new Promise(resolve => setImmediate(resolve));
    queue.tick();
    if (tasks.every(id => store.get(id).state === 'succeeded')) break;
  }
  assert.equal(new Set(starts).size, 80);
  for (const id of tasks) {
    assert.equal(store.get(id).state, 'succeeded');
    assert.equal(store.get(id).attempts, 1);
  }
  assert.equal(queue.snapshot().global.active, 0);
  assert.equal(peak, expected);
  console.log(`${mode}=PASS; INPUT_TASKS=80; PEAK=${peak}; COMPLETED=80; ATTEMPTS_EACH=1; REPLAY=PASS; UPSTREAM_CALLS=0`);
} finally {
  releases.splice(0).forEach(release => release());
  if (queue) await queue.stop();
  if (store) store.close();
  rmSync(dir, { recursive: true, force: true });
}
