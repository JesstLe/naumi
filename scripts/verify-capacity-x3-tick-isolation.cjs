/** X3: real isolated PG + actual receipt/route/runtime implementations; synthetic scan only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {createServer} = require('node:http');
const {transformSync} = require('esbuild');
const {Pool} = require('pg');
const {EventEmitter} = require('node:events');
const {spawnSync} = require('node:child_process');
const root = path.resolve(process.argv[2] || '.');
const baseline = process.argv[3] === 'baseline';
const database = 'postgresql://postgres@127.0.0.1:55463/naumi_x3_tick_fixture?sslmode=disable';
// Never inherit a database URL, PG credentials, or dotenv. Only this dedicated local fixture.
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || key === 'DATABASE_URL' || key.startsWith('NAUMI_DB_') || key === 'NAUMI_TICK_POOL_MAX') delete process.env[key];
process.env.DATABASE_URL = database;
process.env.PGOPTIONS = '-c search_path=x3_' + randomUUID().replaceAll('-', '');
const schema = process.env.PGOPTIONS.split('=')[1];
const commit = 'a'.repeat(40), secret = 'x3-fixture-only-worker-secret-0123456789';
Object.assign(process.env, {SOURCE_COMMIT: commit, NAUMI_INSTANCE_ID: 'x3-web', VIDEO_WORKER_SECRET: secret});
const cases = [];
async function check(name, fn) { await fn(); cases.push(name); console.log('PASS ' + name); }
function load(relative, bindings = {}) {
  const filename = path.join(root, relative==='src/lib/db/connection.ts' && fs.existsSync(path.join(root,'src/platform/db/pool.ts')) ? 'src/platform/db/pool.ts' : relative);
  const code = transformSync(fs.readFileSync(filename, 'utf8'), {loader:'ts',format:'cjs',target:'es2022'}).code;
  const module = {exports:{}};
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', {filename})(name => name === 'server-only' ? {} : name in bindings ? bindings[name] : require(name), module, module.exports);
  return module.exports;
}
function deferred() { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; }
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function main() {
  const admin = new Pool({connectionString:database, max:1});
  const {rows:[info]} = await admin.query('SELECT current_database() name, inet_server_addr() address');
  assert.equal(info.name,'naumi_x3_tick_fixture');
  await admin.query('CREATE SCHEMA ' + schema);
  const connection=load('src/lib/db/connection.ts');
  const api=load('src/lib/release-runtime/worker-tick-receipts.ts');
  const business=connection.getPool();
  const seed=new Pool({connectionString:database,max:2});
  const store=api.createWorkerTickReceiptStore(seed), web=api.workerTickWebIdentity();
  const identity=()=>({tickId:randomUUID(),workerInstanceId:'x3-worker',workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:web.instanceId});
  const headers=input=>Object.fromEntries([...Object.entries(api.TICK_HEADERS).map(([key,name])=>[name,input[key]]),['x-video-worker-secret',secret]]);
  let scans=0, server, extraPool;
  const route=load('src/app/api/video/worker/tick/route.ts', {
    '@/lib/db':{dbEnabled:true,getPool:connection.getPool}, '@/lib/db/connection':connection,
    '@/platform/db/pool':{...connection,dbEnabled:true},
    '@/lib/worker/scan':{scanApplicationWorkerOnce:async()=>{scans++;return {ok:true};}},
    '@/lib/worker/authorization':{imageWorkerAuthorized:req=>req.headers.get('x-video-worker-secret')===secret},
    '@/lib/application/task-execution':{applicationTasksRunHere:()=>true},
    '@/lib/release-runtime/worker-tick-receipts':api,
    '@/lib/video/worker':{scanVideoWorkerOnce:async()=>{scans++;return 0;}},
    '@/lib/canvas-image-tasks':{recoverCanvasImageTasks:async()=>0},
    '@/lib/durable-image-jobs':{recoverDurableImageJobs:async()=>0,imageWorkerAuthorized:req=>req.headers.get('x-video-worker-secret')===secret},
    '@/lib/supplier-cost/worker':{scanSupplierCostsOnce:async()=>0},
    '@/lib/worker/media-recovery':{scheduleMediaRecovery:async()=>({})},
  });
  try {
    const tick=identity();await store.accept(tick,web);await store.complete(tick,web,{ok:true});
    const req=(t=tick)=>new Request('http://127.0.0.1/api/video/worker/tick?tickId='+t.tickId,{headers:headers(t)});
    await check('pool-saturation-actual-route', async()=>{
      const held=await Promise.all(Array.from({length:5},()=>business.connect()));
      try {const r=await route.GET(req()); assert.equal(r.status,baseline?503:200);
        if(baseline)assert.equal((await r.json()).error,'WORKER_TICK_DATABASE_TIMEOUT');
        else assert.equal((await r.json()).receipt.phase,'completed');
        console.log('SATURATION status='+r.status+' businessWaiting='+business.waitingCount);
      } finally {held.forEach(c=>c.release());}
      await delay(30);assert.equal((await route.GET(req())).status,200);assert.equal(business.waitingCount,0);
      assert.equal(business.totalCount,business.idleCount);
    });
    await check('saturated-business-accept-complete-isolated',async()=>{
      const control=api.createWorkerTickReceiptStore(connection.getWorkerTickPool?.() || business);
      const running=identity();await control.accept(running,web);const fresh=identity();
      const held=await Promise.all(Array.from({length:5},()=>business.connect()));
      try {
        if(baseline) {
          await assert.rejects(control.accept(fresh,web),/WORKER_TICK_DATABASE_TIMEOUT/);
          await assert.rejects(control.complete(running,web,{ok:true}),/WORKER_TICK_DATABASE_TIMEOUT/);
        } else {
          assert.equal((await control.accept(fresh,web)).accepted,true);
          assert.equal((await control.complete(running,web,{ok:true})).phase,'completed');
          assert.equal((await control.complete(fresh,web,{ok:true})).phase,'completed');
        }
      } finally {held.forEach(c=>c.release());}
      await delay(30);assert.equal(business.waitingCount,0);assert.equal(business.totalCount,business.idleCount);
    });
    await check('late-checkout-released-no-query', async()=>{
      let released=0,queries=0;
      const slow=api.createWorkerTickReceiptStore({connect:async()=>{await delay(3100);return {query:async()=>{queries++;},release:()=>released++};}});
      await assert.rejects(slow.read(tick,web),/WORKER_TICK_DATABASE_TIMEOUT/);
      await delay(150);assert.equal(released,1);assert.equal(queries,0);
    });
    await check('rollback-failure-discards-client',async()=>{
      let discarded;
      const broken=api.createWorkerTickReceiptStore({connect:async()=>Object.assign(new EventEmitter(),{query:async sql=>{if(sql.startsWith('SELECT'))throw Error('query-failed');if(sql==='ROLLBACK')throw Error('rollback-failed');return {rows:[]};},release:value=>discarded=!!value})});
      await assert.rejects(broken.read(tick,web),/query-failed/);assert.equal(discarded,!baseline);
      console.log('ROLLBACK_FAILURE discarded='+discarded);
    });
    await check('active-pg-disconnect-isolated-process',async()=>{
      const result=spawnSync(process.execPath,[__filename,root,baseline?'baseline':'modified','--disconnect-probe'],{encoding:'utf8',timeout:15000});
      assert.equal(result.status,baseline?1:0,result.stdout+result.stderr);
      if(baseline)assert.match(result.stderr,/Unhandled 'error' event/);
      else assert.match(result.stdout,/ACTIVE_DISCONNECT=HANDLED CLIENTS=0/);
      console.log('ACTIVE_DISCONNECT childExit='+result.status+' handled='+!baseline);
    });
    await check('bundle-singleton',async()=>{
      const other=load('src/lib/db/connection.ts');extraPool=other.getPool();assert.equal(extraPool===business,!baseline);
      console.log('BUNDLE_SINGLETON shared='+(extraPool===business));
      if(extraPool!==business){await extraPool.end();extraPool=undefined;}
    });
    await check('receipt-auth-owner-and-boot-fencing',async()=>{
      assert.equal((await route.GET(new Request(req().url))).status,401);
      assert.equal((await route.GET(req({...tick,workerBootId:randomUUID()}))).status,409);
      const open=identity();await store.accept(open,web);
      await assert.rejects(store.complete(open,{...web,bootId:randomUUID()},{ok:true}),/COMPLETION_CONFLICT/);
      await assert.rejects(store.complete({...open,workerBootId:randomUUID()},web,{ok:true}),/COMPLETION_CONFLICT/);
      assert.equal((await store.read(open,web)).phase,'running');
      await store.complete(open,web,{ok:true});assert.equal((await store.read(open,{...web,bootId:randomUUID()})).phase,'completed');
    });
    await check('accept-commit-before-scan-and-no-held-client',async()=>{
      const once=identity();let executed=0;
      const work=()=>api.runReceiptedWorkerTick(store,once,web,async()=>{executed++;assert.equal(seed.totalCount,seed.idleCount);assert.equal((await store.read(once,web)).phase,'running');return {ok:true};});
      await work();const repeats=await Promise.all(Array.from({length:6},work));
      assert.equal(executed,1);assert.ok(repeats.every(x=>x.duplicate));
      const race=identity();executed=0;
      await Promise.all(Array.from({length:8},()=>api.runReceiptedWorkerTick(store,race,web,async()=>{executed++;await delay(30);return {ok:true};})));
      assert.equal(executed,1);
    });
    await check('accepted-scan-or-completion-failure-stays-unknown',async()=>{
      const a=identity();await assert.rejects(api.runReceiptedWorkerTick(store,a,web,async()=>{throw Error('scan-lost');}),/scan-lost/);
      assert.equal((await store.read(a,web)).phase,'unknown');
      let rescans=0;assert.equal((await api.runReceiptedWorkerTick(store,a,web,async()=>{rescans++;return {ok:true};})).duplicate,true);assert.equal(rescans,0);
      const b=identity();await assert.rejects(api.runReceiptedWorkerTick({...store,complete:async()=>{throw Error('write-lost');}},b,web,async()=>({ok:true})),/write-lost/);
      assert.equal((await store.read(b,web)).phase,'unknown');
    });
    await check('lock-timeout-rollback-and-next-read',async()=>{
      const locked=identity();await store.accept(locked,web);const client=await seed.connect();
      try {await client.query('BEGIN');await client.query('SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1 FOR UPDATE',[locked.tickId]);
        await assert.rejects(store.complete(locked,web,{ok:true}),err=>err.code==='55P03');
      } finally {await client.query('ROLLBACK');client.release();}
      assert.equal((await store.read(locked,web)).phase,'running');
    });
    if(!baseline) {
      await check('configuration-budget-boundaries',async()=>{
        const config=connection.databasePoolBudget;
        assert.deepEqual(config({}),{business:5,tick:2,other:8,total:15,budget:15});
        assert.equal(config({PGPOOL_MAX:'7',NAUMI_TICK_POOL_MAX:'1',NAUMI_DB_POOL_BUDGET:'16'}).total,16);
        for(const value of ['','0','-1','1.5','NaN','5x',' 5','9007199254740992'])assert.throws(()=>config({PGPOOL_MAX:value}),/INVALID_DATABASE_POOL_CONFIG/);
        for(const key of ['NAUMI_TICK_POOL_MAX','NAUMI_DB_POOL_BUDGET'])assert.throws(()=>config({[key]:'0'}),/INVALID_DATABASE_POOL_CONFIG/);
        assert.throws(()=>config({PGPOOL_MAX:'6'}),/DATABASE_POOL_BUDGET_EXCEEDED/);
      });
      await check('tick-queue-timeout-removes-waiter',async()=>{
        const pool=connection.getWorkerTickPool(),control=api.createWorkerTickReceiptStore(pool);
        const held=await Promise.all(Array.from({length:2},()=>pool.connect()));
        try {await assert.rejects(control.read(tick,web));await delay(30);assert.equal(pool.waitingCount,0);}
        finally {held.forEach(c=>c.release());}
        assert.equal((await control.read(tick,web)).phase,'completed');
      });
      await check('idle-error-handled-and-hot-reload-shares-control-pool',async()=>{
        const pool=connection.getWorkerTickPool();assert.ok(pool.listenerCount('error')>0);
        assert.equal(load('src/lib/db/connection.ts').getWorkerTickPool(),pool);
        assert.equal(pool.options.max,2);assert.equal(business.options.max,5);
      });
      await check('pool-generation-freezes-config-until-drained-close',async()=>{
        process.env.PGPOOL_MAX='1000';process.env.DATABASE_URL='invalid-new-config';
        try {const reloaded=load('src/lib/db/connection.ts');assert.equal(reloaded.getPool(),business);assert.equal(reloaded.getWorkerTickPool(),connection.getWorkerTickPool());}
        finally {delete process.env.PGPOOL_MAX;process.env.DATABASE_URL=database;}
      });
    }
    const {WorkerRuntime}=await import(pathToFileURL(path.join(root,'scripts/worker-runtime.mjs')).href);
    let mode='pre503',posts=0,gets=0,httpScans=0,observed;
    server=createServer(async(req,res)=>{
      try {
        const request=new Request('http://127.0.0.1'+req.url,{headers:req.headers,method:req.method});
        assert.equal(request.headers.get('x-video-worker-secret'),secret);
        const input=api.tickIdentity(request);observed=input;
        if(req.method==='POST') {
          posts++;
          if(mode==='pre503'){res.writeHead(503).end('{"error":"temporarily unavailable"}');return;}
          if(mode==='timeout'){res.once('close',()=>{});return;}
          const result=await api.runReceiptedWorkerTick(store,input,web,async()=>{httpScans++;return {ok:true};});
          if(mode==='lost'){res.destroy();return;}
          if(mode==='post503'){res.writeHead(503).end('{"error":"response failed after commit"}');return;}
          res.writeHead(200).end(JSON.stringify({ok:true,receipt:result.receipt,server:web}));
        } else {
          gets++;let receipt=await store.read(input,web);
          if(mode==='wrong-owner')receipt={...receipt,worker:{...receipt.worker,bootId:randomUUID()}};
          res.writeHead(200).end(JSON.stringify({ok:receipt.phase==='completed',receipt,server:{...web,bootId:randomUUID()}}));
        }
      } catch(e) {res.writeHead(e.status||503).end(JSON.stringify({error:e.code||'fixture'}));}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    const memory=()=>{let v=null;return {read:async()=>structuredClone(v),write:async x=>{v=structuredClone(x);}};};
    const worker=(state=memory())=>new WorkerRuntime({origin,secret,instanceId:'x3-worker',commit,targetInstanceId:web.instanceId,store:state,timeoutMs:150,startPaused:false});
    const reconcile=w=>w.control({action:'reconcile',operationId:randomUUID(),bootId:w.bootId,expectedRevision:w.state.revision,tickId:w.state.lastTick.id});
    await check('http-preaccept-503-and-get404-remain-unknown',async()=>{
      mode='pre503';const w=worker();await w.init();const before=httpScans;await w.tick();assert.equal(httpScans,before);
      assert.equal(w.snapshot().phase,'UNKNOWN');const saved=structuredClone(w.state);
      await assert.rejects(reconcile(w),/RECONCILE_UNVERIFIED/);assert.deepEqual(w.state,saved);
      await assert.rejects(w.control({action:'resume',operationId:randomUUID(),bootId:w.bootId,expectedRevision:w.state.revision}),/UNRESOLVED_TICK/);
      const count=posts;await w.tick();assert.equal(posts,count);
    });
    for(const failure of ['lost','post503'])await check('http-postaccept-'+failure+'-reconcile-original-boot',async()=>{
      mode=failure;const state=memory(),w=worker(state);await w.init();const before=httpScans;await w.tick();
      assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(httpScans,before+1);const original=w.bootId,count=posts;
      const reboot=worker(state);await reboot.init();assert.notEqual(reboot.bootId,original);
      mode='wrong-owner';await assert.rejects(reconcile(reboot),/RECONCILE_UNVERIFIED/);assert.equal(reboot.snapshot().phase,'UNKNOWN');
      mode='complete';await reconcile(reboot);assert.equal(reboot.snapshot().phase,'QUIESCENT');assert.equal(reboot.snapshot().paused,true);
      assert.equal(observed.workerBootId,original);await reboot.tick();assert.equal(posts,count);assert.equal(httpScans,before+1);
    });
    await check('http-abort-preserves-original-unknown',async()=>{
      mode='timeout';const w=worker();await w.init();await w.tick();assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().lastTick.failure.code,'TimeoutError');
      const saved=structuredClone(w.state);await assert.rejects(reconcile(w),/RECONCILE_UNVERIFIED/);assert.deepEqual(w.state,saved);
    });
    assert.equal(scans,0);
    if(!baseline)await check('graceful-close-fences-reopen-until-release',async()=>{
      const tickPool=connection.getWorkerTickPool(),held=await tickPool.connect();
      const closing=connection.closeDatabasePools();assert.equal(connection.closeDatabasePools(),closing);
      assert.throws(()=>connection.getPool(),/DATABASE_POOLS_CLOSING/);assert.throws(()=>connection.getWorkerTickPool(),/DATABASE_POOLS_CLOSING/);
      held.release();await closing;assert.equal(tickPool.ended,true);assert.equal(business.ended,true);
      const freshBusiness=connection.getPool();assert.notEqual(freshBusiness,business);
      process.env.PGPOOL_MAX='1000';process.env.DATABASE_URL='invalid-new-config';
      let fresh;
      try {fresh=connection.getWorkerTickPool();assert.equal(fresh.options.connectionString,database);assert.equal(fresh.options.max,2);}
      finally {delete process.env.PGPOOL_MAX;process.env.DATABASE_URL=database;}
      assert.notEqual(fresh,tickPool);assert.equal((await fresh.query('SELECT 1 n')).rows[0].n,1);
      assert.equal((await route.GET(req())).status,200);await connection.closeDatabasePools();
    });
    console.log('X3_'+(baseline?'BASELINE':'MODIFIED')+'=PASS CASES='+cases.length+' REAL_PG=1 ACTUAL_ROUTE=1 HTTP=LOCAL FIXTURE_SCANS='+httpScans+' SUPPLIER_CALLS=0');
  } finally {
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(connection.closeDatabasePools)await connection.closeDatabasePools();else if(!business.ended)await business.end();
    await seed.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
  }
}
async function activeDisconnectProbe() {
  // Only the just-checked-out fixture backend is terminated, never another PID.
  const api=load('src/lib/release-runtime/worker-tick-receipts.ts');
  const pool=new Pool({connectionString:database,max:1}),admin=new Pool({connectionString:database,max:1});
  let termination;
  const wrapped={connect:async()=>{
    const client=await pool.connect(),query=client.query.bind(client);
    client.query=async(sql,...args)=>{
      if(sql.startsWith('SELECT * FROM')) {
        setTimeout(()=>{termination=admin.query('SELECT pg_terminate_backend($1)',[client.processID]);},50);
        return query('SELECT pg_sleep(2)');
      }
      return query(sql,...args);
    };
    return client;
  }};
  try {
    await assert.rejects(api.createWorkerTickReceiptStore(wrapped).read({tickId:randomUUID(),workerInstanceId:'x3-worker',workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:'x3-web'},
      {instanceId:'x3-web',bootId:randomUUID(),commit}));
    await termination;await delay(20);assert.equal(pool.totalCount,0);
    console.log('ACTIVE_DISCONNECT=HANDLED CLIENTS=0');
  } finally {await pool.end();await admin.end();}
}
(process.argv[4]==='--disconnect-probe'?activeDisconnectProbe():main()).catch(e=>{console.error(e);process.exitCode=1;});
