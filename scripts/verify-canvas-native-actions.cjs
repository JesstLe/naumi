/** Actual Canvas entrypoints and bindings + actual application owners. Only
 * document/storage/geometry I/O ports are fixtures; no copied command rules. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];},root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||process.env.NATIVE_ACTIONS_EVIDENCE||'output/canvas-native-actions');
fs.mkdirSync(out,{recursive:true});const file='src/components/canvas/canvas-client.tsx',source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,4),functions={},bindings=[];
(function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['referenceAssetPorts','characterActions','sceneNodeActions','directorActions','videoNodeActions'].includes(d.name.getText(ast))))bindings.push(n.getText(ast));ts.forEachChild(n,visit);})(ast);
const names=['nativeNodeLocation','revealNativeNode','nativeReferenceDraft','openVideoNodeFromSelection','openVideoEditor','patchVideoNode','createCharacterNode','openCharacterEditor','patchCharacterNode','uploadCharacterReferences','generateCharacterReference','createSceneNode','openSceneEditor','patchSceneNode','uploadSceneReferences','generateSceneReference','createDirectorNode','openDirectorEditor','patchDirectorNode','sendDirectorOutput'];
const compile=code=>ts.transpileModule(code,{compilerOptions:{module:1,target:9}}).outputText;
async function bundle(){const files=['character/project','scene/project','director/project','video/client-settings','canvas/generation-feedback',...(!baseline?['canvas/reference-asset-actions','canvas/director-actions','canvas/video-node-actions']:[])];return (await build({stdin:{contents:files.map(f=>`export * from './src/lib/${f}';`).join('\n'),resolveDir:root,loader:'ts'},platform:'node',format:'cjs',bundle:true,write:false,plugins:[{name:'uuid-only',setup(b){b.onResolve({filter:/browser-crypto$/},()=>({path:'uuid',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const browserRandomUUID=()=>__uuid();'}));}}]})).outputFiles[0].text;}
function setup(code){
 let serial=0;const uuid=()=>`12345678-1234-4234-a234-${String(++serial).padStart(12,'0')}`,m={exports:{}},nodes=new Map(),state={actor:'A',workspace:'personal',project:'tree:A',epoch:1,mounted:true,saved:[],history:[],reveal:[],notices:[],selectionRequests:[],uploads:[],merges:[],drafts:[],attached:[],positions:[],refresh:0,loading:false,readonly:false,locked:false,failPosition:false,conflict:false};
 const definition={modelId:'video',providerId:'provider',definition:{modes:['text','single_image','reference'],durationResolutionMap:[{durations:[5],resolutions:['720p']}],aspectRatios:['16:9'],sources:{}}};
 const scope=()=>{const actor=state.actor,workspace=state.workspace,project=state.project,epoch=state.epoch;return {account:actor,workspace,project,key:JSON.stringify([actor,workspace,project]),documentCurrent:()=>state.mounted&&actor===state.actor&&workspace===state.workspace,viewCurrent:()=>state.mounted&&actor===state.actor&&workspace===state.workspace&&epoch===state.epoch,assertView(){if(!this.viewCurrent())throw Error('fixture stale view');}};};
 const c={module:m,exports:m.exports,require,console,Buffer,FormData,File,Blob,Headers,Response,Request,URL,Promise,Error,Map,Set,WeakMap,structuredClone,JSON,Date,Math,crypto:{randomUUID:uuid},__uuid:uuid,
  locale:'zh',get readOnly(){return state.readonly},user:{email:'fixture@test'},nodeSettingsReady:true,isNodeLocked:()=>state.locked,L:(zh,en)=>zh,canFeature:()=>true,
  canvasAccountRef:{get current(){return state.actor}},canvasContextEpochRef:{get current(){return state.epoch}},activeProjectRef:{get current(){return {key:state.project}}},
  active:{key:'tree:A'},activeKey:'tree:A',browsing:false,creatingNew:false,multiSel:['image'],selectedId:'image',selectedTextId:null,selected:{prompt:'original prompt'},
  videoInputChoices:[{id:'image',nodeId:'image',kind:'image',value:'/media/image.png',available:true}],videoNodeCreatePending:{current:false},directorCreating:{current:false},characterCreating:{current:false},sceneCreating:{current:false},directorOutputAttempts:{current:new WeakMap()},
  centerScreen:()=>({x:15,y:25}),canvasAreaRef:{current:{getBoundingClientRect:()=>({left:5,top:7})}},rfRef:{current:{screenToFlowPosition:p=>p,getNodes:()=>[]}},flowNodeSize:()=>({width:320,height:236}),NODE_W:320,NODE_H:236,
  setActiveKey:key=>state.reveal.push(['project',key]),setCreatingNew(){},setBrowsing(){},setSelectedId:id=>state.reveal.push(['selected',id]),setSelectedTextId(){},setSelectedPendId(){},setMultiSel(){},setPropertiesOpen(){},setVideoDockAdvancedId(){},setCharacterEditorId(){},setSceneEditorId(){},setDirectorEditorId(){},setVideoNodeCreateBusy(){},flashTip:message=>state.notices.push(message),pushUndo:action=>state.history.push(action),
  imageDraft:{seed:(id,draft)=>state.drafts.push({id,...draft})},setGenCount(){},wantFocusPendPrompt:{current:false},focusEditableCanvasArea(){},
  pendingPresentation:{set:f=>{c.pendNodes=f(c.pendNodes)}},pendNodes:[],setPendNodes:f=>{c.pendNodes=f(c.pendNodes)},
  addPendAtScreen:()=>{const p={id:'pend-'+uuid(),x:0,y:0,inputs:[]};c.pendNodes.push(p);return p},
  videoCreationCatalogRef:{get current(){return {models:[definition],loading:state.loading,error:'',refresh:async()=>state.refresh++}}},
  DirectorClientError:class extends Error{constructor(code){super(code);this.code=code;}},
 };
 const change=patch=>{Object.assign(state,patch);state.epoch++;};
 const merge=async ids=>{state.merges.push([...ids]);if(state.onMerge)await state.onMerge();return ids.map(id=>({id,image:'/media/'+id+'.png',canvasX:state.positioned?1:null,canvasY:state.positioned?2:null}));};
 c.mergeWorks=merge;
 c.videoAssetStore={upload:async(files,project)=>{const id='asset-'+state.actor+'-'+(state.uploads.length+1);state.uploads.push({actor:state.actor,project,names:files.map(f=>f.name),bytes:await Promise.all(files.map(f=>f.text()))});return [{nodeId:id,kind:'image',value:'/media/'+id+'.png'}];}};
 const position=async()=>{if(state.failPosition){state.failPosition=false;return Response.json({error:'fixture position lost'},{status:503});}state.positioned=true;return Response.json({ok:true});};
 c.privateFetchRaw=async(url,init)=>{state.positions.push(JSON.parse(init.body));return position();};
 c.canvasDocumentFetch=async(s,url,init)=>{s.assertView();state.positions.push(JSON.parse(init.body));return position();};c.expectJsonOk=async response=>{if(!response.ok)throw Error('fixture position lost');return response.json();};
 for(const kind of ['character','scene','director','video']){
  const store={getNode:id=>nodes.get(id),flush:async()=>{},save:async(id,patch)=>{state.saved.push({kind,id,patch:structuredClone(patch)});if(state.onSave)await state.onSave();const node={id,projectKey:state.project,x:30,y:40,width:360,height:260,revision:3,outputs:[],...nodes.get(id),...patch};nodes.set(id,node);return node;},refresh:async()=>{state.refresh++;},attachOutput:async(id,artworkId,kind,revision,operationId)=>{state.attached.push({actor:state.actor,id,artworkId,kind,revision,operationId});if(state.conflict){state.conflict=false;nodes.set(id,{...nodes.get(id),revision:revision+1});throw new c.DirectorClientError('DIRECTOR_REVISION_CONFLICT');}return nodes.get(id);}};c[kind+'NodesStore']=store;
 }
 vm.createContext(c);vm.runInContext(code,c);Object.assign(c,m.exports);c.browserRandomUUID=uuid;
 vm.runInContext(compile(names.filter(n=>functions[n]).map(n=>functions[n]).join('\n')),c);
 // Selection is a separate view-owner port. Record its navigation request,
 // just as the legacy setter port above; selection rules have their own suite.
 c.canvasSelection={selectInProject:(project,patch)=>{assert.equal(project,state.project);state.selectionRequests.push({project,patch});}};
 if(!baseline){c.characterActionsOwner=c.createCanvasReferenceAssetActions('character');c.sceneActionsOwner=c.createCanvasReferenceAssetActions('scene');c.directorActionsOwner=c.createCanvasDirectorActions();c.videoNodeActionsOwner=c.createCanvasVideoNodeActions();}
 function render(){c.canvasHistory={scope:scope()};c.canvasArtworkDocument={scope:c.canvasHistory.scope};c.active={key:state.project};c.activeKey=state.project;if(!baseline)vm.runInContext(compile('(()=>{'+bindings.join('\n')+';Object.assign(globalThis,{referenceAssetPorts,characterActions,sceneNodeActions,directorActions,videoNodeActions});})();'),c);}
 render();return {c,state,nodes,change,render};
}
const plain=v=>JSON.parse(JSON.stringify(v));
(async()=>{const code=await bundle(),rows=[];let checks=0;const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
 for(const kind of ['character','scene','director','video']){
  const f=setup(code),create=()=>kind==='video'?f.c.openVideoNodeFromSelection(false,{x:10,y:20}):f.c['create'+kind[0].toUpperCase()+kind.slice(1)+'Node']({x:10,y:20});
  await create();eq(f.state.saved.length,1,kind+' one native write');eq(f.state.history.length,1,kind+' one history');eq(f.state.reveal.length,2,kind+' original view reveal');
  const id=f.state.saved[0].id;if(!baseline&&source.includes('canvasSelection.selectInProject'))eq(f.state.selectionRequests,[{project:'tree:A',patch:{selectedId:id,selectedTextId:null,selectedPendId:null,multiSel:[]}}],kind+' delegates destination selection to view owner');await f.c['patch'+kind[0].toUpperCase()+kind.slice(1)+'Node'](id,{title:'edited',expectedRevision:3});eq(f.state.saved[1].patch.expectedRevision,3,kind+' explicit CAS');
  rows.push({kind,scenario:'create-patch',saved:f.state.saved,history:f.state.history,reveal:f.state.reveal});
  const late=setup(code);late.state.onSave=async()=>late.change({project:'tree:B'});await (kind==='video'?late.c.openVideoNodeFromSelection(true,{x:10,y:20}):late.c['create'+kind[0].toUpperCase()+kind.slice(1)+'Node']({x:10,y:20}));
  eq(late.state.reveal.length,baseline&&kind==='video'?2:0,kind+' no late navigation');rows.push({kind,scenario:'late-project',reveal:late.state.reveal.length});
 }
 for(const kind of ['character','scene']){
  const f=setup(code),definition=kind==='character'?f.c.newCharacterProject('Character'):f.c.newSceneProject('Scene'),variant=kind==='character'?definition.appearances[0]:definition.states[0];variant.referenceArtworkIds=['image'];f.nodes.set(kind,{id:kind,projectKey:'tree:A',x:1,y:2,width:360,height:260,[kind]:definition});
  await f.c['upload'+kind[0].toUpperCase()+kind.slice(1)+'References'](kind,[new File(['original bytes'],'ref.png',{type:'image/png'})]);
  await f.c['generate'+kind[0].toUpperCase()+kind.slice(1)+'Reference'](kind,definition,variant.id);eq(f.state.uploads.length,1,'one original asset upload');eq(f.state.drafts.length,1,'one draft, no paid generation');rows.push({kind,scenario:'reference',uploads:f.state.uploads,drafts:f.state.drafts,pending:f.c.pendNodes});
 }
 const d=setup(code),file=new File(['director output'],'output.png',{type:'image/png'});d.nodes.set('director',{id:'director',projectKey:'tree:A',x:1,y:2,width:360,height:260,revision:3,outputs:[]});d.state.failPosition=true;
 await assert.rejects(d.c.sendDirectorOutput('director',file,'image',3));checks++;await d.c.sendDirectorOutput('director',file,'image',3);eq(d.state.uploads.length,1,'position retry uses original artwork');eq(d.state.history.length,1,'one add history');eq(d.state.positions[0].operationId,d.state.positions[1].operationId,'position retry retains original op');
 d.change({actor:'B'});d.render();await d.c.sendDirectorOutput('director',file,'image',3);eq(d.state.uploads.length,baseline?1:2,'same File isolated by account');eq(d.state.attached.at(-1).artworkId.startsWith('asset-B-'),!baseline,'no cross-account artwork adoption');rows.push({kind:'director',scenario:'same-file-account',uploads:d.state.uploads.length});
 const v=setup(code);v.state.loading=true;await v.c.openVideoNodeFromSelection();eq(v.state.saved.length,0,'loading catalog does not queue creation');eq(v.state.refresh,0,'loading catalog does not refresh twice');
 eq(bindings.length,baseline?0:5,'actual React bindings moved');eq(source.includes('directorOutputAttempts=useRef'),baseline,'output attempt state moved');
 const common=rows.filter(row=>['create-patch','reference'].includes(row.scenario)),compare=arg('--compare');if(compare){const old=JSON.parse(fs.readFileSync(compare,'utf8'));eq(common,old.common,'original native payload/history/reference trace exact');}
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,cases:rows.length+1,checks,common,rows,actualCanvas:true,supplier:0,db:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2));
 console.log(`CANVAS_NATIVE_ACTIONS=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${report.cases} CHECKS=${checks} ACTUAL_CANVAS=1 PAYLOAD_HISTORY_REFERENCE=${compare?'EXACT':'CAPTURED'} LATE_VIDEO_NAVIGATION=${baseline?1:0} CROSS_ACCOUNT_FILE_REUSE=${baseline?1:0} DB=0 SUPPLIER=0`);
})().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack},null,2));console.error(error);process.exitCode=1;});
