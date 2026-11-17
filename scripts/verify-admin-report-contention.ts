import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';

async function until<T>(probe:()=>Promise<T|undefined>, label:string, ms=700):Promise<T> {
  const deadline=performance.now()+ms;
  do {
    const result=await probe(); if(result!==undefined)return result;
    await delay(10);
  } while(performance.now()<deadline);
  throw Error(`Timed out: ${label}`);
}

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  const url=new URL(process.env.DATABASE_URL??'http://invalid');
  assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
  const schema='report_contention_'+randomUUID().replaceAll('-','');
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.PGPOOL_MAX='5';
  process.env.SETTINGS_SECRET='isolated-report-contention-0123456789abcdef';
  process.env.NAUMI_MULTI_USER='1';

  const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
  const {ReportReadBusy,withOwnedReportClient}=await import('../src/platform/db/owned-read-client');
  const {getOrCreateUser}=await import('../src/lib/db');
  const {getUserRole}=await import('../src/lib/accounts/repository');
  const {ensureBiSchema}=await import('../src/lib/bi/schema');
  const {activateEnterprise}=await import('../src/lib/enterprise/server');
  const {signUserSession}=await import('../src/lib/native-auth');
  const {GET:tenant}=await import('../src/app/api/enterprise/analytics/route');
  const {GET:platform}=await import('../src/app/api/admin/bi/usage/route');
  const pool=getPool(),lock=new Client({connectionString:url.toString()});
  const owner='owner@report.fixture', admin='admin@report.fixture', employee='employee@report.fixture';
  const outsider='outsider@report.fixture', enterpriseId=randomUUID();
  const responseTasks:Promise<Response>[]=[];
  const controllers:AbortController[]=[];
  await lock.connect();
  try {
    await lock.query(`CREATE SCHEMA ${schema}`);
    await ensureBiSchema();
    for(const email of [owner,admin,employee,outsider])await getOrCreateUser(email);
    await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
    await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[owner]);
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Fixture',$2,now()+interval '3 days')",[enterpriseId,owner]);
    await pool.query('INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)',[employee,enterpriseId]);
    await activateEnterprise({email:admin,admin:true,consoleAdmin:true},enterpriseId,employee,[]);
    await pool.query(`INSERT INTO app_ledger(id,email,delta,kind,reason,created_at) SELECT 'contention-'||i,$1,-1,'consume','生成 1 张图',
      '2025-01-01T00:00:00Z'::timestamptz+(i%330)*interval '1 day' FROM generate_series(1,12000)i`,[employee]);
    const platformUrl='http://fixture.invalid/api/admin/bi/usage?view=export&from=2025-01-01&to=2025-12-31';
    const tenantUrl=`http://fixture.invalid/api/enterprise/analytics?enterpriseId=${enterpriseId}&format=csv&from=2018-01-01&to=2025-12-31`;
    const request=(endpoint:string,email:string,signal?:AbortSignal)=>new Request(endpoint,{headers:{cookie:'nv_user='+signUserSession(email,Date.now())},signal});
    const start=(index:number)=>{
      const controller=new AbortController();controllers.push(controller);
      const result=index%2?tenant(request(tenantUrl,owner,controller.signal)):platform(request(platformUrl,admin,controller.signal));
      responseTasks.push(result);return result;
    };
    const holder=(await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
    const blocked=async()=>{
      await lock.query('SELECT pg_stat_clear_snapshot()');
      const result=await lock.query('SELECT query FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[holder]);
      return result.rows.filter(r=>/^(WITH ledger_input|WITH tenancy)/.test(r.query)).length;
    };
    await lock.query('BEGIN');
    try {
      await lock.query('LOCK TABLE app_ledger IN ACCESS EXCLUSIVE MODE');
      if(process.argv.includes('--baseline')) {
        for(let i=0;i<5;i++)void start(i);
        await until(async()=>await blocked()===5?true:undefined,'five report queries parked in PostgreSQL');
        const ordinary=pool.query('SELECT 1 AS ok');
        assert.equal(pool.waitingCount,1,'plain SELECT is queued behind the five reports');
        await lock.query('ROLLBACK');
        assert.equal((await ordinary).rows[0].ok,1);
        await Promise.all(responseTasks);
        console.log('ADMIN_REPORT_CONTENTION_BASELINE=PASS REPORT_SLOTS=5 ORDINARY_QUEUED=1');
        return;
      }
      void start(0);
      await until(async()=>await blocked()===1?true:undefined,'platform read parked in PostgreSQL');
      void start(1);
      await until(async()=>await blocked()===2?true:undefined,'both platforms share the report slots');
      assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
      assert.equal(await getUserRole(admin),'admin');
      assert.equal(await blocked(),2,'ordinary SELECT completed while reports stayed blocked');
      const abandoned=new AbortController();
      let acquired=false;
      const waiter=withOwnedReportClient(pool,async()=>{acquired=true;},abandoned.signal);
      abandoned.abort();await assert.rejects(waiter,{name:'AbortError'});assert.equal(acquired,false);
      for(let i=2;i<5;i++)void start(i);
      // Burst more read requests while both report slots remain occupied.
      const burst=Array.from({length:8},(_,index)=>start(index+5));
      const busy=await Promise.race(burst);
      assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'1');
      assert.match(busy.headers.get('cache-control')??'',/no-store/);
      assert.equal(await blocked(),2);
    } finally { await lock.query('ROLLBACK'); }
    const initial=await Promise.all(responseTasks);
    assert.deepEqual(initial.slice(0,2).map(response=>response.status),[200,200]);
    const freshTenant=await tenant(request(tenantUrl,owner));
    assert.equal(freshTenant.status,200);assert.equal((await freshTenant.text()).split('\r\n').length,12001);
    const forbidden=await tenant(request(tenantUrl,outsider));assert.equal(forbidden.status,403);
    const freshPlatform=await platform(request(platformUrl,admin));
    assert.equal(freshPlatform.status,200);
    const report=await freshPlatform.json();assert.equal(report.users.find((u:{email:string})=>u.email===employee).consumed,12000);

    // Hold both admitted callbacks even longer than the queue deadline so
    // report SQL timeouts cannot be mistaken for admission timeouts.
    let releaseReports!:()=>void;
    const held=new Promise<void>(resolve=>{releaseReports=resolve;});
    let entered=0;
    const admitted=Array.from({length:2},()=>withOwnedReportClient(pool,async()=>{entered++;await held;}));
    try {
      await until(async()=>entered===2?true:undefined,'both report slots held');
      let extraStarted=false;
      await assert.rejects(withOwnedReportClient(pool,async()=>{extraStarted=true;}),ReportReadBusy);
      assert.equal(extraStarted,false);assert.equal(pool.waitingCount,0);
    }finally {releaseReports();await Promise.all(admitted);}
    assert.equal(await withOwnedReportClient(pool,async()=>42),42);
    console.log('ADMIN_REPORT_CONTENTION=PASS REPORT_SLOTS=2 ORDINARY_AVAILABLE=1 BUSY_RETRY_AFTER=1 QUEUED_ABORT=1 WAIT_TIMEOUT=1 LEDGER_PARITY=12000 TENANT_DENIAL=403');
  } finally {
    controllers.forEach(controller=>controller.abort());
    await Promise.allSettled(responseTasks);
    await closeDatabasePools();
    try {await lock.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);} finally {await lock.end();}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
