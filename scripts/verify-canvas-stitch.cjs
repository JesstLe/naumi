/** Actual old Canvas function vs current stitch owner. DOM/HTTP are explicit
 * fixture ports; history recording and document scope are actual modules. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const option=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(option('--source-root')||'.'),out=path.resolve(option('--out')||process.env.CANVAS_STITCH_EVIDENCE||'output/canvas-stitch'),baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true),functions=new Map();
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
const code=()=>build({stdin:{contents:`export * from './src/lib/canvas/document-scope';export * from './src/lib/canvas/history-controller';${baseline?'':"export * from './src/lib/canvas/stitch-run';"}`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>{if(globalThis.__authGate)await globalThis.__authGate;return {"Authorization":"fixture"};};':'export const currentWorkspace=()=>globalThis.__workspace||"personal",currentWorkspaceRevision=()=>globalThis.__revision||0;'}));}}]});
const plain=x=>JSON.parse(JSON.stringify(x)),deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
let built,checks=0;const cases=[],eq=(a,b,label='')=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
function setup(){
 const state={project:'tree:a',account:'actor-a',epoch:0,posts:[],reads:[],history:[],ui:[],tips:[],results:new Map(),next:0,unknown:false,missing:false,status:200,gates:[],auth:undefined,view:true};
 const c={exports:{},module:{exports:{}},require,console,process,Headers,Request,Response,URL,AbortSignal,Map,Set,Promise,Error,Date,JSON,crypto:{randomUUID:()=>`11111111-1111-4111-8111-${String(++state.next).padStart(12,'0')}`}};c.exports=c.module.exports;
 c.fetch=async(url,init={})=>{
  const query=init.method!=='POST';if(query){state.reads.push(url);const match=String(url).split('operationId=')[1];return Response.json({ok:true,result:state.receipts?.get(match)||null});}
  const body=JSON.parse(init.body);state.posts.push(body);const gate=state.gates.shift();if(gate)await gate.promise;
  if(state.status!==200)return Response.json({error:'rejected',accepted:false},{status:state.status});
  const id='canvas-long-'+state.posts.length,result={ok:true,kind:'canvas-stitch',id,image:'/media/'+id+'.png',projectKey:'tree:a',operationId:body.operationId};state.results.set(id,{id,groupId:'a',image:result.image,title:'long',canvasX:920,canvasY:40});
  state.receipts??=new Map();if(body.operationId)state.receipts.set(body.operationId,result);
  if(state.unknown){state.unknown=false;throw Error('lost ACK');}return Response.json(result);
 };
 vm.createContext(c);vm.runInContext(built,c);const api=c.module.exports,scopes=api.createCanvasDocumentContext(),owner=baseline?null:api.createCanvasStitchRun();
 const controller=api.createCanvasHistoryController({changed(){},readOnly:()=>false,flush:async()=>{},transaction:async(_s,work)=>work(),video:()=>undefined,commit(){},pending(){},refresh:async()=>{},warning(){}});
 const merge=async(ids,scope)=>{if(!scope.documentCurrent())return[];if(state.missing)throw Error('sync failed');return ids.map(id=>state.results.get(id)).filter(Boolean);};
 const runtime={user:{email:'fixture@test'},readOnly:false,selectedBatchArts:[{id:'a'},{id:'b'}],selectedBatchIds:['a','b'],stitching:false,
  rfRef:{current:{getNodes:()=>[{id:'a',position:{x:10,y:40},width:380},{id:'b',position:{x:450,y:80},width:380}]}},flowNodeSize:n=>({width:n.width}),X_GAP:90,
  t:k=>k,fmt:(_k,p)=>'Long '+p.n,L:(zh)=>zh,batchRunMountedRef:{current:true},canvasContextEpochRef:{current:0},setStitching:v=>{runtime.stitching=v;},
  privateFetchRaw:c.fetch,expectJsonOk:async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);return data;},
  clearCanvasSelection:()=>state.ui.push(['clear',state.project]),setSelectedId:id=>state.ui.push(['select',id,state.project]),flashTip:m=>state.tips.push(m)};
 vm.runInContext(ts.transpileModule(`globalThis.capture=(ports)=>{const {user,readOnly,stitching,selectedBatchArts,selectedBatchIds,rfRef,flowNodeSize,X_GAP,t,fmt,L,batchRunMountedRef,canvasContextEpochRef,canvasArtworkDocument,canvasHistory,stitch,privateFetchRaw,expectJsonOk,clearCanvasSelection,setSelectedId,flashTip,setStitching,mergeWorks,pushAddUndo}=ports;${functions.get('stitchBatchSelection')}return stitchBatchSelection;};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText,c);
 const h={state,c,runtime,render(){scopes.mount(true);const scope=scopes.render(state.account,state.project),view=owner?.bind(scope);runtime.canvasContextEpochRef.current=state.epoch;runtime.batchRunMountedRef.current=state.view;
  h.scope=scope;h.view=view;return c.capture({...runtime,canvasArtworkDocument:{scope,merge:ids=>merge(ids,scope)},canvasHistory:{record:(scope,action)=>{controller.push(scope,action);state.history.push({scope:scope.project,id:action.records[0].id});}},stitch:view,
   mergeWorks:ids=>merge(ids,scope),pushAddUndo:(id,fresh)=>{const node=fresh.find(n=>n.id===id);if(node){controller.push(scope,{kind:'add',records:[node]});state.history.push({scope:scope.project,id});}}});},
  run(){return h.render()();},move(project,account=state.account){state.project=project;state.account=account;state.epoch++;h.render();},busy(){return baseline?runtime.stitching:h.view.getSnapshot().busy;}};
 h.render();return h;
}
async function test(name,run){await run();cases.push(name);console.log('CASE='+name+' PASS');}
(async()=>{
 built=(await code()).outputFiles[0].text;
 await test('ordered-input-placement-and-one-history',async()=>{const h=setup();await h.run();eq(h.state.posts[0].ids,['a','b']);eq([h.state.posts[0].x,h.state.posts[0].y],[920,40]);eq(h.state.history.length,1);eq(h.state.ui.length,2);eq(h.busy(),false);});
 await test('explicit-readonly-and-not-enough-inputs',async()=>{for(const key of ['readOnly','user','selectedBatchArts']){const h=setup();h.runtime[key]=key==='readOnly'?true:key==='user'?null:[{id:'a'}];await h.run();eq(h.state.posts.length,0);}});
 await test('request-rejection-keeps-existing-selection',async()=>{const h=setup();h.state.status=400;await h.run();eq(h.state.posts.length,1);eq(h.state.history.length,0);eq(h.state.ui.length,0);eq(h.state.tips,['rejected']);});
 await test('lost-ack-reads-original-does-not-create-again',async()=>{const h=setup();h.state.unknown=true;await h.run();await h.run();eq(h.state.posts.length,baseline?2:1);eq(h.state.reads.length,baseline?0:1);eq(h.state.history.length,1);});
 await test('known-result-sync-failure-retains-original',async()=>{const h=setup();h.state.missing=true;await h.run();h.state.missing=false;await h.run();eq(h.state.posts.length,baseline?2:1);eq(h.state.history.length,1);});
 await test('late-project-result-only-records-original-history',async()=>{const h=setup(),gate=deferred();h.state.gates.push(gate);const running=h.run();while(!h.state.posts.length)await new Promise(r=>setImmediate(r));h.move('tree:b');gate.resolve();await running;eq(h.state.ui.length,baseline?2:0);eq(h.state.history,[{scope:'tree:a',id:'canvas-long-1'}]);});
 await test('late-actor-result-never-writes-new-document',async()=>{const h=setup(),gate=deferred();h.state.gates.push(gate);const running=h.run();while(!h.state.posts.length)await new Promise(r=>setImmediate(r));h.move('tree:a','actor-b');gate.resolve();await running;eq(h.state.history.length,0);eq(h.state.ui.length,baseline?2:0);});
 await test('synchronous-double-entry-has-one-post',async()=>{const h=setup(),gate=deferred();h.state.gates.push(gate);const callback=h.render(),first=callback(),second=callback();await new Promise(r=>setImmediate(r));gate.resolve();await Promise.all([first,second]);eq(h.state.posts.length,baseline?2:1);});
 if(!baseline){await test('auth-aba-before-send-never-marks-accepted',async()=>{const h=setup(),gate=deferred();h.c.__authGate=gate.promise;const work=h.run();await new Promise(r=>setImmediate(r));h.move('tree:b');gate.resolve();await work;eq(h.state.posts.length,0);eq(h.state.history.length,0);});
  await test('unresolved-receipt-stays-unknown-without-repost',async()=>{const h=setup();h.state.unknown=true;await h.run();h.state.receipts.clear();await h.run();await h.run();eq(h.state.posts.length,1);eq(h.state.reads.length,2);eq(h.state.history.length,0);});}
 if(!baseline){
  await test('wrong-operation-receipt-stays-unknown',async()=>{const h=setup();h.state.unknown=true;await h.run();for(const [id,value]of h.state.receipts)h.state.receipts.set(id,{...value,operationId:'wrong-operation'});await h.run();eq(h.state.posts.length,1);eq(h.state.history.length,0);eq(h.state.ui.length,0);});
  await test('node-move-before-recovery-retains-first-request',async()=>{const h=setup();h.state.unknown=true;await h.run();h.runtime.rfRef.current.getNodes=()=>[{id:'a',position:{x:900,y:1200},width:380},{id:'b',position:{x:1200,y:1800},width:380}];await h.run();eq(h.state.posts.length,1);eq(h.state.posts[0].x,920);eq(h.state.history.length,1);});
 }
 const result={status:baseline?'REPRODUCED':'PASS',cases:cases.length,checks,baseline,actualPageFunction:true,actualScope:true,actualHistory:true,http:'fixture',supplier:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(`CANVAS_STITCH=${result.status} CASES=${cases.length} CHECKS=${checks} ACTUAL_ENTRY_SCOPE_HISTORY=1 HTTP=FIXTURE SUPPLIER=0`);
})().catch(e=>{console.error(e);process.exitCode=1;});
