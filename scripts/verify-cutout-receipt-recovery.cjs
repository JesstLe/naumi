// Real synchronous wrapper + real PostgreSQL; only auth/config/wallet/supplier
// boundaries are fixtures. Never submits an upstream request.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { transformSync } = require('esbuild');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '..');
const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const source = path.resolve(arg('--source-root') || root), baseline = process.argv.includes('--baseline');
const out = path.resolve(arg('--output-root') || process.env.CUTOUT_RECEIPT_EVIDENCE || 'output/cutout-receipt');
const url = new URL(process.env.CANVAS_FEEDBACK_TEST_DATABASE || 'http://missing');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/canvas_feedback_fixture');
fs.mkdirSync(out, { recursive: true });
const schema = 'receipt_' + crypto.randomBytes(6).toString('hex');
const pool = new Pool({ connectionString: url.href, max: 2, options: `-c search_path=${schema}` });
const state = { owner: 'owner@example.test', scopeKind: 'personal', tenantId: null, actions: 0, settles: 0, supplierCalls: 0 };
const scope = () => ({ actorEmail: state.owner, scopeKind: state.scopeKind, tenantId: state.tenantId, parentContext: null });
class TeamError extends Error { constructor(message, status) { super(message); this.status = status; } }
const loaded = [];
const cache = new Map();
const json = (value, status = 200) => Response.json(value, { status });
const quote = { requestedCredits: 7, tariff: { pricing: { mode: 'credits' } } };
const fixtures = {
  'server-only': {},
  '@/lib/db': { dbEnabled: true, getPool: () => pool, ensureSchema: async () => {}, isBanned: async () => false },
  '@/lib/admin-auth': { resolveUserEmail: async () => state.owner },
  './server': { getBillingRuntime: async () => ({ config: { current: () => ({}) } }), quoteForRequest: async () => quote },
  '../model-config/accepted-context': { acceptedModelVersions: async () => null },
  '../model-config/server': {},
  './quote': {},
  './service': { createBillingService: () => ({
    reserveTx: async (_tx, op) => { await pool.query('INSERT INTO app_billing_operations(id,email,feature,quote,state,request_fingerprint,charged_credits) VALUES($1,$2,$3,$4,\'reserved\',$5,0)', [op.id, op.email, 'tool.cutout', op.quote, fingerprint({ email: op.email, quote: op.quote, ledgerId: op.ledgerId, fingerprint: op.fingerprint })]); return { replayed: false }; },
    settleTx: async (_tx, op, result) => { if (result.state !== 'succeeded') { await pool.query("UPDATE app_billing_operations SET state='hold' WHERE id=$1", [op.id]); return { charge: 0, state: 'hold' }; } state.settles++; await pool.query("UPDATE app_billing_operations SET state='settled',charged_credits=7 WHERE id=$1", [op.id]); return { charge: 7, state: 'settled' }; },
  }), withBillingTransaction: async (_pool, action) => action(pool) },
  './access': { billingJson: json },
  '../model-config/types': { ModelConfigError: class extends Error {} },
  '@/lib/model-config/context': { currentModelExecution: () => null },
  '../staging-history': { excludeImportedHistory: () => '' },
  '../saas/creation-context': { currentCreationContext: scope, withFrozenCreation: (_s, action) => action(), withCreationRequest: (_r, _e, action) => action() },
  '../saas/creation-writer': { startCreation: async () => 'fixture-creation', finishCreation: async () => {}, prepareOriginalCreationInput: async () => {} },
  '../teams/server': { TeamError },
};
Object.assign(fixtures,{
 '@/lib/billing/runtime':{getBillingRuntime:fixtures['./server'].getBillingRuntime},
 '@/lib/saas/creation-scope':fixtures['../saas/creation-context'],
 '@/platform/db/pool':fixtures['@/lib/db'],
 '@/lib/persistence/schema':fixtures['@/lib/db'],
 '@/lib/accounts/repository':fixtures['@/lib/db'],
 '../admin-auth':fixtures['@/lib/admin-auth'],
 '../model-config/context':fixtures['@/lib/model-config/context'],
 '../saas/creation-scope':fixtures['../saas/creation-context'],
 '../saas/creation-writer':{...fixtures['../saas/creation-writer'],claimCreation:async()=>({id:'fixture-creation'})},
 '../teams/errors':{TeamError},
 '../artwork-provenance-context':{withArtworkCreation:(_c,run)=>run()},
 '../artwork-provenance':{provenanceEntry:()=> 'fixture'},
});
function load(rel) {
  const file = path.join(source, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const bytes = fs.readFileSync(file);
  loaded.push({ path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  if(rel.endsWith('.json')){mod.exports=JSON.parse(bytes.toString());return mod.exports;}
  const code = transformSync(bytes.toString(), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const requireLocal = name => {
    if (Object.hasOwn(fixtures, name)) return fixtures[name];
    if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
    const resolved=name.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(rel.replaceAll('\\','/')),name)):name.startsWith('@/')?'src/'+name.slice(2):null;
    const alias=resolved?.startsWith('src/')?'@/'+resolved.slice(4):null;
    if(alias&&Object.hasOwn(fixtures,alias))return fixtures[alias];

    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.relative(source, path.resolve(source, path.dirname(rel), name + (/\.(?:ts|json)$/.test(name)?'':'.ts'))));
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(requireLocal, mod, mod.exports);
  return mod.exports;
}
const { fingerprint } = load('src/lib/billing/fingerprint.ts');
const sync = load('src/lib/billing/synchronous.ts');
function request(id, body = { parentId: 'source-image' }) { return new Request('http://fixture.local/api/cutout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-naumi-billing-operation-id': id }, body: JSON.stringify(body) }); }
async function insertOperation(id, extra = {}) {
  const req = request(id), identity = await sync.billingRequestIdentity(req), full = 'tool-' + id;
  await pool.query('INSERT INTO app_billing_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [full, state.owner, 'tool.cutout', quote, extra.state || 'settled', extra.receipt || null, fingerprint({ email: state.owner, quote, ledgerId: 'led-' + full, fingerprint: identity.hash }), 7]);
  await pool.query('INSERT INTO app_creation_records VALUES($1,$2,$3,$4,$5,$6)', ['creation-' + id, state.owner, 'tool.cutout', full, 'personal', null]);
  return full;
}
async function insertArtwork(op, id = 'art-' + op, extra = {}) {
  await pool.query('INSERT INTO app_artworks VALUES($1,$2,$3,$4,$5,$6)', [id, extra.owner || state.owner, extra.image || 'data:image/png;base64,' + 'A'.repeat(400000), 'completed', extra.deleted ? new Date() : null, { ref: op, operation: 'cutout', evidence: 'server-route', ...extra.provenance }]);
  return id;
}
async function replay(id, body) {
  const response = await sync.withBillingRequest(request(id, body), 'tool.cutout', async () => { state.actions++; throw Error('SUPPLIER_MUST_NOT_RUN'); });
  return { status: response.status, body: await response.json() };
}
const checks = [];
async function check(name, action) { await action(); checks.push(name); }
(async () => {
  const admin = new Pool({ connectionString: url.href });
  await admin.query('CREATE SCHEMA ' + schema); await admin.end();
  try {
    await pool.query(`CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,quote jsonb,state text,result_response jsonb,request_fingerprint text,charged_credits int);
      CREATE TABLE app_creation_records(id text,actor_email text,source_kind text,source_id text,scope_kind text,tenant_id text);
      CREATE TABLE app_creation_links(creation_id text,target_type text,target_id text,actor_email text);
      CREATE TABLE app_artworks(id text PRIMARY KEY,email text,image_url text,status text,deleted_at timestamptz,creation_provenance jsonb);`);
    await check('legacy-settled-large-artwork-replay', async () => {
      const op = await insertOperation('legacy-large-0001'), id = await insertArtwork(op);
      const got = await replay('legacy-large-0001');
      assert.equal(got.status, baseline ? 409 : 200);
      if (baseline) assert.equal(got.body.error, '扣费已完成，结果需要恢复，请联系管理员');
      else { assert.equal(got.body.id, id); assert.equal(got.body.creditsUsed, 7); assert.ok(got.body.url.length > 262144); }
    });
    if (!baseline) {
      await check('compact-checkpoint-before-settlement-and-replay', async () => {
        const id = 'new-cutout-0001';
        const first = await sync.withBillingRequest(request(id), 'tool.cutout', async () => {
          await sync.synchronousCost();
          const art = await insertArtwork('tool-' + id);
          const payload = { ok: true, id: art, url: 'data:image/png;base64,' + 'A'.repeat(400000), creditsUsed: 7 };
          await sync.checkpointSynchronousResult(payload);
          const row = (await pool.query('SELECT * FROM app_billing_operations WHERE id=$1', ['tool-' + id])).rows[0];
          assert.equal(row.state, 'reserved'); assert.ok(JSON.stringify(row.result_response).length < 256);
          await sync.settleSynchronous('fixture-completed'); return json(payload);
        });
        assert.equal(first.status, 200); const got = await replay(id); assert.equal(got.status, 200); assert.equal(got.body.creditsUsed, 7); assert.equal(state.settles, 1);
      });
      await check('duplicate-replays-never-settle-or-run-action', async () => { const results = await Promise.all(Array.from({ length: 5 }, () => replay('new-cutout-0001'))); assert.ok(results.every(x => x.status === 200)); assert.equal(state.settles, 1); });
      await check('exact-owner-rejects-cross-account', async () => { state.owner = 'other@example.test'; assert.equal((await replay('legacy-large-0001')).status, 409); state.owner = 'owner@example.test'; });
      await check('frozen-workspace-rejects-cross-tenant', async () => { state.scopeKind = 'tenant'; state.tenantId = 'another'; assert.equal((await replay('legacy-large-0001')).status, 409); state.scopeKind = 'personal'; state.tenantId = null; });
      await check('request-fingerprint-rejects-changed-source', async () => { assert.equal((await replay('legacy-large-0001', { parentId: 'other-source' })).status, 409); });
      for (const mode of ['missing', 'deleted', 'other-owner', 'wrong-provenance', 'ambiguous', 'unknown']) {
        await check(mode + '-does-not-resubmit-or-guess', async () => {
          const key = 'case-' + mode + '-0001', op = await insertOperation(key, mode === 'unknown' ? { state: 'hold' } : {});
          if (mode !== 'missing') await insertArtwork(op, 'art-' + key, { deleted: mode === 'deleted', owner: mode === 'other-owner' ? 'other@example.test' : undefined, provenance: mode === 'wrong-provenance' ? { ref: 'unrelated' } : {} });
          if (mode === 'ambiguous') await insertArtwork(op, 'art-second-' + key);
          assert.equal((await replay(key)).status, 409);
        });
      }
      await check('checkpoint-id-never-selects-neighbor', async () => { const op = await insertOperation('wrong-id-0001', { receipt: { receipt: 'cutout-artwork-v1', id: 'missing' } }); await insertArtwork(op); assert.equal((await replay('wrong-id-0001')).status, 409); });
      await check('real-cutout-route-keeps-receipt-before-wallet', async () => {
        const png = await require('sharp')({ create: { width: 8, height: 8, channels: 4, background: { r: 100, g: 120, b: 140, alpha: 0.5 } } }).png().toBuffer();
        Object.assign(fixtures['@/lib/db'], {
          reserveCredits: async () => true, refundCredits: async () => {}, getUser: async () => ({ email: state.owner }),
          addArtworks: async (_email, items) => {
            if (state.failArtwork) throw Error('fixture-artwork-write-failed');
            await insertArtwork(sync.currentSynchronousBilling().id, items[0].id, { image: items[0].image });
          }, addLedgerEntry: async () => {
            const op = sync.currentSynchronousBilling().id;
            assert.equal((await pool.query('SELECT result_response FROM app_billing_operations WHERE id=$1', [op])).rows[0].result_response.receipt, 'cutout-artwork-v1');
            await sync.settleSynchronous('fixture-cutout');
          },
        });
        Object.assign(fixtures, {
          '@/lib/imagegen/context': { currentImagegenStep: () => null },
          '@/lib/imagegen/postprocess': { inspectImagegenPixels: async () => ({ transparentPixels: 1, visiblePixels: 1 }) },
          '@/lib/supplier-cost/collect': {},
          '@/lib/model-config/clients': { modelAwareOpenAI: () => ({ images: { edit: async () => { state.mockSupplierCalls = (state.mockSupplierCalls || 0) + 1; sync.markBillingUpstream('succeeded'); return { data: [{ b64_json: png.toString('base64') }] }; } } }) },
          '@/lib/bi/model-observer': { observeOpenAI: x => x, withBiRequest: (_r, action) => action() },
          'next/server': { NextResponse: { json:(value,options)=>json(value,options?.status||200) } }, '@/lib/ip': { clientIp: () => '' },
          '@/lib/storage': { storageEnabled: false }, '@/lib/settings': { getCutoutSettings: async () => ({ backend: 'openai' }), getOpenAISettings: async () => ({ apiKey: 'local-fixture-not-a-key' }) },
          '@/lib/openai-base': { getOpenAIBaseUrl: async () => null }, '@/lib/api-error': { safeError: (_e,message)=>message },
        });
        Object.assign(fixtures,{
          '@/lib/billing/legacy-credit-reservation':fixtures['@/lib/db'],
          '@/lib/billing/legacy-ledger':fixtures['@/lib/db'],
          '@/lib/accounts/session':fixtures['@/lib/db'],
          '@/lib/artworks/writer':fixtures['@/lib/db'],
          '@/lib/object-storage/runtime':fixtures['@/lib/storage'],
          '@/lib/bi/request':fixtures['@/lib/bi/model-observer'],
          '@/lib/bi/model-calls':fixtures['@/lib/bi/model-observer'],
          '@/lib/media-upload':{uploadImage:()=>{throw Error('STORAGE_NOT_USED');}},
        });
        const route = load('src/app/api/cutout/route.ts');
        const req = key => { const f = new FormData(); f.set('image', new File([png], 'input.png', { type: 'image/png' })); f.set('email', state.owner); return new Request('http://fixture.local/api/cutout', { method: 'POST', headers: { 'x-naumi-billing-operation-id': key }, body: f }); };
        const first = await route.POST(req('route-cutout-0001')); if(first.status!==200)console.error('CUTOUT_ROUTE_FIXTURE_RESPONSE='+JSON.stringify(await first.clone().json()));assert.equal(first.status, 200); assert.ok((await first.json()).id);
        const row = (await pool.query('SELECT * FROM app_billing_operations WHERE id=$1', ['tool-route-cutout-0001'])).rows[0];
        assert.equal(row.state, 'settled'); assert.equal(row.result_response.receipt, 'cutout-artwork-v1');
        state.route = route; state.routeRequest = req;
      });
      await check('real-cutout-artwork-save-failure-does-not-settle', async () => {
        state.failArtwork = true; const before = state.settles;
        const result = await state.route.POST(state.routeRequest('failed-save-0001')); assert.equal(result.status, 500);
        const row = (await pool.query('SELECT * FROM app_billing_operations WHERE id=$1', ['tool-failed-save-0001'])).rows[0];
        assert.equal(row.state, 'hold'); assert.equal(row.result_response, null); assert.equal(state.settles, before);
        delete state.route; delete state.routeRequest; delete state.failArtwork;
      });
      await check('zero-real-supplier-and-no-replay-settlement', async () => { assert.equal(state.actions, 0); assert.equal(state.supplierCalls, 0); assert.equal(state.settles, 2); });
    }
    const literal = `CUTOUT_RECEIPT=${baseline ? 'REPRODUCED' : 'PASS'} CASES=${checks.length} SUPPLIER_CALLS=0 REPLAY_SETTLEMENTS=0 EXIT=${baseline ? 1 : 0}`;
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ source, baseline, checks, state, loaded, literal }, null, 2));
    console.log(literal); process.exitCode = baseline ? 1 : 0;
  } finally { await pool.query('DROP SCHEMA ' + schema + ' CASCADE'); await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 2; });
