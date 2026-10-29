/** Actual Canvas callers and task controllers, with observable browser ports.
 * Baseline is a full captured checkout, not a replacement task implementation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),mode=arg('--mode')||'modified',baseline=mode==='baseline';
assert.ok(['baseline','modified'].includes(mode));
const out=path.resolve(arg('--out')||process.env.CANVAS_ACTIVITY_EVIDENCE||'output/canvas-generation-activity');fs.mkdirSync(out,{recursive:true});
process.env.CANVAS_IMAGE_SOURCE_ROOT=root;process.env.TASK_SOURCE_ROOT=root;
process.env.R3_EVIDENCE=out;process.env.TASK_EVIDENCE=out;
const image=require('./verify-canvas-image-task-refactor.cjs'),detail=require('./verify-canvas-task-boundaries.cjs');
let checks=0;const rows=[],eq=(a,b,label)=>{assert.deepEqual(a===undefined?undefined:JSON.parse(JSON.stringify(a)),b===undefined?undefined:JSON.parse(JSON.stringify(b)),label);checks++;};
const fail=()=>{throw Error('fixture-view-preparation');};
async function main(){
 const ib=await image.bundle(),db=await detail.bundle();
 for(const kind of ['derived','blank','detail']){
  const setup=()=>kind==='detail'?detail.setup('detail','done',db):image.setup(kind,'done',ib);
  const f=setup();
  if(f.c.generationPresentation&&kind!=='blank')f.c.generationPresentation={...f.c.generationPresentation,start:fail};else if(kind==='blank')f.c.generationPositionForTask=fail;else f.c.reserveGenerationPosition=fail;
  await assert.rejects(f.run(),/fixture-view-preparation/);checks++;
  eq(f.c.generationOperationRef.current.size,baseline?1:0,kind+' setup exception does not strand a busy key');
  eq(f.state.post??f.state.posts,0,kind+' setup exception never submits');
  rows.push({name:kind+'-setup-exception',busy:f.c.generationOperationRef.current.size,posts:f.state.post??f.state.posts});
 }
 for(const kind of ['derived','blank'])for(const scenario of ['done','poll-transient','position-fails','sync-missing','partial','submit-unknown','workspace-aba']){
  const f=image.setup(kind,scenario,ib);await f.run();
  eq(f.c.generationOperationRef.current.size,0,kind+' releases after '+scenario);
  if(['poll-transient','position-fails','sync-missing'].includes(scenario)){
   const retry=f.retry();eq(typeof retry,'function','retained original task retry');f.state.retried=true;
   await Promise.all([retry(),retry()]);eq(f.state.post,1,'concurrent retry never re-enters paid submit');
   eq(f.state.history.length,1,'result attachment commits history once');eq(f.c.generationOperationRef.current.size,0,'retry releases');
  }
  if(scenario==='submit-unknown')eq(f.state.post,1,'unknown keeps original submission, no automatic second POST');
  rows.push({name:kind+'-'+scenario,posts:f.state.post,polls:f.state.polls,history:f.state.history.length});
 }
 for(const kind of ['detail','detail-blank','cutout','expand','annotate'])for(const scenario of ['done','position-fails','submit-unknown','project-switch']){
  const f=detail.setup(kind,scenario,db);await f.run();eq(f.c.generationOperationRef.current.size,0,'detail/edit release');
  if(scenario==='position-fails'){
   const retry=f.retry();eq(typeof retry,'function','original detail/edit retry remains');f.state.retried=true;await Promise.all([retry(),retry()]);
   eq(f.state.supplier,1,'known results retry does not regenerate');eq(f.state.history.length,1,'known results are added once');
  }
  if(scenario==='project-switch')eq(f.state.positions.length,0,'late result does not write another project');
  eq(f.state.intervals.size,0,'edit timer is disposed');rows.push({name:kind+'-'+scenario,posts:f.state.posts,supplier:f.state.supplier,history:f.state.history.length});
 }
 const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),callers={};
 (function walk(n){if(ts.isFunctionDeclaration(n)&&n.name&&['runGen','generatePend','generateDetailSequence','landEditResult','runComfyWorkflow'].includes(n.name.text))callers[n.name.text]=n.getText(ast);ts.forEachChild(n,walk);})(ast);
 eq(Object.keys(callers).length,5,'all production paths found');
 for(const [name,body]of Object.entries(callers)){
  const delegated={landEditResult:['runCanvasEdit','edit-run.ts'],generateDetailSequence:['runCanvasDetail','detail-run.ts'],runComfyWorkflow:['workflowRunsRef','workflow-runs.ts']}[name];
  let implementation=body;
  if(!baseline&&delegated&&fs.existsSync(path.join(root,'src/lib/canvas',delegated[1]))){
    eq(body.includes(delegated[0]),true,name+' delegates actual application entry');
    implementation=fs.readFileSync(path.join(root,'src/lib/canvas',delegated[1]),'utf8');
  }
  eq(implementation.includes('createCanvasGenerationActivity')||/\b(?:view|generationPresentation|ctx\.generation)\.activity\(/.test(implementation),!baseline,name+' invokes the actual lifecycle owner');
  if(!baseline){eq(/generationOperationRef\.current\.(add|delete)\(/.test(body),false,name+' does not privately mutate activity state');}
 }
 if(!baseline){
  const file=path.join(root,'src/lib/canvas/generation-activity.ts'),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:9}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Promise});const {createCanvasGenerationActivity}=module.exports;
  const operations=new Set();let allow=true,calls=0,clears=0,retry,unblock;
  const held=new Promise(r=>unblock=r);
  const activity=createCanvasGenerationActivity({operations,operationKey:'node:source',canRetry:()=>allow,clear:()=>clears++,execute:async a=>{calls++;retry=a.retry;if(calls===1){a.retain();await held;return 'retained';}return 'done';}});
  const first=activity.run();eq(operations.has('node:source'),true,'claim precedes first await');
  const other=createCanvasGenerationActivity({operations,operationKey:'node:other',canRetry:()=>true,execute:async()=>42});
  eq(await other.run(),42,'unrelated node executes concurrently');eq(operations.has('node:source'),true,'sibling completion preserves original busy state');
  eq(await activity.run(),undefined,'duplicate source is not queued as paid work');eq(calls,1,'duplicate has no task invocation');
  unblock();eq(await first,'retained','original result');eq(clears,0,'failed-card presentation retained');
  allow=false;eq(await retry(),undefined,'stale explicit retry stays idle');eq(calls,1,'stale retry has no task invocation');
  allow=true;eq(await retry(),'done','same retained activity retry');eq(calls,2,'one explicit retry');eq(clears,1,'retention resets per attempt');
  const throwing=createCanvasGenerationActivity({operations,operationKey:'node:throw',canRetry:()=>true,clear:()=>{throw Error('clear-failed');},execute:async()=>{throw Error('task-failed');}});
  await assert.rejects(throwing.run(),/clear-failed/);checks++;eq(operations.size,0,'even throwing cleanup leaves all operations released');
  rows.push({name:'lifecycle-concurrency-retention-retry-and-throwing-cleanup',calls,clears});
 }
 const report={status:'PASS',mode,sourceRoot:root,cases:rows.length,checks,actualCallers:5,actualTaskControllers:true,transport:'fixture',suppliers:0,rows};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_GENERATION_ACTIVITY=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${rows.length} CHECKS=${checks} ACTUAL_CALLERS=5 SETUP_STUCK_KEYS=${baseline?3:0} KNOWN_RETRY=ORIGINAL_TASK UNKNOWN_AUTO_REPOST=0 SUPPLIER=FIXTURE`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
