// Offline pg-interface/serialization checks only. The parent runs real PostgreSQL
// integration tests. This verifier starts no server/container and writes no data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectRecords, RecordsSnapshotError } from './lib/enterprise-records-snapshot.mjs';

const registry = { version: 1, instance: 'naumi47', origin: 'https://47.105.59.142',
  enterpriseId: '12345678-1234-4234-8234-123456789abc', enterpriseName: '测试企业' };
const options = { subjects: ['member@example.test', 'outside@example.test'], from: '2026-09-24', to: '2026-10-23', limit: 2 };
const base = { email: 'member@example.test', created_at: new Date('2026-10-23T02:00:00Z'), ownership: 'legacy-unconfirmed' };
const fixtures = {
  artworks: [{ ...base, id: '__proto__', title: '作品', prompt: 'p'.repeat(20001), status: 'completed', operation: 'generate',
    entry: 'canvas', provenance_evidence: 'server-route', image_url: 'https://private.invalid/protected?signature=PRIVATE_URL', payload: 'RAW_PAYLOAD', error: 'RAW_ERROR', secret: 'RAW_SECRET' },
  { ...base, id: 'a2', ownership: 'frozen-tenant', operation: 'supplier-secret', status: 'RAW_ERROR', entry: 'RAW_SECRET', image_url: null },
  { ...base, id: 'a3', image_url: 'not-selected' }],
  generations: [{ ...base, id: 'j1', source_kind: 'image-job', kind: 'generate', prompt: null, status: 'needs_attention',
    quoted: 600, charged: null, reserved: 20, settled: false, refunded: null, payload: 'RAW_PAYLOAD', error: 'RAW_ERROR' },
  { ...base, id: 'c1', source_kind: 'canvas-task', kind: 'expand', prompt: '编辑', status: 'completed', operation_id: 'c1',
    quoted: '99', charged: '9', reserved: '0', settled: true, refunded: '3', ownership: 'frozen-tenant' },
  { ...base, id: 'v1', source_kind: 'video-task' }],
  ledger: [{ ...base, id: 'led-api-refund-review', delta: 3, ledger_kind: 'refund', operation_id: 'c1', feature: 'canvas.expand', reason: 'RAW_SECRET' },
  { ...base, id: 'led-canvas-image-c1', delta: -9, ledger_kind: 'consume', operation_id: 'c1', feature: 'canvas.expand' },
  { ...base, id: 'led3', delta: -1, ledger_kind: 'consume' }],
};

