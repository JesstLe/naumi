// Execute unchanged AST-extracted CanvasClient functions and complete helpers.
// React/persistence/inner generation boundaries are fixtures; no HTTP is used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(arg('--source-root',path.join(__dirname,'..'))),out=path.resolve(arg('--output-root',path.join(root,'output/canvas-text-prompt-reuse-functions')));
const checks=[],errors=[],loaded=new Map(),extracted=new Map(),plain=value=>JSON.parse(JSON.stringify(value));
const forbidden=name=>()=>{throw Error('UNEXPECTED_BOUNDARY:'+name)};
function read(relative){const file=path.join(root,relative),bytes=fs.readFileSync(file);loaded.set(relative,{file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});return bytes.toString('utf8');}
const transpile=(source,file)=>ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const source=read('src/components/canvas/canvas-client.tsx'),ast=ts.createSourceFile('canvas-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};
(function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)functions[node.name.text]=node.getText(ast);ts.forEachChild(node,visit)})(ast);
const globals={console,Date,Math,Map,Set,WeakMap,Promise,Error,JSON,Array,Buffer,URL,File,Blob,Response,Request,Headers,FormData,AbortController,AbortSignal,TextEncoder,TextDecoder,structuredClone,queueMicrotask,setTimeout,clearTimeout,crypto:crypto.webcrypto,fetch:forbidden('network'),privateFetch:forbidden('model HTTP')};
function moduleLoader(){const context=vm.createContext(globals),cache=new Map();function load(relative){
 if(cache.has(relative))return cache.get(relative).exports;
 const mod={exports:{}};cache.set(relative,mod);
 const localRequire=id=>{const base=id.startsWith('@/')?'src/'+id.slice(2):id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(relative),id)):null;if(!base)return require(id);for(const ext of ['','.ts','.tsx','/index.ts'])if(fs.statSync(path.join(root,base+ext),{throwIfNoEntry:false})?.isFile())return load(base+ext);throw Error('MODULE_NOT_FOUND:'+base)};
 vm.runInContext('(function(require,module,exports){'+transpile(read(relative),relative)+'\n})',context,{filename:relative})(localRequire,mod,mod.exports);return mod.exports;
 }return{load};}
const modules=moduleLoader(),helpers={...modules.load('src/lib/canvas/linked-image-text.ts'),...modules.load('src/lib/canvas/prepare-linked-image-text.ts'),...modules.load('src/lib/canvas/image-node-drafts.ts'),...modules.load('src/lib/canvas/image-reference-drafts.ts')};
function compile(names,environment){
 for(const name of names){assert.ok(functions[name],'real source function exists: '+name);extracted.set(name,crypto.createHash('sha256').update(functions[name]).digest('hex'));}
 const context=vm.createContext({...globals,...helpers,...environment});
 vm.runInContext(transpile(names.map(name=>functions[name]).join('\n')+'\nglobalThis.actions={'+names.join(',')+'};','canvas-extracted-actions.tsx'),context);
 return context.actions;
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};}
async function until(predicate,label){for(let i=0;i<100;i++){if(predicate())return;await new Promise(setImmediate)}throw Error('FIXTURE_WAIT_EXHAUSTED:'+label);}
async function check(name,run){await run();checks.push(name);console.log('CHECK='+name);}
const account='owner@fixture.test',workspace='personal',project='tree:fixture';

