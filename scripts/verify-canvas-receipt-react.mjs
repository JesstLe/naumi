import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=process.cwd(),sourceRoot=path.resolve(process.env.CANVAS_SOURCE_ROOT||root),out=path.resolve(process.env.CANVAS_TEST_OUT||'output/canvas-receipt-react');
await mkdir(out,{recursive:true});
const file=path.join(sourceRoot,'src/components/canvas/canvas-client.tsx'),source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let merge,ack;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='mergeWorks')merge=n.getText(ast);if(ts.isFunctionDeclaration(n)&&n.name?.text==='runGen'){function guard(x){if(ts.isIfStatement(x)&&x.expression.getText(ast).startsWith('jobId&&')&&x.expression.getText(ast).includes('newIds.every'))ack=x.getText(ast);ts.forEachChild(x,guard);}guard(n);}ts.forEachChild(n,visit);}visit(ast);assert.ok(merge&&ack);
const fixture=`import React,{useEffect,useRef,useState}from 'react';import{createRoot}from'react-dom/client';
import{completeCanvasImagegen,pendingAttemptKey,savePendingAttempt,readPendingAttempt}from ${JSON.stringify(path.join(root,'src/lib/imagegen/client-recovery.ts'))};
import{assertGenerationResultsPresent}from ${JSON.stringify(path.join(root,'src/lib/canvas/generation-failure.ts'))};
const owner='fixture@example.test',project='tree:fixture',workspace='personal',operationId='11111111-1111-4111-8111-111111111111',jobId='imagegen-'+operationId,key=pendingAttemptKey(owner,workspace,project,'node:source');
const pending={version:1,owner,workspace,project,operationId,actionKey:'node:source',request:{operationId},authorizedCredits:6,confirmationRequired:false,accepted:'accepted',jobId,context:{workspace,projectContext:project}};
function App(){const[works,setWorks]=useState([{id:'source',image:'/source.png'}]),worksRef=useRef(works),canvasAccountRef=useRef(owner),[done,setDone]=useState(false);useEffect(()=>{worksRef.current=works},[works]);
 const user={email:owner},targetEmail=null,requestOwner=owner,requestProject=project,requestWorkspace=workspace,t=x=>x,invalidateBrowserData=()=>{};
 const privateFetchRaw=async()=>{await new Promise(resolve=>{window.releaseResult=resolve});return Response.json({artworks:[{id:'new-result',image:'/result.png',canvasX:500,canvasY:200}]})},expectJsonOk=r=>r.json(),refetchWorks=async()=>works;
 ${merge}
 const deliver=async()=>{savePendingAttempt(key,pending);const newIds=['new-result'],receiptComplete=true,current=()=>true;const fresh=await mergeWorks(newIds,current);assertGenerationResultsPresent(newIds,fresh);const before=worksRef.current.some(a=>a.id==='new-result');${ack};window.receiptCheck={before,receiptImmediately:!!readPendingAttempt(key),freshIds:fresh.map(a=>a.id)};setDone(true);};
 useEffect(()=>{if(done)window.receiptCheck={...window.receiptCheck,committed:worksRef.current.some(a=>a.id==='new-result'),receiptAfterCommit:!!readPendingAttempt(key)}},[done,works]);
 return <main><button id="generate" onClick={deliver}>生成A</button><label>B的下一次提示词<textarea id="draft" defaultValue="B next draft"/></label><div id="results">{works.map(a=><div key={a.id} data-id={a.id}>{a.id}</div>)}</div></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
await writeFile(path.join(out,'fixture.tsx'),fixture);
const bundled=await build({stdin:{contents:fixture,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},nodePaths:[path.join(root,'node_modules')]});
const js=bundled.outputFiles[0].contents;
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(js);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;background:#fff;color:#182331;padding:24px}label{display:block;margin-top:20px}textarea{display:block;width:420px;height:90px}#results{display:flex;gap:24px;margin-top:24px}#results>div{padding:24px;border:1px solid #ccd4dd;border-radius:8px}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:900,height:520}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#generate').click();await page.waitForFunction(()=>typeof window.releaseResult==='function');await page.locator('#draft').fill('B draft edited while A finishes');await page.evaluate(()=>window.releaseResult());await page.waitForFunction(()=>window.receiptCheck?.committed===true);
 const observed=await page.evaluate(()=>({...window.receiptCheck,draft:document.querySelector('#draft').value,focused:document.activeElement?.id}));
 const report={sourceRoot,observed,errors,browser:await browser.version(),supplierCalls:0,evidenceTier:'actual React DOM/Edge commit scheduling with source-extracted mergeWorks and receipt completion branch; not the full Canvas page'};
 await writeFile(path.join(out,'REACT_RECEIPT.json'),JSON.stringify(report,null,2)+'\n');await page.screenshot({path:path.join(out,'react-receipt.png')});
 assert.deepEqual(errors,[]);assert.equal(observed.before,false,'test actually reached the deferred-ref window');assert.equal(observed.receiptImmediately,false,'verified merge snapshot retires completed receipt');assert.equal(observed.receiptAfterCommit,false);assert.equal(observed.draft,'B draft edited while A finishes');assert.equal(observed.focused,'draft');
 console.log('REACT_RECEIPT=PASS DEFERRED_REF=1 COMPLETED_RECEIPT_RETIRED=1 OTHER_DRAFT_FOCUS_PRESERVED=1 SUPPLIER_CALLS=0');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
