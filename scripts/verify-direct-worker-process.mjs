/** Linux real child process + actual production bundle and real isolated PG.
 * Cached image supplies Node/native dependencies only, not tested App source. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,rm,writeFile,chown,chmod} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {combinedWorkerPlan,CombinedWorkerSupervisor} from './video-worker-with-media.mjs';
const require=createRequire(import.meta.url),{Pool}=require('pg'),baseline=process.argv.includes('--baseline'),mode=baseline?'BASELINE':'MODIFIED',part=process.env.DIRECT_WORKER_PART||'recovery';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'r5b-db');assert.equal(process.platform,'linux');
const dir=await mkdtemp('/tmp/naumi-direct-worker-'),schema='direct_worker_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query('CREATE SCHEMA '+schema);
const secret='direct-worker-fixture-secret-01234567890123456789',commit='b'.repeat(40),instance='fixture-direct-worker',stateFile=path.join(dir,'worker.json'),media=path.join(dir,'media');await mkdir(media);
let calls=0,provider=0,checks=0,child,logs='',backend,lock;
if(part==='combined'){await chown(dir,1001,1001);await chmod(dir,0o755);await chown(media,1001,1001);}
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=a=>{assert.ok(a);checks++;},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const web=createServer((req,res)=>{if(req.url.startsWith('/api/'))calls++;else provider++;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture Web deliberately unavailable"}');});await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+web.address().port;
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=part==='combined'?3001:probe.address().port;await new Promise(resolve=>probe.close(resolve));
const common={...process.env,PGOPTIONS:'-c search_path='+schema,NODE_OPTIONS:'',SETTINGS_SECRET:'direct-worker-fixture-settings-01234567890123456789',NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_DIR:media,MEDIA_PRIVATE:'0',OPENAI_API_KEY:'fixture-no-provider',OPENAI_BASE_URL:origin+'/v1',OPENAI_IMAGE_MODEL:'gpt-image-2',OPENAI_IMAGE_MODELS:'gpt-image-2',NEW_API_IMAGE_API_KEY:'',NAUMI_ROUTER_MANAGEMENT_URL:'',NAUMI_ROUTER_MANAGEMENT_TOKEN:'',VIDEO_PROVIDERS_JSON:'[]',VIDEO_API_KEY:'',MEDIA_WORKER_ORIGIN:'',NAUMI_VIDEO_WORKER:'0',SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:instance,NAUMI_RELEASE_RUNTIME:'0'};
Object.assign(process.env,common);backend=require('/fixture/'+(baseline?'baseline-fixture.cjs':'modified-fixture.cjs'));
const status=async()=>{const r=await fetch(`http://127.0.0.1:${port}/status`,{headers:{'x-video-worker-secret':secret},signal:AbortSignal.timeout(2000)});assert.equal(r.status,200);return r.json();};
const until=async(read,accept,timeout=30000)=>{const end=Date.now()+timeout;let value;while(Date.now()<end){try{value=await read();if(accept(value))return value;}catch{}if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('Worker exited '+child.exitCode+' '+logs);await sleep(40);}throw Error('Fixture wait timeout '+JSON.stringify(value)+' '+logs);};
const control=async(action,s,tickId)=>{const r=await fetch(`http://127.0.0.1:${port}/control`,{method:'POST',headers:{'x-video-worker-secret':secret,'content-type':'application/json'},body:JSON.stringify({action,bootId:s.bootId,operationId:randomUUID(),expectedRevision:s.revision,...(tickId?{tickId}:{})})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
async function start(crash=false){
 const observer=path.join(dir,'crash.cjs');if(crash)await writeFile(observer,`const fs=require('node:fs/promises');const rename=fs.rename;fs.rename=async function(from,to){if(to===process.env.NAUMI_WORKER_STATE_FILE){const data=JSON.parse(await fs.readFile(from,'utf8'));if(data.lastTick?.phase==='complete')process.exit(91);}return rename.call(this,from,to);};\n`);
 const env={...common,NAUMI_RELEASE_RUNTIME:'1',NAUMI_RELEASE_ADMISSION_START:'open',NAUMI_WORKER_EXECUTION:'direct',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',NAUMI_WORKER_STATE_FILE:stateFile,NAUMI_WORKER_TARGET_INSTANCE_ID:instance,NAUMI_WORKER_CONTROL_PORT:String(port),NAUMI_APP_ORIGIN:origin,INTERNAL_APP_ORIGIN:origin,VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000'};
 if(part==='combined'){
  Object.assign(env,{NAUMI_MEDIA_WORKER:'1',MEDIA_WORKER_SECRET:'direct-media-fixture-secret-01234567890123456789',MEDIA_JOB_DIR:'/scratch',MEDIA_WORKER_ORIGIN:'http://127.0.0.1:3002',MEDIA_DIR:media});
  const supervisor=new CombinedWorkerSupervisor(combinedWorkerPlan(env),{log:line=>logs+=line+'\n'});child={exitCode:null,kill:()=>{void supervisor.shutdown(0);}};child.done=supervisor.done.then(code=>{child.exitCode=code;return code;});await supervisor.start();eq(supervisor.children.size,2);eq(supervisor.children.get('scanner').spec,undefined);return status();
 }
 const file=baseline?'/fixture/baseline-scripts/video-worker.mjs':'/app/scripts/video-worker.mjs';child=spawn(process.execPath,[...(crash?['--require',observer]:[]),file],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);child.done=new Promise(resolve=>child.once('close',code=>resolve(code)));return until(status,s=>s.instanceId===instance,90000);
}
try{
 const seed=await backend.seed(),sql=backend.pool();let s=await start(part==='crash');eq(s.phase,'QUIESCENT');eq(calls,0);eq((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
 if(!baseline){eq(s.executionMode,'direct');eq(s.executorRole,'worker');eq(s.targetInstanceId,instance);eq(s.backgroundTasks,0);}
 if(part==='drain'){lock=await sql.connect();await lock.query('BEGIN');await lock.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE',[seed.owner]);}
 await control('resume',s);
 if(baseline){s=await until(status,s=>s.phase==='UNKNOWN');eq(s.paused,true);eq(calls,1);eq((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);eq((await sql.query("SELECT count(*)::int n FROM app_image_jobs WHERE id=ANY($1) AND snapshot->>'status'='pending'",[Object.values(seed.ids)])).rows[0].n,4);}
 else{
  if(part==='drain'){
   s=await until(status,s=>s.activeTicks===1&&s.backgroundTasks>0);eq(s.tickDrainComplete,false);const drained=await control('drain',s);eq(drained.state.phase,'DRAINING');eq(drained.state.tickDrainComplete,false);
   child.kill('SIGTERM');await sleep(200);eq(child.exitCode,null);eq(calls,0);await lock.query('COMMIT');lock.release();lock=null;eq(await child.done,0);
  }else if(part==='crash'){
   eq(await child.done,91);const saved=JSON.parse(await readFile(stateFile,'utf8'));eq(saved.lastTick.phase,'dispatched');
   const receipt=(await sql.query('SELECT phase,worker_boot_id,web_instance_id FROM app_worker_tick_receipts WHERE tick_id=$1',[saved.lastTick.id])).rows[0];eq(receipt.phase,'completed');eq(receipt.web_instance_id,instance);
   s=await start();eq(s.phase,'UNKNOWN');eq(s.paused,true);eq(s.lastTick.workerBootId,saved.lastTick.workerBootId);const reconciled=await control('reconcile',s,s.lastTick.id);eq(reconciled.state.phase,'QUIESCENT');eq(reconciled.state.paused,true);eq(reconciled.receipt.serverReceipt.worker.bootId,receipt.worker_boot_id);eq(reconciled.receipt.observedServer.role,'worker');eq(calls,0);
  }else{s=await until(status,s=>s.lastTick?.phase==='complete'&&s.activeTicks===0);s=(await control('drain',s)).state;eq(s.phase,'QUIESCENT');eq(s.tickDrainComplete,true);}
  eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[seed.owner])).rows[0],{n:3,amount:18});
  for(const [kind,id]of Object.entries(seed.ids)){const row=(await sql.query('SELECT snapshot,payload FROM app_image_jobs WHERE id=$1',[id])).rows[0];eq(row.snapshot.status,'done');if(kind!=='imagegen'){eq(row.payload.billingQuote,seed.quotes[kind]);eq((await sql.query('SELECT state,charged_credits FROM app_billing_operations WHERE id=$1',[id])).rows[0],{state:'settled',charged_credits:6});}if(kind==='generate')eq(row.payload.creationScope,seed.scope);}
  const live=(await sql.query('SELECT lease_token FROM app_image_jobs WHERE id=$1',[seed.live])).rows[0];eq(live.lease_token,seed.token);const unknown=(await sql.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[seed.unknown])).rows[0];eq(unknown.snapshot.paidOperations[seed.unknown].state,'started');eq(unknown.snapshot.status,'needs_attention');eq(calls,0);eq(provider,0);
  const receipt=(await sql.query('SELECT phase,web_instance_id,worker_instance_id FROM app_worker_tick_receipts')).rows;eq(receipt.length,1);eq(receipt[0],{phase:'completed',web_instance_id:instance,worker_instance_id:instance});
 }
 if(child.exitCode===null){child.kill('SIGTERM');eq(await child.done,baseline?2:0);}
 console.log(`DIRECT_WORKER_PROCESS=PASS mode=${mode} part=${part} checks=${checks} REAL_CHILD=1 REAL_PG=1 WEB_POSTS=${calls} CONSUME=${baseline?0:3} CREDITS=${baseline?0:18} FROZEN=6_CURRENT17 SUPPLIER_POSTS=${provider} POSIX_SIGNALS=1`);
}finally{
 if(lock){await lock.query('ROLLBACK');lock.release();}if(child?.exitCode===null){child.kill('SIGTERM');await child.done;}
 await writeFile('/evidence/'+mode+'_'+part+'_CHILD.log',logs);await backend.pool().end();web.closeAllConnections();await new Promise(resolve=>web.close(resolve));await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();await rm(dir,{recursive:true,force:true});console.log('DIRECT_WORKER_PROCESS_CLEANUP=PASS CHILD_STOPPED=1 RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 TEMP_FILES_REMOVED=1');
}
