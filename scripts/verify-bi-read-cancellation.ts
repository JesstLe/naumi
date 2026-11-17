import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer, request as httpRequest} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(probe: () => Promise<T | undefined>, label: string): Promise<T> {
  const end = performance.now() + 2000;
  do {
    const result = await probe();
    if (result !== undefined) return result;
    await delay(20);
  } while (performance.now() < end);
  throw new Error(`Timed out: ${label}`);
}

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
  const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /fixture/);
  process.env.SETTINGS_SECRET = 'bi-read-cancellation-isolated-fixture-1234567890';
  process.env.NAUMI_MULTI_USER = '1';
  process.env.PGPOOL_MAX = '1';
  const schema = 'bi_disconnect_' + randomUUID().replaceAll('-', '');
  process.env.PGOPTIONS = `-c search_path=${schema}`;

  const {getPool, closeDatabasePools} = await import('../src/platform/db/pool');
  const {getOrCreateUser} = await import('../src/lib/db');
  const {ensureBiSchema, queryBi} = await import('../src/lib/bi/repository');
  const {parseBiQuery} = await import('../src/lib/bi/contracts');
  const {signUserSession} = await import('../src/lib/native-auth');
  const {GET} = await import('../src/app/api/admin/bi/route');
  const {GET: conversation} = await import('../src/app/api/admin/bi/conversation/route');
  const {GET: usage} = await import('../src/app/api/admin/bi/usage/route');
  const {GET: tenantUsage} = await import('../src/app/api/enterprise/usage/route');
  const {activateEnterprise} = await import('../src/lib/enterprise/server');
  const pool = getPool();
  const lock = new Client({connectionString: url.toString()});
  const done = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const uri = new URL(req.url!, 'http://fixture.invalid');
    try {
      const handler = uri.pathname === '/api/enterprise/usage' ? tenantUsage : uri.pathname.endsWith('/conversation') ? conversation : uri.pathname.endsWith('/usage') ? usage : GET;
      const result = await handler(new Request(uri, {
        headers: {cookie: req.headers.cookie ?? ''}, signal: signalFromNodeResponse(res),
      }));
      done.set(uri.searchParams.get('probe') ?? '', result.status);
      if (!res.destroyed) res.writeHead(result.status, Object.fromEntries(result.headers)).end(await result.text());
    } catch {
      if (!res.destroyed) res.writeHead(502).end();
    }
  });

  await lock.connect();
  try {
    await lock.query(`CREATE SCHEMA ${schema}`);
    await ensureBiSchema();
    const admin = 'admin@bi-cancel.fixture', member = 'member@bi-cancel.fixture';
    const owner = 'owner@bi-cancel.fixture', outsider = 'outsider@bi-cancel.fixture', tenant = randomUUID();
    for (const email of [admin, member, owner, outsider]) await getOrCreateUser(email);
    await pool.query("UPDATE app_users SET role='admin' WHERE email=$1", [admin]);
    await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES('owned-art',$1,'Owned','image','prompt','','')", [member]);
    await pool.query(`INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,state,duration_ms,frontend_model_label)
      VALUES ('owned-call',$1,'generate','owned-task','wire','success',5,'后台显示名')`, [member]);
    await pool.query(`INSERT INTO app_agent_sessions(id,email,messages) VALUES ('conversation-a',$1,$2),('conversation-a',$3,$4)`,
      [member, JSON.stringify([{role:'user',content:'用户甲'},{role:'tool',content:'不应返回'}]), admin, JSON.stringify([{role:'user',content:'另一位用户'}])]);
    await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')", [owner]);
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Fixture',$2,now()+interval '3 days')", [tenant,owner]);
    await pool.query('INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)',[member,tenant]);
    await activateEnterprise({email:admin,admin:true,consoleAdmin:true},tenant,member,[]);

    const cookie = (email: string) => ({cookie: 'nv_user=' + signUserSession(email, Date.now())});
    const request = (section: string, email = admin) => new Request(`http://fixture.invalid/api/admin/bi?section=${section}`, {headers: cookie(email)});
    assert.equal((await GET(request('artworks', member))).status, 404);
    assert.equal((await GET(request('bogus'))).status, 400);
    assert.deepEqual((await pool.query('SELECT section FROM app_bi_access_log')).rows, []);

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
    const holderPid = (await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
    const freshStats = async () => { await lock.query('SELECT pg_stat_clear_snapshot()'); };
    const detailUrl = `/conversation?id=conversation-a&email=${encodeURIComponent(member)}&kind=agent`;
    const enterpriseUrl = `/api/enterprise/usage?enterpriseId=${tenant}`;
    for (const [section, table, pattern, endpoint, actor] of [
      ['artworks', 'app_artworks', 'WITH query_window', '/api/admin/bi?section=artworks', admin],
      ['calls', 'app_supplier_calls', 'WITH wanted AS MATERIALIZED', '/api/admin/bi?section=calls', admin],
      ['overview', 'app_credit_batches', 'WITH query_window', '/api/admin/bi?section=overview', admin],
      ['conversation', 'app_agent_sessions', 'WITH extracted AS MATERIALIZED', `/api/admin/bi${detailUrl}`, admin],
      ['usage-export', 'app_ledger', 'WITH tenancy AS MATERIALIZED', '/api/admin/bi/usage?view=export', admin],
      ['enterprise-export', 'app_ledger', 'WITH tenancy AS MATERIALIZED', `${enterpriseUrl}&view=export`, owner],
    ]) {
      await lock.query('BEGIN');
      try {
        await lock.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
        const clientRequest = httpRequest(`${origin}${endpoint}&probe=${section}`, {headers: cookie(actor)});
        clientRequest.on('error', () => {});
        clientRequest.end();
        const pid = await until(async () => {
          if (done.has(section)) throw Error(`${section}: route returned ${done.get(section)} before lock wait`);
          await freshStats();
          const active = await lock.query('SELECT pid,query FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [holderPid]);
          return active.rows.find(row => row.query.startsWith(pattern))?.pid as number | undefined;
        }, `${section}: real backend waiting on fixture table lock`);
        assert.equal(pool.totalCount, 1);
        assert.equal(pool.idleCount, 0);
        clientRequest.destroy();
        assert.equal(await until(async () => done.get(section), `${section}: route exits before unlocking`), 499);
        assert.equal(pool.totalCount, 0, `${section}: abandoned client was discarded`);
        await until(async () => {
          await freshStats();
          return (await lock.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid])).rowCount === 0 ? true : undefined;
        }, `${section}: PostgreSQL backend exits before unlocking`);
        assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok, 1);
      } finally {
        await lock.query('ROLLBACK');
      }
    }

    const files = await (await GET(request('artworks'))).json();
    assert.equal(files.total, 1);
    assert.equal(files.rows[0].id, 'owned-art');
    const calls = await (await GET(request('calls'))).json();
    assert.equal(calls.total, 1);
    assert.equal(calls.rows[0].frontend_model_label, '后台显示名');
    assert.equal((await GET(request('overview'))).status, 200);
    const detail = await conversation(new Request(`${origin}/api/admin/bi${detailUrl}`, {headers: cookie(admin)}));
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), {total:1, messages:[{role:'user',text:'用户甲',truncated:false}],page:1,size:20});
    const report = await (await usage(new Request(`${origin}/api/admin/bi/usage`, {headers: cookie(admin)}))).json();
    const exportPage = await (await usage(new Request(`${origin}/api/admin/bi/usage?view=export`, {headers: cookie(admin)}))).json();
    assert.deepEqual(exportPage, {total:report.total, users:report.users, page:report.page, size:report.size});
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM app_bi_access_log')).rows[0].total, 11);
    const enterprise = (account: string, suffix = '') => tenantUsage(new Request(`${origin}${enterpriseUrl}${suffix}`, {headers: cookie(account)}));
    const tenantReport = await (await enterprise(owner)).json();
    const tenantPage = await (await enterprise(owner, '&view=export')).json();
    assert.deepEqual(tenantPage, {total:tenantReport.total, users:tenantReport.users, page:tenantReport.page, size:tenantReport.size});
    assert.deepEqual(tenantPage.users.map((row: {email: string}) => row.email).sort(), [member,owner].sort());
    assert.equal((await enterprise(outsider, '&view=export')).status, 403);
    assert.equal((await enterprise(owner, `&view=export&email=${encodeURIComponent(outsider)}`)).status, 403);

    const tx = await pool.connect();
    try {
      const controller = new AbortController();
      const waiting = queryBi(parseBiQuery(new URLSearchParams('section=artworks')), undefined, controller.signal);
      await until(async () => pool.waitingCount === 1 ? true : undefined, 'one pending checkout');
      controller.abort();
      await assert.rejects(waiting, {name: 'AbortError'});
      assert.equal(pool.idleCount, 0, 'the canceled request does not release another owner’s client');
      assert.equal((await tx.query('SELECT 1 AS ok')).rows[0].ok, 1);
    } finally {
      tx.release();
    }
    await until(async () => pool.waitingCount === 0 && pool.idleCount === 1 ? true : undefined, 'late checkout returned idle');
    console.log('BI_READ_CANCELLATION=PASS HTTP_DISCONNECT ARTWORK_COUNT MODEL_EVIDENCE OVERVIEW CONVERSATION TWO_USAGE_EXPORTS POSTGRES_EXIT WAITING_CHECKOUT AUDIT_AUTH_RETRY');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      await closeDatabasePools();
      await lock.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally { await lock.end(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
