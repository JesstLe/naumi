// Executes the complete TypeScript analytics modules against isolated PostgreSQL.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), { Pool } = require('pg'), { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), out = path.resolve(process.argv[2] || process.env.ADMIN_USER_USAGE_EVIDENCE || 'output/admin-usage-pg');
const url = process.env.ADMIN_USAGE_FIXTURE_DATABASE_URL || process.env.DATABASE_URL || '';
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.ok(process.env.ADMIN_USAGE_FIXTURE_DATABASE_URL || process.env.NAUMI_VERIFY_ISOLATED_DB === '1', 'Explicit isolated fixture required');
const checks = [], loaded = [], cache = new Map();
const scale = process.argv.includes('--scale');
function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative), key = filename;
  if (cache.has(key)) return cache.get(key).exports;
  const source = fs.readFileSync(filename, 'utf8'), module = { exports: {} }; cache.set(key, module);
  loaded.push({ path: filename, sha256: createHash('sha256').update(source).digest('hex') });
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === 'server-only') return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')), mocks);
    if (name === '@/lib/db' || name === '@/platform/db/pool') return { getPool() { throw new Error('Only explicit test client is allowed'); } };
    if (name === '@/platform/db/owned-read-client') return load('src/platform/db/owned-read-client.ts');
    if (name === './repository' || name === './schema') return { ensureBiSchema() { throw new Error('Test SQL schema is explicit'); } };
    return require(name);
  };
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInThisContext()(localRequire, module, module.exports);
  return module.exports;
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const pool = new Pool({ connectionString: url, max: 1 }), tx = await pool.connect();
  const schema = 'usage_' + randomUUID().replaceAll('-', '');
  try {
    await tx.query(`CREATE SCHEMA ${schema}; SET search_path=${schema}`);
    await tx.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text NOT NULL,role text NOT NULL);
      CREATE TABLE app_account_teams(id uuid PRIMARY KEY,name text,owner_email text);
      CREATE TABLE app_enterprise_members(email text UNIQUE,enterprise_id uuid);
      CREATE TABLE app_account_team_members(email text UNIQUE,team_id uuid);
      CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text,kind text,created_at timestamptz,payload jsonb,snapshot jsonb);
      CREATE INDEX jobs_owner_time ON app_image_jobs(email,created_at);
      CREATE TABLE app_canvas_image_tasks(id text PRIMARY KEY,email text,created_at timestamptz,result_artwork_id text);
      CREATE INDEX canvas_result ON app_canvas_image_tasks(email,result_artwork_id);
      CREATE TABLE app_video_tasks(id text PRIMARY KEY,email text,created_at timestamptz,artwork_id text);
      CREATE INDEX video_result ON app_video_tasks(email,artwork_id);
      CREATE TABLE app_artworks(id text PRIMARY KEY,email text,created_at timestamptz,status text,image_url text,video_url text,deleted_at timestamptz,source_url text,template_id text,batch_id text,creation_provenance jsonb);
      CREATE INDEX works_owner_time ON app_artworks(email,created_at);
      CREATE TABLE app_ledger(id text PRIMARY KEY,email text,created_at timestamptz,kind text,delta bigint,reason text NOT NULL DEFAULT '生成');
      CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,feature text,ledger_id text);
      CREATE INDEX ledger_owner_time ON app_ledger(email,created_at);
      CREATE TABLE app_bi_model_calls(id text PRIMARY KEY,email text,created_at timestamptz,input_tokens integer,output_tokens integer);
      CREATE TABLE app_creation_records(id text PRIMARY KEY,actor_email text,source_kind text,source_id text,parent_id text);
      CREATE INDEX creation_source ON app_creation_records(actor_email,source_kind,source_id);`);
    const { parseUsageQuery } = load('src/lib/bi/usage-contracts.ts');
    const { readUserUsage } = load('src/lib/bi/usage-repository.ts', { './schema': { ensureBiSchema: async () => {} } });
    const query = extra => parseUsageQuery(new URLSearchParams({ from: '2026-10-28', to: '2026-10-29', ...extra }));
    const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
    await check('DATE_VALIDATION_AND_BJT_EXCLUSIVE_END', async () => {
      assert.equal(query().start, '2026-10-28T00:00:00+08:00'); assert.equal(query().end, '2026-10-30T00:00:00+08:00');
      for (const extra of [{ from: '2026-02-30' }, { to: '2026-10-27' }, { from: '2020-01-01' }, { sort: 'failures' }, { page: '0' }, { tenantId: 'not-a-uuid' }]) assert.throws(() => query(extra));
    });
    const A = 'a@example.test', B = 'b@example.test', owner = 'owner@example.test';
    const tenant = randomUUID(), other = randomUUID();
    await tx.query("INSERT INTO app_users VALUES($1,'花名A','user'),($2,'花名B','user'),($3,'老板','user'),('zero@example.test','零使用','user')", [A, B, owner]);
    await tx.query("INSERT INTO app_account_teams VALUES($1,'企业A',$2),($3,'企业B','other-owner@example.test')", [tenant, owner, other]);
    await tx.query('INSERT INTO app_enterprise_members VALUES($1,$2),($3,$4)', [A, tenant, B, other]);
    await check('EMPTY_HISTORY_HAS_NULL_TOKENS_AND_EFFICIENCY', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.total, 4); assert.equal(r.summary.tasks, 0); assert.equal(r.summary.inputTokens, null); assert.equal(r.summary.deliveriesPerActiveDay, null);
    });
    const d1 = '2026-10-27T16:00:00Z', d2 = '2026-10-28T16:00:00Z';
    const addJob = (id, email, kind, at, payload = {}) => tx.query('INSERT INTO app_image_jobs VALUES($1,$2,$3,$4,$5,$6)', [id, email, kind, at, payload, kind === 'imagegen' ? { children: { first: { jobId: 'job-child' } } } : {}]);
    const op = randomUUID();
    await addJob('imagegen-' + op, A, 'imagegen', d1);
    await addJob('job-child', A, 'generate', d1, { p: { imagegen: { request: { operationId: op } } } });
    await addJob('job-other-owner', B, 'generate', d1, { p: { imagegen: { request: { operationId: op } } } });
    await addJob('legacy-job', A, 'generate', d2);
    await addJob('legacy-child', A, 'generate', d2);
    await tx.query("INSERT INTO app_creation_records VALUES('parent',$1,'image:imagegen',$2,NULL),('child',$1,'image:generate','legacy-child','parent')", [A, 'imagegen-' + op]);
    await addJob('outside-end', A, 'generate', '2026-10-29T16:00:00Z');
    await tx.query('INSERT INTO app_canvas_image_tasks VALUES($1,$2,$3,$4)', ['canvas-1', A, d1, 'canvas-output']);
    await tx.query('INSERT INTO app_video_tasks VALUES($1,$2,$3,$4)', ['video-1', A, d2, 'video-output']);
    async function artwork(id, email, options = {}) {
      const row = { at: d1, status: 'completed', image: '/media/local.png', video: '', deleted: null, source: null, template: null, batch: null, provenance: null, ...options };
      await tx.query('INSERT INTO app_artworks VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, email, row.at, row.status, row.image, row.video, row.deleted, row.source, row.template, row.batch, row.provenance]);
    }
    await artwork('gen-a', A, { batch: 'b-job-child' });
    await artwork('gen-b', A, { provenance: { version: 1, operation: 'generate', evidence: 'stored-paid-checkpoint', ref: 'legacy-job' }, deleted: d2 });
    await artwork('canvas-output', A); await artwork('video-output', A, { at: d2, image: '', video: '/media/local.mp4' });
    await artwork('upload', A, { source: 'upload' });
    await artwork('copy', A, { provenance: { version: 1, operation: 'copy', evidence: 'server-route', ref: 'gen-a' } });
    await artwork('unknown', A); await artwork('wrong-owner', B, { batch: 'b-job-child' });
    await artwork('empty-image', A, { image: '' }); await artwork('unfinished', A, { status: 'pending' });
    await tx.query("INSERT INTO app_ledger(id,email,created_at,kind,delta) VALUES('c1',$1,$2,'consume',-10),('c2',$1,$2,'consume',-6),('r1',$1,$3,'refund',3),('grant',$1,$2,'grant',99999),('b1',$4,$2,'consume',-2)", [A, d1, d2, B]);
    await tx.query("INSERT INTO app_ledger VALUES('adjust1',$1,$2,'consume',-100,'管理员调整积分'),('adjust2',$1,$2,'consume',-50,'运营修订')", [A, d1]);
    await tx.query("INSERT INTO app_billing_operations VALUES('adjust-op',$1,'credits.adjust','adjust2')", [A]);
    await tx.query("INSERT INTO app_bi_model_calls VALUES('m1',$1,$2,10,5),('m2',$1,$2,NULL,NULL),('m3',$1,$3,0,0)", [A, d1, d2]);
    await check('LOGICAL_TASKS_EXCLUDE_EXACT_CHILD_KEEP_FOREIGN_OWNER', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.summary.tasks, 5); assert.equal(r.users.find(u => u.email === A).tasks, 4); assert.equal(r.users.find(u => u.email === B).tasks, 1);
    });
    await check('DELIVERED_UPLOAD_IMPORT_UNKNOWN_AND_DELETED_ARE_DISTINCT', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.summary.delivered, 4); assert.equal(r.summary.uploads, 1); assert.equal(r.summary.imports, 1); assert.equal(r.summary.unattributedArtworks, 2); assert.equal(r.summary.storedArtworks, 8); assert.equal(r.summary.deletedArtworks, 1);
    });
    await check('LEDGER_AGGREGATION_NOT_MULTIPLIED_AND_GRANT_NOT_CONSUMPTION', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.summary.consumed, 18); assert.equal(r.summary.refunded, 3); assert.equal(r.summary.netCredits, 15); assert.equal(r.summary.creditsPerDelivered, 4.5); assert.equal(r.summary.administrativeDebits, 150);
    });
    await check('ACTIVE_PERSON_DAYS_AND_BJT_DAILY_COHORT', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.summary.activeUsers, 2); assert.equal(r.summary.activeDays, 3); assert.equal(r.summary.deliveriesPerActiveDay, 4 / 3); assert.deepEqual(r.daily.map(x => x.date), ['2026-10-28', '2026-10-29']); assert.equal(r.daily[0].tasks, 3); assert.equal(r.daily[1].tasks, 2);
    });
    await check('TOKEN_COVERAGE_KEEPS_MISSING_NULL_AND_RECORDED_ZERO', async () => {
      const r = await readUserUsage(tx, query()); assert.equal(r.summary.modelCalls, 3); assert.equal(r.summary.tokenSamples, 2); assert.equal(r.summary.inputTokens, 10); assert.equal(r.summary.outputTokens, 5); assert.equal(r.users.find(u => u.email === B).inputTokens, null);
      const zero = await readUserUsage(tx, query({ from: '2026-10-29', email: A })); assert.equal(zero.summary.inputTokens, 0); assert.equal(zero.summary.tokenSamples, 1);
    });
    await check('PAGINATION_DOES_NOT_TRUNCATE_SUMMARY_AND_SORT_IS_ALLOWLISTED', async () => {
      const r = await readUserUsage(tx, query({ size: '1' })); assert.equal(r.users.length, 1); assert.equal(r.total, 4); assert.equal(r.summary.consumed, 18); assert.equal(r.users[0].email, A);
      const p2 = await readUserUsage(tx, query({ size: '1', page: '2' })); assert.equal(p2.users[0].email, B); assert.equal(p2.summary.consumed, 18);
    });
    await check('TENANT_AND_KEYWORD_FILTERS_REUSE_CURRENT_MEMBERSHIP', async () => {
      const r = await readUserUsage(tx, query({ tenantId: tenant })); assert.equal(r.summary.consumed, 16); assert.equal(r.total, 2);
      const q = await readUserUsage(tx, query({ q: '花名B' })); assert.equal(q.total, 1); assert.equal(q.summary.consumed, 2);
    });
    await check('ENTERPRISE_SERVER_ALLOWED_LIST_DENIES_OTHER_AND_EMPTY_IS_EMPTY', async () => {
      const scope = { allowedEmails: [A], tenantId: tenant, tenantName: '企业A' };
      const r = await readUserUsage(tx, query({ tenantId: tenant }), scope); assert.equal(r.total, 1); assert.equal(r.summary.consumed, 16); assert.deepEqual(r.tenants, [{ id: tenant, name: '企业A' }]);
      await assert.rejects(readUserUsage(tx, query({ email: B }), scope)); await assert.rejects(readUserUsage(tx, query({ tenantId: other }), scope));
      const empty = await readUserUsage(tx, query(), { ...scope, allowedEmails: [] }); assert.equal(empty.total, 0); assert.equal(empty.summary.tasks, 0);
    });
    await check('ORPHAN_HISTORICAL_ACCOUNT_REMAINS_READABLE_WITHOUT_INVENTED_IDENTITY', async () => {
      await tx.query("INSERT INTO app_ledger(id,email,created_at,kind,delta) VALUES('orphan','removed@example.test',$1,'consume',-7)", [d1]);
      const r = await readUserUsage(tx, query({ email: 'removed@example.test' })); assert.equal(r.total, 1); assert.equal(r.users[0].name, ''); assert.equal(r.users[0].role, 'unknown'); assert.equal(r.summary.consumed, 7);
    });
    await check('CROSS_WINDOW_PARENT_EXCLUDES_CHILD_WITHOUT_READING_LARGE_PAYLOAD', async () => {
      const old = randomUUID();
      await addJob('imagegen-' + old, A, 'imagegen', '2026-10-26T00:00:00Z');
      await tx.query('UPDATE app_image_jobs SET snapshot=$1 WHERE id=$2', [{ children: { step: { jobId: 'cross-window-child' } } }, 'imagegen-' + old]);
      await addJob('cross-window-child', A, 'generate', d1, { p: { images: [{ data: 'PRIVATE_IMAGE_SENTINEL'.repeat(20000) }] } });
      const observed = [], reader = { query(sql, values) { observed.push(String(sql)); return tx.query(sql, values); } };
      const r = await readUserUsage(reader, query({ email: A })); assert.equal(r.summary.tasks, 4);
      assert.ok(observed.every(sql => !/\bpayload\b/.test(sql))); assert.ok(!JSON.stringify(r).includes('PRIVATE_IMAGE_SENTINEL'));
      const statement = observed.find(sql => sql.startsWith('WITH tenancy')); assert.ok(statement && statement.includes("p.kind='imagegen'"));
    });
    await check('MISSING_OPTIONAL_TABLE_IS_REPORTED_NOT_FABRICATED', async () => {
      await tx.query('DROP TABLE app_bi_model_calls'); const r = await readUserUsage(tx, query());
      assert.equal(r.coverage.sources.find(s => s.key === 'modelCalls').available, false); assert.equal(r.summary.inputTokens, null);
    });
    let scaleEvidence;
    if (scale) await check('SCALE_20K_JOBS_20K_ARTWORKS_40K_CALLS_NO_CORRELATED_CTE_RESCAN', async () => {
      await tx.query("INSERT INTO app_users SELECT 'scale-'||i||'@example.test','规模用户'||i,'user' FROM generate_series(1,194)i");
      await tx.query("INSERT INTO app_enterprise_members SELECT 'scale-'||i||'@example.test',$1 FROM generate_series(1,194)i", [tenant]);
      await tx.query(`INSERT INTO app_image_jobs SELECT 'imagegen-scale-'||i,'scale-'||((i%194)+1)||'@example.test','imagegen',$1::timestamptz+(i%28)*interval '1 day','{}'::jsonb,
        jsonb_build_object('children',jsonb_build_object('step',jsonb_build_object('jobId','job-scale-child-'||i))) FROM generate_series(1,10000)i`, ['2026-09-30T00:00:00Z']);
      await tx.query(`INSERT INTO app_image_jobs SELECT 'job-scale-child-'||i,'scale-'||((i%194)+1)||'@example.test','generate',$1::timestamptz+(i%28)*interval '1 day',
        jsonb_build_object('p',jsonb_build_object('reference','PRIVATE_REFERENCE_BYTES_'||repeat('x',48000))),'{}'::jsonb FROM generate_series(1,10000)i`, ['2026-09-30T00:00:00Z']);
      await tx.query(`INSERT INTO app_creation_records SELECT 'scale-parent-'||i,'scale-'||((i%194)+1)||'@example.test','image:imagegen','imagegen-scale-'||i,NULL FROM generate_series(1,5000)i;
        INSERT INTO app_creation_records SELECT 'scale-child-'||i,'scale-'||((i%194)+1)||'@example.test','image:generate','job-scale-child-'||i,'scale-parent-'||i FROM generate_series(1,5000)i`);
      await tx.query(`INSERT INTO app_artworks SELECT 'scale-art-'||i,'scale-'||(((i-1)%10000+1)%194+1)||'@example.test',$1::timestamptz+(i%28)*interval '1 day','completed','/media/scale.png','',NULL,NULL,NULL,
        'b-job-scale-child-'||((i-1)%10000+1),NULL FROM generate_series(1,20000)i`, ['2026-09-30T00:00:00Z']);
      await tx.query(`INSERT INTO app_ledger SELECT 'scale-led-'||i,'scale-'||((i%194)+1)||'@example.test',$1::timestamptz+(i%28)*interval '1 day','consume',-6,'生成' FROM generate_series(1,12000)i;
      `.replace(/;\s*$/, ''), ['2026-09-30T00:00:00Z']);
      await tx.query(`INSERT INTO app_billing_operations SELECT 'scale-op-'||i,'scale-'||((i%194)+1)||'@example.test',CASE WHEN i%20=0 THEN 'credits.adjust' ELSE 'image.generate' END,'scale-led-'||i FROM generate_series(1,12000)i`);
      await tx.query(`CREATE TABLE app_bi_model_calls(id text PRIMARY KEY,email text,created_at timestamptz,input_tokens integer,output_tokens integer);
        INSERT INTO app_bi_model_calls SELECT 'scale-call-'||i,'scale-'||((i%194)+1)||'@example.test','2026-09-30'::timestamptz+(i%28)*interval '1 day',100,20 FROM generate_series(1,40000)i;
        ANALYZE; SET statement_timeout='10s'`);
      let statement, args;
      const reader = { query(sql, values) { if (String(sql).startsWith('WITH tenancy')) { statement=sql;args=values; } return tx.query(sql,values); } };
      const largeQuery = query({ from: '2026-09-30', size: '100' }), started = performance.now();
      const current = await readUserUsage(reader, largeQuery), elapsedMs = Math.round(performance.now()-started);
      assert.equal(current.summary.tasks, 10006); // Includes the separate old cross-window parent in the expanded date range.
      assert.equal(current.summary.delivered, 20004); assert.equal(current.summary.consumed, 68425); assert.equal(current.summary.modelCalls, 40000);
      const explain = (await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement,args)).rows[0]['QUERY PLAN'];
      const nodes=[];function walk(node){if(!node||typeof node!=='object')return;if(node['Node Type'])nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value)}}walk(explain);
      assert.ok(!nodes.some(n=>n['Node Type']==='CTE Scan'&&Number(n['Actual Loops'])>5),'No per-task scans over materialized link collections');
      const reportFactScans=nodes.filter(n=>n['CTE Name']==='facts').length;
      const reportBytes=Buffer.byteLength(JSON.stringify(current));
      const page = await readUserUsage(reader, largeQuery, undefined, 'export');
      assert.deepEqual(page, {users:current.users,total:current.total,page:current.page,size:current.size});
      assert.doesNotMatch(statement, /source_counts|generate_series| AS daily| AS summary/);
      const exportExplain=(await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement,args)).rows[0]['QUERY PLAN'];
      nodes.length=0;walk(exportExplain);
      const exportFactScans=nodes.filter(n=>n['CTE Name']==='facts').length;
      assert.equal(exportFactScans,1);
      assert.ok(reportFactScans>exportFactScans);
      for (const filters of [{page:'2'},{page:'99'},{sort:'modelCalls',tenantId:tenant},{sort:'tasks',q:'规模用户'}]) {
        const selected = {...largeQuery,...query({from:'2026-09-30',size:'100',...filters})};
        const expected=await readUserUsage(tx,selected), actual=await readUserUsage(tx,selected,undefined,'export');
        assert.deepEqual(actual,{users:expected.users,total:expected.total,page:expected.page,size:expected.size});
      }
      const allowed={allowedEmails:[A],tenantId:tenant,tenantName:'企业A'};
      const scopedPage=await readUserUsage(tx,largeQuery,allowed,'export');
      assert.deepEqual(scopedPage.users.map(u=>u.email),[A]);
      console.log('USAGE_EXPORT_FACT_SCANS='+reportFactScans+'->'+exportFactScans+' BYTES='+reportBytes+'->'+Buffer.byteLength(JSON.stringify(page)));
      const oldBundlePath=process.env.ADMIN_USAGE_BASELINE_BUNDLE;
      let baselinePlan=null;
      if(oldBundlePath){
        const bundle=JSON.parse(fs.readFileSync(oldBundlePath,'utf8')),modules={};
        function oldLoad(name){if(modules[name])return modules[name];const m={exports:{}};modules[name]=m.exports;const req=id=>id==='server-only'?{}:id==='./usage-contracts'?oldLoad('usage-contracts'):id==='./repository'?{}:id==='@/lib/db'?{}:require(id);new vm.Script(`(function(require,module,exports){${bundle[name]}\n})`).runInThisContext()(req,m,m.exports);return m.exports}
        const stop=new Error('PLAN_ONLY');
        try{await oldLoad('usage-repository').readUserUsage({query:async(sql,values)=>{if(String(sql).startsWith('WITH tenancy')){baselinePlan=(await tx.query('EXPLAIN (FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'];throw stop}return tx.query(sql,values)}},largeQuery)}catch(e){assert.equal(e,stop)}
        assert.ok(explain[0].Plan['Total Cost']<baselinePlan[0].Plan['Total Cost']/10);
      }
      scaleEvidence={input:{users:199,jobs:20000,artworks:20000,ledger:12000,modelCalls:40000},elapsedMs,actualExecutionMs:explain[0]['Execution Time'],totalCost:explain[0].Plan['Total Cost'],baselineTotalCost:baselinePlan?.[0].Plan['Total Cost'],explain,baselinePlan};
      fs.writeFileSync(path.join(out,'SCALE.json'),JSON.stringify(scaleEvidence,null,2));
      console.log('SCALE_QUERY_MS='+elapsedMs+' EXECUTION_MS='+explain[0]['Execution Time']);
    });
    const final = await readUserUsage(tx, query());
    assert.equal(JSON.stringify(final).includes('/media/local'), false);
    const result = { result: 'PASS', checks, realPostgres: true, loaded, supplierCalls: 0, productionWrites: 0, ...(scaleEvidence?{scale:{elapsedMs:scaleEvidence.elapsedMs,totalCost:scaleEvidence.totalCost,baselineTotalCost:scaleEvidence.baselineTotalCost}}:{}),output: final, exit: 0 };
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(result, null, 2));
    console.log(`ADMIN_USAGE_PG=PASS CHECKS=${checks.length} REAL_SQL=1 SUPPLIER_CALLS=0 EXIT=0`);
  } finally { await tx.query(`DROP SCHEMA ${schema} CASCADE`); tx.release(); await pool.end(); }
}
main().catch(error => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'FAILURE.json'), JSON.stringify({ checks, loaded, error: error.stack }, null, 2)); console.error(error); process.exitCode = 1; });
