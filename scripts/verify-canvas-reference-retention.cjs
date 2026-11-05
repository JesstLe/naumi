'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('esbuild'),ts=require('typescript');
const mode=process.argv[2]||'MODIFIED',root=path.resolve(process.argv[3]||'.'),out=path.resolve(process.argv[4]||process.env.REFERENCE_RETENTION_EVIDENCE||'output/reference-retention');
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};
function visit(node){if(ts.isFunctionDeclaration(node)&&['generateSelectedImage','prepareImageText'].includes(node.name?.text))functions[node.name.text]=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
const isModified=mode==='MODIFIED',moduleFile='src/lib/canvas/image-reference-drafts.ts';
// The Canvas adapter now delegates to the real creation and request owners.
// Fixture only image-byte reads and the transport boundary, never inline copies.
let lib;
async function loadOwners(){
 const built=await esbuild.build({stdin:{contents:`export*from'./src/lib/canvas/input-references';export*from'./src/lib/canvas/image-references';export*from'./src/lib/canvas/image-creation';export*from'./src/lib/canvas/image-task-request';${isModified?"export*from'./src/lib/canvas/image-reference-drafts';export*from'./src/lib/canvas/image-node-drafts';export*from'./src/lib/canvas/background-generation';export*from'./src/lib/canvas/linked-image-text';export*from'./src/lib/canvas/prepare-linked-image-text';":''}`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')],plugins:[{name:'local-image-bytes',setup(build){build.onResolve({filter:/browser-image-cache$/},()=>({path:'image-bytes',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const readBrowserImage=async url=>new Blob([url==='/media/A.png'?'IMAGE_A':'IMAGE_B'],{type:'image/png'});",loader:'js'}));}}]});
 const loaded={exports:{}};vm.runInThisContext('(function(module,exports,require){'+built.outputFiles[0].text+'\n})')(loaded,loaded.exports,require);lib=loaded.exports;
}
const A={id:'A',image:'/media/A.png',title:'当前详情图A',prompt:'只修改标题，其他保持不变',source:'generate',parentId:'B',parentIds:['B'],width:800,height:600,ratio:'4:3'},B={id:'B',image:'/media/B.png',title:'产品参考B',source:'upload'};
const originalInputBytes=JSON.stringify([A,B]);
let checks=0;const check=action=>{action();checks++;};
function referenceFixture({connected=true,uploaded=false,legacy=false,removeCurrent=false,flush,generate}={}){
 const selected=connected?structuredClone(A):{...A,source:'canvas-add',parentId:null,parentIds:[]},refs=lib.canvasRegenerationReferences(selected,[selected,B]).filter(ref=>!removeCurrent||ref.id!==A.id),file=new File(['IMAGE_U'],'reference.png',{type:'image/png'});
 const candidates=refs.map(art=>({key:'node:'+art.id,sourceNodeId:art.id,title:art.title,url:art.image}));if(uploaded)candidates.push({key:'upload:U',title:file.name,url:'blob:fixture',file});
 const saved=legacy?[{key:'node:B',number:1,role:'edit-target'}]:[],resolved=lib.resolveCanvasImageReferences(candidates,saved,isModified&&!removeCurrent?'node:A':undefined),state={forms:[],errors:[],complete:0,flushes:0,serviceCaptures:0,generateCalls:0,epoch:0,submitted:0,operationKeys:[],textAcks:[]},environment={workspace:'personal'};let fixture;
 const c={selected,editPrompt:selected.prompt,generationMode:'standard',genRatio:'auto',genStyle:'',genCount:1,genResolution:'1K',visibleDockRefs:refs,extraFiles:uploaded?[file]:[],composerReferences:resolved.references,dockReferenceState:{error:''},referenceError:null,executeCanvasImageCreation:lib.executeCanvasImageCreation,setGenError:error=>{if(error)state.errors.push(error);}};
 Object.assign(c,{canvasAccountRef:{current:JSON.stringify(['reference-fixture@example.test','reference-fixture@example.test'])},currentWorkspace:()=>environment.workspace,activeProjectRef:{current:{key:'tree:A'}},canvasContextEpochRef:{current:0},imageSubmissionRef:{current:new Map()},
  beginCanvasImageSubmission:lib.beginCanvasImageSubmission,canvasImageSubmissionKey:lib.canvasImageSubmissionKey,newCanvasImageAttempt:lib.newCanvasImageAttempt,
  setImageSubmissionEpoch:update=>{state.epoch=update(state.epoch);},flushImagePrompts:async()=>{state.flushes++;await flush?.(fixture);}});
 // The real preparation wrapper reads an explicitly empty text document.
 // ACK and existence ports remain visible fixtures, not a skipped prepare step.
 Object.assign(c,{resolveLinkedImageText:lib.resolveLinkedImageText,prepareLinkedImageText:lib.prepareLinkedImageText,
  textWriteBarrierRef:{current:false},historyBusyRef:{current:false},isNodeLocked:()=>false,
  textAutosave:{flush:async()=>{throw Error('Unexpected text source in empty reference fixture');},hasPending:()=>false},textTasks:{state:()=>({busy:false})},
  canvasTextDocument:{getSnapshot:()=>({nodes:[]}),hasUnsaved:()=>false,flush:async ids=>{assert.deepEqual(Array.from(ids),[]);state.textAcks.push([]);}},
  canvasArtworkDocument:{getSnapshot:()=>({nodes:[selected,B]}),get scope(){
   const account=c.canvasAccountRef.current,workspace=environment.workspace,project=c.activeProjectRef.current.key,epoch=c.canvasContextEpochRef.current;
   return {account,workspace,project,viewCurrent:()=>account===c.canvasAccountRef.current&&workspace===environment.workspace&&project===c.activeProjectRef.current.key&&epoch===c.canvasContextEpochRef.current};
  }},
 });
 c.canvasImageCreationServices=()=>{state.serviceCaptures++;return {isCurrent:()=>true,rename:async()=>{},detail:async()=>{throw Error('Unexpected detail operation');},generate:async(source,prompt,options)=>{
  state.generateCalls++;state.operationKeys.push(options.operationKey);
  const scope={owner:'reference-fixture@example.test',project:'tree:A',assertCurrent(){}};
  const form=await lib.prepareCanvasImageTask({kind:'derived',scope,operationKey:options.operationKey||'node:A',position:{x:20,y:30},prompt,source,options,models:[],model:'',quality:'medium',referenceInputs:options.referenceInputs});state.forms.push(form);await generate?.({fixture,options,form});state.complete++;return [{id:'result',url:'/media/result.png',width:800,height:600}];
 }};};
 vm.createContext(c);vm.runInContext(ts.transpileModule(Object.values(functions).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);fixture={c,state,environment,run:()=>c.generateSelectedImage(()=>state.submitted++)};return fixture;
}
async function submit(options){
 const {c,state}=referenceFixture(options);await c.generateSelectedImage();assert.deepEqual(state.errors,[]);assert.equal(state.forms.length,1);assert.equal(state.complete,1);
 const form=state.forms[0];return {images:await Promise.all(form.getAll('image').map(file=>file.text())),manifest:JSON.parse(String(form.get('canvasReferences'))),target:form.get('canvasTargetNode'),targetImage:form.get('canvasTargetImage'),revision:form.get('canvasTargetRevision')};
}
function gate(){let resolve;return {promise:new Promise(r=>resolve=r),resolve};}
async function preparationCases(){
 const cases=[];const test=async(name,work)=>{await work();cases.push(name);};
 await test('held-flush-keeps-original-single-flight-before-request',async()=>{
  const entered=gate(),release=gate(),f=referenceFixture({flush:async()=>{entered.resolve();await release.promise;}}),running=f.run();await entered.promise;
  check(()=>assert.equal(f.state.flushes,1));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,1));check(()=>assert.equal(f.state.epoch,1));check(()=>assert.equal(f.state.generateCalls,0));
  await f.run();check(()=>assert.equal(f.state.flushes,1));check(()=>assert.equal(f.state.serviceCaptures,0));release.resolve();await running;
  check(()=>assert.equal(f.state.forms.length,1));check(()=>assert.equal(f.state.complete,1));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));check(()=>assert.equal(f.state.epoch,2));
  check(()=>assert.match(String(f.state.forms[0].get('imagegenNodeId')),/^node:A:attempt:[a-f0-9-]{36}$/));
 });
 await test('rejected-flush-unlocks-without-generation-and-allows-explicit-new-submit',async()=>{
  const f=referenceFixture({flush:()=>{throw vm.runInContext('new Error("prompt save failed")',f.c);}});await f.run();
  check(()=>assert.deepEqual(f.state.errors,['prompt save failed']));check(()=>assert.equal(f.state.generateCalls,0));check(()=>assert.equal(f.state.serviceCaptures,0));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));check(()=>assert.equal(f.state.epoch,2));
  f.state.errors=[];f.c.flushImagePrompts=async()=>{f.state.flushes++;};await f.run();check(()=>assert.equal(f.state.forms.length,1));check(()=>assert.equal(f.state.complete,1));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));
 });
 for(const kind of ['account','workspace','project','epoch','account-ABA','workspace-ABA','project-ABA'])await test('flush-'+kind+'-fences-before-creation-port',async()=>{
  const f=referenceFixture({flush:()=>{
   const account=f.c.canvasAccountRef.current,workspace=f.environment.workspace,project=f.c.activeProjectRef.current;
   if(kind.startsWith('account'))f.c.canvasAccountRef.current='other-account';
   if(kind.startsWith('workspace'))f.environment.workspace='tenant:other';
   if(kind.startsWith('project'))f.c.activeProjectRef.current={key:'tree:other'};
   if(kind==='epoch'||kind.endsWith('-ABA'))f.c.canvasContextEpochRef.current++;
   if(kind.endsWith('-ABA')){f.c.canvasAccountRef.current=account;f.environment.workspace=workspace;f.c.activeProjectRef.current=project;f.c.canvasContextEpochRef.current++;}
  }});await f.run();check(()=>assert.equal(f.state.flushes,1));check(()=>assert.equal(f.state.serviceCaptures,0));check(()=>assert.equal(f.state.generateCalls,0));check(()=>assert.equal(f.state.forms.length,0));check(()=>assert.deepEqual(f.state.errors,[]));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));check(()=>assert.equal(f.state.epoch,2));
 });
 await test('original-ack-then-new-submit-keeps-new-token-through-old-finally',async()=>{
  const ack=gate(),oldComplete=gate(),secondFlush=gate(),secondEntered=gate();
  const f=referenceFixture({flush:async()=>{if(f.state.flushes===2){secondEntered.resolve();await secondFlush.promise;}},generate:async({options})=>{if(f.state.generateCalls===1){options.onSubmitted();ack.resolve();await oldComplete.promise;}}});
  const original=f.run();await ack.promise;check(()=>assert.equal(f.state.submitted,1));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));check(()=>assert.equal(f.state.epoch,2));
  const newer=f.run();await secondEntered.promise;check(()=>assert.equal(f.c.imageSubmissionRef.current.size,1));check(()=>assert.equal(f.state.epoch,3));oldComplete.resolve();await original;
  check(()=>assert.equal(f.c.imageSubmissionRef.current.size,1));check(()=>assert.equal(f.state.epoch,3));check(()=>assert.equal(f.state.generateCalls,1));secondFlush.resolve();await newer;
  check(()=>assert.equal(f.state.forms.length,2));check(()=>assert.equal(f.state.complete,2));check(()=>assert.equal(f.state.submitted,1));check(()=>assert.equal(f.c.imageSubmissionRef.current.size,0));check(()=>assert.equal(f.state.epoch,4));
  check(()=>assert.equal(new Set(f.state.operationKeys).size,2));for(const key of f.state.operationKeys)check(()=>assert.match(key,/^node:A:attempt:[a-f0-9-]{36}$/));
 });
 await test('original-reference-nodes-are-not-mutated',async()=>{check(()=>assert.equal(JSON.stringify([A,B]),originalInputBytes));});
 return cases;
}
async function main(){
 fs.mkdirSync(out,{recursive:true});await loadOwners();const connected=await submit(),unconnected=await submit({connected:false}),upload=await submit({uploaded:true});
 if(!isModified){assert.deepEqual(connected.images,['IMAGE_B']);assert.deepEqual(unconnected.images,[]);assert.deepEqual(upload.images,['IMAGE_B','IMAGE_U']);assert.ok(!fs.existsSync(path.join(root,moduleFile)));assert.match(source,/setExtraFiles\(\[\]\)/);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({mode,connected,unconnected,upload,missingCurrentA:true,selectionClearsUploads:true,paidCalls:0},null,2));console.log(`${mode}_REFERENCE_RETENTION=REPRODUCED CURRENT_A=OMITTED CONNECTED=B UNCONNECTED=NONE UPLOAD_DESELECT=CLEARED EXIT=0`);return;}
 check(()=>assert.deepEqual(connected.images,['IMAGE_A','IMAGE_B']));check(()=>assert.deepEqual(unconnected.images,['IMAGE_A']));check(()=>assert.deepEqual(upload.images,['IMAGE_A','IMAGE_B','IMAGE_U']));check(()=>assert.equal(connected.target,'A'));check(()=>assert.equal(connected.targetImage,A.image));check(()=>assert.equal(connected.revision,'0'));check(()=>assert.equal(connected.manifest[0].role,'edit-target'));check(()=>assert.equal(connected.manifest[0].sourceNodeId,'A'));
 const migrated=await submit({legacy:true});check(()=>assert.deepEqual(migrated.images,['IMAGE_A','IMAGE_B']));check(()=>assert.deepEqual(migrated.manifest.map(ref=>[ref.number,ref.role]),[[2,'edit-target'],[1,'reference']]));
 const removed=await submit({removeCurrent:true});check(()=>assert.deepEqual(removed.images,['IMAGE_B']));
 const candidates=[{key:'node:A',url:A.image,title:'A'},{key:'node:B',url:B.image,title:'B'}],initial=lib.resolveCanvasImageReferences(candidates,[],'node:A'),explicit=lib.changeImageReferenceRole(initial.bindings,'node:B','edit-target'),referenceOnly=lib.changeImageReferenceRole(initial.bindings,'node:A','reference');
 check(()=>assert.equal(lib.resolveCanvasImageReferences(candidates,explicit,'node:A').references[0].key,'node:B'));check(()=>assert.ok(lib.resolveCanvasImageReferences(candidates,referenceOnly,'node:A').references.every(ref=>ref.role!=='edit-target')));check(()=>assert.deepEqual(lib.resolveCanvasImageReferences(candidates.slice(1),initial.bindings,'node:A').references.map(ref=>ref.key),['node:B']));check(()=>assert.deepEqual(lib.canvasGenerationReferences(A,[A,B]).map(art=>art.id),['B','A']));
 const fifteen=Array.from({length:15},(_,i)=>({...B,id:'ref-'+i}));check(()=>assert.equal(lib.canvasRegenerationReferences({...A,parentId:null,parentIds:fifteen.map(ref=>ref.id)},[A,...fifteen]).length,16));check(()=>assert.throws(()=>lib.canvasRegenerationReferences({...A,parentId:'B',parentIds:fifteen.map(ref=>ref.id)},[A,B,...fifteen])));check(()=>assert.throws(()=>lib.canvasRegenerationReferences(A,[A])));check(()=>assert.equal(lib.canvasRegenerationReferences({...A,source:'canvas-add',parentIds:[]},[A,B]).length,1));
 const created=[],revoked=[],store=new lib.ImageReferenceDraftStore({createObjectURL:file=>{const url='blob:'+created.length;created.push({url,file});return url;},revokeObjectURL:url=>revoked.push(url)}),file=new File(['actual file'],'u.png',{type:'image/png'}),one='owner|personal|project-A|A',two='owner|personal|project-A|B';
 store.add(one,[{key:'upload:1',file}]);check(()=>assert.equal(store.read(one)[0].file,file));check(()=>assert.equal(store.read(two).length,0));check(()=>assert.equal(store.read(null).length,0));check(()=>assert.equal(revoked.length,0));store.add(two,[{key:'upload:2',file}]);store.remove(one,'upload:1');check(()=>assert.equal(store.read(one).length,0));check(()=>assert.equal(store.read(two).length,1));check(()=>assert.deepEqual(revoked,['blob:0']));store.clear();check(()=>assert.deepEqual(revoked,['blob:0','blob:1']));store.clear();check(()=>assert.equal(revoked.length,2));
 const revokedOnFailure=[],failing=new lib.ImageReferenceDraftStore({createObjectURL:file=>{if(file.name==='bad')throw Error('URL unavailable');return 'blob:good';},revokeObjectURL:url=>revokedOnFailure.push(url)});check(()=>assert.throws(()=>failing.add(one,[{key:'good',file},{key:'bad',file:new File(['x'],'bad')}])));check(()=>assert.equal(failing.read(one).length,0));check(()=>assert.deepEqual(revokedOnFailure,['blob:good']));
 const personal=lib.imageDraftScope('A@EXAMPLE.TEST',null,'project'),tenant=lib.imageDraftScope('A@EXAMPLE.TEST',null,'project','tenant:1');check(()=>assert.equal(personal,JSON.stringify(['a@example.test','a@example.test','project'])));check(()=>assert.notEqual(personal,tenant));const memory=new Map(),drafts=new lib.ImageNodeDraftStore(()=>({getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)})),draftKey=lib.imageDraftKey(personal,'A');drafts.write(draftKey,{hiddenReferenceIds:['A'],referenceBindings:initial.bindings});check(()=>assert.deepEqual(new lib.ImageNodeDraftStore(()=>({getItem:key=>memory.get(key)||null,setItem(){}})).read(draftKey).hiddenReferenceIds,['A']));check(()=>assert.deepEqual(drafts.read(lib.imageDraftKey(tenant,'A')),{}));
 check(()=>assert.ok(!source.includes('setExtraFiles([])')));check(()=>assert.match(source,/referenceDraft\.uploads/));check(()=>assert.match(source,/referenceDraft\.remove\(ref.key\)/));check(()=>assert.match(source,/restoreReferences=/));check(()=>assert.match(fs.readFileSync(path.join(root,'src/components/canvas/image-composer.tsx'),'utf8'),/Restore node references/));
 const originalReferenceChecks=checks,preparation=await preparationCases();
 const result={mode,checks,originalReferenceChecks,preparationCases:preparation,preparationChecks:checks-originalReferenceChecks,actualSubmissionOwners:true,connected,unconnected,upload,migrated,explicitRemove:removed,originalInputsNotMutated:true,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),paidCalls:0,scope:'actual Canvas primary adapter + linked-text preparation + creation/request/submission owners; explicitly empty text document ACK and artwork existence ports; mutable captured identity, image-byte and request transport fixtures; not post-acceptance ABA/PG/browser/supplier/billing proof'};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(`MODIFIED_REFERENCE_RETENTION=PASS CHECKS=${checks} CURRENT_A=EDIT_TARGET CONNECTED=A+B UPLOAD=A+B+U LEGACY_LABELS=STABLE EXPLICIT_CHOICES=PRESERVED DRAFT_OWNER_WORKSPACE_NODE=ISOLATED URL_RELEASE=PASS VERSION_TARGET=PRESERVED PAID_CALLS=0 EXIT=0`);console.log(`REFERENCE_PREPARATION=PASS CASES=${preparation.length} CHECKS=${result.preparationChecks} ORIGINAL_REFERENCE_CHECKS=${originalReferenceChecks} ACTUAL_SUBMISSION_OWNERS=1 EXTERNAL_NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
