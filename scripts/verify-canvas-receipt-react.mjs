// Real React DOM with shared artwork/task/result/receipt owners. No extracted
// Canvas closure; only HTTP/auth and the delayed view projection are fixtures.
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=process.cwd(),sourceRoot=path.resolve(process.env.CANVAS_SOURCE_ROOT||root),out=path.resolve(process.env.CANVAS_TEST_OUT||'output/canvas-receipt-react');
await mkdir(out,{recursive:true});const modulePath=f=>JSON.stringify(path.join(sourceRoot,f).replaceAll('\\','/'));
const fixture=`import React,{useEffect,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{createCanvasArtworkDocument}from ${modulePath('src/lib/canvas/artwork-document.ts')};
import{createCanvasImageTask}from ${modulePath('src/lib/canvas/image-task-controller.ts')};
import{pendingAttemptKey,savePendingAttempt,readPendingAttempt}from ${modulePath('src/lib/imagegen/client-recovery.ts')};
const owner='fixture@example.test',project='tree:fixture',workspace='personal',operationId='11111111-1111-4111-8111-111111111111',jobId='imagegen-'+operationId,key=pendingAttemptKey(owner,workspace,project,'node:source');
const pending={version:1,owner,workspace,project,operationId,actionKey:'node:source',request:{operationId},authorizedCredits:6,confirmationRequired:false,accepted:'accepted',jobId,context:{workspace,projectContext:project}};
const scope={account:owner,workspace,project,key:'fixture',viewCurrent:()=>true,documentCurrent:()=>true,assertView(){}};
const documentOwner=createCanvasArtworkDocument().bind(scope,owner,true);documentOwner.accept([{id:'source',title:'Source',createdAt:'2026-10-28',image:'/source.png'}]);
window.fetch=async(url,init={})=>{if(String(url).startsWith('/api/generate-image?job='))return Response.json({status:'done',operationStatus:'succeeded',images:[{id:'new-result',url:'/result.png'}]});if(url==='/api/artworks/position')return Response.json({ok:true});if(String(url).startsWith('/api/artworks/get?')){await new Promise(resolve=>window.releaseResult=resolve);return Response.json({artworks:[{id:'new-result',title:'Result',createdAt:'2026-10-28',image:'/result.png',canvasX:500,canvasY:200}]});}throw Error('Unexpected request '+url);};
function App(){const[works,setWorks]=useState(documentOwner.getSnapshot().nodes),worksRef=useRef(works),[done,setDone]=useState(false);useEffect(()=>{worksRef.current=works},[works]);
 const deliver=async()=>{savePendingAttempt(key,pending);const task=createCanvasImageTask({scope:{owner,project,workspace,isCurrent:()=>true,assertCurrent(){}},prepare:async()=>new FormData(),submit:async()=>Response.json({jobId}),position:()=>({x:500,y:200}),merge:async(ids,current)=>{const fresh=await documentOwner.merge(ids,current);setWorks(fresh);return fresh;},history(){},stage(){},user(){},notice(){},errorText:'Generate failed',saveErrorText:'Save failed',resultGap:40});const result=await task.run();if(result.status!=='succeeded')throw Error(JSON.stringify(result));window.receiptCheck={before:worksRef.current.some(a=>a.id==='new-result'),receiptImmediately:!!readPendingAttempt(key),freshIds:result.artworks.map(a=>a.id),ownerIds:documentOwner.getSnapshot().nodes.map(a=>a.id)};setDone(true);};
 useEffect(()=>{if(done)window.receiptCheck={...window.receiptCheck,committed:worksRef.current.some(a=>a.id==='new-result'),receiptAfterCommit:!!readPendingAttempt(key)}},[done,works]);
 return <main><button id='generate' onClick={deliver}>生成A</button><label>B的下一次提示词<textarea id='draft' defaultValue='B next draft'/></label><div id='results'>{works.map(a=><div key={a.id} data-id={a.id}>{a.id}</div>)}</div></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
await writeFile(path.join(out,'fixture.tsx'),fixture);
const bundled=await build({stdin:{contents:fixture,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},nodePaths:[path.join(root,'node_modules')],tsconfig:path.join(sourceRoot,'tsconfig.json'),plugins:[{name:'browser-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/browser-data-cache$/},()=>({path:'cache',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const invalidateBrowserData=()=>{};export const loadAccountSnapshot=()=>{throw Error("Unexpected whole-account read")};',loader:'js'}));}}]});
const js=bundled.outputFiles[0].contents,server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(js);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;background:#fff;color:#182331;padding:24px}label{display:block;margin-top:20px}textarea{display:block;width:420px;height:90px}#results{display:flex;gap:24px;margin-top:24px}#results>div{padding:24px;border:1px solid #ccd4dd;border-radius:8px}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:900,height:520}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#generate').click();await page.waitForFunction(()=>typeof window.releaseResult==='function');await page.locator('#draft').fill('B draft edited while A finishes');await page.evaluate(()=>window.releaseResult());await page.waitForFunction(()=>window.receiptCheck?.committed===true);
 const observed=await page.evaluate(()=>({...window.receiptCheck,draft:document.querySelector('#draft').value,focused:document.activeElement?.id}));
 await writeFile(path.join(out,'REACT_RECEIPT.json'),JSON.stringify({sourceRoot,observed,errors,browser:await browser.version(),supplierCalls:0,evidenceTier:'actual React DOM/Edge and full shared artwork/task/result/receipt owners; HTTP/auth ports; not the full Canvas page'},null,2)+'\n');await page.screenshot({path:path.join(out,'react-receipt.png')});
 assert.deepEqual(errors,[]);assert.equal(observed.before,false,'test reached the deferred-ref window');assert.equal(observed.receiptImmediately,false);assert.equal(observed.receiptAfterCommit,false);assert.ok(observed.ownerIds.includes('new-result'));assert.equal(observed.draft,'B draft edited while A finishes');assert.equal(observed.focused,'draft');
 console.log('REACT_RECEIPT=PASS DEFERRED_REF=1 COMPLETED_RECEIPT_RETIRED=1 ACTUAL_DOCUMENT_TASK_OWNERS=1 OTHER_DRAFT_FOCUS_PRESERVED=1 SUPPLIER_CALLS=0');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
