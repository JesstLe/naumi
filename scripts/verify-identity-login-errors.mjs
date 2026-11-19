import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const route = path.resolve(process.argv[2] || 'src/pages/api/identity-interaction/[uid].ts');
function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, URL, Headers, Request, Error,
    require: name => { assert.ok(name in dependencies, `unexpected import ${name}`); return dependencies[name]; },
  }, { filename: file });
  return module.exports;
}
const helper = load(path.resolve(process.argv[3] || path.join(root, 'src/lib/enterprise/identity/login-error.ts')));
class TeamError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
async function invoke(options = {}) {
  const calls = { finished: [], account: [], db: [], grant: [] };
  const details = {
    uid: 'valid', params: { client_id: 'registered' },
    prompt: { name: 'login', details: {} }, session: { accountId: 'subject' }, ...options.details,
  };
  class Grant {
    constructor(config) { calls.grant.push(config); }
    static async find() { return options.noGrant ? null : new Grant(); }
    addOIDCScope(scope) { calls.grant.push({ scope }); }
    addOIDCClaims(claims) { calls.grant.push({ claims }); }
    async save() { return 'saved-grant'; }
  }
  const provider = {
    async interactionDetails() { if (options.detailsError) throw options.detailsError; return details; },
    async interactionFinished(_req, _res, data, merge) { calls.finished.push({ data, merge }); }, Grant,
  };
  const handler = load(route, {
    '@/lib/native-auth': { activeNativeUserEmail: async () => options.anonymous ? null : 'fixture@example.test' },
    '@/lib/enterprise/identity/oidc': {
      identityProvider: async () => { if (options.providerError) throw options.providerError; return provider; },
      identityClients: () => [{ clientId: 'registered', redirectUri: 'https://product.example.test/api/auth/central/callback' }],
      oidcAccount: async (...args) => { calls.account.push(args); if (options.accountError) throw options.accountError; },
    },
    '@/platform/db/pool': { getPool: () => ({ query: async (...args) => {
      calls.db.push(args); if (options.dbError) throw options.dbError;
      return { rows: options.missingSubject ? [] : [{ subject_id: 'subject' }] };
    } }) },
    '@/lib/teams/errors': { TeamError },
    '@/lib/enterprise/identity/login-error': helper,
  }).default;
  const res = {
    headersSent: !!options.headersSent, statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(status) { this.statusCode = status; return this; },
    send(body) { this.body = body; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
    redirect(status, url) { this.statusCode = status; this.headers.location = url; this.headersSent = true; },
  };
  await handler({ method: options.method || 'GET', query: { uid: 'valid', returnTo: 'https://attacker.test' }, headers: {} }, res);
  return { res, calls };
}
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; }
  catch (error) { failed++; console.log('FAIL ' + name + ': ' + error.message); }
}
function errorPage(result, status, title, product = true) {
  const { res, calls } = result;
  assert.equal(res.statusCode, status);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.match(res.body, /<meta charset="utf-8">/);
  assert.ok(Buffer.from(res.body).toString('utf8').includes(title));
  assert.ok(res.body.includes(`href="${product ? 'https://product.example.test/login' : '/'}"`));
  assert.ok(!res.body.includes('attacker') && !res.body.includes('fixture@example') && !res.body.includes('PRIVATE_ERROR'));
  assert.equal(calls.finished.length, 0);
  assert.equal(calls.grant.length, 0);
  assert.ok(calls.db.every(([sql]) => sql.startsWith('SELECT ')));
}
await check('missing-subject-utf8-denied', async () => errorPage(await invoke({ missingSubject: true }), 403, '当前账号尚未开通企业协作'));
await check('missing-product-grant-denied', async () => errorPage(await invoke({ accountError: new TeamError('PRIVATE_ERROR', 403) }), 403, '当前账号尚未开通企业协作'));
await check('inactive-native-account', async () => errorPage(await invoke({ accountError: new TeamError('PRIVATE_ERROR', 401) }), 409, '登录账号已变化'));
await check('consent-account-change', async () => errorPage(await invoke({ details: { prompt: { name: 'consent', details: {} }, session: { accountId: 'different' } } }), 409, '登录账号已变化'));
await check('unknown-prompt', async () => errorPage(await invoke({ details: { prompt: { name: 'unexpected' } } }), 400, '登录请求已过期'));
await check('unknown-client-no-return-query', async () => errorPage(await invoke({ details: { params: { client_id: 'unregistered' } } }), 400, '登录请求已过期', false));
await check('uid-mismatch-no-client-return', async () => errorPage(await invoke({ details: { uid: 'different' } }), 400, '登录请求已过期', false));
await check('expired-provider-session', async () => { const e = new Error('PRIVATE_ERROR'); e.name = 'SessionNotFound'; errorPage(await invoke({ detailsError: e }), 400, '登录请求已过期', false); });
await check('provider-service-outage', async () => errorPage(await invoke({ providerError: new TeamError('PRIVATE_ERROR', 503) }), 503, '登录服务暂时不可用', false));
await check('database-outage-not-permission-denied', async () => errorPage(await invoke({ dbError: new Error('PRIVATE_ERROR') }), 503, '登录服务暂时不可用'));
await check('missing-consent-grant', async () => errorPage(await invoke({ noGrant: true, details: { grantId: 'missing', prompt: { name: 'consent', details: {} } } }), 400, '登录请求已过期'));
await check('successful-login-unchanged', async () => {
  const { res, calls } = await invoke(); assert.equal(calls.finished.length, 1);
  assert.equal(calls.finished[0].data.login.accountId, 'subject'); assert.equal(calls.finished[0].merge.mergeWithLastSubmission, false);
  assert.equal(calls.account.length, 1); assert.equal(res.body, '');
});
await check('successful-consent-unchanged', async () => {
  const { calls } = await invoke({ details: { prompt: { name: 'consent', details: { missingOIDCScope: ['openid', 'email'], missingOIDCClaims: ['name'] } } } });
  assert.equal(calls.finished.length, 1); assert.equal(calls.finished[0].data.consent.grantId, 'saved-grant');
  assert.equal(calls.finished[0].merge.mergeWithLastSubmission, true); assert.equal(calls.grant[1].scope, 'openid email'); assert.equal(calls.grant[2].claims[0], 'name');
});
await check('anonymous-native-login-unchanged', async () => {
  const { res, calls } = await invoke({ anonymous: true }); assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?auth=sign-in&redirect=%2Fapi%2Fidentity-interaction%2Fvalid'); assert.equal(calls.db.length, 0);
});
await check('non-get-rejected', async () => { const { res, calls } = await invoke({ method: 'POST' }); assert.equal(res.statusCode, 405); assert.equal(calls.db.length, 0); });
await check('headers-already-sent-not-replaced', async () => { const { res } = await invoke({ headersSent: true, dbError: new Error('PRIVATE_ERROR') }); assert.equal(res.body, ''); });
await check('return-url-policy', () => {
  for (const uri of [undefined, 'javascript:alert(1)', '//attacker.test', 'https://user:pass@example.test/api/auth/central/callback', 'https://example.test/api/auth/central/callback?redirect=x', 'https://example.test/api/auth/central/callback#x', 'https://example.test/other', 'http://example.test/api/auth/central/callback']) assert.equal(helper.loginReturnUrl(uri), '/');
  assert.equal(helper.loginReturnUrl('http://127.0.0.1:1234/api/auth/central/callback'), 'http://127.0.0.1:1234/login');
});
await check('escaped-href-no-inline-code-or-private-data', () => {
  const p = helper.loginErrorResponse('product_access_required', "https://a'b.example.test/api/auth/central/callback");
  assert.ok(p.html.includes('&#39;')); assert.ok(!p.html.includes('<script') && !p.html.includes('onclick='));
});
console.log(`IDENTITY_LOGIN_ERRORS passed=${passed} failed=${failed} cases=${passed + failed} auth_writes=0`);
process.exitCode = failed ? 1 : 0;