function pendingFixture(){
 const initial={id:'pend-a',parentId:'text-a',inputs:['text-a'],x:40,y:80,uploading:false,generating:false,label:'图片'};
 const state={nodes:[initial],text:[{id:'text-a',projectKey:project,title:'正文',content:'before',prompt:'AI instruction',status:'completed',targetIds:[]}],inner:[],errors:[],flushed:[],pending:new Set(['text-a']),unsaved:new Set(['text-a']),locked:false,workspace,externalCurrent:true,flushGate:null};
 const refs={nodes:{current:state.nodes},text:{current:state.text},account:{current:account},project:{current:{key:project}},epoch:{current:1},operations:{current:new Set()},queues:{current:new Map()},deleting:{current:false},history:{current:false}};
 const env={readOnly:false,user:{email:account},selectedPendId:'pend-a',editPrompt:'direction',pendNodes:[],pendNodesRef:refs.nodes,textNodesRef:refs.text,
  canvasAccountRef:refs.account,activeProjectRef:refs.project,canvasContextEpochRef:refs.epoch,currentWorkspace:()=>state.workspace,generationOperationRef:refs.operations,nodeDeletingRef:refs.deleting,historyBusyRef:refs.history,isNodeLocked:()=>state.locked,
  unsavedTextRef:{current:state.unsaved},textSaveQueuesRef:refs.queues,
  textAutosave:{flush:async id=>{state.flushed.push(id);state.pending.delete(id);if(state.flushGate)await state.flushGate.promise;state.unsaved.delete(id);return refs.text.current.find(node=>node.id===id)||null},hasPending:id=>state.pending.has(id)},
  generatePreparedPend:async options=>{state.inner.push(options);return true},setGenError:error=>state.errors.push(error),generationTasksRef:{current:[]},
 };
 const actions=compile(['prepareImageText','generatePend','deletableCanvasIds'],env);
 return{state,refs,initial,actions,hold:()=>{state.flushGate=deferred();return state.flushGate},replace:patch=>{state.nodes=refs.nodes.current.map(node=>node.id===initial.id?{...node,...patch}:node);refs.nodes.current=state.nodes;}};
}

