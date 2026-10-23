// Offline pg-interface/authorization checks only. The parent runs real PostgreSQL.
// No server/container, database connection, storage client, network, or file writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectMedia, RecordsSnapshotError } from './lib/enterprise-records-snapshot.mjs';

const registry = { version: 1, instance: 'fixture-source', origin: 'https://source.example.test',
  enterpriseId: '12345678-1234-4234-8234-123456789abc', enterpriseName: 'Fixture Enterprise' };
const email = 'alice@example.test', other = 'bob@example.test', outsider = 'outside@example.test';
const options = { subjects: [email, other, outsider], from: '2026-09-24', to: '2026-10-23', limit: 1000,
  pairs: [{ id: 'old-artwork', email }, { id: 'bob-artwork', email: other }],
  driver: 'r2', publicBase: 'https://storage.example.test/bucket' };
const artworks = [
  { id: 'bob-artwork', email: other, image_url: options.publicBase + '/bob.webp', ownership: 'frozen-tenant', secret: 'RAW_SECRET' },
  { id: 'old-artwork', email, image_url: '/media/original.webp', ownership: 'legacy-unconfirmed', payload: 'RAW_PAYLOAD' },
];
const original = { key: 'original.webp', owner: email, driver: 'r2', remote_ready: true,
  content_type: 'image/webp', sha256: 'a'.repeat(64), bytes: '1200', thumbnail_key: 'variants/thumb.webp', preview_key: 'variants/preview.webp',
  public: true, id: 'RAW_ID', retry_after: 'RAW_RETRY', width: 1000, secret: 'RAW_SECRET' };
const thumbnail = { ...original, key: 'variants/thumb.webp', bytes: '200', sha256: 'b'.repeat(64), thumbnail_key: null, preview_key: null };
const preview = { ...original, key: 'variants/preview.webp', bytes: '600', sha256: 'c'.repeat(64), thumbnail_key: null, preview_key: null };
const bob = { ...original, key: 'bob.webp', owner: other, bytes: 300, thumbnail_key: null, preview_key: null };
const metadata = [original, thumbnail, preview, bob];
const fields = ['key', 'owner', 'remoteReady', 'contentType', 'sha256', 'bytes', 'thumbnailKey', 'previewKey'].sort();
let cases = 0;
async function test(name, run) {
  try { await run(); cases++; } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
function fixture(change = {}) {
  const calls = [], releases = [];
  let connects = 0, rollbackFailures = change.rollbackFailures ?? 0;
  return { calls, releases, get connects() { return connects; }, async connect() {
    connects++;
    if (change.failConnect) throw new Error('RAW_SECRET postgresql://private PASSWORD');
    return { async query(sql, values) {
      calls.push({ sql, values: structuredClone(values) });
      assert.match(sql, /^(BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|SET LOCAL |SELECT |WITH |ROLLBACK$)/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|DROP|COMMIT)\b/i);
      if (change.fail?.(sql)) throw new Error('RAW_SECRET SQL payload connection://credentials');
      if (sql === 'ROLLBACK' && rollbackFailures-- > 0) throw new Error('RAW_SECRET rollback');
      if (sql.startsWith('BEGIN ') || sql.startsWith('SET LOCAL ') || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT now()')) return { rows: [{ observed_at: '2026-10-23T08:00:00Z',
        read_only: 'on', isolation: 'repeatable read', ...change.observed }] };
      if (sql.startsWith('SELECT t.name')) return { rows: structuredClone(change.enterprise ?? [
        { name: registry.enterpriseName, enabled: true, enterprise_enabled: true, authorized: true }]) };
      if (sql.startsWith('SELECT u.email')) return { rows: structuredClone(change.members ?? [{ email, name: 'Alice' }, { email: other, name: 'Bob' }]) };
      if (sql.startsWith('WITH source_scopes')) return { rows: structuredClone(change.artworks ?? artworks) };
      if (sql.startsWith('WITH source_assets')) return { rows: structuredClone(change.assets ?? metadata) };
      throw new Error('Unexpected fixture query');
    }, release(discard) { releases.push(discard); if (change.failRelease) throw new Error('RAW_SECRET release'); } };
  } };
}
async function rejectCode(pool, opts, code, reg = registry) {
  await assert.rejects(() => inspectMedia(pool, reg, opts), error => error instanceof RecordsSnapshotError
    && error.code === code && error.message === code && !error.cause && !/RAW_SECRET|credentials/.test(error.message));
}
function rolledBack(pool, discard = undefined) {
  assert.equal(pool.calls.at(-1)?.sql, 'ROLLBACK');
  assert.deepEqual(pool.releases, [discard]);
}
const one = { ...options, pairs: [options.pairs[0]] };
const oneRows = { artworks: [artworks[1]] };

