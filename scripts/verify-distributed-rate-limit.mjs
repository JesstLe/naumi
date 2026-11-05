import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fork, execFileSync } from 'node:child_process';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
import pg from 'pg';

const option = name => { const at=process.argv.indexOf(name); return at<0?undefined:process.argv[at+1]; };
const root = process.cwd(), out = path.resolve(option('--out') || process.env.DISTRIBUTED_RATE_LIMIT_EVIDENCE || 'output/a15');
const storeSource = option('--store-source');
fs.mkdirSync(out, { recursive: true });
const keep = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT']);
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.has(k.toUpperCase())));
assert.ok(Object.keys(cleanEnv).some(k => k.toUpperCase() === 'SYSTEMROOT') || process.platform !== 'win32');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env: cleanEnv, windowsHide: true }).trim();
const label = 'a15-' + randomUUID(), secret = randomUUID() + randomUUID();
const digest = key => createHmac('sha256', secret).update('rate-limit:v1:').update(key).digest('hex');
const children = new Set(), sockets = new Set(), borrowed = new Set();
let container, sql, proxy, proxyMode = 'forward', requestId = 0;
const resource = { label, baseline: '956b7238fa375e992e0ac594c47cdba5c9d95f50', memory: 268435456, cpus: 1 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = text => console.log(text);

// Real route modules, isolated non-limiter I/O. No broad application bootstrap.
const routeFiles = new Set(['auth/forgot','admin/login','agent','canvas/workflow-import/asset'].map(p => path.resolve('src/app/api/' + p + '/route.ts')));
const constants = { dbEnabled: 'true', supabaseEnabled: 'false', ADMIN_COOKIE: '"a15-admin"', SESSION_TTL_MS: '60000', MODEL_ID: '"fixture"' };
const routeMocks = { name: 'route-fixture-io', setup(b) {
  if(storeSource)b.onLoad({filter:/rate-limit-store\.ts$/}, args => path.resolve(args.path)===path.resolve('src/lib/rate-limit-store.ts') ? {contents:fs.readFileSync(storeSource,'utf8'),loader:'ts'} : undefined);
  b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'empty' }));
  b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
  b.onResolve({ filter: /^@\// }, args => {
    if (!routeFiles.has(path.resolve(args.importer)) || args.path === '@/lib/rate-limit-http') return;
    const source = ts.createSourceFile(args.importer, fs.readFileSync(args.importer, 'utf8'), ts.ScriptTarget.Latest, true);
    const imp = source.statements.find(n => ts.isImportDeclaration(n) && n.moduleSpecifier.text === args.path);
    const names = imp.importClause.namedBindings.elements.filter(e => !e.isTypeOnly).map(e => (e.propertyName || e.name).text);
    return { path: JSON.stringify(names), namespace: 'route-io' };
  });
  b.onLoad({ filter: /.*/, namespace: 'route-io' }, args => ({ contents: JSON.parse(args.path).map(name => {
    if (constants[name]) return `export const ${name} = ${constants[name]};`;
    if (/Error$/.test(name)) return `export class ${name} extends Error { constructor(code, status=400){super(code);this.code=code;this.status=status;} }`;
    return `export function ${name}(...args){const f=globalThis.__a15?.[${JSON.stringify(name)}];if(!f)throw Error('UNEXPECTED_FIXTURE_IO:${name}');return f(...args);}`;
  }).join('\n') }));
} };
await build({ entryPoints: ['scripts/rate-limit-test-worker.ts'], outfile: path.join(out, 'worker.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [routeMocks] });
await build({ entryPoints: ['src/lib/rate-limit-store.ts'], outfile: path.join(out, 'store.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [routeMocks] });
const require = createRequire(import.meta.url), { RATE_LIMIT_CLEANUP_SQL } = require(path.join(out, 'store.cjs'));

function spawnWorker(env = {}) {
  const child = fork(path.join(out, 'worker.cjs'), [], { env: { ...cleanEnv, ...env }, windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] });
  child.errors = ''; child.stderr.on('data', d => { child.errors += d; });
  child.stdout.on('data', d => fs.appendFileSync(path.join(out, 'worker-stdout.txt'), d));
  children.add(child); return child;
}
function rpc(child, input) { return new Promise((resolve, reject) => {
  const id = ++requestId;
  const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', died); };
  const message = m => { if (m.id !== id) return; cleanup(); m.failure ? reject(new Error(m.failure)) : resolve(m.result); };
  const died = code => { cleanup(); reject(new Error('FIXTURE_CHILD_EXIT:' + code + ':' + child.errors)); };
  const timer = setTimeout(() => { cleanup(); reject(new Error('FIXTURE_RPC_TIMEOUT:' + input.op)); }, 15000);
  child.on('message', message); child.once('exit', died); child.send({ ...input, id });
}); }
async function stopWorker(child) {
  if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  children.delete(child);
}
const calls = (child, key, limit, window, n = 1, concurrency = 1) => rpc(child, { op: 'calls', concurrency, calls: Array.from({length:n}, () => ({key,limit,window})) });

try {
  // Local fixed-clock semantics, with no inherited DB or configuration values.
  const local = spawnWorker();
  assert.deepEqual(await rpc(local, { op: 'calls', calls: [
    {now:100000,key:'long',limit:1,window:600000}, {now:161001,key:'short',limit:1,window:60000}, {now:161001,key:'long',limit:1,window:600000},
    {now:200000,key:'edge',limit:1,window:1000}, {now:201000,key:'edge',limit:1,window:1000}, {now:201001,key:'edge',limit:1,window:1000},
  ] }), [true,true,false,true,false,true]);
  await stopWorker(local);
  log('MODIFIED LOCAL_NO_DB fixed_clock=[true,true,false,true,false,true] long_short=PASS inclusive_edge=PASS');

  container = docker('run','-d','--name',label,'--label','naumi.fixture='+label,'--memory','256m','--memory-swap','256m','--cpus','1','--pids-limit','128',
    '--tmpfs','/var/lib/postgresql/data:rw,size=134217728','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=a15','-e','POSTGRES_DB=a15',
    '-p','127.0.0.1::5432','postgres:16-alpine','-c','shared_buffers=32MB','-c','max_connections=30');
  assert.match(container, /^[a-f0-9]{64}$/);
  const inspect = JSON.parse(docker('inspect',container))[0];
  assert.equal(inspect.Config.Labels['naumi.fixture'],label); assert.equal(inspect.HostConfig.Memory,268435456); assert.equal(inspect.HostConfig.NanoCpus,1000000000);
  const port = Number(inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort);
  Object.assign(resource, { container, image: inspect.Image, port });
  fs.writeFileSync(path.join(out,'RESOURCE_CREATED.json'),JSON.stringify(resource,null,2));
  const url = `postgresql://a15@127.0.0.1:${port}/a15?sslmode=disable`;
  sql = new pg.Pool({ connectionString:url, max:2, connectionTimeoutMillis:1000, application_name:'a15-controller' });
  sql.on('acquire', client=>borrowed.add(client));
  sql.on('release', (_error,client)=>borrowed.delete(client));
  for (let i=0;;i++) { try { await sql.query('SELECT 1'); break; } catch(error) { if(i===50)throw error; await pause(100); } }
  // Deliberate fixture-only clock shadow. Production SQL is unchanged; both
  // real Node processes read the same real PostgreSQL clock function/result.
  await sql.query(`CREATE SCHEMA a15;
    CREATE TABLE a15.fixture_clock(ms bigint NOT NULL); INSERT INTO a15.fixture_clock VALUES(1000000);
    CREATE FUNCTION a15.clock_timestamp() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT to_timestamp(ms::numeric/1000) FROM a15.fixture_clock $$`);
  const setTime = value => sql.query('UPDATE a15.fixture_clock SET ms=$1',[value]);
  proxy = net.createServer(socket => {
    sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); socket.on('error',()=>{});
    if (proxyMode === 'reject') { socket.destroy(); return; }
    if (proxyMode === 'blackhole') return;
    const upstream = net.connect({host:'127.0.0.1',port}); sockets.add(upstream);
    upstream.on('close',()=>sockets.delete(upstream)); upstream.on('error',()=>socket.destroy());
    socket.on('close',()=>upstream.destroy()); upstream.on('close',()=>socket.destroy());
    socket.pipe(upstream); upstream.pipe(socket);
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const workerEnv = { DATABASE_URL:`postgresql://a15@127.0.0.1:${proxy.address().port}/a15?sslmode=disable`, SETTINGS_SECRET:secret, PGOPTIONS:'-c search_path=a15,pg_catalog', PGPOOL_MAX:'5', PGAPPNAME:'a15-worker' };
  let a = spawnWorker(workerEnv), b = spawnWorker(workerEnv);
  const same = (await Promise.all([calls(a,'shared',5,600000,5),calls(b,'shared',5,600000,5)])).flat();
  assert.equal(same.filter(x=>x===true).length,5); assert.equal(same.filter(x=>x===false).length,5);
  const stats = await Promise.all([rpc(a,{op:'stats'}),rpc(b,{op:'stats'})]); assert.notEqual(stats[0].pid,stats[1].pid);
  log(`MODIFIED TWO_NODE_PROCESSES pids=${stats.map(s=>s.pid).join(',')} admitted=5 denied=5 original_limit=5`);

  const distinct = await Promise.all([calls(a,'key-a',2,600000,3),calls(b,'key-b',2,600000,3)]);
  assert.deepEqual(distinct,[[true,true,false],[true,true,false]]);
  const concurrent = (await Promise.all([calls(a,'race',37,600000,100,4),calls(b,'race',37,600000,100,4)])).flat();
  assert.equal(concurrent.filter(x=>x===true).length,37); assert.equal(concurrent.filter(x=>x===false).length,163);
  log('MODIFIED KEY_ISOLATION=PASS CONCURRENT requests=200 workers=2 parallel=8 admitted=37 denied=163 errors=0');

  assert.deepEqual(await calls(a,'sliding',2,1000),[true]); await setTime(1000900);
  assert.deepEqual(await calls(b,'sliding',2,1000),[true]); await setTime(1001000);
  assert.deepEqual(await calls(a,'sliding',2,1000),[false]); await setTime(1001001);
  assert.deepEqual(await calls(b,'sliding',2,1000),[true]); await setTime(1001900);
  assert.deepEqual(await calls(a,'sliding',2,1000),[false]); await setTime(1001901);
  assert.deepEqual(await calls(b,'sliding',2,1000),[true]);
  log('MODIFIED PG_CLOCK sliding_times=1000000,1000900,1001000,1001001,1001900,1001901 outputs=true,true,false,true,false,true');
  await setTime(2000000); assert.deepEqual(await calls(a,'long',1,600000),[true]);
  await setTime(2061001); assert.deepEqual(await calls(b,'short',1,60000),[true]); assert.deepEqual(await calls(a,'long',1,600000),[false]);
  assert.deepEqual(await calls(a,'vary-limit',3,600000,2),[true,true]); assert.deepEqual(await calls(b,'vary-limit',1,600000),[false]);
  await setTime(2100000); assert.deepEqual(await calls(a,'mixed-window',2,600000),[true]); await setTime(2200000);
  assert.deepEqual(await calls(b,'mixed-window',1,60000),[true]); assert.deepEqual(await calls(a,'mixed-window',2,600000),[false]);
  assert.deepEqual(await calls(a,'restart',1,600000),[true]); await stopWorker(a); a=spawnWorker(workerEnv);
  assert.deepEqual(await calls(a,'restart',1,600000),[false]);
  log('MODIFIED PG long_short=PASS different_limits_same_key=PASS different_windows_same_key=PASS repeated_calls=COUNTED node_restart=PRESERVED');

  // Real row-lock timeout: typed infrastructure failure, no quota increment.
  await calls(a,'lock',2,600000);
  const blocker = await sql.connect(); await blocker.query('BEGIN');
  await blocker.query('SELECT * FROM a15.app_rate_limit_buckets WHERE key_hash=$1 FOR UPDATE',[digest('lock')]);
  let start=performance.now(); const locked=await rpc(a,{op:'check',key:'lock',limit:2,window:600000}); const lockMs=performance.now()-start;
  assert.equal(locked.status,503); assert.equal(locked.body.code,'RATE_LIMIT_UNAVAILABLE'); assert.ok(lockMs<4000);
  await blocker.query('ROLLBACK'); blocker.release(); assert.deepEqual(await calls(a,'lock',2,600000),[true]);
  log(`MODIFIED LOCK_TIMEOUT status=503 code=RATE_LIMIT_UNAVAILABLE elapsed_ms=${Math.round(lockMs)} recovery=PASS`);

  // Saturated existing pool and late checkout return, without a second pool.
  assert.equal(await rpc(a,{op:'hold',count:5}),5); start=performance.now();
  assert.equal((await rpc(a,{op:'check',key:'late-checkout',limit:1,window:600000})).status,503);
  assert.ok(performance.now()-start<3000); await rpc(a,{op:'release'}); await pause(50);
  let returned=await rpc(a,{op:'stats'}); assert.equal(returned.waiting,0); assert.equal(returned.idle,returned.total);
  assert.deepEqual(await calls(a,'late-checkout',1,600000),[true]);
  log('MODIFIED CHECKOUT_TIMEOUT status=503 late_client=RETURNED hit_not_consumed=PASS');

  // Real route matrix: default original key/limit/window, same real PG store.
  const routes=[['forgot',5],['admin',10],['agent',20],['canvas',20]];
  for(const [route,limit] of routes){
    await sql.query('TRUNCATE a15.app_rate_limit_buckets');
    for(let i=0;i<limit;i++){
      const response=await rpc(i%2?a:b,{op:'route',route}); assert.equal(response.status,200,route+':'+response.text);
      if(route==='admin')assert.equal(response.cookie,true);
      if(route==='agent')assert.equal(JSON.parse(response.text).reply,'fixture reply');
    }
    const effectsBefore=await Promise.all([rpc(a,{op:'effects'}),rpc(b,{op:'effects'})]);
    const over=await rpc(a,{op:'route',route}); assert.equal(over.status,429,route+':'+over.text);
    assert.deepEqual(await Promise.all([rpc(a,{op:'effects'}),rpc(b,{op:'effects'})]),effectsBefore);
    log(`MODIFIED REAL_ROUTE ${route} normal=200 admitted=${limit} excess=429 business_after_excess=0`);
  }
  await sql.query('TRUNCATE a15.app_rate_limit_buckets');
  const sse=await rpc(a,{op:'route',route:'agent',method:'PUT'}); assert.equal(sse.status,200); assert.match(sse.contentType,/text\/event-stream/); assert.match(sse.text,/event: final/);
  await calls(b,'agent:fixture@example.test',20,600000,19);
  assert.equal((await rpc(a,{op:'route',route:'agent',method:'PUT'})).status,429);
  for(const route of ['agent','canvas'])assert.equal((await rpc(a,{op:'route',route,user:null})).status,401);
  assert.equal((await rpc(a,{op:'route',route:'admin',crossSite:true})).status,403);
  log('MODIFIED REAL_ROUTE agent_PUT normal=200/SSE excess=429 auth_agent_canvas=401 admin_CSRF=403');

  // Schema/table lock creates a genuine backend fault for all routes, including
  // routes previously without a try/catch. No mail/prompt/canvas action starts.
  const tableBlocker=await sql.connect(); await tableBlocker.query('BEGIN'); await tableBlocker.query('LOCK TABLE a15.app_rate_limit_buckets IN ACCESS EXCLUSIVE MODE');
  const beforeFault=await rpc(a,{op:'effects'});
  for(const [route] of routes){const response=await rpc(a,{op:'route',route});assert.equal(response.status,503,route+':'+response.text);assert.equal(JSON.parse(response.text).code,'RATE_LIMIT_UNAVAILABLE');}
  assert.equal((await rpc(a,{op:'route',route:'agent',method:'PUT'})).status,503);
  assert.deepEqual(await rpc(a,{op:'effects'}),beforeFault);
  await tableBlocker.query('ROLLBACK'); tableBlocker.release();
  log('MODIFIED REAL_ROUTE backend_fault=503/RATE_LIMIT_UNAVAILABLE auth,admin,agent_POST,agent_PUT,canvas business_after_fault=0');

  // Active wire blackhole, not just pool acquisition or a synthetic exception.
  await calls(a,'wire-warm',1,600000); proxyMode='blackhole';
  for(const socket of sockets)socket.pause(); start=performance.now();
  const wire=await rpc(a,{op:'check',key:'wire-timeout',limit:1,window:600000}); const wireMs=performance.now()-start;
  assert.equal(wire.status,503); assert.ok(wireMs<4500);
  for(const socket of [...sockets])socket.destroy(); proxyMode='reject'; await pause(50);
  const disconnected=await rpc(a,{op:'check',key:'disconnect',limit:1,window:600000}); assert.equal(disconnected.status,503);
  proxyMode='forward'; assert.deepEqual(await calls(a,'disconnect',1,600000),[true]);
  log(`MODIFIED WIRE_TIMEOUT status=503 elapsed_ms=${Math.round(wireMs)} disconnect=503 recovery=PASS no_local_fallback=PASS`);

  // Missing secret fails closed too; never persist guessable IP/email hashes.
  const badConfig=spawnWorker({...workerEnv,SETTINGS_SECRET:''});
  assert.equal((await rpc(badConfig,{op:'check',key:'private@example.test:192.0.2.1',limit:1,window:600000})).status,503);
  await stopWorker(badConfig);
  const privateRows=(await sql.query('SELECT key_hash FROM a15.app_rate_limit_buckets')).rows;
  assert.ok(privateRows.every(r=>/^[a-f0-9]{64}$/.test(r.key_hash)));
  assert.ok(!JSON.stringify(privateRows).includes('fixture@example.test'));
  log('MODIFIED PRIVACY hmac_sha256_only=PASS missing_secret=503 sanitized_logs=PASS');

  await sql.query('TRUNCATE a15.app_rate_limit_buckets');
  await sql.query(`INSERT INTO a15.app_rate_limit_buckets SELECT md5('expired-'||g)||md5('expired-'||g),ARRAY[1::bigint],1,2 FROM generate_series(1,5000)g;
    INSERT INTO a15.app_rate_limit_buckets SELECT md5('live-'||g)||md5('live-'||g),ARRAY[2200000::bigint],600000,2800000 FROM generate_series(1,5000)g;
    ANALYZE a15.app_rate_limit_buckets`);
  // A fresh process's first admission triggers at most 64 deletions.
  const cleaner=spawnWorker(workerEnv); await calls(cleaner,'clean-trigger',1,600000); await stopWorker(cleaner);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets WHERE expires_at=2')).rows[0].count),4936);
  const explain=await sql.connect(); await explain.query('BEGIN'); await explain.query('SET LOCAL search_path=a15,pg_catalog');
  const plan=(await explain.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+RATE_LIMIT_CLEANUP_SQL,[2200000])).rows;
  fs.writeFileSync(path.join(out,'CLEANUP_EXPLAIN.json'),JSON.stringify(plan,null,2));
  const plans=JSON.stringify(plan);assert.match(plans,/app_rate_limit_expiry/);assert.doesNotMatch(plans,/Seq Scan/);
  await explain.query('ROLLBACK'); explain.release();
  // Lock the first 64 candidates: cleanup must not scan forward to 64 unlocked.
  const cleanupLock=await sql.connect(); await cleanupLock.query('BEGIN');
  await cleanupLock.query('SELECT key_hash FROM a15.app_rate_limit_buckets WHERE expires_at<2200000 ORDER BY expires_at,key_hash LIMIT 64 FOR UPDATE');
  const cleanupClient=await sql.connect(); await cleanupClient.query('BEGIN'); await cleanupClient.query('SET LOCAL search_path=a15,pg_catalog');
  assert.equal((await cleanupClient.query(RATE_LIMIT_CLEANUP_SQL,[2200000])).rowCount,0);
  await cleanupClient.query('ROLLBACK'); cleanupClient.release();await cleanupLock.query('ROLLBACK');cleanupLock.release();
  returned=await rpc(a,{op:'stats'}); assert.equal(returned.waiting,0); assert.equal(returned.total,returned.idle);
  assert.equal(Number((await sql.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='a15-worker' AND state='idle in transaction'")).rows[0].count),0);
  log('MODIFIED CLEANUP expired=5000 remaining=4936 deleted=64 index=app_rate_limit_expiry seq_scan=0 locked_first64_deleted=0 connections_returned=PASS');

  // Continuous distinct short-lived keys must not outgrow the sweep scheduler.
  // The DB clock and both independent workers are real; no sleep/window race.
  await sql.query('TRUNCATE a15.app_rate_limit_buckets');
  const steady=spawnWorker(workerEnv),samples=[];
  for(let minute=0;minute<10;minute++){
    const now=4000000+minute*60001;await setTime(now);
    const values=await rpc(steady,{op:'calls',calls:Array.from({length:200},(_,i)=>({key:`steady-${minute}-${i}`,limit:1,window:1000}))});
    assert.ok(values.every(v=>v===true));
    const sample=(await sql.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE expires_at<$1)::int AS expired FROM a15.app_rate_limit_buckets',[now])).rows[0];samples.push({minute,...sample});
  }
  await stopWorker(steady);fs.writeFileSync(path.join(out,'CLEANUP_STEADY_ARRIVAL.json'),JSON.stringify(samples,null,2));
  log(`MODIFIED CLEANUP_STEADY minutes=10 new_keys_per_minute=200 total=${samples.at(-1).total} expired=${samples.at(-1).expired}`);
  assert.equal(samples.at(-1).total,200,'expired bucket backlog must not grow with steady arrivals');
  assert.equal(samples.at(-1).expired,0);

  // A real cleanup statement error rolls the admission back, releases its
  // client and leaves sweeping eligible on this same process after recovery.
  await sql.query('TRUNCATE a15.app_rate_limit_buckets');await setTime(6000000);
  await sql.query(`INSERT INTO a15.app_rate_limit_buckets SELECT md5('retry-expired-'||g)||md5('retry-expired-'||g),ARRAY[1::bigint],1,2 FROM generate_series(1,128)g;
    CREATE FUNCTION a15.reject_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture cleanup rejected'; END $$;
    CREATE TRIGGER reject_cleanup BEFORE DELETE ON a15.app_rate_limit_buckets FOR EACH STATEMENT EXECUTE FUNCTION a15.reject_cleanup()`);
  const recovering=spawnWorker(workerEnv);
  assert.equal((await rpc(recovering,{op:'check',key:'cleanup-retry',limit:1,window:1000})).status,503);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets')).rows[0].count),128);
  await sql.query('DROP TRIGGER reject_cleanup ON a15.app_rate_limit_buckets');
  assert.deepEqual(await calls(recovering,'cleanup-retry',1,1000),[true]);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets WHERE expires_at=2')).rows[0].count),64);
  assert.deepEqual(await calls(recovering,'cleanup-retry-next',1,1000),[true]);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets WHERE expires_at=2')).rows[0].count),0);
  await stopWorker(recovering);
  log('MODIFIED CLEANUP_FAILURE real_pg_error=503 transaction_rollback=PASS same_process_retry=PASS subsequent_batch=PASS');

  await sql.query('TRUNCATE a15.app_rate_limit_buckets');await setTime(6500000);
  await sql.query(`INSERT INTO a15.app_rate_limit_buckets SELECT md5('commit-expired-'||g)||md5('commit-expired-'||g),ARRAY[1::bigint],1,2 FROM generate_series(1,128)g;
    CREATE FUNCTION a15.reject_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key_hash='${digest('cleanup-commit-retry')}' THEN RAISE EXCEPTION 'fixture commit rejected'; END IF; RETURN NULL; END $$;
    CREATE CONSTRAINT TRIGGER reject_commit AFTER INSERT ON a15.app_rate_limit_buckets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION a15.reject_commit()`);
  const commitRetry=spawnWorker(workerEnv);
  assert.equal((await rpc(commitRetry,{op:'check',key:'cleanup-commit-retry',limit:1,window:1000})).status,503);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets')).rows[0].count),128);
  await sql.query('DROP TRIGGER reject_commit ON a15.app_rate_limit_buckets');
  assert.deepEqual(await calls(commitRetry,'cleanup-commit-retry',1,1000),[true]);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets WHERE expires_at=2')).rows[0].count),64);
  await stopWorker(commitRetry);log('MODIFIED CLEANUP_COMMIT_FAILURE rollback=PASS same_process_retry=PASS cooldown_not_published=PASS');

  // Concurrent requests share one sweep claim through COMMIT. The trigger
  // records committed deletion batches while delaying each sweep slightly.
  await sql.query('TRUNCATE a15.app_rate_limit_buckets');await setTime(7000000);
  await sql.query(`INSERT INTO a15.app_rate_limit_buckets SELECT md5('parallel-expired-'||g)||md5('parallel-expired-'||g),ARRAY[1::bigint],1,2 FROM generate_series(1,320)g;
    CREATE TABLE a15.cleanup_batches(id bigserial PRIMARY KEY,n integer,started_at timestamptz,finished_at timestamptz);
    CREATE FUNCTION a15.record_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE batch_id bigint; BEGIN INSERT INTO a15.cleanup_batches(n,started_at) SELECT count(*),pg_catalog.clock_timestamp() FROM old_rows RETURNING id INTO batch_id; PERFORM pg_sleep(0.03); UPDATE a15.cleanup_batches SET finished_at=pg_catalog.clock_timestamp() WHERE id=batch_id; RETURN NULL; END $$;
    CREATE TRIGGER record_cleanup AFTER DELETE ON a15.app_rate_limit_buckets REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION a15.record_cleanup()`);
  const parallelCleaner=spawnWorker(workerEnv);
  const cleanResults=await rpc(parallelCleaner,{op:'calls',concurrency:5,calls:Array.from({length:40},(_,i)=>({key:'parallel-clean-'+i,limit:1,window:1000}))});
  assert.ok(cleanResults.every(v=>v===true));
  // Continue at most a fixed number of separate requests, not an unbounded
  // loop inside one production admission, if all concurrent calls beat COMMIT.
  for(let i=0;i<6;i++)await calls(parallelCleaner,'drain-clean-'+i,1,1000);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.app_rate_limit_buckets WHERE expires_at=2')).rows[0].count),0);
  const batches=(await sql.query('SELECT n FROM a15.cleanup_batches')).rows.map(v=>v.n);assert.ok(batches.every(n=>n>=0&&n<=64));assert.equal(batches.reduce((n,v)=>n+v,0),320);
  assert.equal(Number((await sql.query('SELECT count(*) FROM a15.cleanup_batches a JOIN a15.cleanup_batches b ON a.id<b.id AND a.started_at<b.finished_at AND b.started_at<a.finished_at')).rows[0].count),0);
  const cleanerStats=await rpc(parallelCleaner,{op:'stats'});assert.equal(cleanerStats.waiting,0);assert.equal(cleanerStats.total,cleanerStats.idle);
  await stopWorker(parallelCleaner);await sql.query('DROP TRIGGER record_cleanup ON a15.app_rate_limit_buckets');
  log(`MODIFIED CLEANUP_CONCURRENT requests=46 deleted=320 max_batch=${Math.max(...batches)} overlap=0 clients_returned=PASS`);
  for(const child of children){assert.doesNotMatch(child.errors,/fixture@example\.test|192\.0\.2\.1|postgresql:|SELECT |UPDATE /);}
  log('MODIFIED PASS supplier_calls=0 production_connections=0 new_pools=0');
} finally {
  for(const child of [...children])await stopWorker(child);
  for(const socket of [...sockets])socket.destroy();
  if(proxy)await new Promise(resolve=>proxy.close(resolve));
  for(const client of [...borrowed])client.release(true);
  if(sql)await sql.end();
  if(container){
    const inspect=JSON.parse(docker('inspect',container))[0];
    assert.equal(inspect.Id,container);assert.equal(inspect.Config.Labels['naumi.fixture'],label);
    docker('stop','-t','3',container);docker('rm',container);
    assert.equal(docker('ps','-a','--no-trunc','--filter','label=naumi.fixture='+label,'--format','{{.ID}}'),'');
    Object.assign(resource,{stoppedByFullId:true,removedByFullId:true,labelInventoryEmpty:true,nodeChildrenRemaining:children.size});
    fs.writeFileSync(path.join(out,'RESOURCE_CLEANUP.json'),JSON.stringify(resource,null,2));
    fs.appendFileSync(path.join(out,'RESOURCE_HISTORY.jsonl'),JSON.stringify(resource)+'\n');
    log(`RESOURCE_CLEANUP container=${container} label=${label} remaining=0`);
  }
}