async function pendingChecks(){
 await check('REAL_PENDING_WRAPPER_AWAITS_ACK_AND_IGNORES_DOUBLE_CLICK',async()=>{
  const f=pendingFixture(),ack=f.hold(),run=f.actions.generatePend();
  await until(()=>f.state.flushed.length===1,'flush started');
  assert.equal(f.state.inner.length,0);assert.equal(await f.actions.generatePend(),false);assert.equal(f.state.flushed.length,1);
  assert.deepEqual(Array.from(f.actions.deletableCanvasIds(['pend-a'])),[],'preparing node cannot be deleted');
  f.refs.text.current=[{...f.refs.text.current[0],content:'latest complete body'}];ack.resolve();
  assert.equal(await run,true);assert.equal(f.state.inner.length,1);assert.equal(f.state.inner[0].linked.prompt,'latest complete body\n\ndirection');
  assert.deepEqual(plain(f.state.inner[0].linked.sources),[{id:'text-a',title:'正文',content:'latest complete body'}]);
  assert.equal(f.refs.operations.current.size,0);assert.deepEqual(f.state.errors,[]);
 });
 await check('REAL_PENDING_WRAPPER_WAITS_EXISTING_SAVE_QUEUE',async()=>{
  const f=pendingFixture(),queue=deferred();
  f.refs.queues.current.set('text-a',queue.promise.then(()=>{f.refs.queues.current.delete('text-a')}));
  const run=f.actions.generatePend();await until(()=>f.state.flushed.length===1,'queued flush');
  await new Promise(setImmediate);assert.equal(f.state.inner.length,0);queue.resolve();assert.equal(await run,true);assert.equal(f.state.inner.length,1);
 });
 for(const kind of ['account','project','workspace','epoch','caller'])await check('REAL_PENDING_SCOPE_CHANGE_'+kind.toUpperCase()+'_ZERO_INNER',async()=>{
  const f=pendingFixture(),ack=f.hold(),run=f.actions.generatePend({isCurrent:()=>f.state.externalCurrent});await until(()=>f.state.flushed.length===1,'scope barrier');
  if(kind==='account')f.refs.account.current='other@fixture.test';if(kind==='project')f.refs.project.current={key:'tree:other'};if(kind==='workspace')f.state.workspace='enterprise:other';if(kind==='epoch')f.refs.epoch.current++;if(kind==='caller')f.state.externalCurrent=false;
  ack.resolve();assert.equal(await run,false);assert.equal(f.state.inner.length,0);assert.deepEqual(f.state.errors,[]);assert.equal(f.refs.operations.current.size,0);
 });
 for(const kind of ['deleted','add-input','cut-input','parent','uploading','generating','needs-attention','locked','deleting','history'])await check('REAL_PENDING_CHANGED_'+kind.toUpperCase()+'_ZERO_INNER',async()=>{
  const f=pendingFixture(),ack=f.hold(),run=f.actions.generatePend();await until(()=>f.state.flushed.length===1,'mutation barrier');
  if(kind==='deleted')f.refs.nodes.current=[];
  if(kind==='add-input')f.replace({inputs:['text-a','image-new']});
  if(kind==='cut-input')f.replace({inputs:[]});
  if(kind==='parent')f.replace({parentId:'text-other'});
  if(kind==='uploading')f.replace({uploading:true});if(kind==='generating')f.replace({generating:true});if(kind==='needs-attention')f.replace({needsAttention:true});
  if(kind==='locked')f.state.locked=true;if(kind==='deleting')f.refs.deleting.current=true;if(kind==='history')f.refs.history.current=true;
  ack.resolve();assert.equal(await run,false);assert.equal(f.state.inner.length,0);assert.match(f.state.errors.at(-1),/图片节点或连线已变更/);assert.equal(f.refs.operations.current.size,0);
 });
 await check('REAL_PENDING_LATER_EDIT_PENDING_AFTER_ACK_ZERO_INNER',async()=>{
  const f=pendingFixture(),ack=f.hold(),run=f.actions.generatePend();await until(()=>f.state.flushed.length===1,'edit barrier');
  f.refs.text.current=[{...f.refs.text.current[0],content:'second edit'}];f.state.pending.add('text-a');ack.resolve();
  assert.equal(await run,false);assert.equal(f.state.inner.length,0);assert.match(f.state.errors.at(-1),/尚未保存/);
 });
 await check('REAL_PENDING_INTERNAL_FROZEN_RECIPE_IS_NOT_COMPOSED_TWICE',async()=>{
  const f=pendingFixture(),recipe='before\n\ndirection';
  assert.equal(await f.actions.generatePend({prompt:recipe,frozenTextPrompt:recipe,forceStandard:true}),true);
  assert.equal(f.state.inner.length,1);assert.equal(f.state.inner[0].linked.prompt,recipe);assert.equal(f.state.inner[0].linked.sources[0].content,'before');
  assert.deepEqual(f.state.flushed,['text-a'],'frozen dialog recipe still crosses real source save barrier');
 });
 await check('REAL_PENDING_NEW_OPTIONS_NODE_ACCEPTED_FROM_REF_BEFORE_STATE_RENDER',async()=>{
  const f=pendingFixture(),newPend={...f.initial,id:'pend-new'};f.refs.nodes.current=[newPend];
  assert.equal(await f.actions.generatePend({pend:newPend,prompt:''}),true);assert.equal(f.state.inner.length,1);
  assert.equal(f.state.inner[0].pend.id,'pend-new');assert.equal(f.state.inner[0].linked.prompt,'before');
 });
 await check('REAL_PENDING_LATEST_TEXT_DISAPPEARANCE_OR_GENERATION_ZERO_INNER',async()=>{
  for(const change of ['missing','generating']){
   const f=pendingFixture(),ack=f.hold(),run=f.actions.generatePend();await until(()=>f.state.flushed.length===1,'text validity barrier');
   f.refs.text.current=change==='missing'?[]:[{...f.refs.text.current[0],status:'generating'}];ack.resolve();
   assert.equal(await run,false);assert.equal(f.state.inner.length,0);assert.match(f.state.errors.at(-1),change==='missing'?/已失效/:/仍在生成/);
  }
 });
}

