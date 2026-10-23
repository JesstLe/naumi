'use strict';
// Concentrated, network-free regression of the actual Canvas AST functions.
// node scripts/verify-imagegen-merge-scope.cjs [--baseline]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/imagegen-frozen-quote47-20261023');
const baseline=process.argv.includes('--baseline');
const sourceRoot=baseline?path.join(out,'baseline'):root;
const sourcePath=path.join(sourceRoot,'src/components/canvas/canvas-client.tsx');
const source=fs.readFileSync(sourcePath,'utf8'),sourceHash=sha(source);
const ast=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions={},declarations={},locations={};let attach;
function walk(node,fn){fn(node);ts.forEachChild(node,child=>walk(child,fn));}
function line(node){return ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1;}
walk(ast,node=>{
 if(ts.isFunctionDeclaration(node)&&['mergeWorks','refetchWorks','runGen','generatePend'].includes(node.name?.text)){
  assert.ok(!functions[node.name.text],'unique '+node.name.text);functions[node.name.text]=node;locations[node.name.text]={start:line(node),end:ast.getLineAndCharacterOfPosition(node.end).line+1};
 }
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['recoveryScope','recoveryAccount','recoveryEpoch','recoveryCurrent'].includes(node.name.text))declarations[node.name.text]=node;
 if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='ImagegenPendingRecovery'){
  const attr=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='onAttach');
  attach=attr?.initializer?.expression;if(attach)locations.onAttach={start:line(attach),end:ast.getLineAndCharacterOfPosition(attach.end).line+1};
 }
});
for(const name of ['mergeWorks','refetchWorks'])assert.ok(functions[name],name+' AST exists');
const actualCode=ts.transpileModule(['refetchWorks','mergeWorks'].map(n=>functions[n].getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const recoveryCode=!baseline&&attach?ts.transpileModule(['recoveryScope','recoveryAccount','recoveryEpoch','recoveryCurrent'].map(n=>'const '+declarations[n].getText(ast)+';').join('\n')+'\nglobalThis.actualAttach='+attach.getText(ast)+';\nglobalThis.actualCurrent=recoveryCurrent;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText:'';
const componentPath=path.join(root,'src/components/canvas/imagegen-pending-recovery.tsx');
const componentSource=fs.readFileSync(componentPath,'utf8'),componentAst=ts.createSourceFile(componentPath,componentSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let componentCheck,componentCurrent;
walk(componentAst,n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='check')componentCheck=n;if(ts.isVariableDeclaration(n)&&n.name.getText(componentAst)==='current')componentCurrent=n.initializer;});
const componentCheckCode=!baseline?ts.transpileModule('const current='+componentCurrent.getText(componentAst)+';\n'+componentCheck.getText(componentAst)+'\nglobalThis.actualCheck=check;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText:'';
const OWNER='fixture.owner@example.test',WORKSPACE='fixture-workspace',PROJECT='tree:fixture';
const old={id:'old',createdAt:'2026-10-01',image:'/old.png'},existing={id:'result',createdAt:'2026-10-02',image:'/before.png'};
const fresh={id:'result',createdAt:'2026-10-23',image:'/after.png'},full={id:'full',createdAt:'2026-10-22',image:'/full.png'};
const cases=[];let assertions=0;
function sha(value){return crypto.createHash('sha256').update(value).digest('hex');}
function clean(v){return v===undefined?v:JSON.parse(JSON.stringify(v));}
function eq(a,b,label){assertions++;assert.deepEqual(clean(a),clean(b),label);}
function ok(value,label){assertions++;assert.ok(value,label);}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function finite(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('finite 5s test deadline exceeded')),5000);})]);}finally{clearTimeout(timer);}}
function fixture({mode='target',gate=null,deferUpdater=false,initialWorks=[old,existing]}={}){
 const entered=deferred(),release=deferred();
 const state={works:initialWorks,mounted:true,workspace:WORKSPACE,targetCalls:0,fullCalls:0,parseCalls:[],setCalls:0,effects:0,queued:[],requests:[],invalidations:[],asserted:0,frames:0,onFrame:null,attachResults:[],clears:0,pendingAttempts:[]};
 async function checkpoint(stage){if(gate===stage){entered.resolve();await release.promise;}}
 const c={console,Promise,Map,Set,Date,Error,Array,encodeURIComponent,targetEmail:null,user:{email:OWNER},activeKey:PROJECT,
  works:state.works,worksRef:{current:state.works},canvasAccountRef:{current:OWNER},canvasContextEpochRef:{current:7},activeProjectRef:{current:{key:PROJECT}},
  currentWorkspace:()=>state.workspace,t:k=>k,invalidateBrowserData:email=>state.invalidations.push(email),authHeader:async()=>({authorization:'Bearer fixture-only'}),
  privateFetchRaw:async(url,options)=>{state.targetCalls++;state.requests.push({kind:'target',url,options});await checkpoint('target-fetch');if(mode==='throw')throw Error('target get failed');return{kind:'target'};},
  fetch:async(url,options)=>{state.fullCalls++;state.requests.push({kind:'full',url,options});await checkpoint('full-fetch');return{kind:'full'};},
  expectJsonOk:async response=>{state.parseCalls.push(response.kind);await checkpoint(response.kind==='target'?'target-parse':'full-parse');return{artworks:response.kind==='target'?(mode==='empty'?[]:[fresh]):[full]};},
  setWorks:value=>{state.setCalls++;if(deferUpdater)state.queued.push(value);else apply(value);},
  requestAnimationFrame:callback=>{const frame=++state.frames;Promise.resolve().then(()=>{state.onFrame?.();callback(frame*16);});return frame;},
  assertGenerationResultsPresent:(ids,works)=>{state.asserted++;for(const id of ids)assert.ok(works.some(a=>a.id===id));}
 };
 function apply(value){const previous=state.works,next=typeof value==='function'?value(previous):value;if(next!==previous)state.effects++;state.works=next;c.works=next;c.worksRef.current=next;}
 vm.createContext(c);vm.runInContext(actualCode+'\nglobalThis.actualMerge=mergeWorks;globalThis.actualRefetch=refetchWorks;',c,{filename:sourcePath+':AST'});
 if(recoveryCode)vm.runInContext(recoveryCode,c,{filename:sourcePath+':root-onAttach-AST'});
 const attempt={owner:OWNER,workspace:WORKSPACE,project:PROJECT,actionKey:'node:original',operationId:'fixture-operation',context:{}};
 state.pendingAttempts=[attempt];
 if(componentCheckCode){
  Object.assign(c,{mounted:{get current(){return state.mounted;}},callbacks:{current:{isCurrent:()=>c.actualCurrent(),onAttach:async(...args)=>{const attached=await c.actualAttach(...args);state.attachResults.push(attached);return attached;}}},checking:{current:new Set()},pendingAttemptKey:()=>attempt.actionKey,
   pollImagegen:async()=>({operationId:attempt.operationId,jobId:'imagegen-'+attempt.operationId,status:'succeeded',artifacts:[{artworkId:'result'}]}),
   setStates:()=>{},completeCanvasImagegen:()=>{state.clears++;},setAttempts:updater=>{state.pendingAttempts=updater(state.pendingAttempts);}});
  vm.runInContext(componentCheckCode,c,{filename:componentPath+':check-AST'});
 }
 const guard=()=>state.mounted&&state.workspace===WORKSPACE&&c.activeProjectRef.current?.key===PROJECT&&c.canvasContextEpochRef.current===7;
 return {state,c,entered:entered.promise,release:release.resolve,guard,merge:ids=>c.actualMerge(ids,guard),refetch:()=>c.actualRefetch(guard),
  attach:()=>c.actualAttach(['result'],()=>state.mounted),
  check:()=>c.actualCheck(attempt),
  change(dimension){if(dimension==='scope')state.workspace='other-workspace';else if(dimension==='project')c.activeProjectRef.current={key:'tree:other'};else if(dimension==='epoch')c.canvasContextEpochRef.current++;else if(dimension==='account')c.canvasAccountRef.current='other@example.test';else if(dimension==='unmount')state.mounted=false;else throw Error('unknown dimension '+dimension);},
  flush(){state.queued.splice(0).forEach(apply);},summary(){return{targetCalls:state.targetCalls,fullCalls:state.fullCalls,setCalls:state.setCalls,stateChanges:state.effects,parseCalls:state.parseCalls,asserted:state.asserted};}
 };
}
async function test(name,run){const start=assertions;try{const evidence=await finite(run());cases.push({name,status:'PASS',assertions:assertions-start,...evidence});}catch(error){cases.push({name,status:'FAIL',assertions:assertions-start,error:{message:error.message,stack:error.stack}});}}
async function stale(dimension,stage,mode='target',useRoot=false){
 const f=fixture({gate:stage,mode}),before=f.state.works;
 const pending=useRoot?f.attach():f.merge(['result']);await finite(f.entered);f.change(dimension);f.release();const result=await finite(pending);
 eq(result,useRoot?false:[],'stale call returns no results');eq(f.state.setCalls,0,'no stale setWorks dispatch');eq(f.state.effects,0,'no stale state mutation');ok(f.state.works===before,'stale keeps identical works reference');
 eq(f.state.fullCalls,stage.startsWith('full')?1:0,'stale never starts a fallback');return{dimension,stage,mode,...f.summary()};
}
async function run(){
 if(baseline){await test('raw baseline ignores optional guard during targeted fetch',async()=>{
  const f=fixture({gate:'target-fetch'}),before=f.state.works,p=f.merge(['result']);await finite(f.entered);f.change('scope');f.release();const result=await finite(p);
  eq({unchanged:f.state.works===before,setWorks:f.state.setCalls,fullFallback:f.state.fullCalls,result:clean(result)}, {unchanged:true,setWorks:0,fullFallback:0,result:[]},'raw baseline must reject stale optional guard');return f.summary();
 });return;}
 await test('successful targeted merge preserves unrelated, replaces matching ID, sorts, and returns merged rows',async()=>{
  const f=fixture(),result=await f.merge(['result']);eq(result,[fresh,old],'returned snapshot');eq(f.state.works,[fresh,old],'actual setWorks updater merge');eq(f.state.targetCalls,1,'one targeted fetch');eq(f.state.fullCalls,0,'no full fallback');eq(f.state.requests[0],{kind:'target',url:'/api/artworks/get?email=fixture.owner%40example.test&ids=result',options:{cache:'no-store'}},'target request');return f.summary();
 });
 for(const mode of ['empty','throw'])await test(mode==='empty'?'empty targeted response falls back to full refetch':'thrown targeted get falls back to full refetch',async()=>{
  const f=fixture({mode});eq(await f.merge(['result']),[full],'full fallback result');eq(f.state.works,[full],'full fallback commits');eq(f.state.targetCalls,1,'one target request');eq(f.state.fullCalls,1,'one full fallback');eq(f.state.setCalls,1,'only fallback commits');return f.summary();
 });
 await test('preflight false guard prevents merge/refetch request and setWorks',async()=>{
  const f=fixture();f.change('unmount');eq(await f.merge(['result']),[],'stale merge empty');eq(await f.refetch(),[],'stale refetch empty');eq(f.summary(),{targetCalls:0,fullCalls:0,setCalls:0,stateChanges:0,parseCalls:[],asserted:0},'no preflight effects');return f.summary();
 });
 for(const dimension of ['scope','account','unmount'])for(const stage of ['target-fetch','target-parse','full-fallback'])await test(`${dimension} invalidation during ${stage} does not commit or initiate stale fallback`,async()=>{
  const details=[];if(stage==='full-fallback'){for(const mode of ['empty','throw'])for(const checkpoint of ['full-fetch','full-parse'])details.push(await stale(dimension,checkpoint,mode));}
  else {details.push(await stale(dimension,stage));if(stage==='target-fetch')details.push(await stale(dimension,stage,'throw'));else details.push(await stale(dimension,stage,'empty'));}
  return{details};
 });
 for(const mode of ['target','empty'])await test(`${mode==='target'?'targeted':'fallback'} functional updater delayed until guard is false leaves exact current array unchanged`,async()=>{
  const details=[];for(const dimension of ['scope','account','unmount']){
   const f=fixture({mode,deferUpdater:true});await f.merge(['result']);eq(f.state.queued.length,1,'one deferred setWorks');ok(typeof f.state.queued[0]==='function','actual source supplies functional updater');
   const concurrent={id:'new-scope-only',createdAt:'2026-10-24'};const untouched=[concurrent];f.state.works=untouched;f.c.works=untouched;f.c.worksRef.current=untouched;
   f.change(dimension);f.flush();ok(f.state.works===untouched,'deferred stale updater returns identical latest state');eq(f.state.works,[concurrent],'new-scope data unchanged');eq(f.state.effects,0,'deferred stale updater has no effect');details.push({dimension,...f.summary()});
  }return{details};
 });
 await test('legacy mergeWorks(ids) without optional guard remains functional',async()=>{const f=fixture();eq(await f.c.actualMerge(['result']),[fresh,old],'legacy merge return');eq(f.state.works,[fresh,old],'legacy merge commits');return f.summary();});
 await test('legacy refetchWorks() without optional guard remains functional',async()=>{const f=fixture();eq(await f.c.actualRefetch(),[full],'legacy full return');eq(f.state.works,[full],'legacy full commit');return f.summary();});
 await test('actual root AST onAttach passes combined scope and mount guard to actual mergeWorks',async()=>{
  ok(attach&&ts.isArrowFunction(attach),'actual root onAttach arrow');eq(attach.parameters.map(p=>p.name.getText(ast)),['ids','isMounted'],'scope callback receives component mount predicate');
  let combined,mergeCall;walk(attach,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='current')combined=n.initializer;if(ts.isCallExpression(n)&&n.expression.getText(ast)==='mergeWorks')mergeCall=n;});
  ok(combined&&ts.isArrowFunction(combined),'combined arrow AST');ok(ts.isBinaryExpression(combined.body)&&combined.body.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken,'combined logical AND AST');eq(combined.body.left.getText(ast),'recoveryCurrent()','scope current left branch');eq(combined.body.right.getText(ast),'isMounted()','mount current right branch');eq(mergeCall.arguments.map(a=>a.getText(ast)),['ids','current'],'actual root passes combined current into actual merge');
  const success=fixture({initialWorks:[old]});await success.check();eq(success.state.attachResults,[true],'actual root success after observed commit');eq(success.state.works,[fresh,old],'root executes real merge');eq(success.state.asserted,1,'root verifies actual returned artwork');eq(success.state.frames,1,'root awaits one RAF');eq(success.state.clears,1,'actual component clears only observed success');eq(success.c.worksRef.current,[fresh,old],'successful state commit updates observed worksRef');
  const deferredRoot=fixture({initialWorks:[old],deferUpdater:true});await deferredRoot.check();eq(deferredRoot.state.attachResults,[false],'computed merge snapshot without updater commit returns false');eq(deferredRoot.state.frames,1,'deferred root still awaits one frame');eq(deferredRoot.state.queued.length,1,'actual merge updater remains unflushed');eq(deferredRoot.state.clears,0,'actual component retains receipt before commit');eq(deferredRoot.state.pendingAttempts.length,1,'pending recovery remains');eq(deferredRoot.c.worksRef.current,[old],'uncommitted snapshot never enters observed ref');
  deferredRoot.change('unmount');const untouched=deferredRoot.state.works;deferredRoot.flush();ok(deferredRoot.state.works===untouched,'flushing queued updater after invalidation keeps exact state');eq(await deferredRoot.attach(),false,'invalid guard still returns false after deferred flush');eq(deferredRoot.state.clears,0,'invalid deferred flush never clears receipt');eq(deferredRoot.state.effects,0,'invalid deferred flush has no commit');
  const details=[];for(const dimension of ['scope','project','epoch','account','unmount'])details.push(await stale(dimension,'target-fetch','target',true));
  const recoveryText=declarations.recoveryCurrent.initializer.getText(ast);for(const fragment of ['canvasAccountRef.current','canvasContextEpochRef.current','currentWorkspace()','activeProjectRef.current'])ok(recoveryText.includes(fragment),'root scope includes '+fragment);
  return{location:locations.onAttach,observedCommit:{normal:{attached:success.state.attachResults,frames:success.state.frames,clears:success.state.clears},deferred:{attached:deferredRoot.state.attachResults,frames:deferredRoot.state.frames,clears:deferredRoot.state.clears,stateChanges:deferredRoot.state.effects}},details};
 });
 await test('all four actual runGen/generatePend generation merge call-sites pass current',async()=>{
  const callSites=[];for(const name of ['runGen','generatePend']){
   const calls=[];walk(functions[name],n=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='mergeWorks')calls.push(n);});eq(calls.length,2,name+' initial and retry merge sites');
   for(const call of calls){eq(call.arguments.length,2,name+' passes optional guard');eq(call.arguments[1].getText(ast),'current',name+' forwards current');callSites.push({function:name,line:line(call),call:call.getText(ast)});}
  }eq(callSites.length,4,'four actual generation call-sites');return{callSites};
 });
 await test('actual recovery component invokes onAttach(ids,current) with mounted and external scope predicate',async()=>{
  const file=path.join(root,'src/components/canvas/imagegen-pending-recovery.tsx'),text=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let call,current,mountedCleanup=false;
  walk(tree,n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='callbacks.current.onAttach')call=n;if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='current')current=n.initializer;if(ts.isBinaryExpression(n)&&n.left.getText(tree)==='mounted.current'&&n.right.kind===ts.SyntaxKind.FalseKeyword)mountedCleanup=true;});
  ok(call,'component calls root callback');eq(call.arguments.map(a=>a.getText(tree)),['ids','current'],'component passes exact current guard');ok(current&&ts.isArrowFunction(current),'component current arrow');ok(ts.isBinaryExpression(current.body)&&current.body.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken,'component combined AND');eq(current.body.left.getText(tree),'mounted.current','component guards mount');ok(current.body.right.getText(tree).includes('callbacks.current.isCurrent?.()'),'component guards external scope');ok(mountedCleanup,'component clears mounted on cleanup');return{componentPath:file,componentSha256:sha(text)};
 });
}
(async()=>{
 await run();const failures=cases.filter(c=>c.status==='FAIL'),status=failures.length?'FAIL':'PASS',exitStatus=failures.length?1:0;
 const unchanged=sha(fs.readFileSync(sourcePath))===sourceHash;const stdout=`MERGE_SCOPE=${status} CASES=${cases.length} ASSERTIONS=${assertions} FAILURES=${failures.length} SOURCE_SHA256=${sourceHash}`;
 const command='node scripts/verify-imagegen-merge-scope.cjs'+(baseline?' --baseline':'');
 const report={status,command,input:{mode:baseline?'raw-baseline':'modified',sourceRoot},exitStatus,stdout,sourcePath,sourceSha256:sourceHash,sourceUnchanged:unchanged,scriptSha256:sha(fs.readFileSync(__filename)),locations,cases:cases.length,assertions,failures:failures.length,scope:'Actual AST-extracted mergeWorks/refetchWorks and root onAttach; actual generation/component call-site AST. Only transport/auth/React state scheduling fixtures; no src changes, Git, SSH, network, build, deploy or supplier calls.',reports:cases};
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,baseline?'MERGE_BASELINE.json':'MERGE_MODIFIED.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).stdout,stdout);assert.ok(unchanged,'source raw hash unchanged');console.log(stdout);if(failures.length)console.error(failures.map(f=>f.name+': '+f.error.message).join('\n'));process.exitCode=exitStatus;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