await test('contract, explicit allowlist, exact metadata and input ordering', async () => {
  const pool = fixture(), result = await inspectMedia(pool, registry, options);
  assert.deepEqual(Object.keys(result).sort(), ['items', 'observedAt', 'sourceReadOnly', 'sourceWrites']);
  assert.equal(result.observedAt, '2026-10-23T08:00:00.000Z');
  assert.equal(result.sourceReadOnly, true); assert.equal(result.sourceWrites, 0);
  assert.deepEqual(result.items.map(item => [item.id, item.email]), options.pairs.map(pair => [pair.id, pair.email]));
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['asset', 'email', 'id', 'imageUrl', 'ownership', 'variants']);
  assert.equal(result.items[0].imageUrl, '/media/original.webp');
  assert.equal(result.items[0].ownership, 'legacy-unconfirmed');
  assert.equal(result.items[1].ownership, 'frozen-tenant');
  assert.deepEqual(result.items[0].asset, { key: original.key, owner: email, remoteReady: true,
    contentType: 'image/webp', sha256: original.sha256, bytes: 1200,
    thumbnailKey: thumbnail.key, previewKey: preview.key });
  assert.deepEqual(result.items[0].variants.map(item => item.key), [thumbnail.key, preview.key]);
  for (const item of result.items) for (const asset of [item.asset, ...item.variants]) {
    assert.deepEqual(Object.keys(asset).sort(), fields); assert.equal(asset.owner, item.email);
    assert.equal(asset.remoteReady, true); assert(Number.isSafeInteger(asset.bytes));
  }
  assert.doesNotMatch(JSON.stringify(result), /RAW_|payload|public|driver|retry_after|remote_ready|content_type|width/);
  assert.equal(pool.connects, 1); assert.equal(pool.calls.length, 11); rolledBack(pool);
  assert.equal(pool.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});