function uploadFixture(){
 const state={nodes:[{id:'pend-upload',inputs:[],x:10,y:20,uploading:false,prompt:'pending metadata'}],errors:[],seeds:[],copies:[],history:[],selected:'pend-upload',syncCalls:0,fail:false,syncGate:null};
 const scope={},draftScope=helpers.imageDraftScope(account,null,project,workspace),draftKey=id=>helpers.imageDraftKey(draftScope,id);
 const artwork=Object.freeze({id:'art-upload',image:'/uploaded.png',title:'Uploaded',prompt:'immutable upload provenance',groupId:'fixture'});
 const drafts=new helpers.ImageNodeDraftStore();let urls=0;const references=new helpers.ImageReferenceDraftStore({createObjectURL:()=>`blob:fixture-${++urls}`,revokeObjectURL:()=>{}});
 drafts.write(draftKey('pend-upload'),{prompt:'editable pending direction',ratio:'3:4',hiddenReferenceIds:['hidden']});
 references.add(draftKey('pend-upload'),[{key:'upload:reference',file:new File(['fixture'],'reference.png',{type:'image/png'})}]);
 const receipt={artworkId:artwork.id,account,workspace,revision:1,scope,draftScope,draftProject:project};
 const refs={account:{current:account},scope:{current:scope},pending:{current:null},receipts:{current:new Map([['pend-upload',receipt]])},works:{current:[artwork]}};
 const env={canvasAccountRef:refs.account,currentWorkspace:()=>workspace,currentWorkspaceRevision:()=>1,importScopeRef:refs.scope,pendingNodeRef:refs.pending,pendUploadReceiptsRef:refs.receipts,worksRef:refs.works,user:{email:account},targetEmail:null,
  setPendNodes:update=>{state.nodes=update(state.nodes)},setSelectedPendId:update=>{state.selected=update(state.selected)},setGenError:error=>state.errors.push(error),setWorks:update=>{refs.works.current=update(refs.works.current)},
  synchronizeCanvasArtworks:async(ids,read,current)=>{state.syncCalls++;assert.deepEqual(Array.from(ids),[artwork.id]);if(state.syncGate)await state.syncGate.promise;if(state.fail)throw Error('fixture sync failed');return read()},
  mergeWorks:async()=>[artwork],projectKey:()=>project,
  imageDraft:{read:(id,scope)=>drafts.read(helpers.imageDraftKey(scope,id)),seed:(id,patch,scope)=>{state.seeds.push({id,patch:plain(patch),scope});drafts.write(helpers.imageDraftKey(scope,id),patch)}},
  referenceDraft:{copyTo:(target,source)=>{state.copies.push({target,source});references.copy(source,target)}},
  consumePendingNodeHistory:id=>state.history.push({consume:id}),pushAddUndo:(id,rows)=>state.history.push({add:id,rows:plain(rows)}),
 };
 return{state,refs,receipt,artwork,drafts,references,draftKey,draftScope,run:compile(['synchronizePendUpload'],env).synchronizePendUpload};
}

