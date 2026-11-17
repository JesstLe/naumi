// Actual whole route modules with explicit auth/DB boundary doubles; no network.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '..'), out = path.resolve(process.argv[2] || process.env.ADMIN_USAGE_ROUTES_EVIDENCE || 'output/admin-usage-routes');
const checks = [], tenant = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
class TeamError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function load(relative, mocks) {
  const file = path.join(root, relative), module = { exports: {} }, source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === '@/lib/bi/usage-contracts') return load('src/lib/bi/usage-contracts.ts', mocks);
    return require(name);
  };
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInThisContext()(localRequire, module, module.exports); return module.exports;
}
async function main() {
  let auth = true, permission = true, owner = false, received, reads = 0, audits = 0;
  const client = { identity: 'same-transaction' };
  const mocks = {
    '@/lib/bi/access': { biAuthorize: async () => auth ? { actor: 'admin' } : json({ error: 'private' }, 404), biJson: json },
    '@/lib/bi/repository': { logBiAccess: async () => { audits++; } },
    '@/lib/bi/usage-repository': { queryUserUsage: async query => { reads++; return { query }; }, readUserUsage: async (tx, query, scope) => { assert.equal(tx, client); received = { query, scope }; reads++; return received; } },
    '@/lib/enterprise/access': { enterpriseAuthorize: async () => auth ? { email: 'manager@example.test', admin: false } : json({ error: 'login' }, 401) },
    '@/lib/enterprise/server': { enterpriseHeavyReportRead: async (actor, id, run) => { assert.equal(actor.admin, false); if (!permission || id !== tenant) throw new TeamError('forbidden'); return run(client, { owner, visible: new Set(['self@example.test', 'child@example.test']), team: { id: tenant, name: '企业A', owner_email: 'owner@example.test' } }); } },
    '@/lib/teams/errors': { TeamError },
    '@/lib/teams/access': { teamJson: json, teamFailure: error => json({ error: error.message }, error.status || 500) },
  };
  const admin = load('src/app/api/admin/bi/usage/route.ts', mocks), enterprise = load('src/app/api/enterprise/usage/route.ts', mocks);
  const request = query => new Request('http://localhost/api/usage?' + new URLSearchParams(query));
  const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
  await check('PLATFORM_UNAUTHENTICATED_NO_READ', async () => { auth = false; assert.equal((await admin.GET(request({}))).status, 404); assert.equal(reads, 0); });
  await check('PLATFORM_QUERY_REJECTED_BEFORE_READ_AND_LOG', async () => { auth = true; assert.equal((await admin.GET(request({ sort: 'failures' }))).status, 400); assert.equal(reads, 0); assert.equal(audits, 0); });
  await check('PLATFORM_AUTHORIZED_AUDITED_PRIVATE_READ', async () => { const r = await admin.GET(request({})); assert.equal(r.status, 200); assert.match(r.headers.get('Cache-Control'), /no-store/); assert.equal(reads, 1); assert.equal(audits, 1); });
  await check('ENTERPRISE_ANONYMOUS_AND_MISSING_TENANT_REJECTED', async () => { auth = false; assert.equal((await enterprise.GET(request({ enterpriseId: tenant }))).status, 401); auth = true; assert.equal((await enterprise.GET(request({}))).status, 400); });
  await check('ENTERPRISE_UNAUTHORIZED_OR_CROSS_TENANT_NO_QUERY', async () => { const n = reads; permission = false; assert.equal((await enterprise.GET(request({ enterpriseId: tenant }))).status, 403); permission = true; assert.equal((await enterprise.GET(request({ enterpriseId: other }))).status, 403); assert.equal(reads, n); });
  await check('ENTERPRISE_CLIENT_MEMBER_LIST_IGNORED_AND_SAME_TX_RETAINED', async () => { const r = await enterprise.GET(request({ enterpriseId: tenant, allowedEmails: 'foreign@example.test', email: 'child@example.test' })); assert.equal(r.status, 200); assert.deepEqual(received.scope.allowedEmails, ['self@example.test', 'child@example.test']); });
  await check('ENTERPRISE_FOREIGN_ACCOUNT_REJECTED_BEFORE_QUERY', async () => { const n = reads; assert.equal((await enterprise.GET(request({ enterpriseId: tenant, email: 'foreign@example.test' }))).status, 403); assert.equal(reads, n); });
  await check('OWNER_CAN_INCLUDE_EXACT_OWNER_NOT_ARBITRARY_ACCOUNT', async () => { owner = true; assert.equal((await enterprise.GET(request({ enterpriseId: tenant, email: 'owner@example.test' }))).status, 200); assert.deepEqual(received.scope.allowedEmails, ['self@example.test', 'child@example.test', 'owner@example.test']); });
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ result: 'PASS', checks, supplierCalls: 0, network: 0, explicitBoundaries: ['auth decision', 'DB transaction', 'repository response'], exit: 0 }, null, 2));
  console.log(`ADMIN_USAGE_ROUTES=PASS CHECKS=${checks.length} NETWORK=0 SUPPLIER_CALLS=0 EXIT=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
