import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';

/** Real HTTP and independent Worker acceptance of a resumed server-owned
 * under-authorized checkpoint. Only that historical budget is fixture-seeded;
 * no task/confirmation/status/receipt is fabricated. Not evidence that an
 * ordinary current fixed-price admission naturally increases its price. */
export async function verifyVideoBudgetProcess(input:{actor:string;pool:Pool;outputDir:string;http:(url:string,body?:unknown,as?:string)=>Promise<{status:number;value:any}>;otherCookie:string;
 posts:()=>number;resume:()=>Promise<unknown>;drain:()=>Promise<unknown>;restart:()=>Promise<unknown>;task:(id:string)=>Promise<any>;
 until:<T>(name:string,read:()=>Promise<T>,accept:(value:T)=>boolean,ms?:number)=>Promise<T>}){
 const {http,pool,actor}=input,checks:string[]=[],responses:any[]=[];let runId='';
 const pass=(name:string)=>{checks.push(name);console.log('BUDGET_PROCESS_CHECK='+name+' PASS');};
 const counts=async()=>{const result:Record<string,number>={};for(const table of ['app_video_tasks','app_gen_reservations','app_billing_operations','app_ledger'])result[table]=Number((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n);return result;};
 const states=async()=>(await pool.query('SELECT * FROM app_video_workflow_run_nodes WHERE run_id=$1 ORDER BY node_id',[runId])).rows;
 const view=async()=>{const r=await http('/api/video/workflows/'+runId);assert.equal(r.status,200,JSON.stringify(r.value));return r.value.run;};
 const confirm=async(version:number,credits:number,as?:string)=>{const result=await http('/api/video/workflows/'+runId,{action:'confirm',nodeId:'budget',billingVersion:version,billingCredits:credits},as);responses.push({version,credits,foreign:!!as,...result});return result;};
 const beforePosts=input.posts(),beforeCounts=await counts();
 try{
  const node=await http('/api/canvas/video-nodes',{id:'budget-process-project',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-process',prompt:'budget project',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[]});assert.equal(node.status,201,JSON.stringify(node.value));
  runId=randomUUID();const admitted=await http('/api/video/workflows',{id:runId,projectKey:node.value.node.projectKey,nodes:[{id:'budget',request:{modelId:'video-process',prompt:'BUDGET_PROCESS original frozen request',parameters:{durationSeconds:1,resolution:'4K'}},dependsOn:[]}]});assert.equal(admitted.status,202,JSON.stringify(admitted.value));
  const original=(await pool.query('SELECT * FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0];
  const {decryptAtRest,encryptAtRest}=await import('../src/lib/settings');const frozen=JSON.parse(decryptAtRest(original.frozen_nodes_enc)!);const version=frozen.budget.quote.version;assert.equal(frozen.budget.quote.credits,17);
  frozen.budget.quote.credits=1;frozen.budget.quote.authorizedCredits=1;
  // Explicit isolated historical-checkpoint fixture. Frozen compiler binding,
  // draft, credential, billing revision, scope and all statuses stay unchanged.
  await pool.query('UPDATE app_video_workflow_runs SET frozen_nodes_enc=$2,public_frozen_nodes=$3::jsonb WHERE id=$1',[runId,encryptAtRest(JSON.stringify(frozen)),JSON.stringify({...original.public_frozen_nodes,budget:frozen.budget.quote})]);
  assert.deepEqual(await counts(),beforeCounts);assert.equal(input.posts(),beforePosts);pass('real-http-admission-then-explicit-historical-underbudget-checkpoint');
  await input.resume();await input.until('actual Worker stops for frozen stage budget',states,rows=>rows[0]?.status==='needs_confirmation',120000);await input.drain();
  assert.deepEqual(await counts(),beforeCounts);assert.equal(input.posts(),beforePosts);assert.equal((await states())[0].task_id,null);pass('actual-worker-budget-stop-before-task-reservation-ledger-and-provider');
  const first=await view(),stage=first.nodes.find((n:any)=>n.id==='budget');
  if(process.argv.includes('--budget-baseline')){
   assert.equal(stage.quote.credits,1);const loop=await confirm(stage.quote.version,stage.quote.credits);assert.equal(loop.status,200);await input.resume();await input.until('baseline confirmation loops',states,rows=>rows[0]?.status==='needs_confirmation');await input.drain();assert.equal(input.posts(),beforePosts);assert.deepEqual(await counts(),beforeCounts);
   console.log('BUDGET_BASELINE_REPRO=CONFIRMED DISPLAYED=1 REQUIRED=17 CONFIRM_RETURNS=200 STATUS=needs_confirmation TASKS_ADDED=0 PROVIDER_POSTS_ADDED=0');assert.equal(stage.quote.credits,17,'User must receive required stage quote, not the original insufficient authorization');return {n:0,amount:0};
  }
  assert.equal(stage.quote.version,version);assert.equal(stage.quote.credits,17);assert.equal(stage.frozenQuote.credits,1);assert.equal(stage.quote.authorizedCredits,17);pass('actual-get-exposes-required-quote-and-preserves-original-frozen-budget');
  const snapshot=(await pool.query('SELECT confirmations,public_frozen_nodes,frozen_nodes_enc FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0];
  assert.equal((await confirm(version,17,input.otherCookie)).status,404);
  for(const [v,c] of [[version+1,999],[version,1],[version,17.5]]){const invalid=await confirm(v,c);assert.equal(invalid.status,409,JSON.stringify(invalid.value));assert.equal(invalid.value.code,'WORKFLOW_CONFIRMATION_STALE');assert.equal((await states())[0].status,'needs_confirmation');}
  assert.deepEqual((await pool.query('SELECT confirmations,public_frozen_nodes,frozen_nodes_enc FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0],snapshot);assert.deepEqual(await counts(),beforeCounts);pass('foreign-stale-insufficient-fractional-confirmations-preserve-state-and-zero-effects');
  await input.restart();const restored=(await view()).nodes[0];assert.equal(restored.quote.credits,17);assert.equal(restored.frozenQuote.credits,1);pass('required-and-original-quotes-survive-independent-worker-restart');
  const {matchesWorkflowStageConfirmation}=await import('../src/lib/video/workflow-budget');
  assert.equal(matchesWorkflowStageConfirmation({version,credits:1,authorizedCredits:17,authorization:true},{version,credits:1}),false);assert.equal(matchesWorkflowStageConfirmation({version,credits:1,authorizedCredits:17,authorization:true},{version,credits:17}),true);pass('cost-plus-confirmation-matches-authorized-cap-not-estimate');
  // Migration fixture: an old binary could leave needs_confirmation without
  // the new proposal column. No status, task or confirmation is invented.
  await pool.query('UPDATE app_video_workflow_run_nodes SET confirmation_quote=NULL WHERE run_id=$1',[runId]);
  const legacy=await confirm(version,1);assert.equal(legacy.status,200,JSON.stringify(legacy.value));await input.resume();await input.until('legacy waiting checkpoint publishes required quote',states,rows=>rows[0]?.status==='needs_confirmation'&&rows[0]?.confirmation_quote?.credits===17,120000);await input.drain();assert.equal((await view()).nodes[0].quote.credits,17);assert.deepEqual(await counts(),beforeCounts);assert.equal(input.posts(),beforePosts);pass('legacy-waiting-checkpoint-without-proposal-recovers-through-existing-http-confirmation');
  const accepted=await Promise.all([confirm(version,17),confirm(version,17)]);assert(accepted.some(r=>r.status===200));assert(accepted.every(r=>r.status===200||r.status===409));
  await input.resume();const doneRows=await input.until('confirmed workflow completes through actual Worker',states,rows=>rows[0]?.status==='completed',120000);await input.drain();const task=await input.task(doneRows[0].task_id);assert.equal(task.status,'completed');assert.equal(task.cost,17);assert.equal(task.parameters.version,3);assert.equal(input.posts(),beforePosts+1);assert(task.artwork_id&&task.video_url);pass('concurrent-real-http-confirmation-creates-one-task-and-worker-result');
  const after=await counts();assert.equal(after.app_video_tasks,beforeCounts.app_video_tasks+1);const led=(await pool.query("SELECT count(*)::int n,(-sum(delta))::int amount FROM app_ledger WHERE id=$1 AND email=$2",['led-video-'+task.id,actor])).rows[0];assert.deepEqual(led,{n:1,amount:17});
  const afterBudget=(await pool.query('SELECT confirmations,public_frozen_nodes,frozen_nodes_enc FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0];assert.deepEqual(afterBudget.public_frozen_nodes,snapshot.public_frozen_nodes);assert.equal(afterBudget.frozen_nodes_enc,snapshot.frozen_nodes_enc);assert.deepEqual(afterBudget.confirmations.budget,{version,credits:17});
  assert.equal((await confirm(version,17)).status,409);assert.equal((await http('/api/video/workflows/'+runId,{action:'resume'})).status,200);assert.equal(input.posts(),beforePosts+1);pass('original-budget-remains-immutable-settlement-once-and-completed-replay-no-repost');
  const completedRunId=runId;runId=randomUUID();
  const cancelledAdmission=await http('/api/video/workflows',{id:runId,projectKey:node.value.node.projectKey,nodes:[{id:'budget',request:{modelId:'video-process',prompt:'BUDGET_PROCESS cancel pending confirmation',parameters:{durationSeconds:1,resolution:'4K'}},dependsOn:[]}]});assert.equal(cancelledAdmission.status,202);
  const cancelledSaved=(await pool.query('SELECT * FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0],cancelledFrozen=JSON.parse(decryptAtRest(cancelledSaved.frozen_nodes_enc)!);cancelledFrozen.budget.quote.credits=1;cancelledFrozen.budget.quote.authorizedCredits=1;
  await pool.query('UPDATE app_video_workflow_runs SET frozen_nodes_enc=$2,public_frozen_nodes=$3::jsonb WHERE id=$1',[runId,encryptAtRest(JSON.stringify(cancelledFrozen)),JSON.stringify({budget:cancelledFrozen.budget.quote})]);
  const cancelCounts=await counts();await input.resume();await input.until('second workflow awaits real budget',states,rows=>rows[0]?.status==='needs_confirmation',120000);await input.drain();assert.equal((await http('/api/video/workflows/'+runId,{action:'cancel'})).status,200);const stopped=await confirm(version,17);assert.equal(stopped.status,409);assert.equal(stopped.value.code,'WORKFLOW_STOPPED');assert.equal((await states())[0].status,'cancelled');assert.deepEqual(await counts(),cancelCounts);assert.equal(input.posts(),beforePosts+1);const cancelledRunId=runId;runId=completedRunId;pass('cancel-pending-confirmation-retains-zero-task-and-rejects-late-confirm');
  await writeFile(path.join(input.outputDir,'BUDGET_PROCESS_RESULT.json'),JSON.stringify({ok:true,checks,runId,cancelledRunId,taskId:task.id,responses,fixtureCheckpoint:{originalAuthorization:1,required:17,version,onlyFixtureBudgetAndLegacyProposalColumnSeeded:true},ledgerAdded:led,actualNext:true,actualIndependentWorker:true,directConfirmCalls:0,paidCalls:0,productionWrites:0},null,2));
  console.log(`VIDEO_COMPILER_BUDGET_PROCESS=PASS CHECKS=${checks.length} REAL_NEXT=1 REAL_INDEPENDENT_WORKER=1 DIRECT_CONFIRM_CALLS=0 ORIGINAL_AUTHORIZATION=1 REQUIRED=17 LEDGER_ADDED=17 PAID_CALLS=0 PRODUCTION_WRITES=0`);return led;
 }catch(error){await writeFile(path.join(input.outputDir,'BUDGET_PROCESS_FAILURE.json'),JSON.stringify({checks,runId,responses,error:String(error)},null,2));throw error;}
}
