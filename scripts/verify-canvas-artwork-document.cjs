// Actual Canvas wrapper/load-effect functions plus real document/cache modules.
// Auth/storage/HTTP/React-setter ports are local fixtures, not production claims.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.ARTWORK_SOURCE_ROOT||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(process.env.ARTWORK_EVIDENCE||'output/refactor-r3b3-20261024');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={};let loadEffect;
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[1]?.getText(ast)==='[ready, authenticatedEmail]')loadEffect=n.arguments[0].getText(ast);ts.forEachChild(n,walk);}walk(ast);
const shared=fs.existsSync(path.join(root,'src/lib/canvas/artwork-document.ts'));assert.equal(shared,!baseline);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText,plain=x=>JSON.parse(JSON.stringify(x));
let checks=0,cases=0;const eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}},tick=()=>new Promise(r=>setImmediate(r));
const art=(id='a',extra={})=>({id,title:id,category:'main',prompt:'',status:'completed',image:'/fixture.png',createdAt:'2026-10-24T00:00:00.000Z',canvasX:10,canvasY:20,groupId:'A',...extra});
async function test(name,work){await work();cases++;console.log('CASE='+name+' PASS');}
async function bundle(){const paths=['src/lib/browser-data-cache.ts',...(shared?['src/lib/canvas/artwork-document.ts','src/lib/canvas/document-scope.ts']:[])];return (await build({stdin:{contents:paths.map(f=>'export * from '+JSON.stringify(path.join(root,f))+';').join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'scope',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=()=>__ports.auth();':'export const currentWorkspace=()=>__ports.workspace,currentWorkspaceRevision=()=>__ports.revision;',loader:'js'}));
 }}]})).outputFiles[0].text;}
