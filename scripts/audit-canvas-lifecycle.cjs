require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const baseline=process.argv.includes('--baseline');
const root=process.cwd(),sourceRoot=path.resolve(process.argv[2]||root),out=path.resolve(process.env.LIFECYCLE_OUT||'output/canvas-lifecycle-audit47-20261019');
function functions(file){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,99,true,4),fn={};function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);return fn}
const fn=functions(sourceRoot+'/src/components/canvas/canvas-client.tsx'),editor=functions(sourceRoot+'/src/components/canvas/annotate-editor.tsx');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(){let nodes=[],calls=0,notices=[],panel='A',closes=0;const c={...require(root+'/src/lib/canvas/generation-feedback.ts'),rfNodes:[],editTaskStateRef:{current:new Map()},pendNodesRef:{current:[]},generationTasks:[],generationTaskPosRef:{current:{}},...require(root+'/src/lib/canvas/generation-failure.ts'),ImagegenHttpError:require(root+'/src/lib/imagegen/http.ts').ImagegenHttpError,Error,readOnly:false,user:{email:'fixture'},canvasAccountRef:{current:'fixture'},canvasContextEpochRef:{current:1},activeProjectRef:{current:{key:'project-A'}},generationOperationRef:{current:new Set()},generationChecksRef:{current:new Set()},rfRef:{current:{getNode:()=>({position:{x:10,y:20}}),getNodes:()=>[]}},flowNodeSize:()=>({width:320}),artworkNodeSize:()=>({width:320}),X_GAP:40,browserRandomUUID:()=>String(++calls),window:{setInterval:()=>1,clearInterval:()=>{}},setPendNodes:f=>{nodes=typeof f==='function'?f(nodes):f;c.pendNodesRef.current=nodes},readJsonSafe:r=>r.json(),livePendingPosition:(_,fallback)=>fallback,privateFetchRaw:async()=>Response.json({ok:true}),mergeWorks:async()=>[{id:'result-A',image:'/a.png'}],pushAddUndo:()=>{},applyServerUser:()=>{},flashTip:s=>notices.push(s),annotateArtwork:{id:'source-A'},setAnnotateArtwork:()=>{panel=null;closes++},ocrRequestEpochRef:{current:0},setOcrArtworkId:()=>{},setOcrSegments:()=>{},setOcrStatus:()=>{},resetImportScope:()=>{},setSelectedId:()=>{},setSelectedPendId:()=>{},setSelectedTextId:()=>{},setCreatingNew:()=>{},setBrowsing:()=>{},setSidebarOpen:()=>{},localStorage:{setItem:()=>{}},setActiveKey:key=>{c.activeProjectRef.current={key};c.canvasContextEpochRef.current++}};
 vm.createContext(c);vm.runInContext(compile(['landEditResult','submitAnnotations','openProject','restoreEditTasks','rememberGenerationDrag','onPendRemove'].map(n=>fn[n]||'').join('\n')),c);
 return {c,switchProject:key=>{c.openProject(key);if(!baseline)c.restoreEditTasks()},nodes:()=>nodes,panel:()=>panel,selectPanel:id=>panel=id,closes:()=>closes,notices};
}
async function main(){const rows=[];
 for(const mode of ['stay','switch-after-error','switch-before-error']){
  const s=setup(),wait=deferred();const running=s.c.landEditResult({id:'source-A'},()=>wait.promise,'扩图');
  assert.equal(s.nodes().length,1);
  if(mode==='switch-before-error')s.switchProject('project-B');
  wait.resolve(Response.json({error:'fixture accepted state unknown',code:'OPERATION_PENDING',operationId:'tool-fixture'},{status:409}));await running;
  if(mode==='switch-after-error'){assert.equal(s.nodes()[0].generationFailure.kind,'uncertain');s.switchProject('project-B')}
  if(mode!=='stay')s.switchProject('project-A');
  assert.equal(s.c.generationOperationRef.current.size,1);assert.equal(s.nodes().length,mode==='stay'||!baseline?1:0);
  let repeated=0;await s.c.landEditResult({id:'source-A'},async()=>{repeated++;return Response.json({id:'result-A'})},'扩图');assert.equal(repeated,0);
  rows.push({id:mode,classification:mode==='stay'||!baseline?'CONTROL_PASS':'CONFIRMED_DEFECT',placeholderCount:s.nodes().length,lockRetained:true,newSubmitBlocked:true});
 }
 for(const success of [true,false]){
  const s=setup(),wait=deferred();let background;
  s.c.privateFetch=()=>wait.promise;
  const e={Error,console,Promise,File,FormData,Blob,imgRef:{current:{}},natW:10,natH:10,submitting:false,items:[{id:'mark',type:'rect',note:'fixture edit'}],artwork:{id:'source-A'},noteRefs:{current:{}},setError:()=>{},setSubmitting:()=>{},drawAnnotations:()=>{},document:{createElement:()=>({getContext:()=>({drawImage:()=>{}}),toBlob:cb=>cb(new Blob(['fixture bytes'],{type:'image/png'}))})},onClose:()=>s.c.setAnnotateArtwork(null),onSubmitted:form=>{background=s.c.submitAnnotations(form);return background}};
  vm.createContext(e);vm.runInContext(compile(editor.submit),e);await e.submit();assert.equal(s.closes(),1,'actual editor closes immediately by design');assert.equal(s.panel(),null);assert.equal(s.nodes().length,1);
  s.selectPanel('B');wait.resolve(Response.json(success?{id:'result-A'}:{error:'fixture unknown'},{status:success?200:502}));await background;
  assert.equal(s.panel(),success&&baseline?null:'B');assert.equal(s.closes(),success&&baseline?2:1);
  rows.push({id:success?'old-success-closes-new-editor':'old-failure-keeps-new-editor',classification:success&&baseline?'CONFIRMED_DEFECT':'CONTROL_PASS',editorClosedAtSubmit:true,newEditorAfterOldCompletion:s.panel(),closeCalls:s.closes()});
 }
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sourceRoot,cases:rows,remainingBugGroups:baseline?2:0,annotationImmediateClose:'EXPECTED_DESIGN',providerCalls:0},null,2));
 for(const row of rows)console.log(JSON.stringify(row));
 console.log(`LIFECYCLE_AUDIT=PASS CASES=${rows.length} REMAINING_BUG_GROUPS=${baseline?2:0} REAL_EDITOR_SUBMIT=YES SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
