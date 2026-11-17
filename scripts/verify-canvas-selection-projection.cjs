'use strict';
// Actual old/current page declarations, complete menu IIFE and property JSX.
// Real React SSR components; feature/action ports are explicit local fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback,root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.SELECTION_PROJECTION_EVIDENCE||'output/canvas-selection-projection')),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),source=read('src/components/canvas/canvas-client.tsx'),sf=ts.createSourceFile('canvas.tsx',source,99,true,4);
let component,menu,properties,oldKinds;const functions={};
(function walk(n){
 if(ts.isFunctionDeclaration(n)&&n.name){functions[n.name.text]=n.getText(sf);if(n.name.text==='CanvasClient')component=n;}
 if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.statements.some(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(sf)==='menu'))&&n.getText(sf).includes('ContextMenuSurface'))menu=n.getText(sf);
 if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(sf)==='NodePropertiesPanel'||ts.isJsxSelfClosingElement(n)&&n.tagName.getText(sf)==='NodePropertiesPanel'){
  let p=n;while(ts.isBinaryExpression(p.parent))p=p.parent;properties=p.getText(sf);
 }
 ts.forEachChild(n,walk);
})(sf);
assert.ok(component&&menu&&properties,'actual complete component projection boundaries');
const focusNames=new Set(['selectedScene','selectedAudio','selectedTimeline','selectedCharacter','selectedDirector','selectedVideo','selected','selectedPend','selectedText','selectionCatalogue','selectionTargets','selectedProperties']);
const boundNames=n=>ts.isIdentifier(n)?[n.text]:ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n)?n.elements.flatMap(e=>ts.isBindingElement(e)?boundNames(e.name):[]):[];
const focus=component.body.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>boundNames(d.name).some(n=>focusNames.has(n)))).map(n=>n.getText(sf)).join('\n');
const controller=read('src/lib/canvas/selection-controller.ts'),csf=ts.createSourceFile('controller.ts',controller,99,true,3);
(function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(csf)==='kinds')oldKinds=n.initializer.getText(csf);ts.forEachChild(n,walk);})(csf);
const owned=fs.existsSync(path.join(root,'src/lib/canvas/selection-projection.ts'));assert.equal(owned,!baseline);
const plain=x=>JSON.parse(JSON.stringify(x)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1,jsx:ts.JsxEmit.React}}).outputText;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;};
const kinds=['video','director','character','scene','audio','timeline'];
const native=(kind,extra={})=>({id:kind+'-a',projectKey:'A',title:kind,width:500+kinds.indexOf(kind)*10,height:250,deletedAt:null,...extra});
const art=(id='art-a',extra={})=>({id,title:id,image:'/media/'+id+'.png',width:1200,height:800,canvasWidth:420,canvasHeight:280,source:'canvas-add',...extra});
const text=(extra={})=>({id:'text-a',projectKey:'A',title:'Text',width:340,height:260,content:'原文【图1】',prompt:'原提示词',...extra});
const pending={id:'pend-a',inputs:[],label:'Pending',generating:false,uploading:false};
function fixture(patch={}){return {name:'base',project:'A',artworks:[art(),art('art-b')],text:[text()],pending:[{...pending}],...Object.fromEntries(kinds.map(k=>[k,[native(k)]])),selectedId:null,selectedTextId:null,selectedPendId:null,ctxId:undefined,readOnly:false,ready:true,historySaving:false,localEditBusy:false,browsing:false,propertiesOpen:true,multi:[],english:false,...patch};}
function scenarios(){const rows=[fixture({name:'empty-focus'})];
 for(const kind of ['art','text','pending',...kinds])rows.push(fixture({name:'focus-'+kind,[kind==='text'?'selectedTextId':kind==='pending'?'selectedPendId':'selectedId']:kind==='pending'?'pend-a':kind+'-a',ctxId:kind==='pending'?'pend-a':kind+'-a'}));
 for(const kind of kinds)for(const deleted of [false,true])rows.push(fixture({name:kind+'-foreign-deleted-'+deleted,project:'B',[kind]:[native(kind,{deletedAt:deleted?'2026-10-31':null})],selectedId:kind+'-a',ctxId:kind+'-a'}));
 rows.push(fixture({name:'deleted-video-focus-vs-context',video:[native('video',{deletedAt:'2026-10-31'})],selectedId:'video-a',ctxId:'video-a'}));
 rows.push(fixture({name:'foreign-text-focus-vs-context',text:[text({projectKey:'B'})],selectedTextId:'text-a',ctxId:'text-a'}));
 rows.push(fixture({name:'independent-focus-ids',selectedId:'art-a',selectedTextId:'text-a',selectedPendId:'pend-a',ctxId:'video-a'}));
 for(const kind of ['art','text',...kinds])for(const mode of ['readOnly','notReady','historyBusy','localBusy'])rows.push(fixture({name:kind+'-'+mode,[kind==='text'?'selectedTextId':'selectedId']:kind+'-a',ctxId:kind+'-a',readOnly:mode==='readOnly',ready:mode!=='notReady',historySaving:mode==='historyBusy',localEditBusy:mode==='localBusy'}));
 rows.push(fixture({name:'image-result-video',artworks:[art('art-a',{videoUrl:'/video.mp4'})],selectedId:'art-a',ctxId:'art-a'}));
 rows.push(fixture({name:'no-original-size',artworks:[art('art-a',{width:0,height:0})],selectedId:'art-a',ctxId:'art-a'}));
 rows.push(fixture({name:'intrinsic-size-only',artworks:[art('art-a',{canvasWidth:null,canvasHeight:null,width:800,height:1600})],selectedId:'art-a',ctxId:'art-a'}));
 rows.push(fixture({name:'first-match-art',artworks:[art('art-a',{title:'first'}),art('art-a',{title:'second'})],selectedId:'art-a',ctxId:'art-a'}));
 for(const kind of kinds)rows.push(fixture({name:'first-match-'+kind,[kind]:[native(kind,{title:'first'}),native(kind,{title:'second'})],selectedId:kind+'-a',ctxId:kind+'-a'}));
 const priority=['text','art',...kinds];for(let start=0;start<priority.length;start++){
  const present=new Set(priority.slice(start)),all=fixture({name:'collision-priority-'+start,selectedId:'same',selectedTextId:'same',ctxId:'same',artworks:present.has('art')?[art('same')]:[],text:present.has('text')?[text({id:'same'})]:[]});
  for(const kind of kinds)all[kind]=present.has(kind)?[native(kind,{id:'same'})]:[];rows.push(all);
 }
 rows.push(fixture({name:'batch-art',selectedId:'art-a',ctxId:'art-a',multi:['art-a','art-b']}));
 rows.push(fixture({name:'mixed-selection',selectedId:'video-a',ctxId:'video-a',multi:['video-a','text-a']}));
 rows.push(fixture({name:'failed-task',ctxId:'task-failed',tasks:[{id:'task-failed',failure:{code:'FAILED'},replaceNode:false}]}));
 rows.push(fixture({name:'replacing-failed-task',ctxId:'task-failed',tasks:[{id:'task-failed',failure:{code:'FAILED'},replaceNode:true}]}));
 rows.push(fixture({name:'unknown-context',ctxId:'missing'}));
 rows.push(fixture({name:'closed-properties',selectedId:'art-a',ctxId:'text-a',propertiesOpen:false}));
 rows.push(fixture({name:'browsing',selectedTextId:'text-a',browsing:true}));
 rows.push(fixture({name:'english',selectedTextId:'text-a',ctxId:'character-a',english:true}));
 rows.push(fixture({name:'empty-workspace',project:null,noActive:true,artworks:[],text:[],pending:[],...Object.fromEntries(kinds.map(k=>[k,[]]))}));
 return rows;
}
async function main(){
 const files=['src/lib/canvas/selection.ts','src/lib/canvas/node-geometry.ts','src/components/canvas/node-properties-panel.tsx','src/components/canvas/context-menu-surface.tsx','src/lib/canvas/node-settings.ts','src/components/canvas/node-menu-items.ts',...(owned?['src/lib/canvas/selection-projection.ts']:[])];
 const built=await build({stdin:{contents:files.map(p=>'export * from '+JSON.stringify(path.join(root,p))+';').join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':path.join(root,'src')},external:['react','react-dom','react-dom/server','react/jsx-runtime'],metafile:true});
 const loaded=[...new Set(['src/components/canvas/canvas-client.tsx','src/lib/canvas/selection-controller.ts',...Object.keys(built.metafile.inputs).filter(p=>p!=='<stdin>').map(p=>path.relative(root,path.resolve(p)))])].filter(p=>!p.startsWith('..'));
 const sourceHashes=Object.fromEntries(loaded.map(p=>[p,hash(path.join(root,p))])),module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const api=module.exports,rows=[];
 for(const config of scenarios()){
  freeze(config);const originalInput=JSON.stringify(config);
  const calls=[],record=(name,...values)=>{calls.push([name,...values]);return Promise.resolve(true);};
  const c={React,console,Map,Set,...api,Item:api.ContextMenuItem,useMemo:f=>f(),activeKey:config.project,active:config.noActive?null:{members:config.artworks},textNodes:config.text,pendNodes:config.pending,selectedId:config.selectedId,selectedTextId:config.selectedTextId,selectedPendId:config.selectedPendId,
   propertiesOpen:config.propertiesOpen,browsing:config.browsing,readOnly:config.readOnly,nodeSettingsReady:config.ready,textNodesReady:config.ready,historySaving:config.historySaving,localEditBusy:config.localEditBusy,batchRunBusy:false,selectionRunCount:config.multi.length,
   ctxMenu:{nodeId:config.ctxId,x:10,y:20,cx:30,cy:40},generationTasks:config.tasks||[],multiSel:config.multi,
   selectedBatchArts:config.multi.length>1?config.artworks.filter(a=>config.multi.includes(a.id)):[],selectedBatchIds:config.multi.filter(id=>config.artworks.some(a=>a.id===id)),selectedBatchAllMarked:false,selectedBatchCanvasGroupId:null,
   nodeSettings:{},DEFAULT_CANVAS_SETTINGS:api.defaultNodeSettings(),lightCanvas:true,locale:config.english?'en':'zh',isMac:false,hasClip:true,undoStack:[],redoStack:[],promptMining:false,stitching:false,zipping:false,assistBusy:false,videoNodeCreateDisabled:false,
   t:k=>k,L:(zh,en)=>config.english?en:zh,shortcut:k=>'Ctrl+'+k,canFeature:()=>true,isNodeLocked:id=>!!config.locked,
   FeatureVisible:({children})=>children,commitNodeSettings:(id,settings)=>record('save-settings',id,settings),setPropertiesOpen:value=>record('properties-open',value),setCtxMenu:value=>record('context-close',value),
   localEdits:{openCrop:a=>record('crop',a.id)},canvasLocalEditContext:()=>({scope:'fixture'}),requestReplace:a=>record('replace',a.id),
   nodeManagementItems:id=>[{id:'manage',label:'manage:'+id,onSelect:()=>record('manage',id)}],
   clipboard:{copySelection:ids=>record('copy',ids),copyArtwork:node=>record('copy-artwork',node.id),copyImage:node=>record('copy-image',node.id),paste:()=>record('paste')},downloads:{image:url=>record('download-image',url)},contextSelectionBaseRef:{current:[]},
   setSelectedId:id=>record('focus-art',id),setSelectedPendId:id=>record('focus-pending',id),setNodeRenameValue:s=>record('rename-value',s),setRenamingNodeId:id=>record('rename-id',id),setProductPicker:value=>record('product-picker',value),
  };
  for(const kind of kinds)c[kind+'NodesStore']={nodes:config[kind],saving:!!config.nativeSaving};
  c.comfyNodesStore={nodes:[],saving:false};
  const named=['openProperties','openCharacterEditor','openSceneEditor','openDirectorEditor','openAudioEditor','openTimelineEditor','openVideoEditor','duplicateCanvasNodes','batchDelete','removeTextNode','openTextImageMenu','copyText','showCopyTip','onPendUpload','onPendRemove','focusCanvasNode','reversePromptsForSelection','openAssistant','tidyLayout','markBatchSelection','downloadBatchSelection','batchRunImages','stitchBatchSelection','toggleArtworkBatchSelection','ungroupBatchSelection','groupBatchSelection','duplicateArt','applyArtworkSelection','deleteTree','createMergeNodeFromSelection','addPendAtScreen','uploadAtScreen','triggerUpload','addTextAtScreen','createCanvasNode','openHistoryPicker','doUndo','doRedo'];
  for(const name of named)c[name]=(...v)=>record(name,...v.map(x=>x&&typeof x==='object'&&'id'in x?x.id:x));
  c.ports=()=>({catalogue:()=>({project:config.project,artworks:config.artworks,text:config.text,...Object.fromEntries(kinds.map(k=>[k,config[k]]))})});
  vm.createContext(c);vm.runInContext(compile(functions.fmt+'\n'+focus+'\nglobalThis.__targets={artwork:selected,text:selectedText,pending:selectedPend,video:selectedVideo,director:selectedDirector,character:selectedCharacter,scene:selectedScene,audio:selectedAudio,timeline:selectedTimeline};\nglobalThis.__properties='+properties+';\nglobalThis.__menu=('+menu+')();\nglobalThis.__kinds=('+oldKinds+')();'),c);
  for(const [key,value] of Object.entries(c.__targets))if(value)ok(config[key==='artwork'?'artworks':key].includes(value),'original row identity '+key);
  const panel=c.__properties,propertyProps=panel?Object.fromEntries(Object.entries(panel.props).filter(([,value])=>typeof value!=='function')):null;
  const actions=[];function visit(element){if(!element||typeof element!=='object')return;if(Array.isArray(element)){element.forEach(visit);return;}if(element.type===api.ContextMenuItem)actions.push(element.props);visit(element.props?.children);}visit(c.__menu);
  const menuHtml=c.__menu?renderToStaticMarkup(c.__menu):null,propertyHtml=panel?renderToStaticMarkup(panel):null;
  const before=calls.length;if(panel){await panel.props.onSave(api.defaultNodeSettings());panel.props.onCrop();panel.props.onReplace();panel.props.onClose();}
  for(const item of actions)if(!item.disabled)await item.onClick?.();
  const row={name:config.name,targets:plain(c.__targets),properties:plain(propertyProps),propertyHtml,menuHtml,actions:actions.map(({label,disabled,danger,hk})=>({label,disabled:!!disabled,danger:!!danger,hk})),calls:plain(calls.slice(before)),kinds:[...c.__kinds]};rows.push(row);
  eq(JSON.stringify(config),originalInput,'catalogue input remains immutable');
  if(panel)ok(row.calls.some(x=>x[0]==='save-settings'&&x[1]===panel.key),'actual property callback uses panel target');
  checks++;console.log('PASS '+config.name);
 }
 if(arg('--compare'))eq(rows,JSON.parse(fs.readFileSync(arg('--compare'),'utf8')).rows,'all original focus/context/property/html/action/kind traces exact');
 eq(Object.fromEntries(loaded.map(p=>[p,hash(path.join(root,p))])),sourceHashes,'loaded source hashes stable');
 if(!baseline){
  if(focus.includes('comfyNodesStore')){
   const config=fixture({});const catalogue={...config,comfy:[native('comfy'),native('comfy',{id:'foreign-comfy',projectKey:'B'})]};
   eq([...api.canvasSelectableNodeKinds(catalogue)].filter(([,kind])=>kind==='comfy'),[['comfy-a','comfy']],'Comfy catalogue is scoped to the selected project');
  }
  const implementation=read('src/lib/canvas/selection-projection.ts');ok(!/fetch\(|useState|useEffect|createContext|localStorage|indexedDB|withBilling|query\(/.test(implementation),'pure projection without I/O/state');
  ok(source.includes('canvasContextTargets(selectionCatalogue,ctxMenu.nodeId)'));ok(source.includes('canvasSelectionProperties(selectionTargets)'));ok(controller.includes('canvasSelectableNodeKinds(ports().catalogue())'));
 }
 const result={status:baseline?'BASELINE_CAPTURED':'PASS',cases:rows.length,checks,comparison:arg('--compare')?'EXACT':'CAPTURED',rows,sourceHashes,actualPageDeclarations:true,actualCompleteMenuIife:true,actualPropertiesJsx:true,realReactSSR:true,ports:['features','actions','useMemo-evaluation'],pg:0,supplierPosts:0};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(`CANVAS_SELECTION_PROJECTION=${result.status} CASES=${rows.length} CHECKS=${checks} TRACE=${result.comparison} PAGE=ACTUAL MENU=ACTUAL PROPERTIES=ACTUAL REAL_REACT_SSR=1 PG=0 SUPPLIER_POSTS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