await test('shared scopes/artworks predicates, active enterprise/accounts and fixed batch SQL', async () => {
  const pool = fixture(); await inspectMedia(pool, registry, options);
  const sql = pool.calls.map(call => call.sql).join('\n');
  for (const fragment of ["statement_timeout='8s'", "lock_timeout='1s'", "idle_in_transaction_session_timeout='15s'",
    'SET LOCAL search_path=pg_catalog,public', 't.authorized_until>now()', 's.enabled AS enterprise_enabled',
    'NOT u.banned', 'u.account_expires_at>now()', "m.membership_status='active'", 'm.membership_expires_at>now()',
    't.owner_email=u.email', "l.target_type<>'artwork' OR l.relation='output'", "a.direction='output'",
    'r.creator IS DISTINCT FROM r.actor_email', "r.scope_kind='personal'", 'r.tenant_id IS DISTINCT FROM $4::uuid',
    "c.source_kind<>'artwork'", 't.result_artwork_id', 'j.snapshot', 'a.deleted_at IS NULL',
    'a.created_at >= $2::timestamptz AND a.created_at < $3::timestamptz', 'NOT COALESCE(s.excluded,false)',
    "s.target_type='artwork' AND s.target_id=a.id AND s.actor_email=a.email"]) assert(sql.includes(fragment), fragment);
  const source = pool.calls.filter(call => call.sql.startsWith('WITH source_scopes'));
  assert.equal(source.length, 1); assert.doesNotMatch(source[0].sql, /LIMIT|OFFSET|count\(\*\)|ANY\(\$[56]/i);
  assert.match(source[0].sql, /JOIN unnest\(\$5::text\[\],\$6::text\[\]\) AS requested\(id,email\)/);
  assert.match(source[0].sql, /requested.id=authorized.id AND requested.email=authorized.email/);
  assert.deepEqual(source[0].values, [[email, other], '2026-09-24T00:00:00+08:00', '2026-10-23T16:00:00.000Z',
    registry.enterpriseId, ['old-artwork', 'bob-artwork'], [email, other]]);
  const assets = pool.calls.filter(call => call.sql.startsWith('WITH source_assets'));
  assert.equal(assets.length, 1); assert.doesNotMatch(assets[0].sql, /LIMIT|OFFSET|SELECT \*/i);
  assert.match(assets[0].sql, /requested.key=a.key AND requested.owner=a.owner/);
  assert.match(assets[0].sql, /k.key=a.key AND k.owner=a.owner/);
  assert.equal((assets[0].sql.match(/a.driver=\$3::text/g) ?? []).length, 2);
  assert.match(assets[0].sql,/a.remote_ready OR EXISTS/);
  for (const field of ['a.key', 'a.owner', 'a.driver', 'a.remote_ready', 'a.content_type', 'a.sha256', 'a.bytes', 'a.thumbnail_key', 'a.preview_key'])
    assert(assets[0].sql.includes(field), field);
  assert.deepEqual(assets[0].values, [['bob.webp', original.key], [other, email], 'r2']);
});

await test('limit never truncates exact authorization or uses records pagination', async () => {
  const a = await inspectMedia(fixture(), registry, options);
  const b = await inspectMedia(fixture(), registry, { ...options, limit: 1 });
  assert.deepEqual(b, a); assert.equal(b.items.length, 2);
});

await test('strict unique/shape/subject/pair/driver input checks before connecting', async () => {
  for (const [patch, code] of [
    [{ pairs: undefined }, 'RECORDS_MEDIA_PAIR_LIMIT'], [{ pairs: {} }, 'RECORDS_MEDIA_PAIR_LIMIT'],
    [{ pairs: Array.from({ length: 26 }, (_, id) => ({ id: String(id), email })) }, 'RECORDS_MEDIA_PAIR_LIMIT'],
    [{ pairs: [options.pairs[0], { ...options.pairs[0] }] }, 'RECORDS_MEDIA_PAIRS_NOT_UNIQUE'],
    [{ subjects: [email, email] }, 'RECORDS_MEDIA_SUBJECTS_NOT_UNIQUE'],
    [{ subjects: Array(1) }, 'RECORDS_MEDIA_SUBJECTS_NOT_UNIQUE'],
    ...[null, [], 'id', {}, { id: 'id' }, { id: '', email }, { id: ' id', email }, { id: 'id\n', email },
      { id: 1, email }, { id: 'i'.repeat(241), email }, { id: 'id', email: 'ALICE@example.test' },
      { id: 'id', email: 'foreign@example.test' }, { id: 'id', email, imageUrl: '/media/forged.webp' }]
      .map(pair => [{ pairs: [pair] }, 'RECORDS_MEDIA_PAIR_INVALID']),
    [{ pairs: Array(1) }, 'RECORDS_MEDIA_PAIR_INVALID'],
    ...['local', 'R2', '', null, undefined].map(driver => [{ driver }, 'RECORDS_MEDIA_DRIVER_INVALID']),
    [{ limit: 0 }, 'RECORDS_LIMIT_INVALID'], [{ limit: 1001 }, 'RECORDS_LIMIT_INVALID'],
    [{ from: '2026-02-30' }, 'RECORDS_WINDOW_INVALID'], [{ from: '2026-09-23' }, 'RECORDS_WINDOW_INVALID'],
  ]) {
    const pool = fixture(); await rejectCode(pool, { ...options, ...patch }, code);
    assert.equal(pool.connects, 0); assert.equal(pool.calls.length, 0);
  }
});

await test('all 25 unique pairs are accepted, tuple equality is not id-only uniqueness', async () => {
  const pairs = Array.from({ length: 25 }, (_, i) => ({ id: 'id-' + i, email }));
  const pool = fixture({ artworks: [] });
  assert.deepEqual((await inspectMedia(pool, registry, { ...options, pairs })).items, []);
  assert.equal(pool.calls.find(call => call.sql.startsWith('WITH source_scopes')).values[4].length, 25);
  const sharedId = fixture({ artworks: [] });
  await inspectMedia(sharedId, registry, { ...options, pairs: [{ id: 'same', email }, { id: 'same', email: other }] });
  assert.deepEqual(sharedId.calls.find(call => call.sql.startsWith('WITH source_scopes')).values.slice(4), [['same', 'same'], [email, other]]);
});

await test('parameters retain exact ids, even SQL punctuation and prototype-shaped ids', async () => {
  for (const id of ["x'); SELECT secret; --", '__proto__']) {
    const pool = fixture({ artworks: [{ ...artworks[1], id }] });
    const result = await inspectMedia(pool, registry, { ...one, pairs: [{ id, email }] });
    assert.equal(result.items[0].id, id);
    const call = pool.calls.find(call => call.sql.startsWith('WITH source_scopes'));
    assert.equal(call.values[4][0], id); assert(!call.sql.includes(id));
  }
});

await test('crossed/foreign/duplicate artwork rows fail closed and rollback', async () => {
  for (const rows of [[{ ...artworks[1], email: other }], [{ ...artworks[0], email }],
    [{ ...artworks[1], id: 'unrequested' }], [artworks[1], artworks[1]], [{ ...artworks[1], image_url: null }, artworks[1]], [{ ...artworks[1], ownership: 'personal' }]]) {
    const pool = fixture({ artworks: rows });
    await rejectCode(pool, options, 'RECORDS_MEDIA_ROW_SCOPE_INVALID'); rolledBack(pool);
    assert(!pool.calls.some(call => call.sql.startsWith('WITH source_assets')));
  }
});

await test('HTTPS registered storage base validation rejects userinfo/query/hash/path normalization', async () => {
  for (const publicBase of [null, 123, 'http://storage.example.test/bucket', '//storage.example.test/bucket',
    'https://u:p@storage.example.test/bucket', 'https://@storage.example.test/bucket',
    'https://storage.example.test/bucket?', 'https://storage.example.test/bucket#',
    'https://storage.example.test/bucket?redirect=other', 'https://storage.example.test/bucket#fragment',
    ' https://storage.example.test/bucket', 'https://storage.example.test/bucket\n',
    'https://storage.example.test/a/../bucket', 'https://storage.example.test/a/./bucket',
    'https://storage.example.test/%2e%2e/bucket', 'https://storage.example.test/bucket\\other',
    'https://storage.example.test/bucket//', 'https://storage.example.test/bucket/redirect?url=https://evil.test']) {
    const pool = fixture(); await rejectCode(pool, { ...options, publicBase }, 'RECORDS_MEDIA_BASE_INVALID'); assert.equal(pool.connects, 0);
  }
});

await test('managed URLs accept only explicit local prefix or supplied registered base', async () => {
  for (const [image_url, publicBase] of [['/media/original.webp', undefined], ['/media/original%2Ewebp', ''],
    [options.publicBase + '/original.webp', options.publicBase],
    [options.publicBase + '/original.webp', options.publicBase + '/']]) {
    const result = await inspectMedia(fixture({ artworks: [{ ...artworks[1], image_url }] }), registry, { ...one, publicBase });
    assert.equal(result.items[0].asset.key, original.key); assert.equal(result.items[0].imageUrl, image_url);
  }
});

await test('unregistered/redirect/signed/normalized/dangerous URLs never reach metadata lookup', async () => {
  for (const image_url of [null, '', 'https://evil.test/original.webp', '//storage.example.test/bucket/original.webp',
    options.publicBase + '.evil/original.webp', options.publicBase + '-other/original.webp',
    'https://storage.example.test/other/original.webp', registry.origin + '/media/original.webp',
    options.publicBase + '/redirect?url=/media/original.webp', '/api/media/redirect/original.webp',
    'https://u:p@storage.example.test/bucket/original.webp', 'https://storage.example.test@evil.test/bucket/original.webp',
    '/media/original.webp?token=SECRET', '/media/original.webp?', '/media/original.webp#', '/media/original.webp#part',
    options.publicBase + '/original.webp?signature=SECRET', options.publicBase + '/original.webp#part',
    ' /media/original.webp', '/media/original.webp\n', '/media/original.webp\\x', '/media/',
    '/media//original.webp', '/media/./original.webp', '/media/../original.webp', '/media/a/../original.webp',
    '/media/%2e%2e/original.webp', '/media/a/%2E%2E/original.webp', '/media/%252e%252e/original.webp',
    '/media/a%2Foriginal.webp', '/media/a%5Coriginal.webp', '/media/a%00.webp', '/media/a%0A.webp',
    '/media/a%3Fsecret.webp', '/media/a%23secret.webp', '/media/https:%2F%2Fevil.test', '/media/%',
    options.publicBase + '/a/../original.webp', options.publicBase + '/%2e%2e/original.webp', '/media/' + 'x'.repeat(16385)]) {
    const pool = fixture({ artworks: [{ ...artworks[1], image_url }] });
    assert.deepEqual((await inspectMedia(pool, registry, one)).items, [], String(image_url).slice(0, 100));
    assert(!pool.calls.some(call => call.sql.startsWith('WITH source_assets'))); rolledBack(pool);
  }
});

await test('missing asset or wrong-owner/wrong-driver/invalid metadata excludes the pair', async () => {
  for (const patch of [null, { owner: other }, { driver: 's3' }, { driver: 'local' }, { remote_ready: 'true' },
    { key: '../original.webp' }, { key: '/original.webp' }, { sha256: 'not-a-hash' }, { sha256: null },
    { content_type: 'image/webp\r\nSecret: value' }, { content_type: '' }, { content_type: null },
    { bytes: '-1' }, { bytes: '9007199254740993' }, { bytes: NaN }, { bytes: Infinity }, { bytes: null }, { bytes: {} }, { bytes: '1.5' }]) {
    const pool = fixture({ ...oneRows, assets: patch === null ? [] : [{ ...original, ...patch }, thumbnail, preview] });
    assert.deepEqual((await inspectMedia(pool, registry, one)).items, [], JSON.stringify(patch)); rolledBack(pool);
  }
});

await test('local-only original authorizes ready variants, never an unready object download',async()=>{
  const result=await inspectMedia(fixture({...oneRows,assets:[{...original,remote_ready:false},thumbnail,preview]}),registry,one);
  assert.equal(result.items.length,1);assert.equal(result.items[0].asset.remoteReady,false);
  assert.deepEqual(result.items[0].variants.map(v=>v.key),[thumbnail.key,preview.key]);
  assert.deepEqual((await inspectMedia(fixture({...oneRows,assets:[{...original,remote_ready:false}]}),registry,one)).items,[]);
});

await test('each variant requires exact owner/driver/ready metadata, not just a key or public flag', async () => {
  for (const patch of [null, { owner: other }, { owner: null }, { driver: 's3' }, { remote_ready: false }, { bytes: '9007199254740993' },
    { sha256: 'bad' }, { key: 'variants/../thumb.webp' }, { content_type: 'image/webp\n' }]) {
    const pool = fixture({ ...oneRows, assets: [original, preview, ...(patch === null ? [] : [{ ...thumbnail, ...patch }])] });
    const item = (await inspectMedia(pool, registry, one)).items[0];
    assert.equal(item.asset.thumbnailKey, null); assert.equal(item.asset.previewKey, preview.key);
    assert.deepEqual(item.variants.map(asset => asset.key), [preview.key]);
    assert(!JSON.stringify(item).includes(thumbnail.key));
  }
  const missing = (await inspectMedia(fixture({ ...oneRows, assets: [original] }), registry, one)).items[0];
  assert.equal(missing.asset.thumbnailKey, null); assert.equal(missing.asset.previewKey, null); assert.deepEqual(missing.variants, []);
});

await test('duplicate derivative keys are deduplicated; unproven nested variant pointers are null', async () => {
  const root = { ...original, preview_key: thumbnail.key };
  const child = { ...thumbnail, thumbnail_key: 'not-authorized.webp', preview_key: 'missing.webp' };
  const item = (await inspectMedia(fixture({ ...oneRows, assets: [root, child] }), registry, one)).items[0];
  assert.equal(item.asset.thumbnailKey, thumbnail.key); assert.equal(item.asset.previewKey, thumbnail.key);
  assert.equal(item.variants.length, 1); assert.equal(item.variants[0].thumbnailKey, null); assert.equal(item.variants[0].previewKey, null);
});

await test('s3 is explicit and accepted, no implicit r2 or local fallback', async () => {
  const pool = fixture({ ...oneRows, assets: metadata.map(asset => ({ ...asset, driver: 's3' })) });
  const item = (await inspectMedia(pool, registry, { ...one, driver: 's3' })).items[0];
  assert.equal(item.asset.key, original.key); assert.equal(item.variants.length, 2);
  assert.equal(pool.calls.find(call => call.sql.startsWith('WITH source_assets')).values[2], 's3');
});

await test('no pairs/members/artwork match yields empty output, no broad metadata scan', async () => {
  for (const [patch, opts] of [[{ members: [] }, options], [{ artworks: [] }, options], [{}, { ...options, pairs: [] }],
    [{ members: [] }, { ...options, subjects: [], pairs: [] }]]) {
    const pool = fixture(patch), result = await inspectMedia(pool, registry, opts);
    assert.deepEqual(result.items, []); assert(!pool.calls.some(call => call.sql.startsWith('WITH source_assets'))); rolledBack(pool);
  }
  const pool = fixture({ ...oneRows, members: [{ email, name: 'Alice' }] });
  const result = await inspectMedia(pool, registry, options); assert.equal(result.items.length, 1);
  assert.deepEqual(pool.calls.find(call => call.sql.startsWith('WITH source_scopes')).values[0], [email]);
});

await test('snapshot time, current enterprise/membership and recent dates are mandatory', async () => {
  for (const [patch, opts, code] of [
    [{ observed: { read_only: 'off' } }, options, 'RECORDS_READ_ONLY_REQUIRED'],
    [{ observed: { isolation: 'read committed' } }, options, 'RECORDS_READ_ONLY_REQUIRED'],
    [{}, { ...options, from: '2026-09-23', to: '2026-10-01' }, 'RECORDS_WINDOW_NOT_RECENT'],
    [{}, { ...options, from: '2026-10-23', to: '2026-10-24' }, 'RECORDS_WINDOW_NOT_RECENT'],
    [{ enterprise: [] }, options, 'RECORDS_ENTERPRISE_NOT_FOUND'],
    [{ enterprise: [{ name: 'other' }] }, options, 'RECORDS_ENTERPRISE_NAME_MISMATCH'],
    ...['enabled', 'enterprise_enabled', 'authorized'].map(field => [{ enterprise: [
      { name: registry.enterpriseName, enabled: true, enterprise_enabled: true, authorized: true, [field]: false }] }, options, 'RECORDS_ENTERPRISE_DISABLED']),
    [{ members: [{ email: 'foreign@example.test' }] }, options, 'RECORDS_MEMBER_SCOPE_INVALID'],
  ]) {
    const pool = fixture(patch); await rejectCode(pool, opts, code); rolledBack(pool);
  }
});

await test('rollback, discard uncertain sessions, and redact source/release errors', async () => {
  for (const prefix of ['SET LOCAL ', 'SELECT now()', 'SELECT t.name', 'SELECT u.email', 'WITH source_scopes', 'WITH source_assets']) {
    const pool = fixture({ fail: sql => sql.startsWith(prefix) });
    await rejectCode(pool, options, 'RECORDS_SOURCE_READ_FAILED'); rolledBack(pool);
  }
  const begin = fixture({ fail: sql => sql.startsWith('BEGIN ') });
  await rejectCode(begin, options, 'RECORDS_SOURCE_READ_FAILED'); assert.deepEqual(begin.releases, [true]);
  assert.equal(begin.calls.length, 1);
  const connect = fixture({ failConnect: true }); await rejectCode(connect, options, 'RECORDS_SOURCE_READ_FAILED'); assert.deepEqual(connect.releases, []);
  const rollback = fixture({ rollbackFailures: 2 }); await rejectCode(rollback, options, 'RECORDS_SOURCE_READ_FAILED'); rolledBack(rollback, true);
  assert.equal(rollback.calls.filter(call => call.sql === 'ROLLBACK').length, 2);
  const readAndRollback = fixture({ fail: sql => sql.startsWith('WITH source_assets'), rollbackFailures: 1 });
  await rejectCode(readAndRollback, options, 'RECORDS_SOURCE_READ_FAILED'); rolledBack(readAndRollback, true);
  const release = fixture({ failRelease: true }); await rejectCode(release, options, 'RECORDS_SOURCE_RELEASE_FAILED'); rolledBack(release);
  const duplicate = fixture({ ...oneRows, assets: [original, original] });
  await rejectCode(duplicate, one, 'RECORDS_MEDIA_METADATA_INVALID'); rolledBack(duplicate);
});

await test('no application import, ensure, environment access, object reads or network', async () => {
  const source = await readFile(new URL('./lib/enterprise-records-snapshot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import\b/m);
  assert.doesNotMatch(source, /ensure\w*\s*\(|fetch\s*\(|process\.env|console\.|https?\.request\s*\(/);
  assert.equal(typeof inspectMedia, 'function');
});

console.log(`ENTERPRISE_MEDIA_AUTHORIZATION_VERIFY_PASS: cases=${cases} offline_fake_pool=1 exact_pairs=1 metadata_acl=1 read_only_rr=1 rollback=1 source_writes=0; real PostgreSQL integration remains with parent`);
