import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg, { type PoolClient } from 'pg';
import esbuild from 'esbuild';
import { parseBiQuery, type BiQuery } from '../src/lib/bi/contracts';
import { ADMIN_QUERY_INDEXES } from '../src/lib/bi/query-indexes';

// Explicit disposable local DB only. Never fall back to DATABASE_URL or dotenv.
async function main() {
  const url = new URL(process.env.X1_TEST_DATABASE_URL || 'http://invalid');
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/naumi_x1_fixture');
  assert.equal(url.username, 'x1_fixture');
  const mode = process.argv[2] || 'modified';
  assert.ok(['baseline', 'modified', 'rollback'].includes(mode));
  const out = resolve(process.argv[3] || 'output/capacity-x1-bi-20261029');
  const reference = resolve(process.argv[4] || `${out}/BASELINE.repository.ts`);
  const entry = resolve(process.argv[5] || (mode === 'baseline' ? reference : 'src/lib/bi/repository.ts'));
  mkdirSync(out, { recursive: true });
  const schema = `x1_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url.toString(), max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  Object.assign(process.env, {
    DATABASE_URL: url.toString(), PGOPTIONS: `-c search_path=${schema}`,
    SETTINGS_SECRET: 'x1-bi-fixture-only-0123456789abcdef', NAUMI_VERIFY_ISOLATED_DB: '1',
  });
  const db = await import('../src/lib/db');
  const pool = db.getPool();
  const unscopedStatements: { sql: string; values: any[] }[] = [];
  const wrapped = new WeakSet();
  pool.on('acquire', client => {
    if (wrapped.has(client)) return;
    wrapped.add(client);
    const run = client.query.bind(client);
    (client as any).query = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('WITH query_window')) unscopedStatements.push({ sql: args[0], values: args[1] });
      return (run as any)(...args);
    };
  });
  let poolBorrows = 0;
  // Run the real repository; only its infrastructure port is bound to this DB.
  (globalThis as any).__x1BiDb = { getPool: () => { poolBorrows++; return pool; }, ensureSchema: db.ensureSchema };
  async function repository(file: string) {
    const built = await esbuild.build({
      stdin: { contents: readFileSync(file, 'utf8'), resolveDir: resolve('src/lib/bi'), sourcefile: file, loader: 'ts' },
      bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', tsconfig: resolve('tsconfig.json'),
      plugins: [{ name: 'isolated-db-port', setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'x1' }));
        b.onResolve({ filter: /^@\/(?:lib\/db|platform\/db\/pool)$/ }, () => ({ path: 'db', namespace: 'x1' }));
        b.onLoad({ filter: /.*/, namespace: 'x1' }, a => ({ contents: a.path === 'db' ? 'module.exports=globalThis.__x1BiDb;' : '' }));
      } }],
    });
    const m = { exports: {} as typeof import('../src/lib/bi/repository') };
    new Function('module', 'exports', 'require', built.outputFiles[0].text)(m, m.exports, createRequire(resolve('package.json')));
    return m.exports;
  }
  const baseline = await repository(reference), actual = await repository(entry);
  const owner = 'owner@x1.fixture', member = 'member@x1.fixture', other = 'other@x1.fixture';
  const query = (v: Record<string, string> = {}): BiQuery => parseBiQuery(new URLSearchParams({
    section: 'operations', from: '2026-10-20', to: '2026-10-20', size: '7', ...v,
  }));
  const clean = ({ generatedAt, ...v }: any) => v;
  const results: any[] = [], plans: any[] = [];
  const statements: { sql: string; values: any[] }[] = [];
  let afterCount: (() => Promise<void>) | undefined;
  try {
    await actual.ensureBiSchema();
    for (const email of [owner, member, other]) await db.getOrCreateUser(email, email.split('@')[0]);
    await pool.query("INSERT INTO app_bi_account_profiles(email,account_type,company,updated_by) VALUES($1,'enterprise','X1 Company','fixture')", [owner]);
    // Incompressible ~100 KiB JSON and one ~5 MiB checkpoint, not repeated padding.
    await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,cost,reserved_cost,created_at,updated_at)
      SELECT 'image-'||lpad(g::text,3,'0'),CASE WHEN g%3=0 THEN $1 WHEN g%3=1 THEN $2 ELSE $3 END,'generate',
        jsonb_build_object('status',CASE WHEN g%7=0 THEN 'error' WHEN g%5=0 THEN 'needs_attention' ELSE 'done' END,
          'stage',CASE WHEN g%11=0 THEN 'checking' ELSE '' END,'error',CASE WHEN g%13=0 THEN '核查原因' ELSE '' END,
          'result',CASE WHEN g%4=0 THEN jsonb_build_object('status','running','stage','reviewing','error',jsonb_build_object('message','nested 核查')) ELSE '{}'::jsonb END,
          'paidOperations',jsonb_build_object('paid-'||g,jsonb_build_object('state','done')),
          'padding',(SELECT string_agg(md5((g*1000000+n)::text),'') FROM generate_series(1,CASE WHEN g=240 THEN 163840 ELSE 3200 END) n)),
        jsonb_build_object('p',jsonb_build_object('prompt','prompt-'||g,'model','fixture-model')),true,6,3,
        '2026-10-20T01:00:00Z'::timestamptz+(g/4)*interval '1 second','2026-10-20T01:00:00Z' FROM generate_series(1,240) g`, [owner, member, other]);
    await pool.query(`INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status,parameters,cost,created_at)
      SELECT 'canvas-'||lpad(g::text,3,'0'),$1,'source',CASE WHEN g%3=0 THEN 'failed' ELSE 'completed' END,
        jsonb_build_object('prompt','canvas-prompt-'||g,'qualityAudit',jsonb_build_object('requested','high'),
          'padding',(SELECT string_agg(md5((g*10000+n)::text),'') FROM generate_series(1,3200) n)),6,'2026-10-20T01:00:00Z' FROM generate_series(1,120) g`, [owner]);
    await pool.query(`INSERT INTO app_video_tasks(id,email,upstream_id,status,prompt,parameters,cost,created_at)
      SELECT 'video-'||lpad(g::text,3,'0'),$1,'fixture',CASE WHEN g%3=0 THEN 'failed' ELSE 'completed' END,'video-prompt-'||g,
        jsonb_build_object('padding',(SELECT string_agg(md5((g*10000+n)::text),'') FROM generate_series(1,3200) n)),6,'2026-10-20T01:00:00Z' FROM generate_series(1,80) g`, [member]);
    // Parent/child physical records and identical IDs in different sources must
    // remain separate here. Logical-task dedup belongs to the anomaly watcher.
    await pool.query(`UPDATE app_image_jobs SET snapshot=snapshot||'{"children":{"slot":{"jobId":"image-006"}}}' WHERE id='image-003';
      INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status,created_at) VALUES('image-003','${owner}','source','completed','2026-10-20T01:00:00Z');
      INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at) VALUES
        ('ancient','${owner}','generate','{"status":"done"}','{}',false,'2000-01-01'),
        ('start-boundary','${owner}','generate','{"status":"done"}','{}',false,'2026-10-19T16:00:00Z'),
        ('end-boundary','${owner}','generate','{"status":"done"}','{}',false,'2026-10-20T16:00:00Z');
      INSERT INTO app_ledger(id,email,delta,kind,reason) SELECT 'led-image-'||id,email,-6,'consume','fixture' FROM app_image_jobs;
      INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,state,duration_ms)
        SELECT 'call-'||id,email,'image',id,'fixture','done',1 FROM app_image_jobs;
      ANALYZE`);
    const sizes = (await pool.query(`SELECT 'snapshot' AS field,count(*)::int rows,min(pg_column_size(snapshot)) bytes_min,max(pg_column_size(snapshot)) bytes_max FROM app_image_jobs
      UNION ALL SELECT 'canvas.parameters',count(*)::int,min(pg_column_size(parameters)),max(pg_column_size(parameters)) FROM app_canvas_image_tasks
      UNION ALL SELECT 'video.parameters',count(*)::int,min(pg_column_size(parameters)),max(pg_column_size(parameters)) FROM app_video_tasks`)).rows;
    const tx = await pool.connect();
    const port = { query: async (sql: string, values: any[]) => {
      statements.push({ sql, values });
      const r = await tx.query(sql, values);
      if (afterCount && /SELECT count\(\*\)::int AS n FROM/.test(sql)) { const f = afterCount; afterCount = undefined; await f(); }
      return r;
    } } as unknown as PoolClient;
    const access = { client: port, allowedEmails: [owner, member] };
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      for (const filters of [{}, { page: '2' }, { page: '9999' }, { email: owner }, { email: other }, { status: 'running' },
        { status: 'done' }, { status: 'error' }, { status: 'needs_attention' }, { status: 'review' }, { from: '2026-10-21', to: '2026-10-21' }] as Record<string, string>[]) {
        const q = query(filters), expected = await baseline.queryEnterpriseOperations(q, access);
        const borrows = poolBorrows;
        const response = await actual.queryEnterpriseOperations(q, access);
        assert.equal(poolBorrows, borrows, 'scoped read must not acquire pool/schema connection');
        assert.deepEqual(clean(response), clean(expected));
        assert.ok(response.rows.every(r => access.allowedEmails.includes(String(r.email))));
        results.push({ path: 'enterprise', filters, total: response.total, rows: response.rows.length });
      }
      for (const emails of [[], [owner], [member], [other]]) {
        const scoped = { client: port, allowedEmails: emails };
        for (const exact of [{ kind: 'image-job' as const, id: 'ancient' }, { kind: 'canvas-task' as const, id: 'image-003' },
          { kind: 'image-job' as const, id: 'image-003' }, { kind: 'video-task' as const, id: 'video-001' }]) {
          const expected = await baseline.queryEnterpriseOperations(query(), scoped, exact);
          assert.deepEqual(clean(await actual.queryEnterpriseOperations(query(), scoped, exact)), clean(expected));
          results.push({ path: 'exact', emails, exact, total: expected.total });
        }
      }
      for (const filters of [{}, { page: '2' }, { page: '9999' }, { q: 'X1 Company' }, { q: "%' OR 1=1 --" },
        { accountType: 'unknown' }, { status: 'review' }, { status: 'creation:running' }, { status: 'creation:failed' },
        { status: 'creation:needs_review' }, { email: other }] as Record<string, string>[]) {
        const q = query(filters), expected = await baseline.queryBi(q, access), borrows = poolBorrows;
        assert.deepEqual(clean(await actual.queryBi(q, access)), clean(expected));
        assert.equal(poolBorrows, borrows);
        results.push({ path: 'scoped-bi', filters, total: expected.total });
      }
      // Full traversal verifies stable tie ordering, no dropped/duplicated physical
      // records, and state filtering BEFORE LIMIT (not a sparse-page shortcut).
      const seen = new Set<string>(); let total = 0;
      for (let page = 1; ; page++) {
        const q = query({ size: '30', page: String(page) }), expected = await baseline.queryEnterpriseOperations(q, access);
        const response = await actual.queryEnterpriseOperations(q, access);
        assert.deepEqual(clean(response), clean(expected)); total = response.total;
        for (const r of response.rows) { const key = `${r.source_table}/${r.email}/${r.id}`; assert.ok(!seen.has(key)); seen.add(key); }
        if (!response.rows.length) break;
      }
      assert.equal(seen.size, total);
      for (const id of ['image-003', 'image-006', 'start-boundary']) assert.ok(seen.has(`app_image_jobs/${owner}/${id}`));
      assert.ok(seen.has(`app_canvas_image_tasks/${owner}/image-003`));
      assert.ok(!seen.has(`app_image_jobs/${owner}/end-boundary`));
      results.push({ path: 'full-pagination', total, unique: seen.size, parentChildPreserved: true });
      for (const [name, repo] of [['baseline', baseline], [mode, actual]] as const) {
        for (const status of ['', 'running']) {
          statements.length = 0; await repo.queryEnterpriseOperations(query({ status }), access);
          const page = statements.find(s => /OFFSET \$9/.test(s.sql))!;
          assert.ok(page);
          const plan = (await tx.query(`EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) ${page.sql}`, page.values)).rows[0]['QUERY PLAN'][0];
          plans.push({ name, status, ...page, plan });
        }
      }
      await tx.query('COMMIT');
      // Count and page retain the caller's MVCC snapshot across a concurrent commit.
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const before = await actual.queryEnterpriseOperations(query(), access);
      afterCount = () => pool.query("DELETE FROM app_image_jobs WHERE id='image-240'").then(() => undefined);
      const during = await actual.queryEnterpriseOperations(query(), access);
      assert.deepEqual(clean(during), clean(before));
      await tx.query('COMMIT');
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const after = await actual.queryEnterpriseOperations(query(), access);
      assert.equal(after.total, before.total - 1);
      const revoked = await actual.queryEnterpriseOperations(query(), { client: port, allowedEmails: [member] });
      assert.ok(revoked.rows.every(r => r.email === member)); assert.ok(revoked.total < after.total);
      assert.equal((await actual.queryEnterpriseOperations(query(), { client: port, allowedEmails: [] })).total, 0);
      results.push({ path: 'mvcc-and-revoked-scope', before: before.total, during: during.total, after: after.total, revoked: revoked.total });
    } finally { await tx.query('ROLLBACK'); tx.release(); }
    // Exercise the real authority boundary, not just manually supplied emails.
    const erp = await import('../src/lib/enterprise/server');
    await erp.ensureEnterpriseSchema();
    const team = randomUUID();
    await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')", [owner]);
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'X1',$2,now()+interval '1 day')", [team, owner]);
    await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)', [team]);
    await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')", [team, member, owner]);
    const enterprisePage = (actor: string, clientWrap?: (tx: PoolClient) => PoolClient) => erp.enterpriseCreationRead(actor, team,
      (client, scope) => actual.queryEnterpriseOperations(query(), { client: clientWrap ? clientWrap(client) : client, allowedEmails: [...scope.visible] }));
    const authorized = await enterprisePage(owner);
    assert.equal(authorized.total, 361);
    assert.equal((await enterprisePage(member)).total, 160);
    await assert.rejects(enterprisePage(other));
    let revokeBlocked = false;
    await enterprisePage(owner, client => ({ query: async (sql: string, values: any[]) => {
      const r = await client.query(sql, values);
      if (/SELECT count\(\*\)::int AS n FROM/.test(sql)) {
        const revoker = await pool.connect();
        try {
          await revoker.query('BEGIN'); await revoker.query("SET LOCAL lock_timeout='100ms'");
          await revoker.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2", [team, member]);
        } catch (error) { assert.equal((error as any).code, '55P03'); revokeBlocked = true; }
        finally { await revoker.query('ROLLBACK'); revoker.release(); }
      }
      return r;
    } } as unknown as PoolClient));
    assert.ok(revokeBlocked, 'authorization share locks remain held through count and page');
    await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2", [team, member]);
    const revokedMember = await enterprisePage(owner);
    assert.equal(revokedMember.total, 201); assert.ok(revokedMember.rows.every(r => r.email === owner));
    await assert.rejects(enterprisePage(member));
    await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1', [team]);
    await assert.rejects(enterprisePage(owner));
    results.push({ path: 'real-enterprise-authority', authorized: authorized.total, member: 160, outsiderDenied: true,
      concurrentRevocationBlocked: revokeBlocked, afterRevocation: revokedMember.total, memberDenied: true, disabledEnterpriseDenied: true });
    for (const filters of [{ section: 'overview' }, {}, { status: 'review' }, { status: 'creation:running' }] as Record<string, string>[]) {
      const q = query(filters);
      assert.deepEqual(clean(await actual.queryBi(q)), clean(await baseline.queryBi(q)));
      results.push({ path: 'admin', filters, equivalent: true });
    }
    const summaryQuery = unscopedStatements.find(s => s.sql.includes('SELECT sum(tasks)::int'))!;
    const extraPlans: any[] = [];
    const explain = async (label: string, sql: string, values?: any[]) => {
      const p = (await pool.query(`EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) ${sql}`, values)).rows[0]['QUERY PLAN'][0];
      extraPlans.push({ label, sql, values, plan: p });
    };
    await explain('summary-without-optional-indexes', summaryQuery.sql, summaryQuery.values);
    // The same scan node can have radically different TOAST work. Observe
    // actual buffer access, never equate "Seq Scan" with decompressing all rows.
    await explain('narrow-image-count', 'SELECT count(*) FROM app_image_jobs');
    await explain('json-state-image-count', "SELECT count(*) FROM app_image_jobs WHERE snapshot->>'status'='done'");
    // Match index EXPRESSIONS, not index names or Seq Scan alone. No production DDL.
    for (const i of ADMIN_QUERY_INDEXES) await pool.query(i.sql);
    await pool.query('VACUUM ANALYZE app_image_jobs');
    await explain('summary-with-optional-indexes', summaryQuery.sql, summaryQuery.values);
    const catalog = (await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE 'app_bi_jobs_%' ORDER BY indexname", [schema])).rows;
    const indexPlans = [];
    const ic = await pool.connect();
    try {
      await ic.query('BEGIN'); await ic.query('SET LOCAL enable_seqscan=off');
      for (const predicate of ["snapshot->>'status' IN ('error','failed')", "snapshot->>'status'='needs_attention' OR snapshot->>'stage' IN ('checking','reviewing') OR snapshot->>'error' LIKE '%核查%'", "COALESCE(snapshot->>'status','unknown')='done'", "COALESCE(snapshot#>>'{result,status}',snapshot->>'status','unknown')='done'"]) {
        indexPlans.push({ predicate, plan: (await ic.query(`EXPLAIN (FORMAT JSON) SELECT id FROM app_image_jobs WHERE created_at>='2026-10-19' AND (${predicate})`)).rows[0]['QUERY PLAN'] });
      }
    } finally { await ic.query('ROLLBACK'); ic.release(); }
    const nodes = (p: any): any[] => [p, ...(p.Plans || []).flatMap(nodes)];
    const summary = plans.map(p => ({ name: p.name, status: p.status, ms: p.plan['Execution Time'],
      sharedBlocks: p.plan.Plan['Shared Hit Blocks'] + p.plan.Plan['Shared Read Blocks'],
      billingLoops: nodes(p.plan.Plan).filter(n => n['Node Type'] === 'Aggregate' && n['Parent Relationship'] === 'SubPlan').reduce((s, n) => s + n['Actual Loops'], 0),
    }));
    const old = summary[0], current = summary[2];
    assert.ok(old.billingLoops > 7, 'baseline must demonstrate pre-page billing work');
    if (mode === 'modified') {
      assert.ok(current.billingLoops <= 7, 'only selected rows may do billing projection');
      assert.ok(current.sharedBlocks < old.sharedBlocks, 'actual PG page must do less buffer work');
    } else assert.equal(current.billingLoops, old.billingLoops, 'baseline/rollback restores observed pre-page work');
    writeFileSync(resolve(out, `${mode}.json`), JSON.stringify({ mode, entry, results, sizes, summary, catalog, indexPlans, plans, extraPlans }, null, 2));
    console.log(`X1_${mode.toUpperCase()}=PASS realPostgres=true equivalenceCases=${results.length} supplierCalls=0`);
    console.log(JSON.stringify({ sizes, summary, catalogCount: catalog.length, mvcc: results.find(r => r.path === 'mvcc-and-revoked-scope'),
      extraPlans: extraPlans.map(p => ({ label: p.label, sharedBlocks: p.plan.Plan['Shared Hit Blocks'] + p.plan.Plan['Shared Read Blocks'] })) }));
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