function setup(built){
 const state={nodes:[art()],rows:[art()],trash:[],requests:[],notices:[],owner:'a@test',account:'a@test',project:'tree:A',readOnly:false,auth:async()=>{},respond:async()=>{},accountStatus:200,getStatus:200,trashStatus:200,malformed:false};
 const storage=new Map(),ports={workspace:'personal',revision:0,async auth(){await state.auth();return {authorization:state.account,'x-naumi-workspace':ports.workspace,'x-naumi-project-context':'wrong'};}};
 const module={exports:{}};
 const c={__ports:ports,module,exports:module.exports,console,Error,Map,Set,WeakMap,Promise,Headers,Response,Request,AbortSignal,URLSearchParams,Date,Blob,structuredClone,setTimeout,clearTimeout,
  window:{location:{search:''}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  canvasAccountRef:{current:state.account},worksRef:{current:state.nodes},pendingNodeRef:{current:null},restoredRef:{current:false},deepFocusRef:{current:false},
  ready:true,authenticatedEmail:state.owner,setWorks:f=>{state.nodes=typeof f==='function'?f(state.nodes):f;},setNames:()=>{},setTargetEmail:()=>{},setReadOnly:()=>{},setPinnedNode:()=>{},setActiveKey:()=>{},setBrowsing:()=>{},
  setSidebarOpen:()=>{},setTrashOpen:()=>{},setTrashItems:f=>state.trashItems=typeof f==='function'?f(state.trashItems):f,setTrashBusy:v=>state.trashBusy=v,
  t:k=>k,flashTip:s=>state.notices.push(s),authHeader:()=>ports.auth(),expectJsonOk:async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 };
 c.fetch=async(url,init={})=>{
  const u=new URL(url,'http://fixture'),status=u.pathname==='/api/account'?state.accountStatus:u.pathname==='/api/artworks/trash'?state.trashStatus:state.getStatus;
  const row={url,method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),body:init.body?JSON.parse(init.body):null};state.requests.push(row);
  let body;if(u.pathname==='/api/projects')body={names:{}};else if(u.pathname==='/api/artworks/trash'){
   if(row.method==='POST'){const selected=state.trash.filter(n=>row.body.ids.includes(n.id));state.trash=state.trash.filter(n=>!row.body.ids.includes(n.id));if(row.body.action==='restore')state.rows.push(...selected);body={ok:true,count:selected.length};}else body={artworks:state.trash};
  }else body={artworks:u.pathname==='/api/account'?state.rows:state.rows.filter(n=>(u.searchParams.get('ids')||'').split(',').includes(n.id))};
  body=structuredClone(state.malformed?{}:status>=400?{error:'fixture unavailable'}:body);await state.respond(row);return Response.json(body,{status});
 };
 vm.createContext(c);vm.runInContext(built,c);Object.assign(c,module.exports);vm.runInContext(compile(fn.privateFetchRaw+'\nglobalThis.__initial='+loadEffect),c);
 const model=shared?c.createCanvasArtworkDocument():null,context=shared?c.createCanvasDocumentContext():null;let binding;
 vm.runInContext(compile(`globalThis.__render=function(works,targetEmail,user,canvasArtworkDocument){const trashBusy=false;${['refetchWorks','mergeWorks','removeWorksLocal','openTrash','trashAction'].map(n=>fn[n]).join('\n')}return {refetchWorks,mergeWorks,removeWorksLocal,openTrash,trashAction};}`),c);
 const render=(account=state.account,project=state.project)=>{state.account=account;state.owner=account;state.project=project;c.canvasAccountRef.current=account;c.authenticatedEmail=account;c.worksRef.current=state.nodes;
  if(model){const scope=context.render(account,project);binding=model.bind(scope,account,!state.readOnly);}
  return c.__render(state.nodes,state.owner,{email:state.owner},binding);
 };
 if(shared){let nodes=state.nodes;Object.defineProperty(state,'nodes',{get:()=>binding?binding.getSnapshot().nodes:nodes,set:v=>{if(binding)binding.set(v);else nodes=v;}});render();binding.accept(nodes);}
 else render();
 return {state,c,ports,render,binding:()=>binding,update:f=>{if(binding)binding.set(f);else c.setWorks(f);},snapshot:()=>binding?.getSnapshot(),
  load:async()=>{if(binding)return binding.load().catch(()=>{});c.__initial();for(let i=0;i<10;i++)await tick();},unmount:()=>context?.mount(false)};
}
async function main(){
 const built=await bundle();
 await test('normal-merge-and-sorted-live-return',async()=>{const f=setup(built);f.state.rows=[art('b',{createdAt:'2026-10-25'})];const result=await f.render().mergeWorks(['b']);eq(result.map(n=>n.id),['b','a']);eq(f.state.nodes.map(n=>n.id),['b','a']);eq(f.state.requests.length,1);});
 await test('initial-load-failure-not-empty-success',async()=>{const f=setup(built);f.state.accountStatus=503;await f.load();eq(f.state.nodes.length,baseline?0:1);if(shared)eq(f.snapshot().phase,'error');});
 await test('malformed-account-not-empty-success',async()=>{const f=setup(built);f.state.malformed=true;await f.load();eq(f.state.nodes.length,baseline?0:1);if(shared)eq(f.snapshot().phase,'error');});
 await test('merge-failure-does-not-full-scan-or-return-stale-success',async()=>{const f=setup(built);f.state.getStatus=503;f.state.accountStatus=503;let failed=false;await f.render().mergeWorks(['missing']).catch(()=>{failed=true});eq(failed,!baseline);eq(f.state.requests.length,baseline?2:1);eq(f.state.nodes.length,1);});
 await test('partial-response-is-not-complete-attachment',async()=>{const f=setup(built);f.state.rows=[art('b')];let failed=false;await f.render().mergeWorks(['b','missing']).catch(()=>{failed=true});eq(failed,!baseline);ok(f.state.nodes.some(n=>n.id==='b'));});
 await test('slow-full-read-keeps-later-local-fields',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.rows=[art('a',{title:'server title',width:700,canvasX:10})];f.state.respond=()=>{entered.resolve();return gate.promise};const pending=f.render().refetchWorks();await entered.promise;f.update(nodes=>nodes.map(n=>({...n,canvasX:900,marked:true})));gate.resolve();await pending;eq(f.state.nodes[0].canvasX,baseline?10:900);eq(f.state.nodes[0].title,'server title');eq(f.state.nodes[0].width,700);eq(!!f.state.nodes[0].marked,!baseline);});
 await test('late-read-does-not-resurrect-delete',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.respond=()=>{entered.resolve();return gate.promise};const r=f.render(),pending=r.mergeWorks(['a']).catch(()=>{});await entered.promise;r.removeWorksLocal(['a']);gate.resolve();await pending;eq(f.state.nodes.length,baseline?1:0);});
 await test('overlapping-reads-do-not-regress-newer-result',async()=>{const f=setup(built),gate=deferred(),entered=deferred();let first=true;f.state.rows=[art('a',{title:'old'})];f.state.respond=()=>{if(first){first=false;entered.resolve();return gate.promise;}};const earlier=f.render().mergeWorks(['a']);await entered.promise;f.state.rows=[art('a',{title:'new'})];await f.render().mergeWorks(['a']);gate.resolve();await earlier;eq(f.state.nodes[0].title,baseline?'old':'new');});
 for(const kind of ['account','workspace'])await test(kind+'-ABA-during-auth',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.auth=()=>{entered.resolve();return gate.promise};const pending=f.render().mergeWorks(['a']);await entered.promise;if(kind==='account'){f.render('b@test');f.render('a@test');}else{f.ports.workspace='tenant';f.ports.revision++;f.ports.workspace='personal';f.ports.revision++;}gate.resolve();await pending;eq(f.state.requests.length,baseline?1:0);});
 await test('caller-currentness-checked-after-auth',async()=>{const f=setup(built),gate=deferred(),entered=deferred();let current=true;f.state.auth=()=>{entered.resolve();return gate.promise};const pending=f.render().mergeWorks(['a'],()=>current);await entered.promise;current=false;gate.resolve();await pending;eq(f.state.requests.length,baseline?1:0);});
 await test('sync-return-not-stale-works-ref',async()=>{const f=setup(built),r=f.render();f.update(nodes=>nodes.concat(art('local')));f.state.rows=[art('remote')];const result=await r.mergeWorks(['remote']);eq(result.some(n=>n.id==='local'),!baseline);ok(f.state.nodes.some(n=>n.id==='local'));});
 await test('remove-uses-current-document-not-render-snapshot',async()=>{const f=setup(built),r=f.render();f.update(nodes=>nodes.concat(art('new')));r.removeWorksLocal(['a']);eq(f.state.nodes.map(n=>n.id),baseline?[]:['new']);});
 await test('trash-read-failure-not-empty',async()=>{const f=setup(built);f.state.trashStatus=503;await f.render().openTrash();if(baseline)eq(f.state.trashItems,[]);else ok(f.snapshot().trashError.length>0);});
 if(shared){
  await test('cached-full-read-is-partitioned-by-workspace',async()=>{const f=setup(built);f.c.activateBrowserData('a@test');await f.load();f.ports.workspace='tenant';f.ports.revision++;f.render();f.state.rows=[art('tenant')];await f.load();eq(f.state.nodes.map(n=>n.id),['tenant']);eq(f.state.requests.filter(r=>r.url.includes('/api/account')).length,2);});
  await test('canvas-reuses-verified-account-cache-same-workspace',async()=>{const f=setup(built);f.c.activateBrowserData('a@test');await f.c.loadAccountSnapshot('a@test');await f.load();eq(f.state.requests.filter(r=>r.url.includes('/api/account')).length,1);});
  await test('confirmed-empty-vs-load-error',async()=>{const f=setup(built);f.state.rows=[];await f.load();eq(f.state.nodes,[]);eq(f.snapshot().phase,'ready');eq(f.snapshot().error,'');});
  await test('known-id-retry-only-gets-original-ids',async()=>{const f=setup(built);f.state.getStatus=503;await f.render().mergeWorks(['a']).catch(()=>{});f.state.getStatus=200;await f.binding().retry();eq(f.state.requests.length,2);ok(f.state.requests.every(r=>r.url.includes('/api/artworks/get')));eq(f.snapshot().error,'');});
  await test('large-local-sync-chunks-without-full-load',async()=>{const f=setup(built);f.state.rows=Array.from({length:205},(_,i)=>art('a'+i));const result=await f.render().mergeWorks(f.state.rows.map(n=>n.id));eq(f.state.requests.length,3);eq(result.length,206);});
  await test('restore-explicitly-clears-local-deletion',async()=>{const f=setup(built);f.render().removeWorksLocal(['a']);f.state.rows=[];f.state.trash=[art()];await f.render().openTrash();await f.render().trashAction('restore',['a']);eq(f.state.nodes.map(n=>n.id),['a']);eq(f.snapshot().trash,[]);eq(f.state.requests.filter(r=>r.method==='POST').length,1);});
  await test('read-only-trash-has-zero-posts',async()=>{const f=setup(built);f.state.readOnly=true;const r=f.render();await r.trashAction('purge',['a']);eq(f.state.requests.length,0);});
  await test('permission-loss-does-not-keep-private-graph-visible',async()=>{const f=setup(built);f.state.getStatus=403;await f.render().mergeWorks(['a']).catch(()=>{});eq(f.state.nodes,null);eq(f.snapshot().phase,'error');});
  await test('unmount-cancels-late-read-projection',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.rows=[art('b')];f.state.respond=()=>{entered.resolve();return gate.promise};const pending=f.render().mergeWorks(['b']);await entered.promise;f.unmount();gate.resolve();eq(await pending,[]);eq(f.state.nodes.map(n=>n.id),['a']);});
  await test('newer-full-absence-wins-over-older-id-response',async()=>{const f=setup(built),gate=deferred(),entered=deferred();let first=true;f.state.respond=()=>{if(first){first=false;entered.resolve();return gate.promise}};const old=f.render().mergeWorks(['a']).catch(()=>{});await entered.promise;f.state.rows=[];await f.render().refetchWorks();gate.resolve();await old;eq(f.state.nodes,[]);eq(f.snapshot().error,'');});
  await test('full-read-keeps-newer-local-additions',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.respond=()=>{entered.resolve();return gate.promise};const pending=f.render().refetchWorks();await entered.promise;f.update(nodes=>nodes.concat(art('later')));gate.resolve();await pending;eq(f.state.nodes.length,2);});
  await test('new-account-never-sees-prior-graph',async()=>{const f=setup(built);f.render('b@test');eq(f.state.nodes,null);f.render('a@test');eq(f.state.nodes.map(n=>n.id),['a']);});
 }
 const result={baseline,cases,checks,sourceRoot:root};fs.writeFileSync(path.join(out,(baseline?'BASELINE':'MODIFIED')+'_RESULT.json'),JSON.stringify(result,null,2));
 console.log(`CANVAS_ARTWORK_DOCUMENT=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${cases} checks=${checks} OWNER=${baseline?'COMPONENT':'DOCUMENT'} FAILED_READ=${baseline?'EMPTY_OR_STALE':'EXPLICIT_ERROR'} AUTH_ABA_GET=${baseline?1:0} ID_FAILURE_FULL_SCAN=${baseline?1:0} SUPPLIER=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
