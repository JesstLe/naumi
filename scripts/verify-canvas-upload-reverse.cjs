// Actual source functions/React effect in a deterministic async fixture. No suppliers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--output-root','output/canvas-upload-reverse')),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});const file=path.join(root,'src/components/canvas/canvas-client.tsx'),text=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};let pendingEffect;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]&&ts.isArrowFunction(n.arguments[0])&&n.arguments[0].getText(ast).includes('const node = pendingNodeRef.current;'))pendingEffect=n.arguments[0].getText(ast);ts.forEachChild(n,visit)}visit(ast);
if(!baseline&&text.includes('useCanvasTextTasks')){
 const {spawnSync}=require('node:child_process');let exit=0;
 for(const [file,args]of [['scripts/verify-canvas-text-tasks.cjs',[]],['scripts/verify-canvas-image-imports.cjs',['--source-root',root,'--output',path.join(out,'imports')]]]){
  const r=spawnSync(process.execPath,[path.join(root,file),...args],{cwd:root,env:{...process.env,TEXT_TASK_SOURCE_ROOT:root,TEXT_TASK_EVIDENCE:path.join(out,'text-tasks')},encoding:'utf8'});
  fs.writeFileSync(path.join(out,path.basename(file)+'.log'),r.stdout+r.stderr);process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)exit=1;
 }
 console.log(`CANVAS_UPLOAD_REVERSE=${exit?'FAIL':'PASS'} ACTUAL_TASK_IMPORT_OWNERS=1 SUPPLIER_CALLS=0 EXIT=${exit}`);process.exitCode=exit;return;
}
assert.ok(functions.uploadRoot&&functions.reversePromptsForSelection&&pendingEffect);
const loaded=[{path:file,sha256:crypto.createHash('sha256').update(text).digest('hex')}],checks=[],failures=[];
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function env(){return {console,Date,Math,Map,Set,Promise,File,FormData,AbortSignal,window:{requestAnimationFrame:f=>f()},setTimeout,clearTimeout,readOnly:false,user:{email:'fixture@example.test'},browsing:false,locale:'zh',t:s=>s,L:(a,b)=>a,fmt:(s,x)=>s+JSON.stringify(x),flowNodeSize:()=>({width:320,height:240}),X_GAP:80,NODE_W:320,NODE_H:260,NODE_LABEL_H:30,Y_GAP:60,TEXT_NODE_DEFAULT_W:300,TEXT_NODE_DEFAULT_H:176,MAX_UPLOAD:64*1024*1024,canvasAccountRef:{current:'account-1'},currentWorkspace:()=> 'personal',currentWorkspaceRevision:()=>0,canvasContextEpochRef:{current:1},activeKey:'tree:fixture',activeProjectRef:{current:{key:'tree:fixture'}},reversePromptLockRef:{current:false},promptMining:false,setPromptMining:()=>{},setCtxMenu:()=>{},readJsonSafe:r=>r.json(),setCreatingNew:()=>{},pushUndo:()=>{},flashTip:()=>{},exports:{}};}
const settle=()=>new Promise(r=>setImmediate(r));
async function reverseCase(){
 const e=env();let nodes=[],requests=[],saves=[],undo=[],messages=[],gates=[];e.rfRef={current:{getNodes:()=>[]}};
 e.setTextNodes=f=>{nodes=typeof f==='function'?f(nodes):f};e.persistTextNode=async n=>{saves.push(n);return n};e.pushUndo=x=>undo.push(x);e.flashTip=x=>messages.push(x);
 e.privateFetch=async(_,opts)=>{const id=JSON.parse(opts.body).sourceIds[0];requests.push(id);await new Promise(r=>gates.push(r));const index=Number(id.slice(4));return {ok:index!==2,json:async()=>index===2?{error:'fixture model unavailable'}:{text:index===3?'   ':`prompt-${id}`}}};
 const helper=path.join(root,'src/lib/canvas/reverse-prompt-batch.ts');if(fs.existsSync(helper)){loaded.push({path:helper,sha256:crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex')});const m={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(helper,'utf8')),{...e,exports:m.exports});e.runReversePromptBatch=m.exports.runReversePromptBatch;}
 const ctx=vm.createContext(e);vm.runInContext(transpile(functions.reversePromptsForSelection+'\nglobalThis.run=reversePromptsForSelection;'),ctx);
 const arts=Array.from({length:5},(_,i)=>({id:'art-'+i,title:'图'+i,canvasX:0,canvasY:i*280}));const done=ctx.run(arts);await settle();const pendingCount=nodes.length;assert.equal(requests.length,2);
 while(gates.length||requests.length<5){const open=gates.splice(0);open.forEach(f=>f());await settle();}
 await done;const blankCompleted=nodes.filter(n=>n.status==='completed'&&!n.content.trim()),failed=nodes.filter(n=>n.status==='failed');
 if(baseline){assert.equal(pendingCount,2);assert.equal(blankCompleted.length,1);assert.equal(failed.length,1);assert.equal(failed[0].error,undefined);checks.push('BASELINE_BATCH_STARTS_WITH_2_OF_5_AND_ACCEPTS_WHITESPACE_SUCCESS_AND_BLANK_FAILURE');}
 else {assert.equal(pendingCount,5);assert.equal(blankCompleted.length,0);assert.equal(failed.length,2);assert.ok(failed.every(n=>n.error&&n.content===''&&n.prompt===''));assert.deepEqual(Array.from(nodes,n=>n.sourceIds[0]),arts.map(a=>a.id));assert.equal(saves.length,5);assert.equal(undo.length,1);assert.ok(messages.some(m=>m.includes('成功 3，失败 2')));checks.push('BATCH_HAS_5_STABLE_INPUTS_3_SUCCESS_2_READABLE_FAILURES_AND_ONE_HISTORY_STEP');}
 return {pendingCount,nodes:JSON.parse(JSON.stringify(nodes)),requests,saves:saves.length,messages};
}
async function uploadCase(switched=false){
 const e=env();e.activeRootId=()=>null;e.rootUploadRef={current:null};e.canvasAreaRef={current:null};e.rfRef={current:{screenToFlowPosition:()=>({x:0,y:0}),getNodes:()=>[]}};e.rfNodes=[];e.uploadCtxRef={current:null};const scope={rootId:null,queue:Promise.resolve(),rects:[]};e.importScopeRef={current:scope};e.importSeqRef={current:0};e.pendingNodeRef={current:null};e.openPendingNodeWithoutSelectionRef={current:false};e.deepFocusRef={current:false};
 e.projects=[{key:'tree:old',members:[{id:'old'}]}];e.works=[];e.textNodesReady=true;for(const s of ['video','director','character','scene','audio','timeline'])e[s+'NodesStore']={ready:true};e.setSelectedId=()=>{};e.setFocusId=()=>{};e.setBrowsing=()=>{};let opened=null;e.setActiveKey=k=>opened=k;let batches=[];e.setImageImports=f=>batches=f(batches);e.pushAddUndoMany=()=>{};
 const file=new File(['test'],'fixture.png',{type:'image/png'});e.prepareImageUploads=async()=>[{width:200,height:100,file,uploadBytes:file.size}];e.adaptiveCanvasImageSize=()=>({width:200,height:100});e.placeGenerationPreview=p=>p;e.uploadFormData=async()=>({id:'new'});
 e.synchronizeCanvasArtworks=async(ids,read,current)=>{assert.ok(current());return read()};const ctx=vm.createContext(e);
 vm.runInContext(transpile('globalThis.consume='+pendingEffect+';\n'+functions.uploadRoot+'\nglobalThis.run=uploadRoot;'),ctx);
 e.mergeWorks=ctx.mergeWorks=async()=>{ctx.consume(); // unrelated projects update, before artwork GET completes
   if(switched)ctx.importScopeRef.current={rootId:null,queue:Promise.resolve(),rects:[]};
   await settle();ctx.works=[{id:'new',image:'/media/new.png'}];ctx.projects=[...ctx.projects,{key:'tree:new',members:ctx.works}];ctx.consume();return ctx.works;};
 e.setWorks=ctx.setWorks=f=>{ctx.works=f(ctx.works);queueMicrotask(()=>ctx.consume());};
 const ids=await ctx.run([file]);await settle();assert.equal(ids.length,1);assert.equal(batches[0].success,1);assert.equal(batches[0].finished,true);
 if(switched){assert.equal(opened,null);checks.push('BACKGROUND_UPLOAD_AFTER_PROJECT_SWITCH_DOES_NOT_NAVIGATE');}
 else if(baseline){assert.equal(opened,null);checks.push('BASELINE_UPLOAD_SAVED_BUT_PENDING_NAVIGATION_CONSUMED_BEFORE_GET');}
 else {assert.equal(opened,'tree:new');checks.push('SAVED_UPLOAD_OPENS_PROJECT_AFTER_SYNC_WITHOUT_REFRESH');}
 return{opened,batch:batches[0]};
}
async function pendingUploadCase(){
 const e=env(),file=new File(['test'],'fixture.png',{type:'image/png'});let pends=[{id:'pend-1',inputs:[],x:0,y:0}],uploads=0,choose=0,synced=false,allowSync=false;
 e.pendNodes=pends;e.pendUploadTargetRef={current:'pend-1'};e.pendUploadRef={current:{value:'chosen',click:()=>choose++}};e.pendUploadReceiptsRef={current:new Map()};e.importScopeRef={current:{}};e.pendingNodeRef={current:null};
 e.setPendNodes=f=>pends=f(pends);e.setSelectedPendId=()=>{};e.activeRootId=()=>null;e.setWorks=f=>f([]);e.pushAddUndo=()=>{};e.consumePendingNodeHistory=()=>{};e.setGenError=()=>{};
 e.uploadFormData=async()=>{uploads++;return{id:'uploaded'}};e.mergeWorks=async()=>{if(!allowSync)throw Error('delayed sync');synced=true;return[{id:'uploaded',image:'/media/a.png'}]};e.synchronizeCanvasArtworks=async(ids,read)=>read();
 const ctx=vm.createContext(e);vm.runInContext(transpile(functions.synchronizePendUpload+'\n'+functions.onPendUpload+'\n'+functions.doUploadPend+'\nglobalThis.run=doUploadPend;globalThis.retry=onPendUpload;'),ctx);
 await ctx.run([file]);assert.equal(uploads,1);assert.equal(pends.length,1);assert.equal(pends[0].uploading,false);assert.equal(ctx.pendingNodeRef.current,null);assert.equal(ctx.pendUploadReceiptsRef.current.size,1);
 allowSync=true;ctx.retry('pend-1');await settle();assert.equal(synced,true);assert.equal(uploads,1);assert.equal(choose,0);assert.equal(pends.length,0);assert.equal(ctx.pendingNodeRef.current,'uploaded');assert.equal(ctx.pendUploadReceiptsRef.current.size,0);checks.push('UPLOADED_PENDING_NODE_RETRIES_SYNC_ONLY_NO_SECOND_UPLOAD');return{uploads,choose,synced};
}
async function cancelledBatchCase(){
 const e=env(),helper=fs.readFileSync(path.join(root,'src/lib/canvas/reverse-prompt-batch.ts'),'utf8'),m={exports:{}};vm.runInNewContext(transpile(helper),{...e,exports:m.exports});let active=true,calls=0,settled=[];
 const r=await m.exports.runReversePromptBatch([1,2,3,4,5],{canStart:()=>active,request:async i=>{calls++;active=false;return'ok'+i},settle:async x=>{settled.push(x);return true},failureMessage:'empty',cancelledMessage:'context switched'});
 assert.equal(calls,1);assert.equal(r.outcomes.length,5);assert.equal(r.succeeded,1);assert.equal(r.failed,4);assert.ok(r.outcomes.slice(1).every(o=>o.status==='failed'&&o.error==='context switched'));checks.push('CONTEXT_SWITCH_STOPS_UNSTARTED_REQUESTS_AND_RECORDS_EACH_INPUT');
}
(async()=>{let result=baseline?'REPRODUCED':'PASS',data;try{data={reverse:await reverseCase(),upload:await uploadCase()};if(!baseline){data.switched=await uploadCase(true);data.pending=await pendingUploadCase();await cancelledBatchCase();}}catch(e){failures.push(e.stack);result='FAIL'}
 const exit=baseline||failures.length?1:0;fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({result,checks,failures,data,loaded,exit,supplierCalls:0},null,2));console.log(`CANVAS_UPLOAD_REVERSE=${result} CHECKS=${checks.length} FAILED=${failures.length} SUPPLIER_CALLS=0 EXIT=${exit}`);if(failures.length)console.error(failures.join('\n'));process.exitCode=exit;})();
