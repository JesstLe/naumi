// Complete production TS modules + real isolated PostgreSQL; no extracted/replaced business logic.
// The baseline mode is an expected exit 1 only after semantic checks pass AND the actual plan reproduces amplification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, randomUUID } = require('node:crypto');
const ts = require('typescript');
const { Pool } = require('pg');

const runnerRoot = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function option(name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  assert.ok(argv[i + 1] && !argv[i + 1].startsWith('--'), `${name} needs a path`);
  assert.ok(path.isAbsolute(argv[i + 1]), `${name} must be absolute`);
  return path.resolve(argv[i + 1]);
}
const sourceRoot = option('--source-root', runnerRoot);
const outputRoot = option('--output-root', path.join(runnerRoot, 'output/admin-usage-skew'));
const baseline = argv.includes('--baseline');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--source-root' || argv[i] === '--output-root') { i++; continue; }
  assert.equal(argv[i], '--baseline', `Unknown option ${argv[i]}`);
}
const report = {
  result: 'RUNNING', mode: baseline ? 'baseline' : 'modified', sourceRoot, outputRoot,
  sourceModules: [], checks: [], semanticResults: {}, realPostgres: true,
  externalNetworkCalls: 0, supplierCalls: 0, productionWrites: 0, fixtureSchemaDropped: false,
};
const cache = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(outputRoot, name), JSON.stringify(value, null, 2) + '\n');
const explicitPoolOnly = { getPool() { throw new Error('Unexpected nested database checkout'); } };
const explicitSchemaOnly = { ensureBiSchema() { throw new Error('Unexpected production schema initialization'); } };
function assertReadOnlySql(sql) {
  assert.match(String(sql), /^(SELECT|WITH)\b/i, 'Analytics module remains query-only');
  const withoutLiterals = String(sql).replace(/'(?:''|[^'])*'/g, "''");
  assert.doesNotMatch(withoutLiterals, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|GRANT|REVOKE|CALL|DO)\b/i, 'Analytics cannot mutate business or schema state');
}

// pg uses its explicit loopback socket; all application HTTP routes are disabled in this runner.
globalThis.fetch = async () => { report.externalNetworkCalls++; throw new Error('Unexpected application fetch'); };
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  mod.request = mod.get = () => { report.externalNetworkCalls++; throw new Error('Unexpected application HTTP'); };
}
function load(relative) {
  const filename = path.resolve(sourceRoot, relative);
  assert.ok(filename.startsWith(sourceRoot + path.sep), 'Module must remain in the selected source root');
  if (cache.has(filename)) return cache.get(filename).exports;
  const bytes = fs.readFileSync(filename), loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  report.sourceModules.push({ path: filename, relativePath: relative, sha256: digest(bytes) });
  const code = ts.transpileModule(bytes.toString('utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const req = name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/db' || name === '@/platform/db/pool') return explicitPoolOnly;
    if (name === './repository' || name === './schema') return explicitSchemaOnly;
    if (name === './usage-contracts') return load('src/lib/bi/usage-contracts.ts');
    if (name === '@/lib/billing/consumption-read') return load('src/lib/billing/consumption-read.ts');
    throw new Error(`Unexpected application import ${name}`);
  };
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInThisContext()(req, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
async function check(name, work) {
  await work(); report.checks.push(name); console.log('PASS ' + name);
}
function semantic(value) { const { generatedAt, ...rest } = value; return rest; }
function nodes(plan) {
  const output = [];
  const visit = n => { if (!n || typeof n !== 'object') return; if (n['Node Type']) output.push(n); for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v); } };
  visit(plan); return output;
}

