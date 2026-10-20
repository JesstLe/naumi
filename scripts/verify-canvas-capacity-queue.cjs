require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
// Reuse the established actual-function harness without running its whole suite.
const source=fs.readFileSync('scripts/verify-canvas-generation-failure.cjs','utf8');
const moduleValue={exports:{}};new Function('require','module',source.slice(0,source.indexOf('(async()=>{const rows=[]'))+';module.exports=setup;')(require,moduleValue);
const setup=moduleValue.exports;
(async()=>{
 for(const kind of ['runGen','generatePend']){
  const {c,state}=setup('done');let now=1_000_000,reads=0;const stages=[];
  c.Date=class extends Date{static now(){return now}};
  c.setTimeout=fn=>{now+=150000;fn();return 1};
  c.fetch=async()=>{
   const item=kind==='runGen'?c.generationTasks[0]:c.pendNodes[0];stages.push(kind==='runGen'?item?.stage:item?.generationStage);
   reads++;return Response.json(reads<=4?{status:'pending',operationStatus:'queued'}:{status:'done',images:[{id:'result',url:'/media/result.png',width:320,height:320}]});
  };
  if(kind==='runGen')await c.runGen(c.source,'fixture',{ratio:'3:4'});else await c.generatePend();
  assert.equal(reads,5,'healthy queue must outlive the old six-minute generation deadline');
  assert(stages.slice(1).every(s=>s==='queued'));assert.equal(state.post,1);assert.equal(kind==='runGen'?c.generationTasks.length:c.pendNodes.length,0);
 }
 const {generationDisplayProgress:progress,generationProgressHint:hint}=require('../src/lib/canvas/generation-progress.ts');
 assert.equal(progress('queued',3600),0);assert(hint('queued',3600).includes('任务已保存'));
 const component=fs.readFileSync('src/components/canvas/generation-placeholder.tsx','utf8');
 assert(component.includes('data-stage="queued"')&&component.includes('Waiting in queue'));
 console.log('CANVAS_CAPACITY_QUEUE=PASS ACTUAL_FUNCTIONS=2 QUEUED_POLLS=4 EACH_ELAPSED_SECONDS=150 SINGLE_SUBMISSION=1 OVER_SIX_MINUTES=CONTINUES TERMINAL_RESULT=DELIVERED QUEUE_PERCENT=HIDDEN');
})().catch(e=>{console.error(e);process.exitCode=1});