async function uploadChecks(){
 await check('REAL_UPLOAD_SYNC_MIGRATES_EDITABLE_DRAFT_NOT_ARTWORK_PROMPT',async()=>{
  const f=uploadFixture(),before=JSON.stringify(f.artwork);await f.run('pend-upload',f.receipt);
  assert.equal(f.drafts.read(f.draftKey(f.artwork.id)).prompt,'editable pending direction');assert.equal(f.drafts.read(f.draftKey(f.artwork.id)).ratio,'3:4');
  assert.deepEqual(plain(f.drafts.read(f.draftKey(f.artwork.id)).hiddenReferenceIds),['hidden']);assert.equal(JSON.stringify(f.artwork),before);
  assert.equal(f.references.read(f.draftKey(f.artwork.id)).length,1);assert.notEqual(f.references.read(f.draftKey(f.artwork.id))[0].url,f.references.read(f.draftKey('pend-upload'))[0].url);
  assert.equal(f.state.nodes.length,0);assert.equal(f.refs.receipts.current.size,0);assert.equal(f.refs.pending.current,f.artwork.id);assert.equal(f.state.selected,null);
  assert.equal(f.state.seeds.length,1);assert.equal(f.state.copies.length,1);assert.equal(f.state.history.length,2);
 });
 await check('REAL_UPLOAD_SYNC_PRESERVES_NEWER_DESTINATION_EDIT',async()=>{
  const f=uploadFixture();f.drafts.write(f.draftKey(f.artwork.id),{prompt:'newer destination direction'});await f.run('pend-upload',f.receipt);
  assert.equal(f.drafts.read(f.draftKey(f.artwork.id)).prompt,'newer destination direction');assert.equal(f.drafts.read(f.draftKey(f.artwork.id)).ratio,'3:4');assert.equal(f.artwork.prompt,'immutable upload provenance');
 });
 await check('REAL_UPLOAD_FAILED_SYNC_RETAINS_PENDING_AND_RECEIPT_THEN_MIGRATES_ON_RETRY',async()=>{
  const f=uploadFixture();f.state.fail=true;await f.run('pend-upload',f.receipt);
  assert.equal(f.state.nodes.length,1);assert.equal(f.state.nodes[0].id,'pend-upload');assert.equal(f.state.nodes[0].uploading,false);assert.equal(f.state.nodes[0].progress,100);
  assert.equal(f.refs.receipts.current.get('pend-upload'),f.receipt);assert.equal(f.state.seeds.length,0);assert.equal(f.state.copies.length,0);assert.equal(f.state.history.length,0);
  assert.equal(f.drafts.read(f.draftKey('pend-upload')).prompt,'editable pending direction');assert.deepEqual(plain(f.drafts.read(f.draftKey(f.artwork.id))),{});assert.match(f.state.errors[0],/无需重新上传/);
  f.state.fail=false;await f.run('pend-upload',f.receipt);assert.equal(f.state.nodes.length,0);assert.equal(f.state.seeds.length,1);assert.equal(f.state.syncCalls,2);
 });
 for(const when of ['before','during'])await check('REAL_UPLOAD_ACCOUNT_CHANGE_'+when.toUpperCase()+'_ZERO_MIGRATION',async()=>{
  const f=uploadFixture();let run;
  if(when==='before'){f.refs.account.current='other';run=f.run('pend-upload',f.receipt)}
  else{f.state.syncGate=deferred();run=f.run('pend-upload',f.receipt);await until(()=>f.state.syncCalls===1,'upload sync');f.refs.account.current='other';f.state.syncGate.resolve()}
  await run;assert.equal(f.state.seeds.length,0);assert.equal(f.state.copies.length,0);assert.equal(f.state.history.length,0);assert.equal(f.state.nodes.length,1);assert.equal(f.refs.receipts.current.size,1);
  assert.equal(f.state.syncCalls,when==='before'?0:1);assert.deepEqual(plain(f.drafts.read(f.draftKey(f.artwork.id))),{});
 });
 await check('REAL_UPLOAD_PROJECT_NAVIGATION_ZERO_DRAFT_MIGRATION',async()=>{
  const f=uploadFixture();f.refs.scope.current={};await f.run('pend-upload',f.receipt);
  assert.equal(f.state.seeds.length,0);assert.equal(f.state.copies.length,0);assert.equal(f.state.nodes.length,1);assert.equal(f.refs.pending.current,null);
 });
}

