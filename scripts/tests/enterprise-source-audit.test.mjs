import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import pg from 'pg';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceSite, sourceBridge, inspectSource, probeSource } from '../../services/enterprise-workflow/src/source-onboarding/audit.mjs';

const id = '1095114e-6b57-429e-a954-7d663907e0c9';
const site = { version: 1, adminUrl: 'https://source.example/admin', enterpriseId: id, expectedEnterpriseName: 'Synthetic enterprise' };
const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID: 'synthetic-source', NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'dedicated', NAUMI_ENTERPRISE_ALLOWED_IDS: id, NAUMI_WORKFLOW_SERVICE_URL: 'http://127.0.0.1:18495', NAUMI_WORKFLOW_SIGNING_KID: 'test', NAUMI_WORKFLOW_SIGNING_KEY: key };

test('strict site binding rejects URL credentials, path normalization, arbitrary fields and missing enterprise', () => {
  assert.equal(sourceSite(site).origin, 'https://source.example');
  for (const adminUrl of ['http://source.example/admin', 'https://u:secret@source.example/admin', 'https://source.example/admin?key=secret', 'https://source.example/admin#secret', 'https://source.example/else', 'https://source.example/foo/../admin', 'https://source.example:443/admin']) assert.throws(() => sourceSite({ ...site, adminUrl }));
  assert.throws(() => sourceSite({ ...site, cookie: 'secret' }));
  assert.throws(() => sourceSite({ ...site, enterpriseId: 'all' }));
  assert.throws(() => sourceSite({ ...site, expectedEnterpriseName: '' }));
});
test('bridge reports config only; no credentials or invented source identity', () => {
  assert.equal(sourceBridge(env, id).enterpriseAllowed, true);
  assert.equal(sourceBridge({}, id).sourceInstanceId, null);
  assert.equal(sourceBridge({ ...env, NAUMI_ENTERPRISE_ALLOWED_IDS: randomUUID() }, id).enterpriseAllowed, false);
  assert.equal(sourceBridge({ ...env, NAUMI_ENTERPRISE_ALLOWED_IDS: id + ',' + id }, id).policyValid, false);
  assert.equal(sourceBridge({ ...env, NAUMI_ENTERPRISE_DEPLOYMENT_MODE: '' }, id).policyValid, false);
  assert.equal(sourceBridge({ ...env, NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'shared', NAUMI_ENTERPRISE_ALLOWED_IDS: Array.from({ length: 101 }, () => randomUUID()).join(',') }, id).policyValid, false);
  assert.equal(sourceBridge({ ...env, NAUMI_WORKFLOW_SERVICE_URL: 'https://user:secret@source.example/' }, id).serviceOriginValid, false);
  assert.equal(sourceBridge({ ...env, NAUMI_WORKFLOW_SIGNING_KEY: 'bad secret' }, id).signingKeyValid, false);
  assert(!JSON.stringify(sourceBridge(env, id)).includes('PRIVATE KEY'));
});
test('anonymous probes do not follow redirects or read account payloads; HTTP200 never proves readiness', async () => {
  const seen = [], bodies = [new Response('login', { status: 302, headers: { location: 'https://other.example/' } }), Response.json({ version: '123', commit: 'a'.repeat(40), password: 'secret' }), Response.json({ secret: 'never retained' }), Response.json({ error: 'unauthorized' }, { status: 401 })];
  const r = await probeSource(site, async (url, options) => { seen.push({ url, options }); return bodies.shift(); });
  assert.equal(seen.length, 4); assert(seen.every(x => x.options.method === 'GET' && x.options.redirect === 'manual' && x.options.credentials === 'omit' && !x.options.headers.authorization && !x.options.headers.cookie));
  assert.equal(r.employeeReady, false); assert.equal(r.checks[0].status, 302); assert.equal(r.checks[1].version.commit, 'a'.repeat(40)); assert(!JSON.stringify(r).includes('secret'));
});
test('probes bound bytes and sanitize remote errors/malformed versions', async () => {
  for (const version of ['x'.repeat(20000), '{}', JSON.stringify({ commit: 'not-a-commit', version: 'secret' })]) {
    const r = await probeSource(site, async url => { if (url.endsWith('/api/version')) return new Response(version, { headers: { 'content-type': 'application/json' } }); throw new Error('secret'); });
    assert(r.checks.every(x => x.result === 'probe-failed')); assert(!JSON.stringify(r).includes('secret'));
  }
});
test('real PostgreSQL read-only source snapshot, exact tenant and unreviewed identity candidates', async t => {
  assert(process.env.SOURCE_AUDIT_TEST_DATABASE_URL, 'run scripts/verify-enterprise-source-audit.mjs (database mandatory)');
  const pool = new pg.Pool({ connectionString: process.env.SOURCE_AUDIT_TEST_DATABASE_URL, max: 1 });
  const foreign = randomUUID();
  try {
    await pool.query(`CREATE TABLE app_account_teams(id uuid PRIMARY KEY,name text,owner_email text,enabled boolean);
      CREATE TABLE app_enterprise_settings(team_id uuid PRIMARY KEY,enabled boolean);
      CREATE TABLE app_enterprise_members(enterprise_id uuid,email text,supervisor_email text,role_id uuid,employment text,version int);
      CREATE TABLE app_users(email text PRIMARY KEY,name text,banned boolean,account_expires_at timestamptz);
      CREATE TABLE app_team_access_grants(email text PRIMARY KEY,enabled boolean,revoked_at timestamptz,starts_at timestamptz,expires_at timestamptz);
      CREATE TABLE app_artworks(id text); CREATE TABLE app_ledger(id text);
      INSERT INTO app_users VALUES('owner@test.invalid','Owner',false,NULL),('staff@test.invalid','Same alias',false,NULL),('foreign@test.invalid','Same alias',false,NULL);
      INSERT INTO app_team_access_grants VALUES('owner@test.invalid',true,NULL,now()-interval '1 hour',NULL);`);
    await pool.query('INSERT INTO app_account_teams VALUES($1,$2,$3,true),($4,$2,$5,true)', [id, site.expectedEnterpriseName, 'owner@test.invalid', foreign, 'foreign@test.invalid']);
    await pool.query('INSERT INTO app_enterprise_settings VALUES($1,true),($2,true)', [id, foreign]);
    await pool.query("INSERT INTO app_enterprise_members VALUES($1,'staff@test.invalid','owner@test.invalid',NULL,'permanent',0)", [id]);
    const digest = async () => (await pool.query(`SELECT jsonb_build_object('users',(SELECT jsonb_agg(u ORDER BY email) FROM app_users u),'teams',(SELECT jsonb_agg(t ORDER BY id) FROM app_account_teams t),'members',(SELECT jsonb_agg(m ORDER BY email) FROM app_enterprise_members m),'grants',(SELECT jsonb_agg(g ORDER BY email) FROM app_team_access_grants g)) AS state`)).rows[0].state;
    await t.test('snapshot has counts but no personal identifiers, candidates carry no permissions or real names', async () => {
      const before = await digest(), { summary, roster } = await inspectSource(pool, site, env);
      assert.deepEqual(await digest(), before); assert.equal(summary.sourceReadOnly, true); assert.equal(summary.sourceWrites, 0); assert.equal(summary.memberCount, 1); assert.equal(summary.accountCount, 2); assert.equal(summary.availableAccounts, 2); assert.equal(summary.employeeReady, false);
      assert.deepEqual(summary.sourceTablePresence, ['app_artworks', 'app_ledger']); assert.equal(summary.recordContentsRead, false);
      assert(roster.rows.every(r => r.realName === null && r.workflowSubject === null && r.mappingStatus === 'unreviewed' && r.workflowTeams.length === 0));
      assert(!JSON.stringify(summary).includes('@')); assert(!JSON.stringify(roster).includes('foreign@test.invalid')); assert.equal(roster.sourceInstanceId, 'synthetic-source');
      assert.equal((await inspectSource(pool, site, env)).summary.snapshotSha256, summary.snapshotSha256);
    });
    await t.test('actual CLI protects output, never overwrites old evidence and logs no account or connection secrets', async () => {
      const folder = await mkdtemp(join(tmpdir(), 'source-audit-cli-')), config = join(folder, 'site.json'), output = join(folder, 'inspection');
      await writeFile(config, JSON.stringify(site));
      const run = () => spawnSync(process.execPath, ['scripts/enterprise-source-audit.mjs', 'inspect', '--site', config, '--output', output], { encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env, DATABASE_URL: process.env.SOURCE_AUDIT_TEST_DATABASE_URL } });
      const first = run(); assert.equal(first.status, 0, first.stderr); assert.equal(first.stdout.trim(), 'SOURCE_AUDIT_INSPECT_PASS: source_writes=0 employee_ready=false');
      const privateFile = await readFile(join(output, 'IDENTITY_REVIEW.private.json'), 'utf8');
      assert.equal(JSON.parse(privateFile).rows.length, 2); assert(!JSON.stringify(first).includes('PRIVATE KEY')); assert(!first.stdout.includes('@'));
      const second = run(); assert.equal(second.status, 1); assert.equal(second.stderr.trim(), 'SOURCE_AUDIT_FAILED');
      assert.equal(await readFile(join(output, 'IDENTITY_REVIEW.private.json'), 'utf8'), privateFile);
      const summary = JSON.parse(await readFile(join(output, 'SUMMARY.json'), 'utf8')); assert.equal(summary.employeeReady, false);
    });
    await t.test('exact ID and expected name fail closed, no search by name', async () => {
      await assert.rejects(inspectSource(pool, { ...site, enterpriseId: randomUUID() }, env), /SOURCE_ENTERPRISE_NOT_FOUND/);
      await assert.rejects(inspectSource(pool, { ...site, expectedEnterpriseName: 'Wrong' }, env), /SOURCE_ENTERPRISE_NAME_MISMATCH/);
      assert.equal((await inspectSource(pool, site, env)).summary.memberCount, 1);
    });
    await t.test('unknown source policy remains unknown, not fabricated from hostname', async () => {
      const r = await inspectSource(pool, site, {}); assert.equal(r.roster.sourceInstanceId, null); assert(r.summary.issues.includes('SOURCE_INSTANCE_POLICY_NOT_CONFIGURED')); assert(r.summary.issues.includes('WORKFLOW_BRIDGE_NOT_CONFIGURED'));
    });
    await t.test('disabled/expired member and revoked owner entry are not accepted as ready', async () => {
      const old = (await inspectSource(pool, site, env)).summary.snapshotSha256;
      await pool.query("UPDATE app_users SET account_expires_at=now()-interval '1 minute' WHERE email='staff@test.invalid'; UPDATE app_team_access_grants SET revoked_at=now()");
      const r = await inspectSource(pool, site, env); assert.equal(r.summary.availableAccounts, 1); assert.notEqual(r.summary.snapshotSha256, old); assert(r.summary.issues.includes('SOURCE_OWNER_ENTRY_UNAVAILABLE')); assert(r.summary.issues.includes('SOURCE_ACCOUNTS_UNAVAILABLE'));
    });
    await t.test('read-only transaction rejects accidental write; connection rolled back and released', async () => {
      const wrapper = { connect: async () => { const c = await pool.connect(); return { release: () => c.release(), query: async (sql, args) => { if (sql.includes('information_schema.columns')) await c.query("UPDATE public.app_users SET name='must not happen'"); return c.query(sql, args); } }; } };
      const before = await digest(); await assert.rejects(inspectSource(wrapper, site, env), e => e.code === '25006'); assert.deepEqual(await digest(), before);
      assert.equal((await pool.query("SHOW transaction_read_only")).rows[0].transaction_read_only, 'off');
    });
    await t.test('missing schema refuses without initializing or altering it', async () => {
      await pool.query('ALTER TABLE app_enterprise_members RENAME COLUMN version TO legacy_version');
      await assert.rejects(inspectSource(pool, site, env), /SOURCE_SCHEMA_INCOMPLETE/);
      assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='app_enterprise_members' AND column_name='version'")).rowCount, 0);
      await pool.query('ALTER TABLE app_enterprise_members RENAME COLUMN legacy_version TO version');
    });
    await t.test('2000 member cap rejects incomplete exports', async () => {
      await pool.query("INSERT INTO app_enterprise_members SELECT $1, 'synthetic-'||n||'@test.invalid','owner@test.invalid',NULL,'permanent',0 FROM generate_series(1,2000) n", [id]);
      await assert.rejects(inspectSource(pool, site, env), /SOURCE_ROSTER_LIMIT_EXCEEDED/);
    });
  } finally { await pool.end(); }
});
