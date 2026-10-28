require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={},decl={};
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);if(ts.isVariableDeclaration(n)&&['pushUndo','undoStack','redoStack'].includes(n.name.getText(ast)))decl[n.name.getText(ast)]=n.initializer;ts.forEachChild(n,walk)}walk(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(){const state={undo:[],redo:[],works:[],requests:[],notices:[],scopes:{current:new WeakMap()},scopeRef:{current:''},busy:{current:false},flush:async()=>{},respond:async()=>Response.json({ok:true}),viewChanges:0};
 function render(project,account='user-A'){
  const scope=JSON.stringify([account,project||'workspace']);state.scopeRef.current=scope;
  const c={Error,Promise,Map,Set,WeakMap,structuredClone,AbortSignal,historyAccount:account,activeKey:project,historyScope:scope,historyScopeRef:state.scopeRef,historyScopesRef:state.scopes,canvasAccountRef:{current:account},user:{email:account},readOnly:false,historyBusyRef:state.busy,historyAttemptsRef:{current:new WeakMap()},textSaveQueuesRef:{current:new Map()},videoNodesStore:{flush:()=>state.flush(),getNode:()=>null},directorNodesStore:{flush:async()=>{},getNode:()=>null,saving:false},characterNodesStore:{flush:async()=>{},getNode:()=>null,saving:false},sceneNodesStore:{flush:async()=>{},getNode:()=>null,saving:false},audioNodesStore:{flush:async()=>{},getNode:()=>null,saving:false},unsavedTextRef:{current:new Set()},setUnsavedTextCount:()=>{},setHistorySaving:()=>{},browserRandomUUID:()=> 'fixture-op',t:k=>k,L:s=>s,expectJsonOk:r=>r.json(),flashTip:s=>state.notices.push(s),setWorks:f=>state.works=f(state.works),setTextNodes:()=>{},setCreatingNew:()=>state.viewChanges++,setActiveKey:()=>state.viewChanges++,setBrowsing:()=>state.viewChanges++,privateFetchRaw:async(url,init)=>{state.requests.push({scope,body:JSON.parse(init.body)});return state.respond()},setUndoStack:f=>state.undo=f(state.undo),setRedoStack:f=>state.redo=f(state.redo)};
  Object.defineProperties(c,{historyUndo:{get:()=>state.undo},historyRedo:{get:()=>state.redo},undoStack:{get:()=>vm.runInContext(decl.undoStack.getText(ast),c)},redoStack:{get:()=>vm.runInContext(decl.redoStack.getText(ast),c)}});
  vm.createContext(c);vm.runInContext(compile(['applyHistory','doUndo','doRedo'].map(n=>fn[n]).join('\n')+'\nglobalThis.pushUndo=('+decl.pushUndo.arguments[0].getText(ast)+');'),c);return c;
 }
 return {state,render};
}
const add=id=>({kind:'add',records:[{id,image:'/fixture.png'}]});
async function main(){let cases=0;
 {
  const {state,render}=setup(),a=render('A');a.pushUndo(add('a'));const b=render('B');await b.doUndo();assert.equal(state.requests.length,0);b.pushUndo(add('b'));await b.doUndo();assert.equal(state.requests.at(-1).body.operations[0].id,'b');await b.doRedo();assert.equal(state.requests.at(-1).body.operations[0].visible,true);await render('A').doUndo();assert.equal(state.requests.at(-1).body.operations[0].id,'a');cases+=3;
 }
 {
  const {state,render}=setup(),a=render('A');a.pushUndo(add('first'));const b=render('B');a.pushUndo(add('late-A'));assert.equal(b.undoStack.length,0);assert.equal(render('A').undoStack.length,2);render('B');await a.doUndo();assert.equal(state.requests.length,0,'stale click handler must not submit');cases+=2;
 }
 {
  const {state,render}=setup(),a=render('A','user-A');a.pushUndo(add('private-A'));assert.equal(render('A','user-B').undoStack.length,0);await render('A','user-B').doUndo();assert.equal(state.requests.length,0);assert.equal(render('A','user-A').undoStack.length,1);cases++;
 }
 {
  const {state,render}=setup(),a=render('A');a.pushUndo(add('a'));const waiting=deferred(),entered=deferred();state.flush=()=>{entered.resolve();return waiting.promise};const task=a.doUndo();await entered.promise;render('B');waiting.resolve();await task;assert.equal(state.requests.length,0);assert.equal(render('A').undoStack.length,1);cases++;
 }
 {
  const {state,render}=setup(),a=render('A');state.works=[{id:'a'},{id:'b'}];a.pushUndo(add('a'));const waiting=deferred(),entered=deferred();state.respond=()=>{entered.resolve();return waiting.promise};const task=a.doUndo();await entered.promise;const b=render('B');waiting.resolve(Response.json({ok:true}));await task;assert.equal(b.undoStack.length,0);assert.equal(state.viewChanges,0);assert.deepEqual(state.works,[{id:'b'}]);assert.equal(render('A').redoStack.length,1);cases++;
 }
 {
  const {render}=setup(),a=render('A');a.pushUndo(add('a'));await a.doUndo();const b=render('B');b.pushUndo(add('b'));assert.equal(render('A').redoStack.length,1,'new B action does not clear redo A');for(let i=0;i<60;i++)a.pushUndo(add('a'+i));assert.equal(render('A').undoStack.length,50);assert.equal(render('B').undoStack.length,1);cases+=2;
 }
 {
  const {render}=setup(),blank=render(null);blank.pushUndo(add('new-root'));assert.equal(render('tree:new-root').undoStack.length,1,'first created project owns its first add');cases++;
 }
 console.log(`SCOPED_HISTORY=PASS CASES=${cases} PROJECT_ISOLATED=YES ACCOUNT_ISOLATED=YES ASYNC_ORIGIN=RETAINED STALE_POST=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
