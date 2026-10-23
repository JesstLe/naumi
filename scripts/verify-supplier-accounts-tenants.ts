import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  const baseline = process.argv.includes('--expect=baseline');
  const root = process.env.FIXTURE_SOURCE_ROOT || process.cwd();
  const file = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const page = 'src/app/admin/supplier-balances/page.tsx';
  if (baseline) {
    assert.equal(existsSync(resolve(root, page)), false);
    assert(!file('src/components/admin/center-shell.tsx').includes('href:"/admin/supplier-balances"'));
    assert(!file('src/components/enterprise/enterprise-console.tsx').includes('TenantUsagePanel'));
    console.log('SUPPLIER_ACCOUNTS_BASELINE_PASS direct_balance_entry=0 tenant_usage_panel=0 supplier_calls=0'); return;
  }
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
  const address = new URL(process.env.DATABASE_URL!); assert.equal(address.hostname, '127.0.0.1'); assert.match(address.pathname, /fixture/);
  process.env.SETTINGS_SECRET = 'supplier-accounts-fixture-012345678901234567890123456'; process.env.NAUMI_MULTI_USER = '1';
  delete process.env.FLEET_PORTAL_ONLY; delete process.env.NAUMI_AUTH_LOGIN_ONLY;
  const db = await import('../src/lib/db'), tenants = await import('../src/lib/saas/tenants');
  const usage = await import('../src/lib/saas/tenant-usage'), http = await import('../src/lib/saas/tenant-usage-http');
  const auth = await import('../src/lib/admin-auth'), native = await import('../src/lib/native-auth');
  const query = await import('../src/lib/saas/tenant-usage-contracts');
  const balance = await import('../src/lib/model-config/provider-balance-access');
  const navigation = await import('../src/lib/admin-navigation');
  assert(file(page).includes('requireAdminPage'));
  assert.equal(navigation.adminDestination('/admin/supplier-balances'), '/admin/supplier-balances');
  assert.equal(navigation.adminDestination('//evil.invalid/admin/supplier-balances'), '/admin/center');
  assert(file('src/components/admin/model-management/model-management.tsx').includes('href="/admin/supplier-balances"'));
  assert(file('src/components/enterprise/enterprise-console.tsx').includes('tenantId={enterpriseId} enterprise'));
  assert(!file('src/components/enterprise/enterprise-console.tsx').includes('ProviderOps'));
  await tenants.ensureTenantSchema(); const pool = db.getPool();
  try {
    const owner = 'owner-a@supplier-usage.fixture', ownerB = 'owner-b@supplier-usage.fixture', manager = 'manager@supplier-usage.fixture';
    const member = 'member@supplier-usage.fixture', outsider = 'outsider@supplier-usage.fixture', sibling = 'sibling@supplier-usage.fixture';
    for (const email of [owner, ownerB, manager, member, outsider, sibling]) {
      await db.getOrCreateUser(email, email);
      await pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]') ON CONFLICT(email) DO UPDATE SET allowed=excluded.allowed", [email]);
    }
    const platform = { email: 'local-admin', admin: true, consoleAdmin: true };
    const makeTenant = async (ownerEmail: string) => (await tenants.createTenant(platform, { commandId: randomUUID(), name: 'Fixture ' + ownerEmail,
      ownerEmail, validUntil: null, seatLimit: null, entitlementName: 'Fixture', featurePolicy: { team: true } })).tenantId;
    const a = await makeTenant(owner), b = await makeTenant(ownerB);
    const role = randomUUID();
    await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Fixture manager',10,true,true)", [a, role]);
    for (const [email, supervisor, roleId] of [[manager, owner, role], [member, manager, null], [sibling, owner, null]]) {
      await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')", [a, email, supervisor, roleId]);
    }
    const fixed = { tenantId: a, from: '2026-10-23', to: '2026-10-23' };
    const absent = await usage.platformTenantUsage(fixed); assert.equal(absent.availability, 'not_recorded'); assert.equal(absent.chargedCredits, null);
    const schema = await import('../src/lib/saas/creation-schema'); await schema.ensureCreationSchema();
    const record = async (id: string, actor: string, tenantId: string | null, parent: string | null = null, at = '2026-10-23T04:00:00Z') => {
      await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,parent_id,accepted_at)
        VALUES($1,$2,$3,$4,$2,'fixture',$1,$5,$6)`, [id, actor, tenantId ? 'tenant' : 'personal', tenantId, parent, at]);
    };
    const link = async (id: string, actor: string, operation: string, type = 'billing', relation = 'execution') => pool.query('INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id,relation) VALUES($1,$2,$3,$4,$5)', [id, actor, type, operation, relation]);
    const op = async (id: string, actor: string, state: string, charged = 0, reserved = 0) => pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,reserved_credits,ledger_id)
      VALUES($1,$2,'fixture','{}','fixture',$3,$4,$5,$1)`, [id, actor, state, charged, reserved]);
    await record('root', member, a); await record('child', member, a, 'root', '2026-10-24T04:00:00Z');
    await op('charge', member, 'settled', 12); await link('root', member, 'charge'); await link('child', member, 'charge');
    await record('pending', manager, a); await op('reserve', manager, 'reserved', 0, 7); await link('pending', manager, 'reserve');
    await record('personal', member, null); await op('personal-charge', member, 'settled', 999); await link('personal', member, 'personal-charge');
    await record('other-tenant', ownerB, b); await op('other-charge', ownerB, 'settled', 888); await link('other-tenant', ownerB, 'other-charge');
    await record('sibling', sibling, a); await op('sibling-charge', sibling, 'settled', 5); await link('sibling', sibling, 'sibling-charge');
    await record('unknown', owner, a); await record('free', owner, a); await link('free', owner, 'free', 'no-charge', 'explicit-no-charge');
    await record('start-boundary', owner, a, null, '2026-10-22T16:00:00Z');
    await op('boundary', owner, 'released'); await link('start-boundary', owner, 'boundary');
    await record('end-boundary', owner, a, null, '2026-10-23T16:00:00Z'); await op('excluded', owner, 'settled', 1000); await link('end-boundary', owner, 'excluded');
    const result = await usage.platformTenantUsage(fixed);
    assert.equal(result.creations, 6); assert.equal(result.chargedCredits, 17); assert.equal(result.reservedCredits, 7);
    assert.equal(result.pendingOperations, 1); assert.equal(result.settledOperations, 3); assert.equal(result.unrecordedCreations, 1);
    const scoped = await usage.enterpriseTenantUsage({ email: manager, admin: true, consoleAdmin: true }, fixed);
    assert.equal(scoped.scope, 'current_subordinates'); assert.equal(scoped.creations, 2); assert.equal(scoped.chargedCredits, 12);
    assert.deepEqual((await usage.enterpriseTenantUsage({ email: owner, admin: false }, fixed)).chargedCredits, 17);
    await assert.rejects(usage.enterpriseTenantUsage({ email: ownerB, admin: true }, fixed), /企业身份/);
    await assert.rejects(usage.enterpriseTenantUsage({ email: member, admin: false }, fixed), /企业身份|查看权限/);
    const onlyUnknown = await usage.platformTenantUsage({ ...fixed, from: '2026-10-22', to: '2026-10-22' }); assert.equal(onlyUnknown.creations, 0); assert.equal(onlyUnknown.chargedCredits, 0);
    await record('unknown-only', owner, a, null, '2026-10-22T04:00:00Z');
    assert.equal((await usage.platformTenantUsage({ ...fixed, from: '2026-10-22', to: '2026-10-22' })).chargedCredits, null, 'Unknown must not become zero');
    for (const id of ['duplicate-root-a', 'duplicate-root-b']) {
      await record(id, owner, a, null, '2026-10-21T04:00:00Z'); await link(id, owner, 'same-operation');
    }
    await op('same-operation', owner, 'settled', 6);
    assert.equal((await usage.platformTenantUsage({ ...fixed, from: '2026-10-21', to: '2026-10-21' })).chargedCredits, 6, 'Distinct operation, not sum of root totals');
    await link('duplicate-root-a', owner, 'missing-operation');
    const incomplete = await usage.platformTenantUsage({ ...fixed, from: '2026-10-21', to: '2026-10-21' });
    assert.equal(incomplete.chargedCredits, 6); assert.equal(incomplete.unrecordedCreations, 1, 'Partial evidence preserves subtotal and missing notice');
    await record('unknown-parent', owner, a, null, '2026-10-20T04:00:00Z');
    await record('free-child-only', owner, a, 'unknown-parent', '2026-10-20T04:00:00Z');
    await link('free-child-only', owner, 'free-child-only', 'no-charge', 'explicit-no-charge');
    const unknownParent = await usage.platformTenantUsage({ ...fixed, from: '2026-10-20', to: '2026-10-20' });
    assert.equal(unknownParent.chargedCredits, null); assert.equal(unknownParent.unrecordedCreations, 1, 'Free child is not free root');
    await record('ambiguous', member, b); await link('ambiguous', member, 'charge');
    assert.equal((await usage.platformTenantUsage(fixed)).chargedCredits, 5, 'Cross-tenant shared operation is not allocated twice');
    await link('unknown', owner, 'other-charge'); assert.equal((await usage.platformTenantUsage(fixed)).unrecordedCreations, 2, 'Wrong payer ignored');
    await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1", [member]);
    const removed = await usage.enterpriseTenantUsage({ email: manager, admin: false }, fixed);
    assert.equal(removed.creations, 1); assert.equal((await usage.platformTenantUsage(fixed)).creations, 6, 'Frozen enterprise attribution remains');
    assert(!query.tenantUsageQuery.safeParse({ ...fixed, to: '2026-02-30' }).success);
    assert(!query.tenantUsageQuery.safeParse({ ...fixed, from: '2024-01-01' }).success);
    await auth.setAdminPassword('fixture-password-only'); const hash = (await db.getSetting(auth.ADMIN_PW_HASH_SETTING))!;
    const adminCookie = auth.ADMIN_COOKIE + '=' + auth.signSession(Date.now(), hash);
    const cookie = (email: string) => 'nv_user=' + native.signUserSession(email, Date.now());
    const req = (c = adminCookie, search = new URLSearchParams(fixed).toString(), method = 'GET') => new Request('http://fixture.test/api/admin/tenant-usage?' + search, { method, headers: { cookie: c } });
    assert.equal((await http.tenantUsageRoute(req(''))).status, 404);
    assert.equal((await http.tenantUsageRoute(req(cookie(owner)))).status, 404);
    assert.equal((await http.tenantUsageRoute(req())).status, 200);
    assert.equal((await http.tenantUsageRoute(req(adminCookie, new URLSearchParams({ ...fixed, credentialRef: randomUUID() }).toString()))).status, 400);
    assert.equal((await http.tenantUsageRoute(req(adminCookie, new URLSearchParams(fixed) + '&tenantId=' + b))).status, 400);
    assert.equal((await http.tenantUsageRoute(req(adminCookie, new URLSearchParams(fixed).toString(), 'POST'))).status, 405);
    const enterprise = await http.tenantUsageRoute(req(cookie(manager) + '; ' + adminCookie), true);
    assert.equal(enterprise.status, 200); const enterpriseText = await enterprise.text(); assert.doesNotMatch(enterpriseText, /provider|apiKey|credentialRef|accountId|https:/);
    assert.equal(JSON.parse(enterpriseText).scope, 'current_subordinates'); assert.match(enterprise.headers.get('cache-control')!, /private.*no-store/);
    assert.equal((await http.tenantUsageRoute(req(cookie(ownerB) + '; ' + adminCookie), true)).status, 403);
    assert.equal((await http.tenantUsageRoute(req(adminCookie), true)).status, 401);
    process.env.FLEET_PORTAL_ONLY = '1'; assert.equal((await http.tenantUsageRoute(req())).status, 404); delete process.env.FLEET_PORTAL_ONLY;
    process.env.NAUMI_AUTH_LOGIN_ONLY = '1'; assert.equal((await http.tenantUsageRoute(req())).status, 404); delete process.env.NAUMI_AUTH_LOGIN_ONLY;
    const flags: boolean[] = [];
    const handler = balance.createProviderOpsHandler({ authorize: async () => ({ actor: 'fixture' }), overview: async (_, include) => { flags.push(include!); return { accounts: [], configVersion: 1, generatedAt: new Date().toISOString(), cacheTtlSeconds: 300 }; } });
    assert.equal((await handler(new Request('http://fixture.test/?view=balances'))).status, 200);
    assert.equal((await handler(new Request('http://fixture.test/'))).status, 200); assert.deepEqual(flags, [false, true]);
    for (const search of ['?view=all', '?view=balances&view=balances', '?refresh=1&refresh=0', '?tenantId=' + a]) assert.equal((await handler(new Request('http://fixture.test/' + search))).status, 400);
    const probes = await import('../src/lib/model-config/provider-balance');
    for (const [name, expected] of [['TimeoutError', 'TIMEOUT'], ['TypeError', 'NETWORK_ERROR']] as const) {
      const service = probes.createProviderBalanceService({ secret: process.env.SETTINGS_SECRET!, readCredential: async () => 'fixture-key', readCache: async () => null, writeCache: async () => {},
        transport: () => async () => new Response(new ReadableStream({ start(controller) { const error = new Error('private response stream failure'); error.name = name; controller.error(error); } })) });
      const data = await service.overview([{ id: 'fixture', name: 'Fixture', enabled: true, baseUrl: 'https://api.apib.ai', credentialRef: 'fixture' }], 1);
      assert.equal(data.accounts[0].errorCode, expected); assert(!JSON.stringify(data).includes('private response stream failure'));
    }
    console.log('SUPPLIER_ACCOUNTS_TENANTS_PASS frozen_attribution=1 operation_dedup=1 timezone=1 pending_and_unknown=1 enterprise_scope=1 platform_cookie_no_elevation=1 balance_only=1 supplier_calls=0');
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
