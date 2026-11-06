// Actual native document/hooks and document-scope. Only auth and HTTP timing
// are controlled. Models, workers and production endpoints are never called.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
const source=path.resolve(process.argv[2]||'.'),phase=process.argv[3]||'MODIFIED',out=path.resolve(process.env.VIDEO_CONNECT_EVIDENCE||'output/video-image-connect',phase+'-projects');
const kinds=['video','director','character','scene','audio','timeline'];
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const from=p=>JSON.stringify(path.join(source,p).replaceAll('\\','/'));
 const fixture=`import React,{useRef,useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {createCanvasDocumentContext} from ${from('src/lib/canvas/document-scope')};
 import {selectWorkspace,currentWorkspace} from ${from('src/lib/saas/workspace-client')};
 ${kinds.map(k=>`import {use${k[0].toUpperCase()+k.slice(1)}Nodes} from ${from(`src/components/canvas/${k}/use-${k}-nodes`)};`).join('\n')}
 const kinds=${JSON.stringify(kinds)},state={db:new Map(),reads:[],posts:[],read:async()=>{},post:async()=>{},readStatus:200};
 const key=(kind,workspace,actor,project)=>JSON.stringify([kind,workspace,actor,project]);
 const record=(kind,project='tree:P',mark='initial')=>({id:kind+'-'+project.slice(5),projectKey:project,revision:1,title:mark,marker:mark,deletedAt:null,updatedAt:mark});
 let view={actor:'a',project:'tree:P',readOnly:false},sequence=0;
 window.__auth=async()=>({authorization:view.actor});
 window.fetch=async(input,init={})=>{
  const url=new URL(String(input),location.origin),headers=new Headers(init.headers),workspace=headers.get('x-naumi-workspace'),actor=headers.get('authorization'),project=headers.get('x-naumi-project-context'),kind=url.pathname.split('/')[3].replace(/-nodes$/,'');
  if(!init.method||init.method==='GET'){
   const capture={kind,workspace,actor,project},nodes=structuredClone(state.db.get(key(kind,workspace,actor,project||'tree:default'))||[]);
   state.reads.push(capture);await state.read(capture);
   return state.readStatus===200?Response.json({nodes}):Response.json({error:'read unavailable'},{status:state.readStatus});
  }
  const body=JSON.parse(init.body),entry={kind,workspace,actor,project,body,url:url.pathname,method:init.method,signal:init.signal};state.posts.push(entry);
  const rows=state.db.get(key(kind,workspace,actor,project))||[],old=rows.find(n=>n.id===body.id);
  if(body.expectedRevision!==(old?.revision||0))return Response.json({error:'conflict'},{status:409});
  const node={...old,...body,projectKey:project||body.projectKey,revision:body.expectedRevision+1};delete node.operationId;delete node.expectedRevision;
  state.db.set(key(kind,workspace,actor,node.projectKey),[...rows.filter(n=>n.id!==node.id),node]);
  await state.post(entry);return Response.json({node});
 };
 const root=createRoot(document.getElementById('root'));
 function Harness(){const [,render]=useState(0),context=useRef(createCanvasDocumentContext()),scope=context.current.render(view.actor,view.project),input={scope,email:view.actor,readOnly:view.readOnly};
  const stores={${kinds.map(k=>`${k}:use${k[0].toUpperCase()+k.slice(1)}Nodes(input)`).join(',')}};
  useEffect(()=>{context.current.mount(true);return()=>context.current.mount(false);},[]);
  window.h={state,stores,key,record,change:patch=>{Object.assign(view,patch);flushSync(()=>render(n=>n+1));},workspace:value=>{selectWorkspace(value);flushSync(()=>render(n=>n+1));}};
  return <main>{kinds.map(kind=><section key={kind}>{kind}<output>{JSON.stringify(stores[kind].allNodes)}</output></section>)}</main>;
 }
 window.reset=()=>{sessionStorage.clear();view={actor:'a',project:'tree:P',readOnly:false};selectWorkspace('personal');state.db.clear();state.reads=[];state.posts=[];state.read=async()=>{};state.post=async()=>{};state.readStatus=200;
  for(const kind of kinds)for(const project of ['tree:P','tree:Q','tree:default'])for(const workspace of ['personal','tenant'])for(const actor of ['a','b'])state.db.set(key(kind,workspace,actor,project),[record(kind,project,workspace+'-'+actor)]);
  flushSync(()=>root.render(<Harness key={++sequence}/>));
 };window.reset();`;
 const built=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',nodePaths:[path.resolve('node_modules')],tsconfig:path.join(source,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'auth-only',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const authHeader=()=>window.__auth();',loader:'js'}));}}]});
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(/^(PASS|FAIL) /.test(m.text()))console.log(m.text());});
 await context.route('http://native-documents.fixture/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><body><div id="root"></div></body></html>'}));
 try{
  await page.goto('http://native-documents.fixture/');await page.addScriptTag({content:built.outputFiles[0].text});
  const result=await page.evaluate(async kinds=>{
   const checks=[];const test=async(name,run)=>{try{await run();checks.push({name,pass:true});console.log('PASS '+name)}catch(e){checks.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message)}};
   const eq=(a,b,label='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b))};
   const wait=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('fixture wait timeout')};
   const gate=()=>{let release,enter;return {promise:new Promise(r=>release=r),entered:new Promise(r=>enter=r),release:()=>release(),enter:()=>enter()}};
   const reset=async()=>{window.reset();await wait(()=>kinds.every(k=>window.h.stores[k].ready));};
   for(const kind of kinds){
    await test(kind+'_initial_read_has_project_context_and_original_nodes',async()=>{await reset();const h=window.h;eq(h.state.reads.filter(r=>r.kind===kind).map(r=>r.project),['tree:P']);eq(h.stores[kind].nodes.map(n=>n.id),[kind+'-P'])});
    await test(kind+'_project_navigation_reads_once_and_keeps_other_project',async()=>{await reset();const h=window.h,prior=h.record(kind);h.stores[kind].accept([prior],()=>true);const before=h.state.reads.length;h.change({project:'tree:Q'});await wait(()=>h.state.reads.length>=before+kinds.length);await wait(()=>window.h.stores[kind].nodes.some(n=>n.id===kind+'-Q'));eq(h.state.reads.length-before,kinds.length);eq(window.h.stores[kind].nodes.some(n=>n.id===prior.id),true)});
    await test(kind+'_scoped_absence_removes_only_current_project',async()=>{await reset();const h=window.h;h.stores[kind].accept([h.record(kind),h.record(kind,'tree:Q')],()=>true);h.state.db.set(h.key(kind,'personal','a','tree:P'),[]);await h.stores[kind].refresh();eq(window.h.stores[kind].allNodes.map(n=>n.id),[kind+'-Q'])});
    await test(kind+'_server_tombstone_really_hides_deleted_node',async()=>{await reset();const h=window.h;h.stores[kind].accept([h.record(kind)],()=>true);h.state.db.set(h.key(kind,'personal','a','tree:P'),[{...h.record(kind),revision:2,deletedAt:'2026-11-06T00:00:00Z'}]);await h.stores[kind].refresh();eq(window.h.stores[kind].nodes.length,0);eq(window.h.stores[kind].allNodes[0].revision,2)});
    await test(kind+'_overview_is_not_authoritative_for_other_project_absence',async()=>{await reset();const h=window.h;h.stores[kind].accept([h.record(kind)],()=>true);h.change({project:null});await window.h.stores[kind].refresh();eq(window.h.stores[kind].nodes.some(n=>n.id===kind+'-P'),true)});
    await test(kind+'_pre_receipt_read_cannot_erase_new_receipt',async()=>{await reset();const h=window.h,g=gate();h.state.db.set(h.key(kind,'personal','a','tree:P'),[]);h.state.read=async r=>{if(r.kind===kind){g.enter();await g.promise;}};const old=h.stores[kind].refresh();await g.entered;h.stores[kind].accept([{...h.record(kind),revision:5,marker:'real-receipt'}],()=>true);g.release();await old;eq(window.h.stores[kind].nodes.find(n=>n.id===kind+'-P')?.revision,5)});
    await test(kind+'_late_old_project_read_does_not_replace_new_view',async()=>{await reset();const h=window.h,g=gate();h.state.read=async r=>{if(r.kind===kind&&r.project==='tree:P'){g.enter();await g.promise;}};const old=h.stores[kind].refresh();await Promise.race([g.entered,new Promise(r=>setTimeout(r,30))]);h.change({project:'tree:Q'});await window.h.stores[kind].refresh();g.release();await old;eq(window.h.stores[kind].nodes.some(n=>n.id===kind+'-Q'),true)});
    await test(kind+'_read_failure_keeps_nodes_and_real_error',async()=>{await reset();const h=window.h;h.stores[kind].accept([h.record(kind)],()=>true);h.state.readStatus=503;await h.stores[kind].refresh().catch(()=>{});eq(window.h.stores[kind].nodes.some(n=>n.id===kind+'-P'),true);eq(window.h.stores[kind].error,'read unavailable')});
    await test(kind+'_workspace_epoch_rejects_late_reads_and_keeps_actor_isolation',async()=>{await reset();const h=window.h,g=gate();h.state.read=async r=>{if(r.kind===kind&&r.workspace==='personal'){g.enter();await g.promise;}};const old=h.stores[kind].refresh();await g.entered;h.workspace('tenant');await window.h.stores[kind].refresh();g.release();await old;eq(window.h.stores[kind].nodes[0]?.marker,'tenant-a')});
   }
   await test('video_project_navigation_preserves_inflight_save_lifetime_and_exact_attempt',async()=>{await reset();const h=window.h,g=gate();h.stores.video.accept([h.record('video')],()=>true);h.state.post=async entry=>{if(entry.kind==='video'){g.enter();await g.promise;}};const saving=h.stores.video.save('video-P',{title:'edited',projectKey:'tree:P'});await g.entered;const attempt=h.state.posts[0];h.change({project:'tree:Q'});eq(attempt.signal.aborted,false);g.release();const saved=await saving;eq(saved.revision,2);eq(saved.projectKey,'tree:P');eq(h.state.posts.length,1);eq(h.state.posts[0].project,'tree:P');eq(window.h.stores.video.getNode('video-P').title,'edited');eq(window.h.stores.video.unsavedCount,0)});
   return {checks,failed:checks.filter(c=>!c.pass).length,actualReact:true,actualHooks:6,paidCalls:0};
  },kinds);
  assert.deepEqual(errors,[]);const literal=`VIDEO_PROJECT_REFRESH=${result.failed?'FAIL':'PASS'} CHECKS=${result.checks.length} FAILED=${result.failed} PHASE=${phase} ACTUAL_HOOKS=6 SUPPLIER_CALLS=0`;
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({...result,literal,source,errors},null,2));console.log(literal);process.exitCode=result.failed?1:0;
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
