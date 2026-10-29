/** Actual React hook/state + actual Canvas edit/detail callers. Browser/auth,
 * transport and document I/O are fixture ports; no provider or billing is mocked
 * into a claimed production acceptance. The baseline is a full source copy. */
import fs from 'node:fs/promises';import path from 'node:path';import ts from 'typescript';
import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';
import {createRequire} from 'node:module';import {chromium} from '@playwright/test';
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.PENDING_PRESENTATION_EVIDENCE||'output/canvas-pending-presentation'),baseline=arg('--mode')==='baseline';
await fs.mkdir(out,{recursive:true});const file='src/components/canvas/canvas-client.tsx',source=await fs.readFile(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,4),fns={},declarations=[];
(function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fns[n.name.text]=n.getText(ast);if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['[pendNodes, setPendNodes]','editTaskStateRef'].includes(d.name.getText(ast))))declarations.push(n.getText(ast));ts.forEachChild(n,walk);})(ast);
if(baseline)assert.equal(declarations.length,2);else {assert.equal(declarations.length,0);assert.doesNotMatch(source,/editTaskStateRef/);}
const p=s=>s.replaceAll('\\','/');
const fixture=`import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
${baseline?'':`import {useCanvasPendingPresentation} from '${p(path.join(root,'src/components/canvas/use-canvas-pending-presentation'))}';`}
let current={account:'A',project:'tree:A',workspace:'personal'},renders=0,sequence=0;window.__workspace='personal';const root=createRoot(document.getElementById('root'));
function Harness(){const [version,render]=useState(0),[readOnly,setReadOnly]=useState(false);renders++;
const canvasAccountRef={current:current.account},activeProjectRef={current:{key:current.project}},currentWorkspace=()=>current.workspace;
const selected={value:null},setSelectedPendId=f=>selected.value=typeof f==='function'?f(selected.value):f,flashTip=()=>{};
const generationPresentation={drag(){}};
${baseline?declarations.join('\n'):`const pendingPresentation=useCanvasPendingPresentation({key:JSON.stringify([current.account,current.workspace,current.project||'workspace'])},readOnly);const {nodes:pendNodes,set:setPendNodes}=pendingPresentation;`}
const pendNodesRef=useRef(pendNodes);pendNodesRef.current=pendNodes;
${fns.restoreEditTasks}
${fns.rememberGenerationDrag}
${fns.onPendRemove}
const view=${baseline?`{getSnapshot:()=>pendNodes,get:id=>editTaskStateRef.current.get(id)?.node,seed(node){editTaskStateRef.current.set(node.id,{account:current.account,workspace:current.workspace,project:current.project,node});setPendNodes(nodes=>[...nodes.filter(item=>item.id!==node.id),node]);},update(id,patch){const saved=editTaskStateRef.current.get(id);if(saved)editTaskStateRef.current.set(id,{...saved,node:{...saved.node,...patch}});restoreEditTasks();},clearTransient:()=>setPendNodes([]),retain:node=>view.seed(node),release:id=>editTaskStateRef.current.delete(id)}`:`{...pendingPresentation,seed:pendingPresentation.retain}`};
window.h={view,nodes:pendNodes,version,renders,selected,flush:fn=>flushSync(fn),restore:()=>flushSync(restoreEditTasks),drag:(id,pos,commit)=>flushSync(()=>rememberGenerationDrag(id,pos,commit)),remove:id=>flushSync(()=>onPendRemove(id)),readonly:value=>flushSync(()=>setReadOnly(value)),change:patch=>{Object.assign(current,patch);window.__workspace=current.workspace;flushSync(()=>render(v=>v+1));}};
return <main><output>{JSON.stringify(pendNodes.map(node=>({id:node.id,x:node.x,y:node.y,label:node.label})))}</output></main>;}
window.reset=()=>{current={account:'A',project:'tree:A',workspace:'personal'};window.__workspace='personal';flushSync(()=>root.render(<Harness key={++sequence}/>));};window.reset();`;
const built=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.resolve('node_modules')],define:{'process.env.NODE_ENV':'"development"'}});
await fs.writeFile(path.join(out,'fixture.tsx'),fixture);
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?built.outputFiles[0].contents:'<!doctype html><html><meta charset="utf-8"><body style="background:#fff;color:#142033"><div id="root"></div><script src="/app.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],external=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external.push(route.request().url()),route.abort()));await page.goto('http://127.0.0.1:'+server.address().port);
 const react=await page.evaluate(baseline=>{
  let checks=0;const rows=[],eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));checks++;};
  const node=(id,label='original')=>({id,x:50,y:80,label,parentId:'source',linked:true,uploading:false,progress:8,inputs:['source'],generating:true,operationKey:'node:source'});
  for(const [name,patch]of [['project',{project:'tree:B'}],['account',{account:'B'}],['workspace',{workspace:'tenant'}]]){
   window.reset();let h=window.h,old=h.view;h.flush(()=>old.seed(node('pend-same')));h.flush(()=>old.clearTransient());h.change(patch);window.h.restore();
   eq(window.h.nodes.length,0,name+' foreign placeholder hidden');h=window.h;h.flush(()=>h.view.seed(node('pend-same','other view')));
   h.change({account:'A',project:'tree:A',workspace:'personal'});window.h.restore();eq(window.h.nodes.map(n=>n.label),baseline?[]:['original'],name+' same id does not erase original retained result');
   h=window.h;const count=h.renders;h.flush(()=>old.update('pend-same',{generationStage:'saving'}));eq(window.h.nodes.length,baseline?0:1,name+' late updates remain bound');
   h.change(patch);window.h.restore();eq(window.h.nodes.map(n=>n.label),['other view'],name+' foreign view retains own record');
   rows.push({name,originalErased:baseline});
  }
  window.reset();let h=window.h;h.flush(()=>h.view.seed(node('pend-drag')));h=window.h;const count=h.renders;
  for(let i=0;i<100;i++)h.drag('pend-drag',{x:i,y:i+1},false);eq(window.h.renders,count,'pointer movement does not render parent');
  h.drag('pend-drag',{x:321,y:123},true);if(!baseline)eq(window.h.nodes[0].x,321,'committed drag publishes exact position');
  h=window.h;h.remove('pend-drag');eq(window.h.nodes.length,1,'running original task cannot be removed');
  h.flush(()=>h.view.update('pend-drag',{generating:false}));h=window.h;h.remove('pend-drag');eq(window.h.nodes.length,0,'failed card removal releases only local record');h.restore();eq(window.h.nodes.length,0,'removed record does not resurrect');
  rows.push({name:'drag-and-retained-removal',moves:100});
  window.reset();h=window.h;h.flush(()=>h.view.seed(node('pend-readonly')));h=window.h;h.readonly(true);window.h.restore();eq(window.h.nodes.length,0,'readonly hides editable cards');h=window.h;h.flush(()=>h.view.update('pend-readonly',{generationStage:'saving'}));if(!baseline)eq(window.h.nodes.length,0,'late updates never reveal editable card in readonly');h=window.h;h.readonly(false);window.h.restore();eq(window.h.nodes[0].generationStage,'saving','return retains original recovery state');rows.push({name:'readonly-retains-original'});
  if(!baseline){
   window.reset();h=window.h;let old=h.view;h.flush(()=>old.seed(node('pend-unmounted')));window.reset();const count=window.h.renders;old.update('pend-unmounted',{generationStage:'saving'});eq(window.h.renders,count,'unmounted view unsubscribed');
   h=window.h;h.flush(()=>h.view.set([node('pend-transient')]));h.flush(()=>h.view.seed(node('pend-retained')));h.flush(()=>h.view.clearTransient());eq(window.h.nodes.map(n=>n.id),['pend-retained'],'clear only transient placeholders');
   h.flush(()=>h.view.update('pend-retained',{generating:false,generationFailure:{kind:'sync',message:'original'}}));h=window.h;
   let next;h.flush(()=>next=h.view.beginEdit({...node('pend-next'),generationSize:{width:320,height:320}},{preferred:{x:1,y:2},occupied:[]}));eq(window.h.nodes.map(n=>n.id),['pend-next'],'new explicit edit replaces only failed same operation card');eq(next.x,1,'layout uses current view only');
   rows.push({name:'unmount-transient-and-failed-replacement'});
  }
  return {groups:rows.length,checks,rows};
 },baseline);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const require=createRequire(import.meta.url);process.env.TASK_SOURCE_ROOT=root;process.env.TASK_EVIDENCE=path.join(out,'actual-callers');
 const detail=require('./verify-canvas-task-boundaries.cjs'),db=await detail.bundle(),callers=[];let checks=react.checks;
 const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 for(const kind of ['cutout','detail-blank']){
  const f=detail.setup(kind,'position-fails',db);await f.run();const failed=f.c.pendNodes[0],retry=failed?.onGenerationRetry;eq(typeof retry,'function','actual edit/detail retains original task continuation');
  f.c.activeProjectRef.current={key:'tree:B'};f.c.canvasContextEpochRef.current++;f.presentation?.render();if(!baseline)eq(f.c.pendNodes.length,0,'actual caller no foreign failed card');
  f.restore();eq(f.c.pendNodes[0].id,failed.id,'same failed placeholder restored');f.state.retried=true;await Promise.all([retry(),retry()]);eq(f.state.posts,1,'known result continuation zero paid resubmit');eq(f.state.quotes,1,'known result continuation zero requote');eq(f.state.history.length,1,'one attachment/history');
  callers.push({kind,posts:f.state.posts,quotes:f.state.quotes,history:f.state.history.length,originalPlaceholderId:failed.id});
 }
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,react,actualCanvasCallers:callers,checks,pageErrors:errors,externalRequests:external.length,actualReact:true,actualCanvas:true,fullProduct:false,supplier:'FIXTURE'};
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_PENDING_PRESENTATION=${baseline?'BASELINE_REPRODUCED':'PASS'} GROUPS=${react.groups+callers.length} CHECKS=${checks} ACTUAL_REACT=1 ACTUAL_CALLERS=2 SAME_ID_ORIGINAL_LOST=${baseline?1:0} DRAG_RENDER_PER_MOVE=0 KNOWN_RESULT_POSTS=1 REQUOTE=0 EXTERNAL=0 SUPPLIER=FIXTURE`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
