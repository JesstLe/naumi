// Actual Canvas callers + actual hook/controller/reducers. Auth/HTTP/React are
// bounded local ports, not production/browser/PG acceptance. Full source-root A/B.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.HISTORY_SOURCE_ROOT||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(process.env.HISTORY_EVIDENCE||'output/refactor-r3b-20261024');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={},decl={};
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))decl[n.name.text]=n.initializer?.getText(ast);ts.forEachChild(n,walk);}walk(ast);
assert.equal(!!decl.canvasHistory,!baseline,'explicit mode must match source tree');
const textOwner=fs.existsSync(path.join(root,'src/lib/canvas/text-document.ts'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText,plain=x=>JSON.parse(JSON.stringify(x));
let checks=0,cases=0;const eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
const wait=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
async function test(name,run){await run();cases++;console.log('CASE='+name+' PASS');}
async function bundle(){
 const entries=['src/lib/canvas/node-settings.ts',...(baseline?[]:['src/lib/canvas/node-preferences.ts','src/components/canvas/use-canvas-history.ts','src/lib/canvas/history-model.ts','src/lib/canvas/history-scope.ts','src/lib/canvas/history-contract.ts','src/lib/canvas/node-commands.ts','src/lib/canvas/pending-presentation.ts','src/lib/canvas/generation-presentation.ts',...(fs.existsSync(path.join(root,'src/lib/canvas/native-document-lifecycle.ts'))?['src/lib/canvas/native-document-lifecycle.ts']:[]),...(textOwner?['src/lib/canvas/text-document.ts','src/lib/canvas/document-scope.ts']:[])])];
 return (await build({stdin:{contents:entries.map(e=>'export * from '+JSON.stringify(path.join(root,e))+';').join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'fixture-ports',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'scope',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='react'?'export const useRef=(...a)=>__hooks.ref(...a),useState=(...a)=>__hooks.state(...a),useEffect=(...a)=>__hooks.effect(...a),useCallback=f=>f,useSyncExternalStore=()=>0;':a.path==='auth'?'export const authHeader=()=>__ports.auth();':'export const currentWorkspace=()=>__ports.workspace,currentWorkspaceRevision=()=>__ports.revision,WORKSPACE_SELECTION="workspace";',loader:'js'}));
 }}]})).outputFiles[0].text;
}
function setup(built){
 const state={account:'user-A',project:'tree:A',works:[art()],texts:[text()],settings:{},pending:[{id:'pend',inputs:['a'],parentId:'a',linked:true}],undo:[],redo:[],requests:[],notices:[],views:0,refreshes:0,flushed:0,flush:async()=>{},respond:async()=>Response.json({ok:true,persisted:true}),refresh:async()=>{},auth:async()=>{},readOnly:false,renderWrites:0};
 const slots=[],effects=[];let cursor=0,uid=0;
 const hooks={ref(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},state(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;state.renderWrites++;}];},effect(f){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(f());}}};
 const ports={workspace:'personal',revision:0,async auth(){await state.auth();return {'x-naumi-workspace':ports.workspace,'x-naumi-project-context':'tree:WRONG','authorization':'fixture'};}};
 const projectedModule={exports:{}};
 const c={textWriteBarrierRef:{current:0},textAutosave:{flushAll:async()=>[],flush:async()=>null},textTasks:{state:()=>({busy:false})},canvasArtworkDocument:{history:undefined},__ports:ports,__hooks:hooks,module:projectedModule,exports:projectedModule.exports,console,Promise,Error,Map,Set,WeakMap,Headers,Request,Response,AbortSignal,structuredClone,crypto:globalThis.crypto,localStorage:{setItem(){}},
  historyScopesRef:{current:new WeakMap()},historyScopeRef:{current:''},historyBusyRef:{current:false},historyAttemptsRef:{current:new WeakMap()},
  canvasAccountRef:{current:state.account},activeProjectRef:{current:{key:state.project}},videoResultAttempts:{current:new Map()},unsavedTextRef:{current:new Map()},textSaveQueuesRef:{current:new Map()},
  pendNodesRef:{current:state.pending},textNodesRef:{current:state.texts},nodeSettingsRef:{current:{}},nodeSettingsReady:true,
  browserRandomUUID:()=>`00000000-0000-4000-8000-${String(++uid).padStart(12,'0')}`,authHeader:()=>ports.auth(),currentWorkspace:()=>ports.workspace,
  fetch:async(url,init)=>{state.requests.push({url,headers:Object.fromEntries(new Headers(init.headers)),body:JSON.parse(init.body)});return (await state.respond()).clone();},
  expectJsonOk:async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;},t:k=>k,L:s=>s,
  flashTip:s=>state.notices.push(s),setHistorySaving:()=>{},setUnsavedTextCount:()=>{},setSelectedTextId:()=>{},setNodeSettings:v=>{state.settings=v;},
  setWorks:f=>{if(state.deferredWorks)state.deferredWorks.push(f);else state.works=f(state.works);},setTextNodes:f=>{if(state.deferredTexts)state.deferredTexts.push(f);else {state.texts=f(state.texts);c.textNodesRef.current=state.texts;}},setPendNodes:f=>{state.pending=f(state.pending);c.pendNodesRef.current=state.pending;},
  projectNavigation:{empty:()=>state.views++,open:()=>state.views+=3},setCreatingNew:()=>state.views++,setActiveKey:()=>state.views++,setBrowsing:()=>state.views++,setUndoStack:f=>state.undo=f(state.undo),setRedoStack:f=>state.redo=f(state.redo),
  settingsFor:()=>projectedModule.exports.defaultNodeSettings(),isNodeLocked:()=>false,mergeWorks:async()=>{},setRfNodes:f=>{state.rf=f(state.rf||[]);},
 };
 state.videos=[video()];c.videoNodesStore={getNode:id=>state.videos.find(n=>n.id===id),flush:async()=>{state.flushed++;await state.flush();},refresh:async()=>{state.refreshes++;await state.refresh();}};
 // Existing image/text/video cases have no director nodes. Bind the new
 // document port without changing their original flush/refresh observations.
 c.directorNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 // These legacy image/text/video cases also have no character records.
 // Bind the actual new document port; preserve every original observation/assertion.
 c.characterNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 // Original image/text/video cases contain no scene records; preserve counters.
 c.sceneNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 c.audioNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 c.timelineNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 c.comfyNodesStore={saving:false,getNode:()=>undefined,flush:async()=>{},refresh:async()=>{}};
 vm.createContext(c);vm.runInContext(built,c);Object.assign(c,projectedModule.exports);
 if(!baseline&&c.createCanvasPendingPresentation){
  const p=c.createCanvasPendingPresentation().bind('fixture'),g=c.createCanvasGenerationPresentation().bind('fixture');p.set(state.pending);
  Object.defineProperty(state,'pending',{get:p.getSnapshot,set:p.set});c.pendingPresentation={...p,atScope:()=>p};c.generationPresentation={...g,atScope:()=>g};c.canvasSelection={patch(){}};
 }

 // Bind the production adapter used by the extracted actual Canvas caller;
 // keep the original six document ports and their flush/refresh observations.
 if(c.canvasNativeDocuments)c.nativeDocuments=c.canvasNativeDocuments({videoNodes:c.videoNodesStore,directorNodes:c.directorNodesStore,characterNodes:c.characterNodesStore,sceneNodes:c.sceneNodesStore,audioNodes:c.audioNodesStore,timelineNodes:c.timelineNodesStore});
 const names=[...(fn.flushProjectText?['flushProjectText']:[]),'privateFetchRaw','applyHistory','doUndo','doRedo','commitNodeSettings','selectVideoResult',...(fn.saveManyNodePositions?['saveManyNodePositions']:[]),...(!baseline?['applyPendingLinkHistory','applyHistorySettings','onHistoryApplied']:[])];
 // pushUndo is a useCallback invocation. Keep its original initializer, with a
 // fixture useCallback, rather than maintaining a handwritten copy of its body.
 c.useCallback=f=>f;
 if(!baseline&&c.createCanvasNodePreferences){
  const preferenceScope={account:state.account,workspace:'personal',project:state.project,key:'fixture',documentCurrent:()=>true,viewCurrent:()=>true,assertView(){}};
  const preferences=c.createCanvasNodePreferences().bind(preferenceScope,state.account,{read:async()=>({persisted:true,settings:{}}),local:{read:()=>({}),write(){}},notice:m=>state.notices.push(m),failed:'fixture'});
  const preferenceCommit=preferences.commit;preferences.commit=async(id,to,ports)=>{await preferences.load();return preferenceCommit(id,to,ports);};
  const apply=preferences.apply;preferences.apply=(update,persisted)=>{apply(update,persisted);state.settings=preferences.getSnapshot().settings;c.nodeSettingsRef.current=state.settings;};
  c.nodePreferences=preferences;c.nativeDocuments.settingsKinds=id=>Object.fromEntries(['video','director','character','scene','audio','timeline'].map(kind=>[kind,!!c[kind+'NodesStore'].getNode(id)]));
 }

 const declarations=baseline?`const historyAccount=canvasAccountRef.current,historyScope=JSON.stringify([historyAccount,activeKey||"workspace"]);historyScopeRef.current=historyScope;const textPatchOf=${decl.textPatchOf};const pushUndo=${decl.pushUndo};const undoStack=historyUndo.filter(a=>historyScopesRef.current.get(a)===historyScope),redoStack=historyRedo.filter(a=>historyScopesRef.current.get(a)===historyScope);`
 : `const canvasHistory=${decl.canvasHistory};const {undoStack,redoStack,pushUndo,historyBusyRef,historySaving,setHistorySaving,historyCurrent}=canvasHistory;`;
 vm.runInContext(compile(`globalThis.__render=function(activeKey,user,readOnly,historyUndo,historyRedo){const active={key:activeKey,members:[],textNodes:[],videoNodes:[]};${names.map(n=>fn[n]).join('\n')}\n${declarations}\nreturn {applyHistory,doUndo,doRedo,pushUndo,commitNodeSettings,selectVideoResult,${fn.saveManyNodePositions?'saveManyNodePositions':'canvasHistory'},undoStack,redoStack};};`),c);
 let textBinding;
 const documentContext=textOwner?c.createCanvasDocumentContext():null;
 const textDocument=textOwner?c.createCanvasTextDocument({storage:()=>undefined,notice:()=>{}}):null;
 if(textOwner){let rawTexts=state.texts;Object.defineProperty(state,'texts',{get:()=>textBinding?textBinding.getSnapshot().nodes:rawTexts,set:nodes=>{if(textBinding)textBinding.set(nodes);else rawTexts=nodes;}});}
 const render=(project=state.project,account=state.account)=>{state.project=project;state.account=account;c.canvasAccountRef.current=account;c.activeProjectRef.current={key:project};cursor=0;if(textDocument){const scope=documentContext.render(account,project);textBinding=textDocument.bind(scope,account,account,true);if(!textBinding.getSnapshot().nodes.length)textBinding.accept([text()]);c.canvasTextDocument=textBinding;}return c.__render(project,{email:account},state.readOnly,state.undo,state.redo);};
 return {state,c,ports,render,textSnapshot:()=>textBinding?.getSnapshot(),unmount:()=>{documentContext?.mount(false);effects.forEach(f=>f?.());}};
}
const art=(id='a')=>({id,title:id,category:'main',prompt:'',createdAt:'2026-10-24T00:00:00.000Z',status:'completed',image:'/fixture.png',canvasX:30,canvasY:40,width:320,height:320,parentId:null,parentIds:[],groupId:'A'});
const text=()=>({id:'text-a',projectKey:'tree:A',title:'copy',prompt:'',content:'before',sourceIds:['a'],targetIds:[],productIds:[],width:380,height:260,canvasX:100,canvasY:200,status:'completed',createdAt:'2026-10-24T00:00:00.000Z',updatedAt:'2026-10-24T00:00:00.000Z'});
const video=()=>({id:'video-a',projectKey:'tree:A',revision:3,title:'video',x:50,y:60,width:380,height:260,config:{},inputs:[],lastTaskId:null,lastResultId:null,displayResultId:null,deletedAt:null,createdAt:'2026-10-24T00:00:00.000Z',updatedAt:'2026-10-24T00:00:00.000Z'});
async function main(){
 const built=await bundle(),report=[],sample=setup(built),settings=plain(sample.c.defaultNodeSettings()),tp=(({title,content,sourceIds,targetIds,productIds,width,height})=>({title,content,sourceIds,targetIds,productIds,width,height}))(text());
 const actions=[{kind:'video-patch',id:'video-a',from:{x:30},to:{x:80}},{kind:'video-result',id:'video-a',from:null,to:'result'},{kind:'video-add',records:[video()]},
  {kind:'pending-link',id:'pend',from:{inputs:[],parentId:null,linked:false},to:{inputs:['a'],parentId:'a',linked:true}},
  {kind:'workflow-add',artworks:[art()],textNodes:[text()]},{kind:'mixed-add',artworks:[art()],textNodes:[text()],videoNodes:[video()],projectKey:'tree:A'},
  {kind:'workflow-fill',id:'a',assetOperationId:'00000000-0000-4000-8000-000000000001',from:art(),to:{...art(),image:'/new.png'}},
  {kind:'node-settings',id:'a',text:false,from:settings,to:{...settings,locked:true}},
  ...['move','text-move'].map(kind=>({kind,id:kind==='move'?'a':'text-a',from:{x:30,y:40},to:{x:80,y:90}})),
  {kind:'move-many',moves:['a','text-a','video-a'].map(id=>({id,from:{x:30,y:40},to:{x:80,y:90}}))},
  {kind:'canvas-group',changes:[{id:'a',from:null,to:'g'}]},...['delete','add'].map(kind=>({kind,records:[art()]})),
  {kind:'mixed-delete',artworks:[art()],textNodes:[text()],videoNodes:[video()]},...['text-delete','text-add'].map(kind=>({kind,records:[text()]})),
  {kind:'parent',targetId:'a',parentId:'parent',added:true},{kind:'text-patch',id:'text-a',from:tp,to:{...tp,content:'after'}},{kind:'rename',id:'a',from:'a',to:'renamed'},
  {kind:'art-size',id:'a',from:{x:30,y:40,width:320,height:320},to:{x:80,y:90,width:500,height:500}},{kind:'mark',changes:[{id:'a',from:false,to:true}]}];
 for(const action of actions)for(const reverse of [false,true])await test(action.kind+'-'+(reverse?'undo':'redo'),async()=>{
  const f=setup(built),r=f.render();await r.applyHistory(action,reverse);eq(f.state.requests.length,action.kind==='pending-link'?0:1);eq(f.state.notices.length,0);
  if(!baseline&&f.state.requests.length)eq(f.c.historyRequest.safeParse(f.state.requests[0].body).success,true,'real wire schema accepts compiled body');
  report.push({kind:action.kind,reverse,operations:f.state.requests[0]?.body.operations||[],works:f.state.works,texts:f.state.texts,settings:f.state.settings,pending:f.state.pending});
 });
 await test('scoped-stacks-and-late-origin',async()=>{const f=setup(built),a=f.render();a.pushUndo(actions[13]);const b=f.render('tree:B');await b.doUndo();eq(f.state.requests.length,0);a.pushUndo({kind:'add',records:[art('late')]});eq(f.render().undoStack.length,0);eq(f.render('tree:A').undoStack.length,2);eq(f.render('tree:A','user-B').undoStack.length,0);await f.render('tree:A','user-A').doUndo();eq(f.render().redoStack.length,1);f.render('tree:B').pushUndo(actions[13]);eq(f.render('tree:A').redoStack.length,1);for(let i=0;i<60;i++)f.render().pushUndo({kind:'add',records:[art('a'+i)]});eq(f.render().undoStack.length,50);});
 await test('first-project-history',async()=>{const f=setup(built);f.render(null).pushUndo({kind:'add',records:[art()]});eq(f.render('tree:A').undoStack.length,1);});
 await test('transaction-rejected',async()=>{const f=setup(built);f.render().pushUndo(actions[9]);f.state.respond=async()=>Response.json({error:'write failed'},{status:409});await f.render().doUndo();eq(f.render().undoStack.length,1);eq(f.render().redoStack.length,0);eq(f.state.texts[0].canvasX,100);});
 await test('committed-refresh-warning-keeps-undo',async()=>{const f=setup(built);f.render().pushUndo(actions[10]);f.state.refresh=async()=>{throw Error('video refresh failed')};await f.render().doUndo();eq(f.render().redoStack.length,baseline?0:1);eq(f.state.works[0].canvasX,30);ok(f.state.notices.length===1);});
 await test('actual-move-many-does-not-rollback-commit',async()=>{const f=setup(built);f.state.rf=[{id:'a',position:{x:80,y:90}}];f.state.refresh=async()=>{throw Error('video refresh failed')};const r=f.render();if(r.saveManyNodePositions)await r.saveManyNodePositions(actions[10].moves);else await r.canvasHistory.submit(r.canvasHistory.scope,()=>actions[10]);eq(f.render().undoStack.length,baseline?0:1);eq(f.state.rf[0].position.x,baseline?30:80);});
 for(const phase of ['flush','auth'])for(const kind of ['project','account','workspace'])await test(phase+'-'+kind+'-ABA',async()=>{
  const f=setup(built),r=f.render();r.pushUndo(actions[13]);const gate=wait(),entered=wait();f.state[phase]=()=>{entered.resolve();return gate.promise};const running=f.render().doUndo();await entered.promise;
  if(kind==='workspace'){f.ports.workspace='tenant';f.ports.revision++;f.ports.workspace='personal';f.ports.revision++;}
  else if(kind==='project'){f.render('tree:B');f.render('tree:A');}else{f.render('tree:A','user-B');f.render('tree:A','user-A');}
  gate.resolve();await running;eq(f.state.requests.length,baseline?1:0);eq(f.render().undoStack.length,baseline?0:1);
 });
 await test('committed-navigation-updates-original-document',async()=>{const f=setup(built);f.render().pushUndo({kind:'rename',id:'a',from:'before',to:'after'});const gate=wait(),entered=wait();f.state.respond=()=>{entered.resolve();return gate.promise};const running=f.render().doUndo();await entered.promise;f.render('tree:B');gate.resolve(Response.json({ok:true}));await running;eq(f.state.works[0].title,'before');eq(f.state.views,0);eq(f.render('tree:A').redoStack.length,1);});
 await test('committed-account-switch-does-not-write-new-account',async()=>{const f=setup(built);f.render().pushUndo(actions[13]);const gate=wait(),entered=wait();f.state.respond=()=>{entered.resolve();return gate.promise};const running=f.render().doUndo();await entered.promise;f.render('tree:A','user-B');gate.resolve(Response.json({ok:true}));await running;eq(f.state.works.length,1);eq(f.render().undoStack.length,0);eq(f.render('tree:A','user-A').redoStack.length,baseline?0:1);});
 await test('lost-response-reuses-frozen-body-before-current-revision',async()=>{const f=setup(built),r=f.render(),action=actions[0];f.state.respond=async()=>{throw Error('lost response')};await r.applyHistory(action,true).catch(()=>{});f.state.respond=async()=>Response.json({ok:true});f.state.videos=[];await f.render().applyHistory(action,true).catch(()=>{});eq(f.state.requests.length,baseline?1:2);if(!baseline)eq(f.state.requests[0].body,f.state.requests[1].body);});
 await test('same-action-flight-deduplicated',async()=>{const f=setup(built),r=f.render(),gate=wait(),entered=wait();f.state.respond=()=>{entered.resolve();return gate.promise};const one=r.applyHistory(actions[19],true);await entered.promise;const two=r.applyHistory(actions[19],true);await new Promise(q=>setImmediate(q));gate.resolve(Response.json({ok:true}));await Promise.all([one,two]);eq(f.state.requests.length,baseline?2:1);});
 await test('newer-unsaved-draft-survives-history-response',async()=>{const f=setup(built),r=f.render(),gate=wait(),entered=wait();f.state.respond=()=>{entered.resolve();return gate.promise};const pending=r.applyHistory(actions[18],true);await entered.promise;const draft={...text(),content:'new typing',updatedAt:'later'};f.c.unsavedTextRef.current.set(draft.id,draft);f.state.texts=[draft];gate.resolve(Response.json({ok:true}));await pending;eq(f.state.texts[0].content,baseline?'before':'new typing');eq(textOwner?f.textSnapshot().unsaved:f.c.unsavedTextRef.current.size,baseline?0:1);});
 await test('actual-node-settings-owner',async()=>{const f=setup(built),r=f.render();eq(await r.commitNodeSettings('a',{...settings,locked:true}),true);eq(f.state.requests.length,1);eq(f.render().undoStack.length,1);eq(f.state.settings.a.locked,true);});
 await test('deferred-react-update-protects-new-draft',async()=>{const f=setup(built);f.state.deferredTexts=[];await f.render().applyHistory(actions[18],true);const draft={...text(),content:'after response typing',updatedAt:'newer'};f.c.unsavedTextRef.current.set(draft.id,draft);f.state.texts=[draft];for(const update of f.state.deferredTexts)f.state.texts=update(f.state.texts);eq(f.state.texts[0].content,baseline?'before':'after response typing');});
 await test('deferred-react-update-protects-new-account',async()=>{const f=setup(built);f.state.deferredWorks=[];await f.render().applyHistory(actions[19],true);f.render('tree:A','user-B');f.state.works=[{...art(),title:'user-B document'}];for(const update of f.state.deferredWorks)f.state.works=update(f.state.works);eq(f.state.works[0].title,baseline?'a':'user-B document');});
 await test('actual-video-result-commit-refresh-failure',async()=>{const f=setup(built);f.state.refresh=async()=>{throw Error('refresh failed')};await f.render().selectVideoResult('video-a','result',3).catch(()=>{});eq(f.render().undoStack.length,baseline?0:1);eq(f.state.requests[0].body.operations[0].expectedRevision,3);});
 if(!baseline){
  await test('workspace-stacks-and-auth-headers',async()=>{const f=setup(built);f.render().pushUndo(actions[13]);f.ports.workspace='tenant';f.ports.revision++;eq(f.render().undoStack.length,0);f.render().pushUndo(actions[19]);await f.render().doUndo();eq(f.state.requests[0].headers['x-naumi-workspace'],'tenant');eq(f.state.requests[0].headers['x-naumi-project-context'],'tree:A');});
  await test('unmount-before-auth-no-post',async()=>{const f=setup(built),r=f.render(),gate=wait(),entered=wait();f.state.auth=()=>{entered.resolve();return gate.promise};const pending=r.applyHistory(actions[19],true);await entered.promise;f.unmount();gate.resolve();await pending.catch(()=>{});eq(f.state.requests.length,0);});
  await test('pending-local-and-read-only',async()=>{const f=setup(built);f.state.pending[0].generating=true;await assert.rejects(f.render().applyHistory(actions[3],true));checks++;f.state.readOnly=true;await assert.rejects(f.render().applyHistory(actions[19],true));checks++;eq(f.state.requests.length,0);});
 }
 const result={mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,cases,checks,actions:report};fs.writeFileSync(path.join(out,(baseline?'BASELINE':'MODIFIED')+'_RESULT.json'),JSON.stringify(result,null,2));
 console.log(`CANVAS_HISTORY_REFACTOR=PASS mode=${result.mode} cases=${cases} checks=${checks} ACTION_KINDS=${actions.length} OWNER=${baseline?'COMPONENT':'SHARED'} REFRESH_FAILURE=${baseline?'UNDO_LOST':'WARNING_UNDO_RETAINED'} ABA_POST=${baseline?1:0} HTTP=FIXTURE SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
