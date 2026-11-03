// Actual application owners and actual React navigation hook. Only authentication,
// workspace selection, document refresh and HTTP/SSE transports are test ports.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.MAIN_SYNC_ASSISTANT_EVIDENCE||'output/main-sync-assistant-navigation'));
fs.mkdirSync(out,{recursive:true});
let checks=0,cases=0,browser,server;
const details=[],eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;},ok=(value,message)=>{assert.ok(value,message);checks++;};
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
const event=(type,data)=>`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const answer=(extra='')=>new Response(extra+event('final',{reply:'分镜方案已保存'})+event('done',{ok:true}),{headers:{'content-type':'text/event-stream'}});
async function test(name,work){await work();cases++;details.push(name);console.log('PASS '+name);}
const scopeState={name:'personal',revision:0};global.__mainSyncWorkspace=scopeState;
async function loadOwners(){
 const names=['assistant-session','project-navigation','document-scope','text-task','text-task-request'];
 // The fixed main planning helper supplies the same formal-source input to old
 // and new owners. The old refactor snapshot predates that helper itself.
 const planningInput=path.resolve(__dirname,'../src/lib/video/storyboard-client.ts');
 const entry=names.map(name=>`export * from ${JSON.stringify(path.join(root,'src/lib/canvas',name+'.ts'))};`).join('\n')+
  `\nexport {storyboardPlanningRequest} from ${JSON.stringify(planningInput)};`;
 const target=path.join(out,'owners.cjs');
 await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:target,bundle:true,platform:'node',format:'cjs',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'owned-ports',setup(b){
  b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'ports'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'ports'}));
  b.onLoad({filter:/.*/,namespace:'ports'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({authorization:"fixture-actor"});':'export const currentWorkspace=()=>global.__mainSyncWorkspace.name,currentWorkspaceRevision=()=>global.__mainSyncWorkspace.revision;'}));
 }}]});return require(target);
}
function assistantFixture(api){
 scopeState.name='personal';scopeState.revision=0;
 const context=api.createCanvasDocumentContext(),scope=context.render('actor','tree:A'),owner=api.createCanvasAssistant(),session=owner.bind(scope);
 const facts={posts:[],video:[],storyboard:[],reveal:[],submit:async()=>answer()};
 session.input('尚未发送的聊天草稿');session.anchor('art-a');session.skill({id:'existing-skill',revision:7});
 const ctx={english:false,members:[{id:'art-a',image:'/fixture/a.png',title:'A'}],imageModelId:'image-a',ratio:'3:4',resolution:'2K',quality:'medium',videoNodeId:'video-selected',textNodeId:'text-selected',
  submit:async(body,signal,submission,current)=>{facts.posts.push({body,signal,submission,current});return facts.submit();},read:async()=>Response.json({}),merge:async()=>[],history:()=>{},upload:async()=>[],cue:()=>{},selectAnchor:()=>{},
  video:async(nodes,current)=>{if(current())facts.video.push(nodes);},text:async()=>{},revealVideo:async(result,current)=>{if(current())facts.reveal.push(result);},storyboard:async(result,current)=>{if(current())facts.storyboard.push(result);}};
 const prepared=api.storyboardPlanningRequest({id:'text-script',projectKey:'tree:A',status:'completed',content:'完整剧本及对白'});
 return {context,scope,owner,session,facts,ctx,prepared};
}
async function ownerCases(api){
 await test('prepared-storyboard-uses-formal-source-without-chat-draft-skill-or-images',async()=>{
  const f=assistantFixture(api);f.facts.submit=async()=>answer(event('video_nodes',{nodes:[{id:'video-1',projectKey:'tree:A'},{id:'foreign',projectKey:'tree:B'}]})+event('video_nodes',{nodes:[{id:'video-1',projectKey:'tree:A'},{id:'video-2',projectKey:'tree:A'}]}));
  await f.session.send(f.ctx,false,f.prepared);const body=JSON.parse(f.facts.posts[0].body);
  eq(body.textNodeId,'text-script');eq(body.videoNodeId,undefined);eq(body.skill,null);eq(body.contextIds,[]);eq(body.anchorId,'');eq(body.messages.at(-1).content,f.prepared.text);
  eq(f.session.getSnapshot().input,'尚未发送的聊天草稿');eq(f.session.getSnapshot().skill.id,'existing-skill');eq(f.facts.posts.length,1);
  eq(f.facts.storyboard,[{projectKey:'tree:A',nodeIds:['video-1','video-2']}]);eq(f.session.getSnapshot().outcome,'done');
 });
 await test('normal-chat-after-planning-keeps-original-skill-reference-and-draft-contract',async()=>{
  const f=assistantFixture(api);await f.session.send(f.ctx,false,f.prepared);await f.session.send(f.ctx);const body=JSON.parse(f.facts.posts[1].body);
  eq(body.skill,{id:'existing-skill',revision:7});eq(body.contextIds,['art-a']);eq(body.videoNodeId,'video-selected');eq(body.textNodeId,'text-selected');eq(body.messages.at(-1).content,'尚未发送的聊天草稿');eq(f.session.getSnapshot().input,'');eq(f.facts.storyboard,[]);
 });
 await test('prepared-retry-retains-original-turn-bytes-and-does-not-replace-chat-draft',async()=>{
  const f=assistantFixture(api);f.facts.submit=async()=>Response.json({error:'fixture rejection'},{status:400});await f.session.send(f.ctx,false,f.prepared);
  eq(f.session.getSnapshot().input,'尚未发送的聊天草稿');const body=f.facts.posts[0].body,submission=f.facts.posts[0].submission;await f.session.send(f.ctx,false,f.prepared);
  eq(f.facts.posts[1].body,body);eq(f.facts.posts[1].submission,submission);eq(f.session.getSnapshot().turns.filter(turn=>turn.role==='user').length,1);eq(f.facts.storyboard,[]);
 });
 await test('same-text-normal-chat-never-reuses-prepared-operation',async()=>{
  const f=assistantFixture(api);f.session.anchor(null);f.ctx.members=[];f.facts.submit=async()=>Response.json({error:'fixture rejection'},{status:400});await f.session.send(f.ctx,false,f.prepared);
  f.session.input(f.prepared.text);await f.session.send(f.ctx);const prepared=JSON.parse(f.facts.posts[0].body),normal=JSON.parse(f.facts.posts[1].body);
  eq(normal.textNodeId,'text-selected');eq(normal.videoNodeId,'video-selected');eq(normal.skill,{id:'existing-skill',revision:7});ok(normal.turnId!==prepared.turnId);ok(f.facts.posts[1].submission!==f.facts.posts[0].submission);
 });
 await test('prepared-node-id-is-captured-before-asynchronous-response',async()=>{
  const f=assistantFixture(api),held=gate();f.facts.submit=()=>held.promise;const running=f.session.send(f.ctx,false,f.prepared);f.prepared.textNodeId='later-mutated-node';f.prepared.text='later-mutated-text';held.resolve(answer());await running;
  const body=JSON.parse(f.facts.posts[0].body);eq(body.textNodeId,'text-script');ok(body.messages.at(-1).content.includes('text-script'));
 });
 await test('project-switch-suppresses-late-storyboard-and-video-callbacks',async()=>{
  const f=assistantFixture(api),held=gate();f.facts.submit=()=>held.promise;const running=f.session.send(f.ctx,false,f.prepared);f.owner.bind(f.context.render('actor','tree:B'));
  held.resolve(answer(event('video_nodes',{nodes:[{id:'video-stale',projectKey:'tree:A'}]})));await running;eq(f.facts.storyboard,[]);eq(f.facts.video,[]);eq(f.facts.posts.length,1);
 });
 await test('incomplete-stream-does-not-open-a-completed-storyboard',async()=>{
  const f=assistantFixture(api);f.facts.submit=async()=>new Response(event('video_nodes',{nodes:[{id:'video-saved',projectKey:'tree:A'}]})+event('delta',{text:'已保存部分方案'}));
  await f.session.send(f.ctx,false,f.prepared);eq(f.session.getSnapshot().outcome,'error');eq(f.facts.storyboard,[]);eq(f.session.getSnapshot().input,'尚未发送的聊天草稿');eq(f.facts.posts.length,1);
 });
 await test('project-owner-waits-for-current-loaded-graph-and-clears-selection-once',async()=>{
  const writes=[],storage=new Map(),project={key:'tree:shared',members:[],textNodes:[]};const navigation=api.createCanvasProjectNavigation('fixture-owner',{current:()=>true,storage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},push:()=>{},back:()=>{},select:(key,id)=>writes.push([key,id]),focus:()=>{},missing:()=>{},schedule:()=>()=>{}});
  navigation.initialize(null);navigation.reconcile([project],false,'tree:shared');eq(navigation.getSnapshot().activeKey,null);eq(writes,[]);
  navigation.reconcile([],true,'tree:shared');eq(navigation.getSnapshot().activeKey,null);navigation.reconcile([project],true,'tree:shared');eq(navigation.getSnapshot().activeKey,'tree:shared');eq(writes,[['tree:shared',null]]);
  navigation.reconcile([project],true,'tree:shared');eq(writes.length,1);navigation.browse();navigation.reconcile([project],true,'tree:shared');eq(navigation.getSnapshot().browsing,true);
 });
 await test('explicit-project-link-also-fences-a-warm-node-link-until-load',async()=>{
  const writes=[],project={key:'tree:shared',members:[{id:'art-a'}],textNodes:[]},navigation=api.createCanvasProjectNavigation('fixture-owner',{current:()=>true,storage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},push:()=>{},back:()=>{},select:(key,id)=>writes.push([key,id]),focus:()=>{},missing:()=>{},schedule:()=>()=>{}});
  navigation.initialize('art-a');navigation.requestProject('tree:shared');navigation.reconcile([project],false,'tree:shared');eq(writes,[]);eq(navigation.getSnapshot().activeKey,null);
  navigation.reconcile([project],true,'tree:shared');eq(navigation.getSnapshot().activeKey,'tree:shared');eq(writes,[['tree:shared','art-a'],['tree:shared',null]]);
 });
 const textNode=()=>({id:'text-a',projectKey:'tree:A',title:'Text',prompt:'',content:'',status:'idle',canvasX:0,canvasY:0,width:380,height:240,sourceIds:[],productIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 for(const change of ['project','account-ABA','workspace-ABA'])await test('accepted-text-'+change+'-retains-original-answer-and-document-identity',async()=>{
  scopeState.name='personal';scopeState.revision=0;const context=api.createCanvasDocumentContext(),scope=context.render('actor','tree:A'),held=gate();let nodes=[textNode()],posts=0,saves=0,headers,models=0;
  const task=api.createCanvasTextTask(api.generalTextTask(nodes[0],'生成文本','Text'));
  const makePorts=bound=>({submit:async()=>{posts++;await held.promise;return Response.json({text:'原任务已生成的文本',model:'text-original'});},document:{getSnapshot:()=>({nodes}),set:update=>{if(bound.documentCurrent())nodes=update(nodes);},save:async node=>{headers=Object.fromEntries((await api.canvasDocumentHeaders(bound)).entries());saves++;return node;}},history:()=>{},model:()=>models++,changed:()=>{},errorText:'failed'});
  const running=task.run(scope,makePorts(scope));eq(posts,1);
  if(change==='project')context.render('actor','tree:B');else if(change==='account-ABA'){context.render('other','tree:A');context.render('actor','tree:A');}else{scopeState.name='team';scopeState.revision++;scopeState.name='personal';scopeState.revision++;}
  held.resolve();eq(await running,change==='project');eq(posts,1);eq(saves,change==='project'?1:0);eq(models,0);eq(task.getSnapshot().hasResult,true);
  if(change==='project'){eq(headers['x-naumi-project-context'],'tree:A');eq(headers['x-naumi-workspace'],'personal');}
  else{const resumed=context.render('actor','tree:A');eq(await task.run(resumed,makePorts(resumed)),true);eq(posts,1);eq(saves,1);eq(headers['x-naumi-project-context'],'tree:A');eq(headers['x-naumi-workspace'],'personal');}
 });
}
async function hookCases(){
 const entry=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{useCanvasProjectNavigation}from'@/components/canvas/use-canvas-project-navigation';
window.events=[];window.reads=[];window.held=new Map();window.settings={actor:'actor',workspace:'personal',revision:0,requestedProject:'tree:shared',loaded:true,projects:[{key:'tree:shared',members:[],textNodes:[]}]};
const root=createRoot(document.getElementById('root'));let readId=0;
function App(){const[f,set]=useState(window.settings);window.settings=f;const view=useCanvasProjectNavigation({ready:true,email:f.actor,requestedProject:f.requestedProject,ports:()=>({select:(key,id)=>window.events.push({actor:f.actor,workspace:f.workspace,key,id}),focus:()=>{},missing:()=>{},back:()=>{},refreshProject:()=>{const id=++readId;window.reads.push({id,actor:f.actor,workspace:f.workspace,revision:f.revision});return new Promise(resolve=>window.held.set(id,resolve));}})});
useEffect(()=>view.navigation.reconcile(f.projects,f.loaded&&view.requestedProjectReady,f.requestedProject),[view.navigation,f.projects,f.loaded,view.requestedProjectReady,f.requestedProject]);
window.api={state:()=>({activeKey:view.activeKey,ready:view.requestedProjectReady}),set:patch=>flushSync(()=>set(old=>{const next={...old,...patch};window.settings=next;return next;})),resolve:id=>{const fn=window.held.get(id);if(fn){window.held.delete(id);fn();}}};return <div>{view.activeKey}</div>;}flushSync(()=>root.render(<App/>));`;
 await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outfile:path.join(out,'hook.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'workspace-port',setup(b){b.onResolve({filter:/workspace-client$/},()=>({path:'workspace',namespace:'ports'}));b.onLoad({filter:/.*/,namespace:'ports'},()=>({contents:'export const currentWorkspace=()=>window.settings.workspace,currentWorkspaceRevision=()=>window.settings.revision;'}));}}]});
 server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/hook.js'?'text/javascript':'text/html');res.end(req.url==='/hook.js'?fs.readFileSync(path.join(out,'hook.js')):'<!doctype html><html><body><div id="root"></div><script src="/hook.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const visit=async()=>{await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.api&&window.reads.length===1);};
 await test('actual-react-hook-warm-cache-opens-only-after-the-owned-refresh',async()=>{
  await visit();eq(await page.evaluate(()=>window.api.state()),{activeKey:null,ready:false});eq(await page.evaluate(()=>window.events),[]);await page.evaluate(()=>window.api.resolve(1));await page.waitForFunction(()=>window.api.state().activeKey==='tree:shared');
  eq(await page.evaluate(()=>window.events),[{actor:'actor',workspace:'personal',key:'tree:shared',id:null}]);eq(await page.evaluate(()=>window.reads.length),1);
 });
 await test('actual-react-hook-account-ABA-never-reuses-an-earlier-loaded-request',async()=>{
  await page.evaluate(()=>window.api.set({actor:'other'}));await page.waitForFunction(()=>window.reads.length===2);eq(await page.evaluate(()=>window.api.state().ready),false);
  await page.evaluate(()=>window.api.set({actor:'actor'}));await page.waitForFunction(()=>window.reads.length===3);eq(await page.evaluate(()=>window.api.state().ready),false);const before=await page.evaluate(()=>window.events.length);
  await page.evaluate(()=>window.api.resolve(2));eq(await page.evaluate(()=>window.api.state().ready),false);eq(await page.evaluate(()=>window.events.length),before);
  await page.evaluate(()=>window.api.resolve(3));await page.waitForFunction(()=>window.api.state().ready);eq(await page.evaluate(()=>window.events.length),before+1);
 });
 await test('actual-react-hook-workspace-ABA-rejects-late-read-completion',async()=>{
  await visit();await page.evaluate(()=>window.api.set({workspace:'team',revision:1}));await page.waitForFunction(()=>window.reads.length===2);await page.evaluate(()=>window.api.set({workspace:'personal',revision:2}));await page.waitForFunction(()=>window.reads.length===3);
  await page.evaluate(()=>{window.api.resolve(1);window.api.resolve(2);});eq(await page.evaluate(()=>window.api.state().ready),false);eq(await page.evaluate(()=>window.events),[]);
  await page.evaluate(()=>window.api.resolve(3));await page.waitForFunction(()=>window.api.state().ready);eq(await page.evaluate(()=>window.events.length),1);
 });
 await test('actual-react-hook-new-request-does-not-consume-an-absent-project',async()=>{
  await page.evaluate(()=>window.api.set({requestedProject:'tree:later',projects:[]}));await page.waitForFunction(()=>window.reads.length===4);await page.evaluate(()=>window.api.resolve(4));await page.waitForFunction(()=>window.api.state().ready);ok((await page.evaluate(()=>window.api.state().activeKey))!=='tree:later');
  await page.evaluate(()=>window.api.set({projects:[{key:'tree:later',members:[],textNodes:[]}]}));await page.waitForFunction(()=>window.api.state().activeKey==='tree:later');eq(await page.evaluate(()=>window.events.at(-1).key),'tree:later');
 });
 await test('actual-react-hook-removing-project-request-cancels-pending-opening',async()=>{
  await visit();await page.evaluate(()=>window.api.set({requestedProject:undefined}));await page.waitForFunction(()=>window.api.state().ready);await page.evaluate(()=>window.api.resolve(1));
  eq(await page.evaluate(()=>window.api.state().activeKey),null);eq(await page.evaluate(()=>window.events),[]);
 });
 eq(errors,[]);
}
(async()=>{
 try{const owners=await loadOwners();await ownerCases(owners);await hookCases();const report={status:'PASS',cases,checks,details,actualAssistantOwner:true,actualProjectOwner:true,actualReactHook:true,actualTextTaskOwner:true,auth:'fixture',documentRefresh:'controlled',router:false,pg:false,supplierCalls:0,sourceRoot:root};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`MAIN_SYNC_ASSISTANT_NAVIGATION=PASS CASES=${cases} CHECKS=${checks} ACTUAL_OWNERS=1 ACTUAL_REACT=1 PREPARED_STORYBOARD=1 PROJECT_FRESH_READ=1 ACCOUNT_WORKSPACE_ABA=1 TEXT_ORIGINAL_DOCUMENT=1 SUPPLIER=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({status:'FAIL',cases,checks,details,error:String(error),stack:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;}
 finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}delete global.__mainSyncWorkspace;console.log('MAIN_SYNC_ASSISTANT_CLEANUP=PASS BROWSER_CLOSED=1 LOOPBACK_CLOSED=1');}
})();