function poolFixture(change = {}) {
  const calls = [], releases = [];
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (change.fail?.(sql)) throw new Error('RAW_SECRET postgresql://credentials RAW_ERROR');
    if (sql.startsWith('ROLLBACK') && change.failRollback) throw new Error('RAW_SECRET');
    if (sql.startsWith('SELECT now()')) return { rows: [{ observed_at: '2026-10-23T08:00:00Z', read_only: 'on', isolation: 'repeatable read', ...change.observed }] };
    if (sql.startsWith('SELECT t.name')) return { rows: change.enterprise ?? [{ name: registry.enterpriseName, enabled: true, enterprise_enabled: true, authorized: true }] };
    if (sql.startsWith('SELECT u.email')) return { rows: change.members ?? [{ email: base.email, name: '成员' }] };
    if (sql.startsWith('WITH source_scopes')) {
      const kind = sql.includes('SELECT a.id,a.email') ? 'artworks' : sql.includes('SELECT j.id,j.email,j.created_at,j.source_kind') ? 'generations' : 'ledger';
      if (sql.includes('SELECT count(*) AS total FROM')) return { rows: [{ total: change.total ?? 50 }] };
      return { rows: change.rows?.[kind] ?? fixtures[kind] };
    }
    return { rows: [] };
  }, release(value) { releases.push(value); } };
  return { calls, releases, async connect() { if (change.failConnect) throw new Error('RAW_SECRET'); return client; } };
}
const rejectCode = async (pool, config, opts, code) => {
  await assert.rejects(() => inspectRecords(pool, config, opts), e => e instanceof RecordsSnapshotError && e.message === code && !e.cause);
};
const pool = poolFixture();
const result = await inspectRecords(pool, registry, options);
assert.equal(result.type, 'enterprise-source-snapshot-v1');
assert.equal(result.instanceId, registry.instance);
assert.equal(result.enterpriseId, registry.enterpriseId);
assert.equal(result.enterpriseName, registry.enterpriseName);
assert.equal(result.origin, registry.origin);
assert.equal(result.observedAt, '2026-10-23T08:00:00.000Z');
assert.deepEqual(result.members, [{ email: base.email, name: '成员' }]);
assert.equal(result.sourceReadOnly, true); assert.equal(result.sourceWrites, 0);
for (const kind of ['artworks', 'generations', 'ledger']) {
  assert.equal(result.rows[kind].length, 2);
  assert.deepEqual(result.limits[kind], { total: 50, truncated: true });
  for (const row of result.rows[kind]) {
    assert.deepEqual(row.media, { available: false, href: null });
    assert.deepEqual(row.attribution, { visibility: 'current-enterprise-scope', businessOwnership: 'unconfirmed', workflowTaskId: null });
    assert.equal(row.account.sourceKey, JSON.stringify([registry.instance, base.email]));
    assert.equal(row.account.name, '成员');
  }
}
assert.equal(result.rows.artworks[0].prompt.length, 20000);
assert.equal(result.rows.artworks[0].ownership, 'legacy-unconfirmed');
assert.equal(result.rows.artworks[1].ownership, 'frozen-tenant');
assert.equal(result.rows.artworks[1].operation, null);
assert.equal(result.rows.artworks[1].status, null);
assert.equal(result.rows.artworks[1].sourceLabel, null);
assert.equal(Object.getPrototypeOf(result.mediaUrls), Object.prototype);
assert.equal(Object.hasOwn(result.mediaUrls, '__proto__'), true);
assert.equal(result.mediaUrls.__proto__, fixtures.artworks[0].image_url);
assert.equal(Object.keys(result.mediaUrls).length, 1);
assert.equal(result.rows.generations[0].credits.charged, null);
assert.equal(result.rows.generations[0].credits.evidence, 'unrecorded');
assert.equal(result.rows.generations[0].prompt, null);
assert.equal(result.rows.generations[1].credits.charged, 9);
assert.equal(result.rows.generations[1].credits.refunded, 3);
assert.equal(result.rows.generations[1].credits.evidence, 'linked-ledger');
assert.equal(result.rows.generations[1].taskRefs.canvasTaskId, 'c1');
assert.equal(result.rows.ledger[0].credits.delta, 3);
assert.equal(result.rows.ledger[0].ledgerKind, 'refund');
assert.equal(result.rows.ledger[0].taskRefs.billingOperationId, 'c1');
assert.equal(result.rows.ledger[0].operation, '画布扩图');
assert.equal(result.rows.ledger[1].credits.charged, null);
assert.equal(result.rows.ledger[1].credits.quoted, null);
assert.doesNotMatch(JSON.stringify({ ...result, mediaUrls: undefined }), /RAW_PAYLOAD|RAW_ERROR|RAW_SECRET|PRIVATE_URL|image_url|payload|reason/);

assert.equal(pool.calls.length, 15);
assert.equal(pool.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
assert.deepEqual(pool.releases, [undefined]);
const sql = pool.calls.map(c => c.sql).join('\n');
assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|DROP)\b/i);
assert.doesNotMatch(sql, /password|balance|remaining|result_response|settlement_result|before_result|after_result|FOR SHARE/i);
assert.match(sql, /statement_timeout='8s'/);
assert.match(sql, /membership_status='active'/);
assert.match(sql, /membership_expires_at>now\(\)/);
assert.match(sql, /NOT u.banned/);
assert.match(sql, /account_expires_at>now\(\)/);
assert.match(sql, /l.target_type<>'artwork' OR l.relation='output'/);
assert.match(sql, /r.creator=r.actor_email/);
assert.match(sql, /r.scope_kind='personal'/);
assert.match(sql, /r.tenant_id IS DISTINCT FROM \$4::uuid/);
assert.match(sql, /c.source_kind,c.source_id,c.actor_email/);
assert.match(sql, /a.direction='output'/);
assert.match(sql, /s.target_type=j.target_type AND s.target_id=j.id AND s.actor_email=j.email/);
assert.match(sql, /bs.target_type='billing' AND bs.target_id=o.id AND bs.actor_email=j.email/);
assert.doesNotMatch(sql, /ij.id=o.id|cj.id=o.id|vj.id=o.id/); // Cross-table ID collisions are not source evidence.
assert.match(sql, /l.email=j.email AND l.kind='consume' AND l.delta<0/);
assert.match(sql, /l.id=o.ledger_id OR l.id=j.legacy_ledger_id/);
assert.match(sql, /r.refund_credits=rl.delta/);
assert.match(sql, /rb.source='refund'/);
assert.match(sql, /l.id='led-api-refund-'\|\|r.id/);
assert.doesNotMatch(sql, /l.operation_id/);
const sourceCalls = pool.calls.filter(c => c.sql.startsWith('WITH source_scopes'));
assert.equal(sourceCalls.length, 6);
for (const call of sourceCalls) {
  assert.deepEqual(call.values[0], [base.email]);
  assert.equal(call.values[1], '2026-09-24T00:00:00+08:00');
  assert.equal(call.values[2], '2026-10-23T16:00:00.000Z');
  if (call.sql.includes('SELECT page.*')) {
    assert.match(call.sql, /ORDER BY page.created_at DESC,page.id COLLATE "C" DESC/);
    assert.equal(call.values[4], 3);
  }
}