async function historyChecks(){
 await check('REAL_IMAGE_VERSION_UNDO_REDO_KEEP_EDITABLE_PROMPT_DRAFT',async()=>{
  const historyScope='fixture-history',draftScope=helpers.imageDraftScope(account,null,project,workspace),key=helpers.imageDraftKey(draftScope,'art-version'),drafts=new helpers.ImageNodeDraftStore();
  drafts.write(key,{prompt:'my reusable editable draft',ratio:'3:4'});
  const act={kind:'image-version',id:'art-version',from:{versionId:'version-old',image:'/old.png',prompt:'old provenance'},to:{versionId:'version-new',image:'/new.png',prompt:'new provenance'}};
  const state={works:[{id:act.id,image:act.to.image,prompt:act.to.prompt,canvasImageVersionId:act.to.versionId,canvasImageRevision:2}],posts:[],merges:[],target:act.from};
  const worksRef={current:state.works},noopStore={flush:async()=>{},getNode:()=>undefined,refresh:forbidden('unrelated history refresh')};
  const env={canvasAccountRef:{current:account},currentWorkspace:()=>workspace,currentWorkspaceRevision:()=>1,historyScope,historyScopeRef:{current:historyScope},historyAttemptsRef:{current:new WeakMap()},activeKey:project,
   textAutosave:{flushAll:async()=>{}},textSaveQueuesRef:{current:new Map()},videoNodesStore:noopStore,directorNodesStore:noopStore,characterNodesStore:noopStore,sceneNodesStore:noopStore,audioNodesStore:noopStore,timelineNodesStore:noopStore,
   worksRef,generationOperationRef:{current:new Set()},browserRandomUUID:()=>crypto.randomUUID(),t:value=>value,
   privateFetchRaw:async(url,init)=>{assert.equal(url,'/api/canvas/history');state.posts.push(JSON.parse(init.body));return{ok:true}},expectJsonOk:async value=>value,
   setWorks:update=>{state.works=update(state.works);worksRef.current=state.works},mergeWorks:async(ids,current)=>{assert.equal(current(),true);state.merges.push(Array.from(ids));state.works=state.works.map(art=>({...art,image:state.target.image,prompt:state.target.prompt,canvasImageVersionId:state.target.versionId,canvasImageRevision:art.canvasImageRevision+1}));worksRef.current=state.works;return state.works},
   unsavedTextRef:{current:new Set()},setUnsavedTextCount:()=>{},imageDraft:{setPrompt:forbidden('history overwrites draft'),seed:forbidden('history replaces draft'),read:()=>drafts.read(key)},selected:{id:act.id},
  };
  const action=compile(['applyHistory'],env).applyHistory,before=JSON.stringify(drafts.read(key));
  await action(act,true);assert.equal(state.posts[0].operations[0].versionId,act.from.versionId);assert.equal(state.works[0].prompt,'old provenance');assert.equal(JSON.stringify(drafts.read(key)),before);
  state.target=act.to;await action(act,false);assert.equal(state.posts[1].operations[0].versionId,act.to.versionId);assert.equal(state.works[0].prompt,'new provenance');assert.equal(JSON.stringify(drafts.read(key)),before);
  assert.deepEqual(state.merges,[[act.id],[act.id]]);assert.notEqual(state.posts[0].operationId,state.posts[1].operationId);
 });
}

(async()=>{
 try{await pendingChecks();await uploadChecks();await historyChecks()}catch(error){errors.push(error.stack||String(error))}
 const status=errors.length?'FAIL':'PASS',exit=errors.length?1:0,stdout=`CANVAS_TEXT_PROMPT_REUSE_FUNCTIONS=${status} CHECKS=${checks.length} FAILED=${errors.length} SUPPLIER_CALLS=0 NETWORK_CALLS=0 EXIT=${exit}`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'MODIFIED.json'),JSON.stringify({status,checks,errors,loaded:[...loaded].map(([relative,meta])=>({relative,...meta})),extractedFunctions:[...extracted].map(([name,sha256])=>({name,sha256})),stdout,exit,evidence:'Unmodified AST-extracted CanvasClient functions; complete linked text and draft-store modules; React, save, inner-generation and history persistence boundaries are fixtures.'},null,2));
 console.log(stdout);if(errors.length)console.error(errors.join('\n'));process.exitCode=exit;
})();
