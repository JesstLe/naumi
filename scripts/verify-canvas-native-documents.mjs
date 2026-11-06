/** Actual six React hooks + real document scope. Only auth/HTTP response timing
 * are controlled ports; this is not the separate full-product/PG acceptance. */
import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'node:http';
import assert from 'node:assert/strict';import {build} from 'esbuild';import ts from 'typescript';import {chromium} from '@playwright/test';
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.NATIVE_DOCUMENT_EVIDENCE||'output/refactor-r7c-20261029/native-documents'),baseline=process.argv.includes('--baseline');
await fs.mkdir(out,{recursive:true});const kinds=['video','director','character','scene','audio','timeline'];
const canvas=await fs.readFile(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',canvas,99,true,4);let raw;
(function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='privateFetchRaw')raw=node.getText(ast);ts.forEachChild(node,walk);})(ast);assert.ok(raw);
const fixture=`import React,{useState,useRef,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {authHeader} from '${path.join(root,'src/lib/supabase').replaceAll('\\','/')}';
import {createCanvasDocumentContext} from '${path.join(root,'src/lib/canvas/document-scope').replaceAll('\\','/')}';
import {currentWorkspace,selectWorkspace,currentWorkspaceRevision} from '${path.join(root,'src/lib/saas/workspace-client').replaceAll('\\','/')}';
${kinds.map(k=>`import {use${k[0].toUpperCase()+k.slice(1)}Nodes} from '${path.join(root,`src/components/canvas/${k}/use-${k}-nodes`).replaceAll('\\','/')}';`).join('\n')}
${raw}
const kinds=${JSON.stringify(kinds)},state={db:new Map(),receipts:new Map(),posts:[],reads:[],auth:async()=>{},read:async()=>{},afterPost:async()=>{},readError:false};
const record=(kind,mark='personal')=>({id:kind,projectKey:'tree:P',revision:1,title:mark,deletedAt:null,updatedAt:'initial',marker:mark});
const key=(kind,workspace,owner)=>JSON.stringify([kind,workspace,owner]);
window.__auth=async()=>{await state.auth();return {'authorization':window.h?.actor||'a','x-naumi-workspace':currentWorkspace()};};
window.fetch=async(input,init={})=>{
 const url=new URL(String(input),location.origin),headers=new Headers(init.headers),workspace=headers.get('x-naumi-workspace')||'personal',owner=url.searchParams.get('email')||headers.get('authorization')||'a',kind=url.pathname.split('/')[3].replace(/-nodes$/,''),id=key(kind,workspace,owner);
 if(!state.db.has(id))state.db.set(id,record(kind,workspace));
 if(!init.method||init.method==='GET'){state.reads.push({url:url.pathname,workspace,owner});const nodes=[structuredClone(state.db.get(id))];await state.read(kind);if(state.readError)return Response.json({error:'read unavailable'},{status:503});return Response.json({nodes});}
 const body=JSON.parse(init.body);state.posts.push({url:url.pathname,method:init.method,workspace,owner,body,project:headers.get('x-naumi-project-context')});
 const op=key(kind,workspace,body.operationId),prior=state.receipts.get(op);let result;
 if(prior)result=prior;else{const current=state.db.get(id);if(body.expectedRevision!==current.revision)return Response.json({error:'conflict',code:'FIXTURE_REVISION_CONFLICT'},{status:409});result={...current,...body,revision:current.revision+1,updatedAt:'saved'};delete result.operationId;delete result.expectedRevision;state.db.set(id,result);state.receipts.set(op,result);}
 await state.afterPost();return Response.json({node:result});
};
let view={actor:'a',owner:'a',project:'tree:P',readOnly:false},sequence=0;const root=createRoot(document.getElementById('root'));
function Harness(){const [version,render]=useState(0),context=useRef(createCanvasDocumentContext()),scope=context.current.render(JSON.stringify([view.actor,view.owner]),view.project),input={email:view.owner,readOnly:view.readOnly,scope,request:privateFetchRaw};
 const stores={${kinds.map(k=>`${k}:use${k[0].toUpperCase()+k.slice(1)}Nodes(input)`).join(',')}};
 useEffect(()=>{context.current.mount(true);return()=>context.current.mount(false);},[]);
 window.h={...view,stores,state,record,key,workspace:currentWorkspace,revision:currentWorkspaceRevision,change:patch=>{Object.assign(view,patch);flushSync(()=>render(n=>n+1));},select:id=>{selectWorkspace(id);flushSync(()=>render(n=>n+1));},unmount:()=>flushSync(()=>root.render(null))};
 return <main><b>Native documents</b><span>{version}</span>{kinds.map(kind=><section key={kind} data-kind={kind}><strong>{kind}</strong><output>{JSON.stringify(stores[kind].allNodes)}</output><em>{stores[kind].error}</em></section>)}</main>;
}
window.reset=()=>{sessionStorage.clear();state.db.clear();state.receipts.clear();state.posts=[];state.reads=[];state.auth=async()=>{};state.read=async()=>{};state.afterPost=async()=>{};state.readError=false;view={actor:'a',owner:'a',project:'tree:P',readOnly:false};selectWorkspace('personal');flushSync(()=>root.render(<Harness key={++sequence}/>));};window.reset();`;
await fs.writeFile(path.join(out,'fixture.tsx'),fixture);
const built=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',nodePaths:[path.resolve('node_modules')],tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'only-auth-port',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const authHeader=()=>window.__auth();',loader:'js'}));}}]});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?built.outputFiles[0].contents:'<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px system-ui;color:#172033;background:white;margin:24px}section{padding:12px;border-bottom:1px solid #ddd}output{display:block;max-width:100%;overflow:auto}em{color:#b33}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('NATIVE_PHASE='))console.log(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async({kinds,baseline})=>{
  let checks=0,groups=0;const observations=[];
  const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));checks++;};
  const wait=async(fn)=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('fixture wait timeout');};
  const gate=()=>{let release,enter;const promise=new Promise(r=>release=r),entered=new Promise(r=>enter=r);return {release,enter,promise,entered};};
  const reset=async()=>{window.reset();await wait(()=>kinds.every(kind=>window.h.stores[kind].ready));};
  for(const kind of kinds){
   console.log('NATIVE_PHASE='+kind+' START');await reset();let h=window.h;h.select('tenant');await new Promise(r=>setTimeout(r,30));eq(window.h.stores[kind].allNodes[0].marker,baseline?'personal':'tenant',kind+' workspace bucket');
   observations.push({kind,workspaceSeparated:!baseline});groups++;
   for(const change of ['workspace','actor','readonly','unmount']){
    await reset();h=window.h;const g=gate();h.state.auth=async()=>{g.enter();await g.promise;};const save=h.stores[kind].save(kind,{title:'late-auth'}).catch(e=>String(e));await g.entered;
    if(change==='workspace'){h.select('tenant');window.h.select('personal');}else if(change==='actor'){h.change({actor:'b'});window.h.change({actor:'a'});}else if(change==='readonly'){h.change({readOnly:true});window.h.change({readOnly:false});}else h.unmount();
    g.release();await save;eq(h.state.posts.length,baseline?1:0,kind+' auth '+change+' stops stale POST');groups++;
   }
   console.log('NATIVE_PHASE='+kind+' LOST');await reset();h=window.h;let lost=kind==='video'&&!baseline?3:1;h.state.afterPost=async()=>{if(lost-->0)throw Error('committed response lost');};
   await h.stores[kind].save(kind,{title:'lost'}).catch(()=>{});await window.h.stores[kind].refresh();await window.h.stores[kind].save(kind,{title:'lost'});
   eq(h.state.receipts.size,baseline?2:1,kind+' unknown original operation');eq(h.state.posts[0].body.operationId===h.state.posts[1].body.operationId,!baseline,kind+' exact operation replay');groups++;
   if(!baseline){
    console.log('NATIVE_PHASE='+kind+' NEXT_AFTER_LOST');await reset();h=window.h;let first=kind==='video'?3:1;h.state.afterPost=async()=>{if(first-->0)throw Error('lost first');};
    await h.stores[kind].save(kind,{title:'first'}).catch(()=>{});await window.h.stores[kind].save(kind,{title:'second'});
    eq(h.state.posts.map(p=>p.body.expectedRevision),kind==='video'?[1,1,1,1,2]:[1,1,2],kind+' settle prior before next');eq(h.state.posts[0].body,h.state.posts[1].body,kind+' frozen original body');eq(h.state.receipts.size,2,kind+' exactly two intended writes');groups++;
    await reset();h=window.h;const g=gate();h.state.read=async k=>{if(k===kind){g.enter();await g.promise;}};const oldRead=h.stores[kind].refresh();await g.entered;h.state.read=async()=>{};
    const server=h.state.db.get(h.key(kind,'personal','a'));server.marker='newer-read';await window.h.stores[kind].refresh();g.release();await oldRead;
    eq(window.h.stores[kind].allNodes[0].marker,'newer-read',kind+' newer read wins');groups++;
    await reset();h=window.h;const before=h.stores[kind].allNodes;await h.stores[kind].refresh();eq(window.h.stores[kind].allNodes===before,true,kind+' unchanged array reference');
    h.state.readError=true;await window.h.stores[kind].refresh().catch(()=>{});eq(window.h.stores[kind].error,'read unavailable',kind+' read error visible');eq(window.h.stores[kind].allNodes.length,1,kind+' failure retains nodes');groups++;
    console.log('NATIVE_PHASE='+kind+' DEDUP');await reset();h=window.h;const hold=gate();h.state.afterPost=async()=>{hold.enter();await hold.promise;};const one=h.stores[kind].save(kind,{title:'dedup'}),two=h.stores[kind].save(kind,{title:'dedup'});await hold.entered;eq(h.state.posts.length,1,kind+' in-flight dedup');hold.release();await Promise.all([one,two]);groups++;
    await reset();h=window.h;const stable=h.stores[kind].allNodes,readCount=h.state.reads.length;h.change({project:'tree:Q'});await wait(()=>h.state.reads.length===readCount+kinds.length);eq(window.h.stores[kind].allNodes===stable,true,kind+' project retains document');eq(h.state.reads.length,readCount+kinds.length,kind+' project loads its context once without restarting document');groups++;
   }
  }
  for(const kind of ['audio','timeline']){
   await reset();const h=window.h,before=h.state.reads.length;await h.stores[kind].render(kind,0,'render-conflict').catch(()=>{});await new Promise(r=>setTimeout(r,20));
   eq(h.state.reads.length-before,1,kind+' command409 keeps original refresh');eq(h.state.posts.length,1,kind+' conflict never resubmits');groups++;
  }
  return {status:baseline?'BASELINE_REPRODUCED':'PASS',groups,checks,kinds:6,observations,actualReact:true,actualHooks:true,authAndHttpPorts:true,paidCalls:0};
 },{kinds,baseline});
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'native-documents.png')});await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({...result,errors,sourceRoot:root},null,2)+'\n');
 console.log(`CANVAS_NATIVE_DOCUMENTS=${result.status} GROUPS=${result.groups} CHECKS=${result.checks} ACTUAL_REACT=1 HOOKS=6 WORKSPACE=${baseline?'LEAK_REPRODUCED':'ISOLATED'} AUTH_LATE_POST=${baseline?'REPRODUCED':'ZERO'} ORIGINAL_SAVE=${baseline?'REISSUED':'REPLAYED'} HTTP=CONTROLLED SUPPLIER=0`);
}catch(error){await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack,errors},null,2)+'\n');throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
