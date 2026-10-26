import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {Pool} from 'pg';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/anomaly_fixture/);
 const baseline=process.argv.includes('--baseline'),sourceRoot=process.argv.includes('--source-root')?process.argv[process.argv.indexOf('--source-root')+1]:process.cwd();
 const admin=new Pool({connectionString:url.toString()}),schema='anomaly_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 process.env.PGOPTIONS=`-c search_path=${schema}`;process.env.SETTINGS_SECRET='isolated-anomaly-test-settings-secret';
 process.env.NAUMI_RELEASE_RUNTIME='1';process.env.NAUMI_RELEASE_ADMISSION_START='open';process.env.NAUMI_INSTANCE_ID='anomaly-fixture-'+randomUUID();process.env.SOURCE_COMMIT='a'.repeat(40);
 const background=await import('../src/lib/release-runtime/background-activity'),store=await import('../src/lib/release-runtime/store');
 const sql=new Pool({connectionString:url.toString(),options:`-c search_path=${schema}`});
 const native=createRequire(import.meta.url),results:{name:string;passed:boolean}[]=[];
 const check=(name:string,value:boolean)=>results.push({name,passed:value});
 try{
  let reads=0,batchFails=true,dispatches=0,paidPosts=0;
  const stub:any={};
  const fakeRequire=(name:string):any=>{
   if(name.includes('background-activity'))return background;
   if(name.includes('release-runtime/identity'))return {releaseRuntimeEnabled:()=>true};
   if(name==='@/lib/db')return {dbEnabled:true};
   if(name==='@/lib/image-job-repository')return {dueImageJobs:async()=>{reads++;return [{id:'eligible',kind:'generate'},{id:'held',kind:'generate'}];}};
   if(name==='./image-job-queue')return {dispatchImageQueue:async(items:any[],send:any)=>{let n=0;for(const item of items)if(await send(item))n++;return n;}};
   if(name==='./imagegen/batch')return {recoverImagegenBatches:async()=>{if(batchFails){batchFails=false;throw Error('fixture-batch-read-failed');}return 0;}};
   if(name==='./imagegen/stored-delivery')return {recoverStoredDeliveries:async()=>0};
   if(name==='server-only')return {};
   if(name.startsWith('node:'))return native(name);
   return stub;
  };
  const exports:any={},file=resolve(sourceRoot,'src/lib/durable-image-jobs.ts');
  const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const scope={exports,module:{exports},require:fakeRequire,process,console:{error:()=>{}},Buffer,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout,
   fetch:async(_url:string,options:any)=>{dispatches++;const id=JSON.parse(options.body).workerJobId;await background.withBackgroundActivity('durable-image','generate:'+id,'claim',async()=>{if(id==='held')paidPosts++;return 1;},()=>0);return {ok:true};}};
  vm.runInNewContext(compiled,scope,{filename:file});
  await assert.rejects(background.withBackgroundActivity('durable-image','generate:held','claim',async()=>{throw Error('accepted-unknown');},()=>0));
  await assert.rejects(exports.recoverDurableImageJobs(),/fixture-batch-read-failed/);
  const afterFailure=reads;await exports.recoverDurableImageJobs();
  check('SCANNER_REENTERS_AFTER_FAILED_TICK',reads===afterFailure+1);
  const oldUnknown=await sql.query("SELECT state FROM app_release_activities WHERE admission_key='generate:held'");check('ORIGINAL_PAID_UNKNOWN_UNCHANGED',oldUnknown.rows.length===1&&oldUnknown.rows[0].state==='unknown'&&paidPosts===0);
  const scans=await sql.query("SELECT state FROM app_release_activities WHERE admission_key LIKE 'recovery-dispatch-scan%'");check('FAILED_SCAN_EVIDENCE_RETAINED',scans.rows.some(r=>r.state==='unknown'));
  const before=reads;await Promise.all([exports.recoverDurableImageJobs(),exports.recoverDurableImageJobs()]);check('SAME_PROCESS_SCAN_COALESCED',reads===before+1);
  await sql.query("UPDATE app_release_boots SET admission='draining'");const drainedReads=reads;await exports.recoverDurableImageJobs();check('DRAIN_ADMISSION_STILL_BLOCKS',reads===drainedReads);await sql.query("UPDATE app_release_boots SET admission='open'");
  // Actual reader implementation and isolated PostgreSQL, not invented SQL.
  process.env.NAUMI_RELEASE_RUNTIME='0';
  const db=await import('../src/lib/db'),bi=await import('../src/lib/bi/repository'),legacy=await import('../src/lib/saas/legacy-creations');
  await bi.ensureBiSchema();const pool=db.getPool();const owner='anomaly-owner@fixture.test';await db.getOrCreateUser(owner);
  await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled) VALUES('fixture-pending',$1,'imagegen',$2::jsonb,'{}',false,true),('fixture-cancelled',$1,'imagegen',$3::jsonb,'{}',false,true),('fixture-done',$1,'generate',$4::jsonb,'{}',false,true)",[owner,JSON.stringify({status:'pending',result:{status:'pending'}}),JSON.stringify({status:'done',result:{status:'cancelled'}}),JSON.stringify({status:'done'})]);
  await pool.query("INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status) VALUES('fixture-completed',$1,'fixture-source','completed'),('fixture-failed',$1,'fixture-source','failed')",[owner]);
  const filters:any={source:'legacy',period:'all',page:1,size:100,user:owner,q:''};
  const all=await legacy.listLegacyCreations(filters);const cancelled=all.items.find(r=>JSON.parse(Buffer.from(r.id.slice(7),'base64url').toString()).id==='fixture-cancelled')!;
  const detail=await legacy.legacyCreationDetail(cancelled.id);check('LIST_DETAIL_TERMINAL_STATUS_EQUAL',cancelled.status===detail.detail.status&&cancelled.status==='cancelled');
  for(const [status,count] of [['queued',1],['succeeded',2],['failed',1],['cancelled',1]] as const){const r=await legacy.listLegacyCreations({...filters,status});check('FILTER_'+status,r.pagination.total===count&&r.items.length===count&&r.items.every(i=>i.status===status));}
  const foreign=await legacy.listLegacyCreations({...filters,user:'foreign@fixture.test'});check('OWNER_FILTER_PRESERVED',foreign.items.length===0);
  const untouched=await pool.query("SELECT snapshot->>'status' status,snapshot#>>'{result,status}' result FROM app_image_jobs WHERE id='fixture-cancelled'");check('READERS_NEVER_MUTATE_TASK',untouched.rows[0].status==='done'&&untouched.rows[0].result==='cancelled');
  const issues=results.filter(r=>!r.passed);if(baseline){assert(issues.some(r=>r.name==='SCANNER_REENTERS_AFTER_FAILED_TICK'));assert(issues.some(r=>r.name==='FILTER_queued'));console.log('BASELINE=REPRODUCED SCANNER_FIXED_KEY_BLOCK=1 LEGACY_FILTER_MISMATCH=1');}
  else assert.equal(issues.length,0,JSON.stringify(issues));
  console.log('ANOMALY_REGRESSIONS='+JSON.stringify({mode:baseline?'baseline':'modified',checks:results.length,failed:issues.map(r=>r.name),supplierPosts:paidPosts,originalUnknownPreserved:true,realPg:true}));
  await pool.end();
 }finally{await store.releasePool().end();await sql.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
