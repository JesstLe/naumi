/** Actual batch owner + Canvas image entry/controller, with local HTTP/timer
 * ports. Actual React placeholder DOM is checked separately in headless Edge. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildSync,build}=require('esbuild'),{chromium}=require('@playwright/test');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline');
// This flag names this task's fixture mode, not the old refactor fixture's mode.
process.argv=process.argv.filter(value=>value!=='--baseline');
const out=path.resolve(arg('--out')||'output/batch-placeholders-20261114');fs.mkdirSync(out,{recursive:true});
process.env.CANVAS_IMAGE_SOURCE_ROOT=root;
const fixture=require('./verify-canvas-image-task-refactor.cjs');
const load=file=>{const m={exports:{}};vm.runInNewContext(buildSync({entryPoints:[path.join(root,file)],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,{module:m,exports:m.exports,console,Set,Map,Promise});return m.exports;};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function waitFor(test,label){for(let i=0;i<300;i++){if(test())return;await turn();}throw Error('fixture stalled: '+label);}
(async()=>{
 const built=await fixture.bundle(),f=fixture.setup('derived','done',built),{c,state}=f;
 const timers=[],posts=[],positions=[],phase=new Map();let current=true;
 c.setTimeout=(fn,ms)=>{if(ms===2500){timers.push(fn);return 1;}return setTimeout(fn,ms);};
 c.clearTimeout=id=>{if(typeof id!=='number')clearTimeout(id);};
 c.privateFetch=async(_url,init)=>{const id=init.body.get('imagegenNodeId');posts.push(id);return Response.json({jobId:'fixture-'+id});};
 c.fetch=async(url,init)=>{
  if(String(url).includes('/position')){positions.push(JSON.parse(init.body));return Response.json({ok:true});}
  const id=new URL(String(url),'http://fixture').searchParams.get('job').slice('fixture-'.length),p=phase.get(id)||'queued';
  if(p==='done')return Response.json({status:'done',operationStatus:'succeeded',images:[{id:'result-'+id,url:'/local.png',width:320,height:320}]});
  if(p==='failed')return Response.json({status:'error',operationStatus:'failed',error:'fixture one-node failure'});
  return Response.json({status:'pending',operationStatus:p==='queued'?'queued':'pending',stage:'editing'});
 };
 c.mergeWorks=async ids=>ids.map(id=>({id,image:'/local.png',status:'completed'}));
 const nodes=Array.from({length:12},(_,i)=>({id:'batch-'+i,kind:'image',x:0,y:i*400,runnable:true}));
 const owner=load('src/lib/canvas/selection-run-controller.ts').createCanvasSelectionRun();
 const scope={key:'batch',account:'fixture',workspace:'personal',project:'tree:source',documentCurrent:()=>current,viewCurrent:()=>current,assertView(){assert.ok(current);}};
 const services={targets:()=>nodes,canRun:()=>true,run:async node=>(await c.entry.runGen({...f.src,id:node.id},'recipe '+node.id,{count:1,ratio:'3:4',operationKey:'node:'+node.id})).length>0};
 const running=owner.start(scope,nodes.map(n=>n.id),services);
 const initial=c.generationTasks.length;assert.equal(initial,baseline?2:12,'all result slots appear synchronously');
 assert.equal(await owner.start(scope,nodes.map(n=>n.id),services),undefined,'double click does not start another batch');
 await waitFor(()=>posts.length===(baseline?2:12)&&timers.length===(baseline?2:12),'all independent submissions before any result');
 assert.equal(new Set(posts).size,posts.length,'one submission per selected node');
 const flush=async()=>{state.clock+=2500;const next=timers.splice(0);next.forEach(fn=>fn());await turn();await turn();await turn();};
 await flush();
 assert.ok(c.generationTasks.every(t=>t.stage===(baseline?'generating':'queued')),'queue receipts control stage');
 const first=c.generationTasks[0],firstId=first.id;
 c.generationPresentation.drag(firstId,{x:777,y:888},true);
 phase.set('node:batch-0','running');phase.set('node:batch-1','running');
 const activeAt=state.clock+2500;await flush();
 assert.equal(c.generationTasks.find(t=>t.id===firstId).id,firstId,'same placeholder identity after admission');
 if(!baseline){
  assert.equal(c.generationTasks.filter(t=>t.stage==='queued').length,10);
  assert.equal(c.generationTasks.filter(t=>t.stage==='generating').length,2);
  assert.equal(c.generationTasks.find(t=>t.id===firstId).startedAt,activeAt,'execution progress starts after queue');
 }
 for(const node of nodes)phase.set('node:'+node.id,node.id==='batch-5'?'failed':'done');
 let finished=false,result;running.then(r=>{finished=true;result=r;});
 for(let i=0;i<80&&!finished;i++){await flush();await turn();}
 assert.ok(finished,'batch completes');assert.equal(result.succeeded,11);assert.equal(result.failed,1);
 assert.equal(posts.length,12,'no duplicate paid submission');assert.equal(new Set(posts).size,12);
 assert.equal(c.generationTasks.length,1,'only failed card remains');assert.ok(c.generationTasks[0].failure);
 assert.ok(positions.some(p=>p.id==='result-node:batch-0'&&p.x===777&&p.y===888),'dragged slot is final result position');
 const {runSelectionBatch}=load('src/lib/canvas/selection-run.ts');
 let inFlight=0,peak=0;await runSelectionBatch(nodes,{concurrency:2,isCurrent:()=>true,canRun:()=>true,run:async()=>{peak=Math.max(peak,++inFlight);await turn();inFlight--;return true;}});assert.equal(peak,2,'specialized text mining keeps its own existing policy');
 current=false;let started=0;const stopped=await runSelectionBatch(nodes,{isCurrent:()=>current,canRun:()=>true,run:async()=>{started++;return true;}});assert.equal(started,0);assert.equal(stopped.skipped,12);
 const ui=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GenerationPlaceholder}from'./src/components/canvas/generation-placeholder';const root=createRoot(document.getElementById('root'));window.show=(stage,startedAt)=>flushSync(()=>root.render(<GenerationPlaceholder stage={stage} startedAt={startedAt} taskId="batch-attempt"/>));`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'bundle.js',platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},nodePaths:[path.resolve(__dirname,'../node_modules')],loader:{'.css':'local-css'},plugins:[{name:'locale-port',setup(b){b.onResolve({filter:/locale-context$/},()=>({path:'locale',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useI18n=()=>({locale:window.fixtureLocale||"zh"})',loader:'js'}));}}]});
 const js=ui.outputFiles.find(f=>f.path.endsWith('.js')).text,css=ui.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let dom;
 try{
  const page=await browser.newPage({viewport:{width:520,height:440}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<style>body{background:white;margin:30px;font-family:Arial}#root{height:340px}${css}</style><div id="root"></div>`);await page.addScriptTag({content:js});
  await page.evaluate(()=>window.show('queued',Date.now()-180000));
  const queuedText=await page.locator('#root').innerText(),queueProgress=await page.getByRole('progressbar').count();
  if(baseline){assert.equal(queueProgress,1);assert.ok(!queuedText.includes('排队中'));}
  else{assert.equal(queueProgress,1);assert.ok(!queuedText.includes('排队中'));assert.equal(await page.locator('[data-progress]').count(),1);
    const queuePercent=Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));assert.ok(queuePercent>=1&&queuePercent<=25,'queue shows low but alive progress');}
  const queuedPercent=Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  await page.evaluate(()=>window.show('generating',Date.now()));
  assert.equal(await page.getByRole('progressbar').count(),1);const percent=Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));assert.ok(percent>=queuedPercent&&percent<99,'same attempt keeps displayed queue floor without inheriting queue elapsed time');
  if(!baseline){await page.evaluate(()=>{window.fixtureLocale='en';window.show('queued',Date.now()-200000);});const enText=await page.locator('#root').innerText();
    assert.ok(!enText.includes('Queued')&&enText.includes('no need to resubmit'),'english queue hint escalates without the queue word');}
  assert.deepEqual(errors,[]);dom={queuedText,queueProgress,activeProgress:percent,pageErrors:errors};
 }finally{await browser.close();}
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',initialPlaceholders:initial,initialSubmissions:baseline?2:12,totalSubmissions:posts.length,result,queuedStage:baseline?'generating':'queued',actualCanvasEntry:true,actualImageController:true,actualReactDOM:dom,supplierRequests:0};
 fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify(report,null,2));
 console.log(`BATCH_PLACEHOLDERS=${baseline?'BASELINE_REPRODUCED':'PASS'} INITIAL_SLOTS=${initial} INITIAL_SUBMITS=${baseline?2:12} TOTAL_SUBMITS=12 SUCCESS=11 FAILED=1 QUEUED_PERCENT=SHOWN ACTIVE_PERCENT=PRESERVED DRAG=PASS DOUBLE_CLICK=PASS CONTEXT=PASS SUPPLIER=0`);
})().catch(error=>{console.error(error);process.exitCode=1;});
