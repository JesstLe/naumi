'use strict';
// Real finish/transaction/UNKNOWN SQL and real background wrappers, isolated PG.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto'),{AsyncLocalStorage}=require('node:async_hooks'),{Pool}=require('pg'),ts=require('typescript');
const flag=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const baseline=process.argv.includes('--baseline'),root=path.resolve(flag('--source-root')||'.');
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');
const schema='finish_isolation_'+randomUUID().replaceAll('-',''),identity={instanceId:'fixture-finish',bootId:randomUUID()};
const admin=new Pool({connectionString:process.env.DATABASE_URL,max:1});let pool,checks=0;
class ReleaseRuntimeError extends Error {constructor(code){super(code);this.code=code;}}
function ast(relative,names){const text=fs.readFileSync(path.join(root,relative),'utf8'),tree=ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true),found=[];ts.forEachChild(tree,n=>{if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.push(n.getText(tree));});assert.equal(found.length,names.length);return found.join('\n');}
const storeSource=ast('src/lib/release-runtime/store.ts',['transaction','finishActivity','unknownActivity']);
const bgSource=fs.readFileSync(path.join(root,'src/lib/release-runtime/background-activity.ts'),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const inflight={};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'src/lib/worker/inflight.ts'),'utf8')),{exports:inflight});
async function fixture(fault){
 await pool.query('TRUNCATE app_release_activities,app_release_session_owners');
 const id=randomUUID(),logs=[],events=[],metrics={actions:0,cleanup:0,settled:0};
 await pool.query("INSERT INTO app_release_activities(id,instance_id,boot_id,activity_kind,state) VALUES($1,$2,$3,'accepted-work','active')",[id,identity.instanceId,identity.bootId]);
 await pool.query("INSERT INTO app_release_session_owners(run_id,instance_id,boot_id,state) VALUES($1,$2,$3,'running')",[id,identity.instanceId,identity.bootId]);
 const query=async(client,sql,values)=>{
  const text=String(sql);events.push(text.trim().split(/\s+/).slice(0,3).join(' '));
  if(text.startsWith('DELETE FROM app_release_activities')){
   metrics.cleanup++;
   if(fault==='cleanup-sql')return client.query('SELECT 1/0');
   if(fault==='cleanup-connect')throw new Error('timeout exceeded when trying to connect');
  }
  if(fault==='completion-update'&&text.startsWith("UPDATE app_release_activities SET state='finished'"))return client.query('SELECT 1/0');
  return client.query(sql,values);
 };
 const wrapped={query:(sql,v)=>query(pool,sql,v),connect:async()=>{const c=await pool.connect();return {query:(sql,v)=>query(c,sql,v),release:()=>c.release()};}};
 const store={};vm.runInNewContext(compile(storeSource),{exports:store,ensureReleaseSchema:async()=>{},releasePool:()=>wrapped,releaseIdentity:()=>identity,ReleaseRuntimeError,console:{warn:(...v)=>logs.push(v.join(' ')),error:(...v)=>logs.push(v.join(' '))}});
 Object.assign(store,{OBSERVED_BACKGROUND_SCOPES:['durable-image'],beginBackgroundActivity:async()=>{const r=(await pool.query('SELECT state FROM app_release_activities WHERE id=$1',[id])).rows[0];return r.state==='unknown'?null:id;},heartbeatActivity:async()=>{},bindBackgroundActivity:async()=>{}});
 const bg={},processFixture={env:{}};vm.runInNewContext(compile(bgSource),{exports:bg,require:n=>n==='node:async_hooks'?{AsyncLocalStorage}:n==='node:process'?processFixture:n==='./identity'?{releaseIdentity:()=>identity,releaseRuntimeEnabled:()=>true}:n==='./accepted-context'?{currentAcceptedParent:()=>undefined}:n==='./store'?store:n==='../worker/inflight'?inflight:(()=>{throw Error(n);})(),setInterval:()=>({unref(){}}),clearInterval:()=>{},console:{error:(...v)=>logs.push(v.join(' ')),warn:(...v)=>logs.push(v.join(' '))}});
 return {id,bg,store,logs,events,metrics,row:async()=>(await pool.query("SELECT a.state,s.state session FROM app_release_activities a JOIN app_release_session_owners s ON s.run_id=a.id WHERE a.id=$1",[id])).rows[0]};
}
async function step(name,body){await body();checks++;console.log('PASS '+name);}
async function main(){
 try{
  await admin.query('CREATE SCHEMA '+schema);pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE app_release_activities(id uuid PRIMARY KEY,instance_id text,boot_id uuid,activity_kind text,state text,finished_at timestamptz,heartbeat_at timestamptz,outcome text);CREATE TABLE app_release_session_owners(run_id uuid,instance_id text,boot_id uuid,state text,updated_at timestamptz)`);
  for(const fault of ['cleanup-sql','cleanup-connect'])await step((baseline?'historical cleanup failure poisons completed work: ':'cleanup failure preserves acknowledged work: ')+fault,async()=>{
   const f=await fixture(fault);let error;
   try{assert.equal(await f.bg.withBackgroundActivity('durable-image','original-job','claim',async()=>{f.metrics.actions++;return 7;},()=>0),7);}catch(e){error=e;}
   assert.equal(f.metrics.actions,1);const row=await f.row();
   if(baseline){assert(error);assert.equal(row.state,'unknown');assert.equal(row.session,'unknown');const repeated=await f.bg.withBackgroundActivity('durable-image','original-job','claim',async()=>{f.metrics.actions++;return 7;},()=>0);assert.equal(repeated,0);assert.equal(f.metrics.actions,1);}
   else{assert.equal(error,undefined);assert.deepEqual(row,{state:'finished',session:'idle'});assert(f.logs.includes('[release-runtime] finished-activity-cleanup-deferred'));assert(f.events.indexOf('COMMIT')<f.events.findIndex(x=>x.startsWith('DELETE')));}
  });
  if(baseline){console.log('BASELINE=REPRODUCED CLEANUP_FAILURE_TO_UNKNOWN=2 ORIGINAL_JOB_REENTRY_BLOCKED=2 SUPPLIER_CALLS=0 REAL_PG=1');return;}
  await step('normal completion preserves original outcome and session',async()=>{const f=await fixture();await f.store.finishActivity(f.id,'confirmed-result');assert.deepEqual(await f.row(),{state:'finished',session:'idle'});assert.equal((await pool.query('SELECT outcome FROM app_release_activities WHERE id=$1',[f.id])).rows[0].outcome,'confirmed-result');});
  await step('critical completion update failure is still UNKNOWN',async()=>{const f=await fixture('completion-update');await assert.rejects(f.bg.withBackgroundActivity('durable-image','original-job','claim',async()=>7,()=>0));assert.equal((await f.row()).state,'unknown');assert.equal(f.metrics.cleanup,0);assert(f.logs.some(l=>l.includes('stage=finish code=22012')));});
  await step('action failure keeps original error, UNKNOWN, and no new supplier entry',async()=>{const f=await fixture(),error=new Error('PRIVATE_PROMPT_SQL_CREDENTIAL');await assert.rejects(f.bg.withBackgroundActivity('durable-image','original-job','claim',async()=>{throw error;},()=>0),e=>e===error);assert.equal((await f.row()).state,'unknown');assert.equal(f.metrics.cleanup,0);assert(f.logs.some(l=>l.includes('stage=action')));assert(f.logs.every(l=>!l.includes('PRIVATE_PROMPT')));});
  await step('missing completion row fails rather than proceeding to cleanup',async()=>{const f=await fixture();await assert.rejects(f.store.finishActivity(randomUUID()),/RELEASE_ACTIVITY_FINISH_CONFLICT/);assert.equal((await f.row()).state,'active');assert.equal(f.metrics.cleanup,0);});
  await step('retention cap and active UNKNOWN agent protection unchanged',async()=>{const f=await fixture();for(const kind of ['request','accepted-work','agent-run'])for(const state of ['finished','active','unknown'])await pool.query("INSERT INTO app_release_activities(id,activity_kind,state,finished_at) SELECT gen_random_uuid(),$1,$2,now()-interval '10 days' FROM generate_series(1,110)",[kind,state]);await f.store.finishActivity(f.id);const rows=(await pool.query('SELECT state,activity_kind,count(*)::int n FROM app_release_activities WHERE id<>$1 GROUP BY state,activity_kind',[f.id])).rows;assert.equal(rows.reduce((n,x)=>n+x.n,0),890);assert(rows.filter(x=>x.state!=='finished'||x.activity_kind==='agent-run').every(x=>x.n===110));});
  await step('detached settled hook runs once after durable finish despite cleanup failure',async()=>{const f=await fixture('cleanup-sql');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture-settled-timeout')),3000);f.bg.detachBackgroundActivity('durable-image','original-job','claim',async()=>{f.metrics.actions++;},async()=>{try{assert.equal((await f.row()).state,'finished');f.metrics.settled++;clearTimeout(timer);resolve();}catch(e){clearTimeout(timer);reject(e);}}).catch(reject);});assert.equal(f.metrics.actions,1);assert.equal(f.metrics.settled,1);});
  console.log(`MODIFIED=PASS GROUPS=${checks} REAL_PG=1 ORIGINAL_UNKNOWN_PRESERVED=1 SUPPLIER_CALLS=0 RETENTION_CAP=100`);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();console.log('FIXTURE_CLEANUP=PASS');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
