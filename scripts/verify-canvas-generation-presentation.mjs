/** Actual React state declarations (baseline) or actual scoped hook (modified),
 * plus the actual Canvas generation callers/controllers in a separate VM tier. */
import fs from 'node:fs/promises';import path from 'node:path';import ts from 'typescript';
import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';
import {createRequire} from 'node:module';import {chromium} from '@playwright/test';
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.GENERATION_PRESENTATION_EVIDENCE||'output/generation-presentation'),baseline=arg('--mode')==='baseline';
await fs.mkdir(out,{recursive:true});const file='src/components/canvas/canvas-client.tsx',source=await fs.readFile(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,4);
const declarations=[],functions={};
(function walk(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['generationTaskPosRef','generationOperationRef','generationTaskSizeRef','[generationTasks, setGenerationTasks]'].includes(d.name.getText(ast))))declarations.push(n.getText(ast));if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);ts.forEachChild(n,walk);})(ast);
if(baseline)assert.equal(declarations.length,4);else{assert.equal(declarations.length,0);assert.doesNotMatch(source,/generationTaskPosRef|generationTaskSizeRef|generationOperationRef|setGenerationTasks/);}
const p=s=>s.replaceAll('\\','/');
const fixture=`import React,{useRef,useState,useSyncExternalStore} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {createCanvasDocumentContext} from '${p(path.join(root,'src/lib/canvas/document-scope'))}';
import {createCanvasGenerationActivity} from '${p(path.join(root,'src/lib/canvas/generation-activity'))}';
import {generationPlaceholderSize,generationPositionForTask} from '${p(path.join(root,'src/lib/canvas/generation-feedback'))}';
${!baseline?`import {useCanvasGenerationPresentation} from '${p(path.join(root,'src/components/canvas/use-canvas-generation-presentation'))}';`:''}
let current={account:'A',project:'tree:A',workspace:'personal'},renders=0,sequence=0;const root=createRoot(document.getElementById('root'));
window.__workspace='personal';window.__revision=0;const notify=()=>{};
function Harness(){const [version,render]=useState(0),context=useRef(createCanvasDocumentContext()),scope=context.current.render(current.account,current.project);renders++;
${baseline?declarations.join('\n'):''}
${baseline?`const rfRef={current:{getNodes:()=>[]}},rfNodes=[];
${functions.reserveGenerationPosition}
const view={getSnapshot:()=>({tasks:generationTasks,positions:generationTaskPosRef.current,operations:generationOperationRef.current}),
start(task,placement){const point=reserveGenerationPosition(task.id,placement.preferred,task.previewSize,placement.existing);setGenerationTasks(tasks=>[...tasks,{...task,position:point}]);return point;},
update(id,patch){setGenerationTasks(tasks=>tasks.map(task=>task.id===id?{...task,...patch}:task));},
remove(id){delete generationTaskPosRef.current[id];delete generationTaskSizeRef.current[id];setGenerationTasks(tasks=>tasks.filter(task=>task.id!==id));},
drag(id,position,commit){generationTaskPosRef.current[id]={...position};if(commit)setGenerationTasks(tasks=>tasks.map(task=>task.id===id?{...task,position}:task));},
busy:key=>generationOperationRef.current.has(key),activity:input=>createCanvasGenerationActivity({...input,operations:generationOperationRef.current})};
const snapshot=view.getSnapshot();`:`const view=useCanvasGenerationPresentation(scope),snapshot=view;`}
window.h={view,snapshot,scope,version,renders,flush:fn=>flushSync(fn),change:patch=>{Object.assign(current,patch);window.__workspace=current.workspace;window.__revision++;flushSync(()=>render(n=>n+1));}};
return <main><output>{JSON.stringify(snapshot.tasks.map(task=>({id:task.id,stage:task.stage,position:task.position})))}</output><b>{snapshot.operations.size}</b></main>;}
window.reset=()=>{current={account:'A',project:'tree:A',workspace:'personal'};window.__workspace='personal';window.__revision++;flushSync(()=>root.render(<Harness key={++sequence}/>));};window.reset();`;
const built=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',nodePaths:[path.resolve('node_modules')],tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'workspace-auth-only',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const currentWorkspace=()=>window.__workspace;export const currentWorkspaceRevision=()=>window.__revision;',loader:'js'}));}}]});
await fs.writeFile(path.join(out,'fixture.tsx'),fixture);const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?built.outputFiles[0].contents:'<!doctype html><html><head><meta charset="utf-8"></head><body style="background:white;color:#172033"><div id="root"></div><script src="/app.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],external=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external.push(route.request().url()),route.abort()));await page.goto('http://127.0.0.1:'+server.address().port);
 const react=await page.evaluate(async baseline=>{
  let checks=0;const rows=[],eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));checks++;};
  const task=id=>({id,operationKey:'node:source',sourceId:'source',label:'Generating',stage:'preparing',previewSize:{width:100,height:100},startedAt:1});
  const placement={preferred:{x:0,y:0},occupied:[]};
  for(const [name,patch]of [['project',{project:'tree:B'}],['account',{account:'B'}],['workspace',{workspace:'tenant'}]]){
   window.reset();let h=window.h,old=h.view;h.flush(()=>old.start(task('task-A'),placement));
   let release;const gate=new Promise(r=>release=r),activity=old.activity({operationKey:'node:source',canRetry:()=>true,execute:async()=>{await gate;return 'original';}}),running=activity.run();
   h.change(patch);h=window.h;eq(h.snapshot.tasks.length,baseline?1:0,name+' no foreign task card');
   eq(h.view.busy('node:source'),baseline,name+' no foreign busy key');
   let bCalls=0;const other=h.view.activity({operationKey:'node:source',canRetry:()=>true,execute:async()=>{bCalls++;return 'other';}});await other.run();eq(bCalls,baseline?0:1,name+' current view can act independently');
   let point;h.flush(()=>point=h.view.start({...task('task-B'),operationKey:'node:B'},placement));eq(point,baseline?{x:132,y:0}:{x:0,y:0},name+' only current-view previews occupy layout');
   h.flush(()=>old.update('task-A',{stage:'saving'}));eq(window.h.snapshot.tasks.some(task=>task.id==='task-A'),baseline,name+' late progress stays in original binding');
   h.change({account:'A',project:'tree:A',workspace:'personal'});eq(window.h.snapshot.tasks.some(task=>task.id==='task-B'),baseline,name+' return restores original presentation only');
   eq(window.h.snapshot.tasks.find(task=>task.id==='task-A').stage,'saving',name+' original captured binding retained');
   release();eq(await running,'original',name+' original activity finishes');eq(window.h.view.busy('node:source'),false,name+' original key released');
   rows.push({name,foreignCards:baseline,foreignBusy:baseline,foreignLayout:baseline});
  }
  window.reset();let h=window.h;h.flush(()=>h.view.start(task('task-drag'),placement));let view=window.h.view,renders=window.h.renders;
  for(let n=0;n<100;n++)view.drag('task-drag',{x:n,y:n+2});eq(window.h.renders,renders,'live drag does not render entire Canvas');
  h.flush(()=>view.drag('task-drag',{x:321,y:123},true));eq(window.h.snapshot.tasks[0].position,{x:321,y:123},'commit keeps exact user position');
  let release;const hold=new Promise(r=>release=r);const busy=window.h.view.activity({operationKey:'node:source',canRetry:()=>true,execute:()=>hold});
  h.flush(()=>busy.run());await new Promise(r=>setTimeout(r,10));eq(Number(document.querySelector('b').textContent),baseline?0:1,'busy-only change refreshes rendered React projection');release();await new Promise(r=>setTimeout(r,10));eq(Number(document.querySelector('b').textContent),0,'busy-only release refreshes rendered React projection');
  rows.push({name:'drag-and-operation-observation',dragFrames:100});
  if(!baseline){
   window.reset();h=window.h;const old=h.view;h.flush(()=>old.start(task('task-same'),placement));h.change({project:'tree:B'});
   h=window.h;h.flush(()=>h.view.start(task('task-same'),{preferred:{x:500,y:200},occupied:[]}));renders=window.h.renders;
   h.flush(()=>{old.drag('task-same',{x:900,y:800},true);old.update('task-same',{stage:'saving'});old.remove('task-same');});
   eq(window.h.snapshot.tasks[0].stage,'preparing','same-id old callback cannot alter another view');
   eq(window.h.snapshot.tasks[0].position,{x:500,y:200},'same-id old drag cannot move another view');
   eq(window.h.renders,renders,'unsubscribed old view does not render current Canvas');
   const detached=window.h.view;window.reset();renders=window.h.renders;
   h.flush(()=>detached.update('task-same',{stage:'saving'}));eq(window.h.renders,renders,'unmounted subscription is removed');
   rows.push({name:'same-id-late-callback-and-unsubscribe'});
  }
  return {cases:rows.length,checks,rows};
 },baseline);
 const retryAnchor=baseline?null:await page.evaluate(()=>{
  window.reset();const {view,flush}=window.h,task=id=>({id,operationKey:'node:retry',sourceId:'source',label:'Generating',stage:'preparing',previewSize:{width:100,height:100},startedAt:1});
  flush(()=>view.start(task('task-failed'),{preferred:{x:0,y:0},occupied:[]}));
  flush(()=>view.drag('task-failed',{x:731,y:319},true));
  flush(()=>view.update('task-failed',{failure:{kind:'sync',message:'original result exists'}}));
  let retry;flush(()=>retry=view.start(task('task-retry'),{preferred:{x:0,y:0},occupied:[]}));
  if(retry.x!==731||retry.y!==319||window.h.snapshot.tasks.length!==1||'task-failed' in window.h.snapshot.positions)throw Error('retry must replace only the failed card and keep its dragged anchor');
  flush(()=>view.hide('task-retry'));if(view.position('task-retry',{x:0,y:0}).x!==731)throw Error('hiding a card must retain its attachment anchor');
  flush(()=>view.remove('task-retry'));if(view.position('task-retry',{x:0,y:0}).x!==0)throw Error('removal must release hidden layout reservation');
  return {cases:1,checks:3,retryPosition:{x:731,y:319},hiddenAnchorRetained:true,removedAnchorReleased:true};
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);const require=createRequire(import.meta.url);
 process.env.CANVAS_IMAGE_SOURCE_ROOT=root;process.env.TASK_SOURCE_ROOT=root;process.env.R3_EVIDENCE=out;process.env.TASK_EVIDENCE=out;
 const image=require('./verify-canvas-image-task-refactor.cjs'),detail=require('./verify-canvas-task-boundaries.cjs'),ib=await image.bundle(),db=await detail.bundle();
 let checks=react.checks+(retryAnchor?.checks||0);const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};const callers=[];
 for(const kind of ['derived','detail']){
  const f=kind==='derived'?image.setup('derived','position-fails',ib):detail.setup('detail','position-fails',db);await f.run();
  eq(f.c.generationTasks.length,1,'actual caller retains failed presentation');const old=f.c.generationTasks[0];
  f.c.activeProjectRef.current={key:'tree:B'};f.c.canvasContextEpochRef.current++;f.presentation?.render();
  eq(f.c.generationTasks.length,baseline?1:0,'actual caller failure does not cross project');
  f.c.activeProjectRef.current={key:'tree:source'};f.c.canvasContextEpochRef.current++;f.presentation?.render();
  eq(f.c.generationTasks[0].id,old.id,'actual caller retains same original card on return');
  eq(f.state.post??f.state.posts,1,'navigation does not submit again');
  callers.push({kind,originalTaskId:old.id,foreignFailureVisible:baseline,posts:1});
 }
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,react,retryAnchor,actualCanvasCallers:callers,checks,pageErrors:errors,externalRequests:external.length,actualBrowser:'Edge',suppliers:0};
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_GENERATION_PRESENTATION=${baseline?'BASELINE_REPRODUCED':'PASS'} GROUPS=${react.cases+callers.length+(retryAnchor?.cases||0)} CHECKS=${checks} ACTUAL_REACT=1 ACTUAL_CALLERS=2 FOREIGN_TASKS=${baseline?1:0} FOREIGN_BUSY=${baseline?1:0} FOREIGN_LAYOUT=${baseline?1:0} DRAG_RENDER_PER_MOVE=0 SUPPLIER=FIXTURE`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
