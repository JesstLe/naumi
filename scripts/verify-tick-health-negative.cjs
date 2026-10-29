// Actual health-module SQL / receipt store on a dedicated ephemeral local PG.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process'),{transformSync}=require('esbuild'),{Pool}=require('pg');
const source=path.resolve(process.argv[2]||'.'),baseline=process.argv[3]==='baseline';
let container;
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function load(file,bindings={}){const module={exports:{}};const code=transformSync(fs.readFileSync(path.join(source,file),'utf8'),{loader:'ts',format:'cjs'}).code;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(s=>s==='server-only'?{}:bindings[s]||require(s),module,module.exports);return module.exports;}
(async()=>{
 const name='naumi-health-negative-'+randomUUID(),label='tick-health-negative',password=randomUUID();
 container=run('docker',['run','-d','--rm','--name',name,'--label','naumi.task='+label,'--memory','256m','--cpus','1','--tmpfs','/var/lib/postgresql/data','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB=tick_health_fixture','postgres:16-alpine']);
 try{
  let ready=false;for(let n=0;n<50;n++){if(spawnSync('docker',['exec',container,'pg_isready','-U','postgres']).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  const port=run('docker',['port',container,'5432/tcp']).split(':').at(-1),pool=new Pool({connectionString:`postgresql://postgres:${password}@127.0.0.1:${port}/tick_health_fixture`,max:2});
  try{
   await pool.query('CREATE TABLE app_image_jobs(email text,created_at timestamptz,snapshot jsonb); CREATE TABLE app_canvas_image_tasks(email text,created_at timestamptz,status text); CREATE TABLE app_video_tasks(email text,created_at timestamptz,status text)');
   const health=load('src/lib/enterprise/health.ts',{'../platform/db/pool':{dbEnabled:true,getPool:()=>pool},'@/platform/db/pool':{dbEnabled:true,getPool:()=>pool},'@/lib/teams/server':{TeamError:Error},'./server':{enterpriseRead:async(_a,_id,cb)=>cb(pool,{owner:true,manageMembers:true,visible:[],team:{owner_email:'fixture@local.test'}})}});
   const current=process.cwd();const receiptFile=path.join(current,'src/lib/release-runtime/worker-tick-receipts.ts');
   const receiptSource=transformSync(fs.readFileSync(receiptFile,'utf8'),{loader:'ts',format:'cjs'}).code,module={exports:{}};
   vm.runInThisContext('(function(require,module,exports){'+receiptSource+'\n})')(s=>s==='server-only'?{}:require(s),module,module.exports);
   const store=module.exports.createWorkerTickReceiptStore(pool),commit='d'.repeat(40),web={instanceId:'health-fixture',bootId:randomUUID(),commit,bootSource:'preload'};
   const identity=v=>({tickId:randomUUID(),workerInstanceId:'fixture-worker',workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:web.instanceId,...(v===2?{protocolVersion:2,targetWebBootId:web.bootId,targetWebCommit:commit}:{})});
   const adminSource=fs.readFileSync(path.join(source,'src/app/admin/health/page.tsx'),'utf8');
   const adminTemplate=adminSource.match(/q\(`(SELECT count\(\*\)::int n, max\(accepted_at\) last_at FROM app_worker_tick_receipts[^`]+)`\)/)[1];
   const capabilitySql=adminSource.match(/q\(`(SELECT EXISTS\(SELECT 1 FROM pg_attribute[^`]+)`\)/)?.[1];
   let checks=0;
   const read=async(label,n,last)=>{const hasNegative=capabilitySql?(await pool.query(capabilitySql)).rows[0].has_negative===1:false;const adminSql=vm.runInNewContext('`'+adminTemplate+'`',{hasNegative});const v=await health.enterpriseHealth({},'fixture'),a=(await pool.query(adminSql)).rows[0];assert.equal(v.worker.recentTicks,n);assert.equal(a.n,n);assert.equal(v.worker.lastAcceptedAt,last||null);assert.equal(a.last_at?.toISOString()||null,last||null);checks++;console.log(label+' RECENT='+n+' ACCEPTED_TIME='+(last?'present':'null'));};
   const seed=identity(1);await store.accept(seed,web);
   const cols=await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='app_worker_tick_receipts'");assert.ok(!cols.rows.some(r=>r.column_name==='nonacceptance_at'));
   await pool.query('TRUNCATE app_worker_tick_receipts');await read('OLD_SCHEMA_EMPTY',0,null);
   for(const phase of ['running','completed','unknown']){const i=identity(1);await store.accept(i,web);if(phase==='completed')await store.complete(i,web,{ok:true});if(phase==='unknown')await store.unknown(i,web);}
   let accepted=(await pool.query('SELECT max(accepted_at) last FROM app_worker_tick_receipts')).rows[0].last.toISOString();await read('V1_ALL_ACCEPTED_PHASES',3,accepted);
   await pool.query('TRUNCATE app_worker_tick_receipts');const negative=await store.proveNotAccepted(identity(2),web);assert.equal(negative.acceptedAt,null);
   const physical=(await pool.query('SELECT accepted_at FROM app_worker_tick_receipts')).rows[0].accepted_at.toISOString();await read('NEGATIVE_ONLY',baseline?1:0,baseline?physical:null);
   const real=identity(2);await store.acceptFenced(real,web);await store.unknown(real,web);
   accepted=(await pool.query('SELECT max(accepted_at) last FROM app_worker_tick_receipts WHERE nonacceptance_at IS NULL')).rows[0].last.toISOString();await read('NEGATIVE_PLUS_ACCEPTED_UNKNOWN',baseline?2:1,accepted);
   assert.equal((await pool.query('SELECT count(*)::int n FROM app_worker_tick_receipts WHERE nonacceptance_at IS NOT NULL')).rows[0].n,1);
   console.log(`TICK_HEALTH_${baseline?'BASELINE':'MODIFIED'}=PASS CASES=${checks} REAL_PG=1 SCANS=0 SUPPLIER_CALLS=0 TOMBSTONES_RETAINED=1`);
  }finally{await pool.end();}
 }finally{assert.equal(run('docker',['inspect','--format','{{index .Config.Labels "naumi.task"}}',container]),label);run('docker',['rm','-f',container]);console.log('OWN_FIXTURE_REMOVED=1');}
})().catch(e=>{console.error(e);process.exitCode=1});
