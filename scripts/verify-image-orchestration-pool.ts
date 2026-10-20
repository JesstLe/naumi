/** Real PG and actual submission/cancellation locks. The baseline has no SQL
 * deadlock (each session awaits the JS pool), so use a bounded diagnostic and
 * cancel only this fixture's owned backend sessions on reproduction. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';

async function main(){
 const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 const db=await import('../src/lib/db'),repository=await import('../src/lib/image-job-repository');
 await db.ensureSchema();const pool=db.getPool();
 const {imagegenSubmission,cancelImagegenOperation}=await import('../src/lib/imagegen/cancel');
 const max=Number(pool.options.max),ids=Array.from({length:max},()=>`imagegen-${randomUUID()}`);
 for(const id of ids)await repository.createImageJob(id,'fixture@pool.local','imagegen',{status:'pending',paidOperationVersion:1},{},0,false);
 const blockers=await Promise.all(Array.from({length:max},()=>pool.connect()));
 blockers.forEach(c=>c.on('error',()=>{}));pool.on('error',()=>{});
 const pids=(await Promise.all(blockers.map(c=>c.query('SELECT pg_backend_pid() pid')))).map(r=>r.rows[0].pid);
 let finished=0,runs=0;const errors:unknown[]=[];
 const started=Date.now();const work=ids.map(id=>imagegenSubmission(id,async()=>{await pool.query('SELECT 1');runs++;}).then(()=>{finished++},e=>errors.push(e)));
 // Queue all lock acquisitions before letting any pool connection go. On the
 // old implementation all5 then hold tx and wait for nested getImageJob.
 await new Promise(r=>setTimeout(r,50));blockers.forEach(c=>c.release());
 for(let i=0;i<100&&finished<max&&!errors.length;i++)await new Promise(r=>setTimeout(r,20));
 const outcome={finished,runs,expected:max,waiting:pool.waitingCount,idle:pool.idleCount,total:pool.totalCount,elapsedMs:Date.now()-started};
 console.log('POOL_PROBE='+JSON.stringify(outcome));
 const stalled=finished!==max;
 if(stalled){
  for(const id of pids)await f.sql.query('SELECT pg_terminate_backend($1)',[id]);
  await Promise.race([Promise.allSettled(work),new Promise(r=>setTimeout(r,1500))]);
 }
 try{
  assert.equal(stalled,false,'Concurrent image orchestration must not exhaust the shared query pool');
  assert.equal(errors.length,0);
  // Cancellation must still serialize with the exact original submit lock.
  const operation=randomUUID(),id='imagegen-'+operation;await repository.createImageJob(id,'fixture@pool.local','imagegen',{status:'pending',paidOperationVersion:1},{},0,false);
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
  const a=imagegenSubmission(id,async()=>{entered();await gate;await pool.query('SELECT 1');runs++});await ready;
  let cancelled=false;const b=cancelImagegenOperation(operation,'fixture@pool.local').then(()=>{cancelled=true});
  await new Promise(r=>setTimeout(r,40));assert.equal(cancelled,false);release();await Promise.all([a,b]);
  let afterCancel=0;await assert.rejects(imagegenSubmission(id,async()=>{afterCancel++}));assert.equal(afterCancel,0);
  await imagegenSubmission(id,async()=>{await pool.query('SELECT 1')},true);
  const {runImagegenBatchTick,cancelImagegenBatch,submitAcceptedImagegenBatch}=await import('../src/lib/imagegen/batch');
  const {ensureImagegenBatches}=await import('../src/lib/imagegen/batch-repository');await ensureImagegenBatches();await db.getOrCreateUser('fixture@pool.local');
  const batches=Array.from({length:5},()=>randomUUID());
  for(const bid of batches){
   const request:any={version:1,operationId:bid,entry:'workbench',mode:'batch',prompt:'fixture batch',inputs:[],variants:1,parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},output:{format:'png'},batch:{items:[{key:'a',name:'a',prompt:'fixture child'}],concurrency:1,maxAttempts:1,failFast:false}};
   const child={...request,mode:'generate',prompt:'fixture child'};delete child.batch;
   const plan:any={request,intent:{background:null,operation:'postprocess',conflicts:[],requirements:[]},fingerprint:'fixture',modelVersion:0,billingVersion:0,steps:[],totalCredits:0,confirmationRequired:false,warnings:[],children:[{key:'a',plan:{request:child,intent:{background:null,operation:'postprocess',conflicts:[],requirements:[]},fingerprint:'fixture',modelVersion:0,billingVersion:0,steps:[],totalCredits:0,confirmationRequired:false,warnings:[]}}]};
   await submitAcceptedImagegenBatch(plan,'fixture@pool.local');
  }
  // Keep new children durable but unexecuted, isolating batch admission from
  // media/model work while preserving the actual submission implementation.
  const {DurableImageJobs}=await import('../src/lib/durable-image-jobs');const kick=DurableImageJobs.prototype.kick;DurableImageJobs.prototype.kick=async()=>{};
  try{await Promise.race([Promise.all(batches.map(runImagegenBatchTick)),new Promise((_,reject)=>setTimeout(()=>reject(Error('BATCH_POOL_STALLED')),4000))]);}finally{DurableImageJobs.prototype.kick=kick;}
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_imagegen_batch_items WHERE state='submitted'")).rows[0].n),5);
  await Promise.all(batches.map(id=>cancelImagegenBatch(id,'fixture@pool.local')));
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_imagegen_batch_items WHERE state='submitted'")).rows[0].n),5,'accepted children preserved on cancellation');
  console.log('IMAGE_ORCHESTRATION_POOL=PASS CONCURRENT_SUBMISSIONS=5 QUERY_POOL_STARVATION=0 CANCEL_ORDER=PASS CANCELLED_NEW_POSTS=0 ACCEPTED_CONTINUATION=PASS CONCURRENT_BATCHES=5 CHILD_RECEIPTS=5 SUPPLIER_CALLS=0');
 }finally{if(!stalled){const {closeImageCoordinationPool}=await import('../src/lib/imagegen/coordination-pool');await closeImageCoordinationPool();await pool.end();}await f.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
