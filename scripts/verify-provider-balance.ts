import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
  const address = new URL(process.env.DATABASE_URL || 'http://invalid'); assert.equal(address.hostname, '127.0.0.1'); assert.match(address.pathname, /fixture/);
  process.env.SETTINGS_SECRET = 'provider-balance-fixture-only-012345678901234567890123456'; process.env.NAUMI_MULTI_USER = '1';
  delete process.env.FLEET_PORTAL_ONLY; delete process.env.NAUMI_AUTH_LOGIN_ONLY;
  const db = await import('../src/lib/db'), schema = await import('../src/lib/model-config/schema'), storage = await import('../src/lib/settings');
  const balance = await import('../src/lib/model-config/provider-balance'), access = await import('../src/lib/model-config/provider-balance-access');
  const auth = await import('../src/lib/admin-auth'), native = await import('../src/lib/native-auth'), bi = await import('../src/lib/bi/access');
  await db.ensureSchema(); const pool = db.getPool(); await schema.ensureModelSchema(pool);
  const refs = { old: randomUUID(), current: randomUUID(), alias: randomUUID(), other: randomUUID(), unsupported: randomUUID(), unlimited: randomUUID(), zero: randomUUID(), apib: randomUUID() };
  const secretKeys = { old: 'sk-fixture-OLD-DO-NOT-USE', current: 'sk-fixture-SHARED-ACCOUNT', alias: 'sk-fixture-SHARED-ACCOUNT', other: 'sk-fixture-OTHER-ACCOUNT', unsupported: 'sk-fixture-UNSUPPORTED', unlimited: 'sk-fixture-UNLIMITED', zero: 'sk-fixture-ZERO', apib: 'sk-fixture-APIB-ACCOUNT' };
  const insert = async (ref: string, provider: string, key: string) => pool.query('INSERT INTO app_model_credentials(id,provider_id,key_enc,created_by) VALUES($1,$2,$3,$4)', [ref, provider, storage.encryptAtRest(key), 'provider-balance.fixture']);
  for (const [name, provider] of [['old', 'geek-one'], ['current', 'geek-one'], ['alias', 'geek-two'], ['other', 'geek-other'], ['unsupported', 'apimart-unverified'], ['unlimited', 'geek-unlimited'], ['zero', 'geek-zero'], ['apib', 'apib-account']] as const) await insert(refs[name], provider, secretKeys[name]);
  const provider = (id: string, credentialRef: string, baseUrl = 'https://www.geeknow.top/v1') => ({ id, credentialRef, name: id + '（fixture）', baseUrl, enabled: true, protocol: 'openai-chat', maxConcurrent: 3, timeoutMs: 30000 });
  const providers = [provider('geek-one', refs.current), provider('geek-two', refs.alias), provider('geek-other', refs.other), { ...provider('apimart-unverified', refs.unsupported, 'https://api.apimart.fixture/v1'), protocol: 'apimart-images' }, provider('geek-mismatch', refs.current), provider('geek-unlimited', refs.unlimited), provider('geek-zero', refs.zero), provider('apib-account', refs.apib, 'https://api.apib.ai/v1')];
  const readCredential = (ref: string, id: string) => balance.readProviderBalanceCredential(pool, ref, id);
  assert.equal(await readCredential(refs.current, 'geek-one'), secretKeys.current); assert.equal(await readCredential(refs.current, 'geek-mismatch'), null);
  const insertVersion = async (providers: unknown) => Number((await pool.query('INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,$2,$3,$4,$5) RETURNING version', [randomUUID(), 'fixture', 'balance published-contract fixture', JSON.stringify({ providers }), randomUUID()])).rows[0].version);
  let version = await insertVersion(providers); await pool.query('INSERT INTO app_model_config_state(singleton,active_version) VALUES(true,$1)', [version]);
  let time = Date.parse('2026-10-23T01:00:00Z'), calls = 0, mode: 'ok' | 'network' | 'unauthorized' | 'malformed' | 'timeout' = 'ok';
  const usedKeys: string[] = [], readRefs: string[] = [];
  const service = balance.createProviderBalanceService({ secret: process.env.SETTINGS_SECRET, now: () => time,
    readCredential: async (ref, id) => { readRefs.push(ref); return readCredential(ref, id); }, readCache: db.getSetting, writeCache: db.setSetting,
    transport: () => async (input, init) => {
      calls++; assert(['https://www.geeknow.top/api/usage/token/', 'https://api.apib.ai/v1/user/balance'].includes(String(input))); assert.equal(init?.method, 'GET');
      const key = new Headers(init?.headers).get('authorization')!.replace('Bearer ', ''); usedKeys.push(key); assert.notEqual(key, secretKeys.old);
      await new Promise(resolve => setTimeout(resolve, 3));
      if (mode === 'network') throw new Error('sk-SENSITIVE https://internal-secret.fixture/private?key=DO_NOT_LEAK');
      if (mode === 'timeout') throw new DOMException('sensitive fixture timeout URL', 'TimeoutError');
      if (mode === 'unauthorized') return Response.json({ error: 'sk-SENSITIVE internal-private-url' }, { status: 401 });
      if (mode === 'malformed') return Response.json({ remain_balance: 88, currency: 'USD', secret: 'sk-SENSITIVE' });
      if (key === secretKeys.apib) { assert.equal(String(input), 'https://api.apib.ai/v1/user/balance'); return Response.json({ success: true, remain_balance: 12.345, used_balance: 7.5, ignored_secret: 'sk-SENSITIVE' }); }
      return Response.json({ data: { total_granted: key === secretKeys.unlimited ? -1 : 100, total_used: 10, total_available: key === secretKeys.unlimited ? -200 : key === secretKeys.zero ? 0 : key === secretKeys.current ? 90 : 35, unlimited_quota: key === secretKeys.unlimited }, ignored_secret: 'sk-SENSITIVE' });
    },
  });
  const read = balance.createPublishedProviderBalanceReader(pool, service);
  const protectedTables = ['app_model_execution_stages', 'app_supplier_calls', 'app_billing_operations', 'app_ledger', 'app_model_provider_leases', 'app_model_health_observations', 'app_model_health_probes'];
  const counts = async () => Promise.all(protectedTables.map(async table => (await pool.query('SELECT to_regclass($1) AS name', [table])).rows[0].name ? (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n : null));
  const baseline = await counts();
  const [first, parallel] = await Promise.all([read(), read()]);
  assert.equal(calls, 5); assert.equal(first.accounts.length, 7); assert.deepEqual(first.accounts.map(a => a.accountId), parallel.accounts.map(a => a.accountId));
  assert(!readRefs.includes(refs.old)); assert(!usedKeys.includes(secretKeys.old));
  const shared = first.accounts.find(account => account.providers.some(provider => provider.id === 'geek-one'))!;
  assert.equal(shared.providers.length, 2); assert.equal(shared.measurement!.remaining, 90); assert.equal(shared.measurement!.unit, null); assert.equal(shared.identity, 'published_credential');
  assert.equal(first.accounts.find(account => account.providers[0].id === 'geek-other')!.measurement!.remaining, 35);
  assert.equal(first.accounts.find(account => account.providers[0].id === 'apimart-unverified')!.status, 'unsupported');
  assert.equal(first.accounts.find(account => account.providers[0].id === 'apimart-unverified')!.measurement, null);
  assert.equal(first.accounts.find(account => account.providers[0].id === 'geek-mismatch')!.errorCode, 'CREDENTIAL_UNAVAILABLE');
  const unlimited = first.accounts.find(account => account.providers[0].id === 'geek-unlimited')!.measurement!;
  assert.equal(unlimited.unlimited, true); assert.equal(unlimited.remaining, null); assert.equal(unlimited.total, null); assert.equal(unlimited.kind, 'api_key_quota');
  assert.equal(first.accounts.find(account => account.providers[0].id === 'geek-zero')!.measurement!.remaining, 0);
  const apib = first.accounts.find(account => account.providers[0].id === 'apib-account')!;
  assert.equal(apib.measurement!.kind, 'account_balance'); assert.equal(apib.measurement!.remaining, 12.345); assert.equal(apib.measurement!.unit, null); assert.equal(apib.measurement!.unlimited, null);
  const apibAdapter = balance.documentedBalanceAdapters.find(adapter => adapter.id === 'apib-account-balance-v1')!;
  assert.throws(() => apibAdapter.parse({ success: false, remain_balance: 12, used_balance: 7 }));
  assert.throws(() => apibAdapter.parse({ data: { success: true, remain_balance: 12, used_balance: 7 } }));
  assert.throws(() => apibAdapter.parse({ success: true, remain_balance: '12', used_balance: 7 }));
  assert.equal(apibAdapter.parse({ success: true, remain_balance: -1, used_balance: -1 }).remaining, null);
  await read(); assert.equal(calls, 5); const limited = await read(true); assert.equal(calls, 5); assert(limited.accounts.filter(a => a.status === 'ok').every(account => account.cache.refreshLimited));
  time += 16_000; mode = 'network'; const failed = await read(true); assert.equal(calls, 10);
  assert(failed.accounts.filter(account => account.credentialAvailable && account.source).every(account => account.errorCode === 'NETWORK_ERROR' && account.measurement === null && account.lastKnown !== null));
  assert.doesNotMatch(JSON.stringify(failed), /sk-SENSITIVE|internal-secret|DO_NOT_LEAK|https:\/\/internal/);
  time += 31_000; mode = 'malformed'; assert((await read()).accounts.filter(account => account.source && account.credentialAvailable).every(account => account.errorCode === 'MALFORMED_RESPONSE'));
  time += 31_000; mode = 'unauthorized'; assert((await read()).accounts.filter(account => account.source && account.credentialAvailable).every(account => account.errorCode === 'AUTH_FAILED'));
  time += 31_000; mode = 'timeout'; assert((await read()).accounts.filter(account => account.source && account.credentialAvailable).every(account => account.errorCode === 'TIMEOUT'));
  time += 31_000; mode = 'ok'; await read();
  const rotatedProviders = providers.map(provider => provider.id === 'geek-one' ? { ...provider, credentialRef: refs.other } : provider);
  // A credential owned by another provider is unavailable, never a fallback to
  // either that account or an old same-provider credential.
  version = await insertVersion(rotatedProviders); await pool.query('UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true', [version]);
  const rotated = await read(); assert.equal(rotated.accounts.find(account => account.providers[0].id === 'geek-one')!.measurement, null); assert.equal(rotated.accounts.find(account => account.providers[0].id === 'geek-two')!.measurement!.remaining, 90);
  for (const value of Object.values(secretKeys)) assert(!JSON.stringify(rotated).includes(value)); assert(!JSON.stringify(rotated).includes(refs.current)); assert(!JSON.stringify(rotated).includes('baseUrl'));
  assert.deepEqual(await counts(), baseline);
  const ordinary = 'member@provider-balance.fixture', nativeAdmin = 'admin@provider-balance.fixture';
  await db.getOrCreateUser(ordinary, 'Fixture 企业成员'); await db.getOrCreateUser(nativeAdmin, 'Fixture 管理员'); await pool.query("UPDATE app_users SET role='admin' WHERE email=$1", [nativeAdmin]);
  await auth.setAdminPassword('fixture-admin-password-only'); const passwordHash = (await db.getSetting(auth.ADMIN_PW_HASH_SETTING))!;
  const authBaseline = await counts();
  const cookie = auth.ADMIN_COOKIE + '=' + auth.signSession(Date.now(), passwordHash), handler = access.createProviderOpsHandler({ authorize: bi.biAuthorize, overview: read });
  const req = (cookieValue = cookie, query = '', method = 'GET') => new Request('http://fixture.test/api/admin/bi/provider-ops' + query, { method, headers: { cookie: cookieValue } });
  assert.equal((await handler(req(''))).status, 404); assert.equal((await handler(req('nv_user=' + native.signUserSession(ordinary, Date.now())))).status, 404);
  assert.equal((await handler(req('nv_user=' + native.signUserSession(nativeAdmin, Date.now())))).status, 404, 'Second administrator verification is required');
  const authorized = await handler(req()); assert.equal(authorized.status, 200); assert.match(authorized.headers.get('cache-control') || '', /private.*no-store/);
  assert.equal((await handler(req(cookie, '?credentialRef=' + refs.old))).status, 400); assert.equal((await handler(req(cookie, '?refresh=maybe'))).status, 400);
  assert.equal((await handler(req(cookie, '', 'POST'))).status, 405);
  process.env.FLEET_PORTAL_ONLY = '1'; assert.equal((await handler(req())).status, 404); delete process.env.FLEET_PORTAL_ONLY;
  process.env.NAUMI_AUTH_LOGIN_ONLY = '1'; assert.equal((await handler(req())).status, 404); delete process.env.NAUMI_AUTH_LOGIN_ONLY;
  const unsafe = access.createProviderOpsHandler({ authorize: bi.biAuthorize, overview: async () => { throw new Error('sk-SENSITIVE https://internal-secret.fixture/?token=DO_NOT_LEAK'); } });
  const rejected = await unsafe(req()), rejectedText = await rejected.text(); assert.equal(rejected.status, 503); assert.doesNotMatch(rejectedText, /sk-SENSITIVE|internal-secret|DO_NOT_LEAK/); assert.match(rejectedText, /PROVIDER_OPS_UNAVAILABLE/);
  assert.deepEqual(await counts(), authBaseline);
  const staleReader = balance.createPublishedProviderBalanceReader(pool, { overview: async (...args) => { const result = await service.overview(...args); const next = await insertVersion(providers); await pool.query('UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true', [next]); return result; } });
  const changed = await access.createProviderOpsHandler({ authorize: bi.biAuthorize, overview: staleReader })(req()); assert.equal(changed.status, 409); assert.equal((await changed.json()).code, 'CONFIG_CHANGED');
  console.log('PROVIDER_BALANCE_FIXTURE_PASS exact_published_credential=1 old_key_ignored=1 account_grouping=1 account_isolation=1 cache=1 refresh_throttle=1 inflight_dedupe=1 apib_top_level_contract=1 apib_success_false_rejected=1 negative_unlimited_masked=1 unknown_unit=1 known_zero=1 unknown_not_zero=1 stale_distinguished=1 errors_sanitized=1 auth=1 second_factor=1 fleet_block=1 enterprise_denied=1 private_cache=1 version_change_guard=1 execution_billing_health_unchanged=1 real_supplier_calls=0');
  await pool.end();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
