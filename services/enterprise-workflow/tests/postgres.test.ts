import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import test from 'node:test';
import pg from 'pg';
import { WorkflowStore } from '../src/store';
import { createWorkflowServer } from '../src/server';
import { WorkflowError, type Actor, type Action } from '../src/contracts';

test('isolated PostgreSQL + HTTP: atomic lifecycle, contention, restart, replay, isolation and rollback', async () => {
  const connectionString = process.env.WORKFLOW_TEST_DATABASE_URL;
  assert.ok(connectionString, 'Run node verify.mjs to provision a disposable PostgreSQL container');
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname));
  const pool = new pg.Pool({ connectionString, max: 8 });
  const enterpriseId = randomUUID(), orderId = randomUUID(), taskId = randomUUID();
  const principal = (subject: string) => ({ enterpriseId, subject });
  const members = new Map<string, Actor>([
    ['ops', { ...principal('ops'), permissions: ['request'], workKinds: [] }],
    ['lead', { ...principal('lead'), permissions: ['dispatch', 'manage'], workKinds: [] }],
    ['design1', { ...principal('design1'), permissions: ['execute'], workKinds: ['design'] }],
    ['design2', { ...principal('design2'), permissions: ['execute'], workKinds: ['design'] }],
    ['review', { ...principal('review'), permissions: ['review'], workKinds: [] }],
  ]);
  const resolve = async (_: unknown, p: { enterpriseId: string; subject: string }) => {
    const a = members.get(p.subject); return a?.enterpriseId === p.enterpriseId ? a : null;
  };
  const assetId = randomUUID();
  const assets = async (_: unknown, actor: Actor, ids: string[]) => actor.enterpriseId === enterpriseId && ids.every(id => id === assetId);
  let store = new WorkflowStore(pool, resolve, assets);
  const server = createWorkflowServer(store, async req => {
    // Test-only token map, deliberately not exported as a production identity adapter.
    const subject = req.headers.authorization?.replace(/^Bearer /, '');
    return subject && members.has(subject) ? principal(subject) : null;
  });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/readyz`)).status, 503);
    await pool.query(await readFile(new URL('../migrations/001-workflow.sql', import.meta.url), 'utf8'));
    // Rerunning the additive migration is idempotent.
    await pool.query(await readFile(new URL('../migrations/001-workflow.sql', import.meta.url), 'utf8'));
    assert.equal((await fetch(`${base}/readyz`)).status, 200);
    assert.equal((await fetch(`${base}/v1/orders/${orderId}`, { headers: { 'x-user': 'lead', 'x-enterprise': enterpriseId } })).status, 401);
    assert.equal((await fetch(`${base}/v1/commands`, { method: 'POST', headers: { authorization: 'Bearer ops', 'content-type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/v1/commands`, { method: 'POST', headers: { authorization: 'Bearer ops' }, body: '{}' })).status, 415);
    let version = 0;
    const command = (action: Action) => ({ commandId: randomUUID(), orderId, expectedVersion: version, action });
    const send = async (subject: string, action: Action) => {
      const response = await fetch(`${base}/v1/commands`, { method: 'POST', headers: { authorization: `Bearer ${subject}`, 'content-type': 'application/json' }, body: JSON.stringify(command(action)) });
      const value = await response.json() as { order: { version: number }; error?: unknown };
      assert.equal(response.status, 200, JSON.stringify(value)); version = value.order.version; return value;
    };
    const create = command({ type: 'create', title: '运营需求', brief: '活动主视觉', acceptance: '文字与尺寸正确' });
    const first = await store.execute(principal('ops'), create); version = first.order.version;
    assert.equal((await store.execute(principal('ops'), create)).replayed, true);
    await assert.rejects(store.execute(principal('ops'), { ...create, action: { ...create.action, title: '不同内容' } }), /IDEMPOTENCY_CONFLICT/);
    await send('ops', { type: 'submit-requirement' });
    await send('lead', { type: 'approve-requirement' });
    await send('lead', { type: 'plan-tasks', tasks: [{ id: taskId, title: '主视觉', kind: 'design', points: 8, dueAt: new Date(Date.now() + 86400000).toISOString(), dependencyIds: [] }] });
    await send('lead', { type: 'publish' });
    await assert.rejects(store.execute(principal('lead'), command({ type: 'assign', taskId, assignee: 'outside' })), /MEMBERSHIP_REQUIRED/);
    const claim1 = command({ type: 'claim', taskId }), claim2 = command({ type: 'claim', taskId });
    const claims = await Promise.allSettled([store.execute(principal('design1'), claim1), store.execute(principal('design2'), claim2)]);
    assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
    const winnerIndex = claims.findIndex(r => r.status === 'fulfilled'), winner = winnerIndex === 0 ? 'design1' : 'design2';
    const rejected = claims.find(r => r.status === 'rejected') as PromiseRejectedResult;
    // A non-winner no longer has visibility after the pool task is claimed; reject without leaking state.
    assert.equal((rejected.reason as WorkflowError).code, 'FORBIDDEN');
    version++;
    await send(winner, { type: 'start', taskId });
    await send(winner, { type: 'progress', taskId, percent: 80, note: '构图完成' });
    await assert.rejects(store.execute(principal(winner), command({ type: 'submit-delivery', taskId, assetIds: [randomUUID()], note: '跨租户附件' })), /INVALID_ASSETS/);
    // Force a database exception AFTER the order update, proving all three writes roll back.
    const before = await pool.query('SELECT (SELECT count(*) FROM enterprise_workflow.events) AS events,(SELECT count(*) FROM enterprise_workflow.commands) AS commands');
    await pool.query(`CREATE FUNCTION enterprise_workflow.fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture insert failure'; END $$;
      CREATE TRIGGER fail_event BEFORE INSERT ON enterprise_workflow.events FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_event()`);
    await assert.rejects(store.execute(principal(winner), command({ type: 'block', taskId, reason: '事务失败注入' })), /fixture insert failure/);
    await pool.query('DROP TRIGGER fail_event ON enterprise_workflow.events; DROP FUNCTION enterprise_workflow.fail_event()');
    assert.equal((await store.get(principal(winner), orderId)).version, version);
    assert.deepEqual((await pool.query('SELECT (SELECT count(*) FROM enterprise_workflow.events) AS events,(SELECT count(*) FROM enterprise_workflow.commands) AS commands')).rows, before.rows);
    await send(winner, { type: 'submit-delivery', taskId, assetIds: [assetId], note: '第一稿' });
    await send('review', { type: 'request-rework', taskId, reason: '品牌色修正' });
    await send(winner, { type: 'start', taskId });
    await send(winner, { type: 'submit-delivery', taskId, assetIds: [assetId], note: '第二稿' });
    const acceptance = command({ type: 'accept-delivery', taskId, quality: 4, note: '通过' });
    const accepted = await store.execute(principal('review'), acceptance); version = accepted.order.version;
    assert.equal(accepted.order.status, 'completed');
    assert.equal((await store.execute(principal('review'), acceptance)).replayed, true);
    // New pool + store represents independent process recovery; no state held in memory.
    const recoveredPool = new pg.Pool({ connectionString });
    try {
      store = new WorkflowStore(recoveredPool, resolve, assets);
      assert.equal((await store.get(principal('lead'), orderId)).status, 'completed');
      assert.equal((await store.execute(principal('review'), acceptance)).replayed, true);
      await assert.rejects(store.get({ enterpriseId: randomUUID(), subject: 'lead' }, orderId), /MEMBERSHIP_REQUIRED/);
      members.set('review', { ...members.get('review')!, permissions: [] });
      await assert.rejects(store.execute(principal('review'), acceptance), /FORBIDDEN/);
      members.delete(winner);
      await assert.rejects(store.get(principal(winner), orderId), /MEMBERSHIP_REQUIRED/);
    } finally { await recoveredPool.end(); }
    const facts = await pool.query("SELECT event FROM enterprise_workflow.events WHERE event->>'type'='workflow.task.accepted.v1'");
    assert.equal(facts.rowCount, 1); assert.equal(facts.rows[0].event.data.reworkCount, 1);
    assert.equal(facts.rows[0].event.data.contributor, winner);
    assert.equal((await pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, '0');
    console.log('POSTGRES_HTTP_PASS: durable=1 concurrent_claim_winners=1 acceptance_events=1 atomic_rollback=1 cross_tenant_denied=1 legacy_writes=0 provider_calls=0');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await pool.end();
  }
});