for (const [opts, code] of [
  [{ ...options, subjects: Array(101).fill(base.email) }, 'RECORDS_SUBJECT_LIMIT'],
  [{ ...options, subjects: ['not-an-email'] }, 'RECORDS_SUBJECT_INVALID'],
  [{ ...options, limit: 1001 }, 'RECORDS_LIMIT_INVALID'],
  [{ ...options, limit: 0 }, 'RECORDS_LIMIT_INVALID'],
  [{ ...options, from: '2026-02-30' }, 'RECORDS_WINDOW_INVALID'],
  [{ ...options, from: '2026-09-23' }, 'RECORDS_WINDOW_INVALID'],
  [{ ...options, from: '2026-10-01', to: '2026-09-30' }, 'RECORDS_WINDOW_INVALID'],
]) {
  const bad = poolFixture(); await rejectCode(bad, registry, opts, code); assert.equal(bad.calls.length, 0);
}
for (const origin of ['https://user:password@example.test', 'https://example.test/path', 'http://example.test', 'https://example.test/']) {
  const bad = poolFixture(); await rejectCode(bad, { ...registry, origin }, options, 'RECORDS_ORIGIN_INVALID'); assert.equal(bad.calls.length, 0);
}
const old = poolFixture();
await rejectCode(old, registry, { ...options, from: '2026-09-01', to: '2026-09-02' }, 'RECORDS_WINDOW_NOT_RECENT');
assert.equal(old.calls.at(-1).sql, 'ROLLBACK');
for (const [change, code] of [
  [{ enterprise: [] }, 'RECORDS_ENTERPRISE_NOT_FOUND'],
  [{ enterprise: [{ name: '其他企业' }] }, 'RECORDS_ENTERPRISE_NAME_MISMATCH'],
  [{ enterprise: [{ name: registry.enterpriseName, enabled: true, enterprise_enabled: false, authorized: true }] }, 'RECORDS_ENTERPRISE_DISABLED'],
  [{ observed: { read_only: 'off' } }, 'RECORDS_READ_ONLY_REQUIRED'],
  [{ observed: { isolation: 'read committed' } }, 'RECORDS_READ_ONLY_REQUIRED'],
  [{ members: [{ email: 'other@example.test' }] }, 'RECORDS_MEMBER_SCOPE_INVALID'],
  [{ total: '9007199254740992' }, 'RECORDS_TOTAL_INVALID'],
  [{ total: 1 }, 'RECORDS_COUNT_MISMATCH'],
  [{ fail: query => query.startsWith('WITH source_scopes') }, 'RECORDS_SOURCE_READ_FAILED'],
]) {
  const bad = poolFixture(change); await rejectCode(bad, registry, options, code);
  assert.equal(bad.calls.at(-1).sql, 'ROLLBACK'); assert.deepEqual(bad.releases, [undefined]);
}
const failed = poolFixture({ fail: query => query.startsWith('SELECT t.name'), failRollback: true });
await rejectCode(failed, registry, options, 'RECORDS_SOURCE_READ_FAILED');
assert.deepEqual(failed.releases, [true]);
const failedBegin = poolFixture({ fail: query => query.startsWith('BEGIN') });
await rejectCode(failedBegin, registry, options, 'RECORDS_SOURCE_READ_FAILED');
assert.deepEqual(failedBegin.releases, [true]);
await rejectCode(poolFixture({ failConnect: true }), registry, options, 'RECORDS_SOURCE_READ_FAILED');
const empty = await inspectRecords(poolFixture({ members: [], total: 0, rows: { artworks: [], generations: [], ledger: [] } }), registry, { ...options, subjects: [] });
assert.deepEqual(empty.members, []); assert.deepEqual(empty.rows, { artworks: [], generations: [], ledger: [] });
assert.deepEqual(empty.limits.ledger, { total: 0, truncated: false });
const exact = await inspectRecords(poolFixture({ total: 2, rows: Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, v.slice(0, 2)])) }), registry, options);
assert.deepEqual(exact.limits.ledger, { total: 2, truncated: false });
const foreign = poolFixture({ rows: { artworks: fixtures.artworks.map(row => ({ ...row, email: 'foreign@example.test' })) } });
await rejectCode(foreign, registry, options, 'RECORDS_ROW_SCOPE_INVALID');
const source = await readFile(new URL('./lib/enterprise-records-snapshot.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /^import\b/m);
assert.doesNotMatch(source, /ensure\w*Schema\s*\(|fetch\s*\(|process\.env|console\./);
console.log('ENTERPRISE_RECORDS_SNAPSHOT_VERIFY_PASS: offline pg-interface/allowlist/limits/rollback; real PostgreSQL integration remains with parent');