async function run() {
  fs.mkdirSync(outputRoot, { recursive: true });
  assert.ok(!fs.existsSync(path.join(outputRoot, 'RESULT.json')), 'Use a new output root; prior evidence is immutable');
  const rawUrl = process.env.ADMIN_USAGE_FIXTURE_DATABASE_URL || '';
  const url = new URL(rawUrl);
  assert.ok(url.protocol === 'postgres:' || url.protocol === 'postgresql:', 'A PostgreSQL fixture URL is required');
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'Only an explicit loopback fixture is permitted');
  assert.equal(decodeURIComponent(url.pathname), '/usage_fixture', 'Fixture database must be usage_fixture');
  assert.equal(url.search, '', 'Connection-string query overrides are not permitted');
  const pool = new Pool({ connectionString: rawUrl, max: 1, connectionTimeoutMillis: 5000, application_name: 'verify-admin-usage-skew' });
  let tx, schemaCreated = false;
  const schema = 'usage_skew_' + randomUUID().replaceAll('-', '');
  try {
    tx = await pool.connect();
    assert.equal((await tx.query('SELECT current_database() AS name')).rows[0].name, 'usage_fixture');
    await tx.query(`CREATE SCHEMA ${schema}`); schemaCreated = true;
    await tx.query(`SET search_path=${schema}; SET statement_timeout='30s'; SET lock_timeout='2s'`);
    await tx.query(`
      CREATE TABLE app_users(email text PRIMARY KEY,name text NOT NULL,role text NOT NULL);
      CREATE TABLE app_account_teams(id uuid PRIMARY KEY,name text,owner_email text);
      CREATE TABLE app_enterprise_members(email text UNIQUE,enterprise_id uuid);
      CREATE TABLE app_account_team_members(email text UNIQUE,team_id uuid);
      CREATE TABLE app_bi_account_profiles(email text PRIMARY KEY);
      CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,created_at timestamptz,payload jsonb,snapshot jsonb);
      CREATE INDEX jobs_owner_kind_time ON app_image_jobs(email,kind,created_at DESC);
      CREATE TABLE app_canvas_image_tasks(id text PRIMARY KEY,email text,created_at timestamptz,result_artwork_id text);
      CREATE INDEX canvas_result ON app_canvas_image_tasks(email,result_artwork_id);
      CREATE TABLE app_video_tasks(id text PRIMARY KEY,email text,created_at timestamptz,artwork_id text);
      CREATE INDEX video_result ON app_video_tasks(email,artwork_id);
      CREATE TABLE app_artworks(id text PRIMARY KEY,email text,created_at timestamptz,status text,image_url text,video_url text,deleted_at timestamptz,source_url text,template_id text,batch_id text,creation_provenance jsonb);
      CREATE INDEX works_owner_time ON app_artworks(email,created_at DESC);
      CREATE TABLE app_ledger(id text PRIMARY KEY,email text,created_at timestamptz,kind text,delta bigint,reason text NOT NULL DEFAULT '生成');
      CREATE INDEX ledger_owner_time ON app_ledger(email,created_at);
      CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,ledger_id text);
      CREATE TABLE app_bi_model_calls(id text PRIMARY KEY,email text,created_at timestamptz,input_tokens integer,output_tokens integer);
      CREATE INDEX model_owner_time ON app_bi_model_calls(email,created_at DESC);
      CREATE TABLE app_creation_records(id text PRIMARY KEY,actor_email text,source_kind text,source_id text,parent_id text);
      CREATE UNIQUE INDEX creation_source ON app_creation_records(source_kind,source_id,actor_email);
      CREATE INDEX creation_parent ON app_creation_records(parent_id);
    `);
    const { parseUsageQuery } = load('src/lib/bi/usage-contracts.ts');
    const { readUserUsage } = load('src/lib/bi/usage-repository.ts');
    const A = 'edge@usage.fixture', B = 'foreign@usage.fixture', S = 'skew@usage.fixture', O = 'owner@usage.fixture', Z = 'zero@usage.fixture';
    const tenant = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
    const from = '2026-10-28', to = '2026-10-29';
    const day1 = '2026-10-27T16:00:00Z', day2 = '2026-10-28T16:00:00Z', before = '2026-10-26T00:00:00Z', end = '2026-10-29T16:00:00Z';
    const query = more => parseUsageQuery(new URLSearchParams({ from, to, sort: 'tasks', size: '100', ...more }));
    const scope = emails => ({ allowedEmails: emails, tenantId: tenant, tenantName: 'Fixture enterprise' });
    const reader = { query(sql, values) { assertReadOnlySql(sql); return tx.query(sql, values); } };
    const read = (more = {}, allowed) => readUserUsage(reader, query(more), allowed);
    await check('EXPLICIT_READ_PORTS_DENY_CHECKOUT_SCHEMA_AND_BUSINESS_WRITES', async () => {
      assert.throws(() => explicitPoolOnly.getPool(), /Unexpected nested database checkout/);
      assert.throws(() => explicitSchemaOnly.ensureBiSchema(), /Unexpected production schema initialization/);
      assert.throws(() => assertReadOnlySql('CREATE TABLE forbidden(id text)'), /query-only/);
      assert.throws(() => assertReadOnlySql('WITH forbidden AS (DELETE FROM app_ledger RETURNING id) SELECT * FROM forbidden'), /cannot mutate/);
      if (!baseline) assert.ok(report.sourceModules.some(module => module.relativePath === 'src/lib/billing/consumption-read.ts'), 'Actual shared helper must be source-hashed, never mocked');
    });
    await tx.query("INSERT INTO app_users SELECT unnest($1::text[]),unnest($2::text[]),'user'", [[A, B, S, O, Z], ['Edge', 'Foreign', 'Skew', 'Owner', 'Zero']]);
    await tx.query('INSERT INTO app_account_teams VALUES($1,$2,$3),($4,$5,$6)', [tenant, 'Fixture enterprise', O, other, 'Other enterprise', B]);
    await tx.query('INSERT INTO app_enterprise_members SELECT unnest($1::text[]),$2::uuid', [[A, S, Z], tenant]);
    const addJob = (id, email, kind, at, children) => tx.query('INSERT INTO app_image_jobs VALUES($1,$2,$3,$4,$5,$6)', [id, email, kind, at, { image: 'PRIVATE_PAYLOAD_NOT_FOR_ANALYTICS'.repeat(200) }, children === undefined ? {} : { children }]);
    await addJob('imagegen-current', A, 'imagegen', day1, { one: { jobId: 'job-edge-child' }, duplicate: { jobId: 'job-edge-child' }, foreign: { jobId: 'job-foreign-child' } });
    await addJob('imagegen-duplicate-old', A, 'imagegen', before, { duplicate: { jobId: 'job-edge-child' } });
    await addJob('imagegen-cross-old', A, 'imagegen', before, { one: { jobId: 'job-cross-child' } });
    await addJob('imagegen-known-old', A, 'imagegen', before, { one: { jobId: 'job-known-child' } });
    await addJob('imagegen-foreign-old', B, 'imagegen', before, { wrong: { jobId: 'job-edge-orphan' } });
    await addJob('imagegen-future', A, 'imagegen', end, { tooLate: { jobId: 'job-boundary-orphan' } });
    for (const [i, value] of [[], null, 'not-an-object', 7, {}, { null: null, scalar: 'x', missing: { noJobId: 'x' } }].entries()) {
      await addJob('imagegen-malformed-' + i, A, 'imagegen', before, value);
    }
    for (const id of ['job-edge-child', 'job-cross-child', 'job-known-child', 'job-edge-orphan', 'job-boundary-orphan']) await addJob(id, A, 'generate', day1);
    await addJob('job-foreign-child', B, 'generate', day1);
    await addJob('job-outside-end', A, 'generate', end);
    await tx.query("INSERT INTO app_creation_records VALUES('known-parent',$1,'image:imagegen','imagegen-known-old',NULL),('known-child',$1,'image:generate','job-known-child','known-parent')", [A]);
    await tx.query('INSERT INTO app_canvas_image_tasks VALUES($1,$2,$3,NULL)', ['canvas-edge', A, day1]);
    await tx.query('INSERT INTO app_video_tasks VALUES($1,$2,$3,$4)', ['video-edge', A, day2, 'art-video']);
    const artwork = (id, email, source, batch, provenance = null, deleted = null) => tx.query('INSERT INTO app_artworks VALUES($1,$2,$3,\'completed\',\'/media/fixture.png\',\'\',$4,$5,NULL,$6,$7)', [id, email, day1, deleted, source, batch, provenance]);
    await artwork('art-generated', A, null, 'b-job-edge-child');
    await artwork('art-provenance', A, null, null, { version: 1, operation: 'generate', evidence: 'fixture-proof', ref: 'job-known-child' }, day2);
    await artwork('art-upload', A, 'upload', null);
    await artwork('art-copy', A, null, null, { version: 1, operation: 'copy', evidence: 'fixture-copy' });
    await artwork('art-unattributed', A, null, null);
    await artwork('art-foreign', B, null, 'b-job-edge-child');
    await artwork('art-video', A, null, null);
    await tx.query("INSERT INTO app_ledger VALUES('charge-a',$1,$2,'consume',-12,'生成'),('charge-b',$1,$2,'consume',-6,'生成'),('refund-a',$1,$3,'refund',3,'退款'),('admin',$1,$2,'consume',-100,'运营调账'),('foreign-charge',$4,$2,'consume',-2,'生成')", [A, day1, day2, B]);
    await tx.query("INSERT INTO app_billing_operations VALUES('adjust-op',$1,'credits.adjust','admin')", [A]);
    await tx.query("INSERT INTO app_bi_model_calls VALUES('recorded',$1,$2,10,4),('missing',$1,$2,NULL,NULL),('zero',$3,$2,0,0)", [A, day1, B]);

    const edge = await read(); report.semanticResults.edge = semantic(edge);
    await check('LOGICAL_TASKS_CROSS_WINDOW_DUPLICATES_MALFORMED_AND_FOREIGN_OWNER', async () => {
      assert.equal(edge.summary.tasks, 6); assert.equal(edge.users.find(u => u.email === A).tasks, 5); assert.equal(edge.users.find(u => u.email === B).tasks, 1);
      assert.deepEqual(edge.daily.map(d => d.tasks), [5, 1]); assert.equal(edge.summary.activeDays, 3);
    });
    await check('ARTWORK_LEDGER_TOKENS_AND_SOURCE_COVERAGE_UNCHANGED', async () => {
      assert.equal(edge.summary.delivered, 3); assert.equal(edge.summary.storedArtworks, 7); assert.equal(edge.summary.uploads, 1); assert.equal(edge.summary.imports, 1);
      assert.equal(edge.summary.unattributedArtworks, 2); assert.equal(edge.summary.deletedArtworks, 1);
      assert.equal(edge.summary.consumed, 20); assert.equal(edge.summary.refunded, 3); assert.equal(edge.summary.administrativeDebits, 100);
      assert.equal(edge.summary.modelCalls, 3); assert.equal(edge.summary.inputTokens, 10); assert.equal(edge.summary.outputTokens, 4); assert.equal(edge.summary.tokenSamples, 2);
      assert.equal(edge.coverage.sources.filter(s => s.available).length, 6); assert.ok(!JSON.stringify(edge).includes('PRIVATE_PAYLOAD_NOT_FOR_ANALYTICS'));
    });
    await check('PAGINATION_RETAINS_FULL_AGGREGATE', async () => {
      const first = await read({ size: '1' }); const second = await read({ size: '1', page: '2' });
      assert.equal(first.total, 5); assert.equal(first.users.length, 1); assert.equal(first.users[0].email, A); assert.equal(second.users[0].email, B);
      assert.deepEqual(first.summary, edge.summary); assert.deepEqual(second.summary, edge.summary);
      report.semanticResults.page1 = semantic(first); report.semanticResults.page2 = semantic(second);
    });
    await check('ENTERPRISE_ALLOWLIST_EMPTY_SCOPE_AND_IDENTITY_REJECTIONS', async () => {
      const own = await read({ tenantId: tenant }, scope([A])); assert.equal(own.total, 1); assert.equal(own.summary.tasks, 5); assert.equal(own.summary.consumed, 18);
      const empty = await read({ tenantId: tenant }, scope([])); assert.equal(empty.total, 0); assert.equal(empty.summary.tasks, 0); assert.equal(empty.summary.consumed, 0);
      await assert.rejects(read({ email: B }, scope([A])), /所选账号/); await assert.rejects(read({ tenantId: other }, scope([A])), /所选企业/);
      report.semanticResults.scope = semantic(own); report.semanticResults.emptyScope = semantic(empty);
    });
    await check('EXPLICIT_TENANT_AND_SINGLE_USER_FILTERS', async () => {
      const own = await read({ tenantId: tenant }); assert.equal(own.summary.tasks, 5); assert.equal(own.summary.consumed, 18); assert.equal(own.total, 4);
      const foreign = await read({ email: B }); assert.equal(foreign.total, 1); assert.equal(foreign.summary.tasks, 1); assert.equal(foreign.summary.delivered, 0);
      report.semanticResults.tenant = semantic(own); report.semanticResults.foreign = semantic(foreign);
    });

    // Concentrated legacy distribution: 1,600 parents + children under ONE account, unlike evenly spread scale fixtures.
    const count = 1600, known = 400;
    await tx.query(`INSERT INTO app_image_jobs
      SELECT 'imagegen-skew-'||i,$1,'imagegen',CASE WHEN i<=$2/2 THEN $3::timestamptz ELSE $4::timestamptz END,'{}'::jsonb,
        jsonb_build_object('children',jsonb_build_object('step',jsonb_build_object('jobId','job-skew-'||i))) FROM generate_series(1,$2::int)i`, [S, count, before, day1]);
    await tx.query(`INSERT INTO app_image_jobs SELECT 'job-skew-'||i,$1,'generate',$2::timestamptz,'{}'::jsonb,'{}'::jsonb FROM generate_series(1,$3::int)i`, [S, day1, count]);
    await addJob('job-skew-orphan', S, 'generate', day1);
    await tx.query(`INSERT INTO app_creation_records SELECT 'known-skew-parent-'||i,$1,'image:imagegen','imagegen-skew-'||i,NULL FROM generate_series(1,$2::int)i`, [S, known]);
    await tx.query(`INSERT INTO app_creation_records SELECT 'known-skew-child-'||i,$1,'image:generate','job-skew-'||i,'known-skew-parent-'||i FROM generate_series(1,$2::int)i`, [S, known]);
    await tx.query(`INSERT INTO app_artworks SELECT 'art-skew-'||i,$1,$2::timestamptz,'completed','/media/skew.png','',NULL,NULL,NULL,'b-job-skew-'||i,NULL FROM generate_series(1,$3::int)i`, [S, day1, count]);
    await tx.query(`INSERT INTO app_ledger SELECT 'ledger-skew-'||i,$1,$2::timestamptz,'consume',-6,'生成' FROM generate_series(1,$3::int)i`, [S, day1, count]);
    await tx.query(`INSERT INTO app_bi_model_calls SELECT 'calls-skew-'||i,$1,$2::timestamptz,100,20 FROM generate_series(1,$3::int)i`, [S, day1, count]);
    for (const table of ['app_users', 'app_account_teams', 'app_enterprise_members', 'app_account_team_members', 'app_image_jobs', 'app_canvas_image_tasks', 'app_video_tasks', 'app_artworks', 'app_ledger', 'app_billing_operations', 'app_bi_model_calls', 'app_creation_records']) await tx.query('ANALYZE ' + table);
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let statement, values;
    const capture = { query(sql, params) { if (String(sql).startsWith('WITH tenancy')) { statement = sql; values = params; } return reader.query(sql, params); } };
    const started = performance.now();
    const skew = await readUserUsage(capture, query({ tenantId: tenant }), scope([S]));
    const durationMs = Math.round(performance.now() - started);
    report.semanticResults.skew = semantic(skew);
    await check('SKEW_REAL_RESULT_PRESERVES_KNOWN_AND_CROSS_WINDOW_LEGACY_DEDUP', async () => {
      assert.equal(skew.total, 1); assert.equal(skew.summary.tasks, count / 2 + 1); assert.equal(skew.summary.delivered, count);
      assert.equal(skew.summary.consumed, count * 6); assert.equal(skew.summary.modelCalls, count);
      assert.equal(skew.summary.inputTokens, count * 100); assert.equal(skew.summary.outputTokens, count * 20);
      assert.equal(skew.users[0].email, S); assert.ok(statement && Array.isArray(values));
    });
    const plan = (await tx.query('EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) ' + statement, values)).rows[0]['QUERY PLAN'];
    await tx.query('ROLLBACK');
    save('PLAN.json', plan);
    save('SEMANTIC.json', report.semanticResults);
    const allNodes = nodes(plan), functions = allNodes.filter(n => n['Node Type'] === 'Function Scan' && n['Function Name'] === 'jsonb_each');
    assert.ok(functions.length > 0, 'The actual execution plan must include the legacy JSON expansion');
    const loops = functions.reduce((n, item) => n + Number(item['Actual Loops']), 0);
    assert.ok(Number.isFinite(loops) && loops > 0, 'Actual plan loop count is required');
    const bound = count * 2;
    report.plan = { queryMs: durationMs, executionMs: plan[0]['Execution Time'], parentCount: count, childCount: count + 1, knownChildCount: known, jsonEachLoops: loops, boundedLoops: bound, amplification: loops / count, totalCost: plan[0].Plan['Total Cost'] };
    report.semanticSha256 = digest(JSON.stringify(report.semanticResults));
    report.querySha256 = digest(statement);
    await check(baseline ? 'BASELINE_ACTUAL_PLAN_REPRODUCES_SUPERLINEAR_EXPANSION' : 'MODIFIED_ACTUAL_PLAN_EXPANDS_EACH_PARENT_ONCE', async () => {
      if (baseline) assert.ok(loops > count * 20, `Baseline must reproduce the defect, got ${loops} loops for ${count} parents`);
      else assert.ok(loops <= bound, `Repeated JSON expansion: ${loops} loops exceeds ${bound}`);
    });
    await check('LOADED_MODULE_BYTES_STABLE_AND_NO_EXTERNAL_CALLS', async () => {
      for (const loadedModule of report.sourceModules) assert.equal(digest(fs.readFileSync(loadedModule.path)), loadedModule.sha256, 'Loaded module changed during test');
      assert.equal(report.externalNetworkCalls, 0); assert.equal(report.supplierCalls, 0);
    });
    report.result = baseline ? 'REPRODUCED' : 'PASS'; report.exit = baseline ? 1 : 0;
  } finally {
    if (tx) {
      try {
        await tx.query('ROLLBACK');
        if (schemaCreated) { await tx.query(`DROP SCHEMA ${schema} CASCADE`); report.fixtureSchemaDropped = true; }
      } finally { tx.release(); }
    }
    await pool.end();
  }
  assert.equal(report.fixtureSchemaDropped, true);
  save('RESULT.json', report);
  const line = `ADMIN_USAGE_SKEW=${report.result} CHECKS=${report.checks.length} JSON_EACH_LOOPS=${report.plan.jsonEachLoops} PARENTS=${report.plan.parentCount} REAL_SQL=1 SUPPLIER_CALLS=0 EXTERNAL=0 EXIT=${report.exit}`;
  fs.writeFileSync(path.join(outputRoot, 'stdout.txt'), line + '\n'); console.log(line); process.exitCode = report.exit;
}
run().catch(error => {
  report.result = 'FAIL'; report.exit = 2; report.error = error.stack;
  fs.mkdirSync(outputRoot, { recursive: true }); save('FAILURE.json', report);
  console.error(error.stack); process.exitCode = 2;
});
