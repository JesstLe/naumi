/** Actual old/new Canvas entries,not a second implementation of placement.
 * Document/history/presentation ports are recorded. PG and browser are separate. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const {createHash}=require('node:crypto');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const baseline=process.argv.includes('--baseline'),root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.NODE_CREATION_EVIDENCE||'output/canvas-node-creation');
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),functions={};
const names=['addPendAtScreen','createMergeNodeFromSelection','addTextNodeAtScreen','createCanvasNode','pendingNodeCreationPorts','textNodeCreationPorts'];
const localizers=[];
(function walk(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))functions[n.name.text]=n.getText(ast);if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='L'&&n.initializer)localizers.push(n.initializer);ts.forEachChild(n,walk);})(ast);
for(const name of names.slice(0,4))assert.ok(functions[name],name);
assert.equal(localizers.length,1,'the actual Canvas L initializer is uniquely bound');
const localizer=localizers[0],localizerSource=localizer.getText(ast);
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const plain=v=>JSON.parse(JSON.stringify(v));
async function bundle(){
 const content=['export * from "./src/lib/canvas/node-commands";','export * from "./src/lib/canvas/node-geometry";',...(!baseline?['export * from "./src/lib/canvas/node-creation";']:[])].join('\n');
 return(await build({stdin:{contents:content,loader:'ts',resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false,tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.resolve('node_modules')]})).outputFiles[0].text;
}
function fixture(code,options={}){
 const trace=[],pending=[],texts=[],histories=[],views=[],viewCaptures=[],viewRequests=[];let uuid=0;
 const viewport=options.viewport||{x:35,y:-40,zoom:1.5};
 const c={console,Buffer,Promise,Map,Set,Math,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-31T01:00:00.000Z']));}static now(){return 123456;}},crypto:{randomUUID:()=>`uuid-${++uuid}`},
  module:{exports:{}},exports:{},pendSeqRef:{current:1},NODE_W:320,NODE_H:236,X_GAP:Number(source.match(/const X_GAP = (\d+)/)[1]),MAX_TOTAL_IMAGES:16,
  readOnly:!!options.readOnly,user:options.anonymous?null:{email:'owner@fixture.test'},active:options.noProject?null:{key:'tree:current'},activeKey:options.noProject?null:'tree:current',
  selectedBatchArts:Array.from({length:options.count??3},(_,i)=>({id:'a'+i})),selectedBatchIds:Array.from({length:options.count??3},(_,i)=>'a'+i),viewportRef:{current:viewport},
  // Keep the existing English t port explicit; both actual L branches are
  // separately exercised below. This is not a substitute LocaleProvider.
  locale:options.locale??'en',t:key=>key==='canvas.imageNode'?'Image':key==='canvas.textGenerate'?'Text':key,
  fmt:(s,vars)=>s+JSON.stringify(vars),
 };
 c.exports=c.module.exports;vm.createContext(c);vm.runInContext(code,c);Object.assign(c,c.module.exports);
 const record=(kind,...values)=>trace.push([kind,...plain(values)]);
 c.rfRef={current:options.noFlow?null:{getViewport:()=>viewport,getNodes:()=>options.nodes||[
  {id:'a0',position:{x:10,y:30},data:{width:400,height:200}},
  {id:'a1',position:{x:500,y:130},data:{width:200,height:100}},
  {id:'a2',position:{x:-50,y:-100},measured:{width:120,height:140}},
 ]}};
 c.setPendNodes=update=>{const next=update([...pending]);pending.splice(0,pending.length,...next);record('pending',next);};
 c.setTextNodes=update=>{const next=update([...texts]);texts.splice(0,texts.length,...next);record('text',next);};
 c.pushUndo=action=>{histories.push(plain(action));record('history',action);};
 for(const name of ['setGenerationMode','setSelectedId','setSelectedTextId','setSelectedPendId','setGenCount','setTextPrompt','clearCanvasSelection','flashTip'])c[name]=(...v)=>record(name,...v);
 c.imageDraft={seed:(...v)=>record('seed',...v)};
 c.wantFocusPendPrompt={current:false};
 c.focusEditableCanvasArea=area=>{views.push(plain(area));record('focus',area);};
 // Node creation records its existing presentation port. The real view owner
 // and cross-project scheduling are exercised by view-navigation unit/DOM.
 c.canvasArtworkDocument={scope:{project:c.activeKey}};
 c.viewControls={capture:scope=>{const captured=plain(scope);viewCaptures.push(captured);return {area:(area,project)=>{viewRequests.push(plain({area,project,scope:captured}));c.focusEditableCanvasArea(area);}};}};
 c.projectNavigation={open:key=>record('navigate',key)};
 c.canvasSelection={selectInProject:(...v)=>record('selectProject',...v)};
 c.persistTextNode=node=>{record('saveText',node);return Promise.resolve();};
 c.canFeature=name=>{record('feature',name);return !options.videoDenied;};
 c.centerScreen=()=>({x:300,y:200});
 for(const[kind,name]of Object.entries({timeline:'createTimelineNode',audio:'createAudioNode',scene:'createSceneNode',character:'createCharacterNode',director:'createDirectorNode'}))c[name]=point=>record('native',kind,point);
 c.openVideoNodeFromSelection=(blank,point)=>record('native','video',blank,point);
 // Execute the production lexical initializer, not a copied zh/en predicate.
 vm.runInContext(transpile('const L='+localizerSource+';\n'+Object.values(functions).join('\n')+'\nglobalThis.entries={addPendAtScreen,createMergeNodeFromSelection,addTextNodeAtScreen,createCanvasNode};'),c);
 return {c,trace,pending,texts,histories,views,viewCaptures,viewRequests,snapshot:()=>plain({trace,pending,texts,histories,views,sequence:c.pendSeqRef.current,focusPrompt:c.wantFocusPendPrompt.current})};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const code=await bundle(),cases=[],localeCases=[];let checks=0;
 const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
 async function run(name,options,action,verify,collection=cases){const f=fixture(code,options);await action(f);await Promise.resolve();verify?.(f);collection.push({name,result:f.snapshot(),...(collection===localeCases?{locale:options.locale,viewCaptures:f.viewCaptures,viewRequests:f.viewRequests}:{})});}
 await run('blank-default',{},f=>f.c.entries.addPendAtScreen(300,200,null,false),f=>{eq(f.pending[0].inputs,[]);eq(f.histories[0].kind,'pending-add');});
 await run('blank-linked',{},f=>f.c.entries.addPendAtScreen(50,100,'a1',true),f=>eq(f.pending[0].inputs,['a1']));
 await run('unlinked-parent',{},f=>f.c.entries.addPendAtScreen(50,100,'a1',false),f=>eq(f.pending[0].inputs,[]));
 await run('blank-anonymous',{anonymous:true},f=>f.c.entries.addPendAtScreen(0,0,null,false),f=>eq(f.pending.length,1));
 await run('viewport-fallback',{noFlow:true,viewport:{x:20,y:30,zoom:0}},f=>f.c.entries.addPendAtScreen(40,80,null,false),f=>eq([f.pending[0].x,f.pending[0].y],[-140,-68]));
 await run('shared-pending-sequence',{},f=>{f.c.entries.addPendAtScreen(0,0,null,false);f.c.pendSeqRef.current++;f.c.entries.createMergeNodeFromSelection();},f=>eq(f.pending.map(n=>n.id),['pend-123456-1','pend-123456-3']));
 await run('multi-reference',{},f=>f.c.entries.createMergeNodeFromSelection(),f=>{eq(f.pending[0].inputs,['a0','a1','a2']);eq([f.pending[0].x,f.pending[0].y],[790,20]);eq(f.histories.length,1);});
 await run('multi-reference-limit',{count:19},f=>f.c.entries.createMergeNodeFromSelection(),f=>{eq(f.pending[0].inputs.length,16);eq(f.trace.filter(r=>r[0]==='flashTip').length,1);});
 await run('multi-reference-no-flow',{noFlow:true},f=>f.c.entries.createMergeNodeFromSelection(),f=>eq([f.pending[0].x,f.pending[0].y],[90,0]));
 for(const options of [{count:1},{readOnly:true}])await run('multi-reference-disabled-'+JSON.stringify(options),options,f=>f.c.entries.createMergeNodeFromSelection(),f=>eq(f.trace,[]));
 await run('text-default',{},f=>f.c.entries.addTextNodeAtScreen(300,200),f=>{eq(f.texts[0].projectKey,'tree:current');eq(f.histories[0].kind,'text-add');eq(f.trace.filter(r=>r[0]==='saveText').length,1);});
 await run('text-new-project',{noProject:true},f=>f.c.entries.addTextNodeAtScreen(300,200),f=>eq(f.texts[0].projectKey,'tree:text-uuid-1'));
 await run('text-options',{},f=>f.c.entries.addTextNodeAtScreen(40,80,{forceNewProject:true,title:'Custom',prompt:'原提示',sourceIds:['a1','a1','a2','a3','a4','a5','a6']}),f=>{eq(f.texts[0].sourceIds,['a1','a2','a3','a4','a5']);eq(f.texts[0].title,'Custom');eq(f.texts[0].projectKey,'tree:text-uuid-1');});
 for(const options of [{anonymous:true},{readOnly:true}])await run('text-disabled-'+JSON.stringify(options),options,f=>f.c.entries.addTextNodeAtScreen(300,200),f=>eq(f.trace,[]));
 for(const kind of ['image','text','video','director','character','scene','audio','timeline'])await run('dispatch-'+kind,{},f=>f.c.entries.createCanvasNode(kind,{x:90,y:100}));
 await run('dispatch-default-center',{},f=>f.c.entries.createCanvasNode('image'),f=>eq(f.pending.length,1));
 await run('dispatch-readonly',{readOnly:true},f=>f.c.entries.createCanvasNode('video',{x:0,y:0}),f=>eq(f.trace,[]));
 await run('dispatch-video-feature-denied',{videoDenied:true},f=>f.c.entries.createCanvasNode('video',{x:0,y:0}),f=>eq(f.trace,[['feature','video']]));
 // Keep new locale coverage outside the original common-case trace sequence.
 const verifyText=(f,title,prompt='')=>{
  const node=f.texts[0];eq(node.title,title,'actual locale/default or explicit title');eq(node.prompt,prompt,'instruction is not translated');eq(node.content,'','title/placeholder never enters generated content');eq(node.status,'idle');
  eq(f.histories,[{kind:'text-add',records:[node]}],'one undo records the complete same node');eq(f.trace.filter(r=>r[0]==='saveText').map(r=>r[1]),[node],'one save records the same node');
  eq(f.trace.filter(r=>r[0]==='navigate'),[['navigate',node.projectKey]]);eq(f.trace.filter(r=>r[0]==='selectProject'),[['selectProject',node.projectKey,{selectedId:null,selectedPendId:null,selectedTextId:node.id}]]);
  eq(f.viewCaptures,[f.c.canvasArtworkDocument.scope],'adapter captures the document scope');eq(f.viewRequests,[{area:{x:node.canvasX,y:node.canvasY,width:300,height:176},project:node.projectKey,scope:f.c.canvasArtworkDocument.scope}],'adapter carries the destination project to the recorded focus port');
 };
 for(const [locale,title]of [['zh','文字'],['en','Text']]){
  await run('locale-default-'+locale,{locale},f=>f.c.entries.addTextNodeAtScreen(300,200),f=>verifyText(f,title),localeCases);
  await run('locale-explicit-title-'+locale,{locale},f=>f.c.entries.addTextNodeAtScreen(300,200,{title:'用户自定 / Custom',prompt:'原提示 / Original',sourceIds:['a1','a1','a2','a3','a4','a5','a6']}),f=>{verifyText(f,'用户自定 / Custom','原提示 / Original');eq(f.texts[0].sourceIds,['a1','a2','a3','a4','a5']);},localeCases);
  await run('locale-new-project-'+locale,{locale,noProject:true},f=>f.c.entries.addTextNodeAtScreen(300,200),f=>{verifyText(f,title);eq(f.texts[0].projectKey,'tree:text-uuid-1');},localeCases);
 }
 await run('locale-next-creation-keeps-existing-title',{locale:'zh'},f=>{f.c.entries.addTextNodeAtScreen(300,200);f.c.locale='en';f.c.entries.addTextNodeAtScreen(400,300);},f=>{eq(f.texts.map(n=>n.title),['文字','Text']);eq(f.histories.map(h=>h.records[0]),f.texts);eq(f.trace.filter(r=>r[0]==='saveText').map(r=>r[1]),f.texts);eq(f.viewRequests.map(r=>r.project),f.texts.map(n=>n.projectKey));},localeCases);
 for(const options of [{locale:'en',anonymous:true},{locale:'en',readOnly:true}])await run('locale-disabled-'+JSON.stringify(options),options,f=>f.c.entries.addTextNodeAtScreen(300,200),f=>{eq(f.trace,[]);eq(f.texts,[]);eq(f.histories,[]);eq(f.viewRequests,[]);},localeCases);
 const compare=arg('--compare');if(compare){const old=JSON.parse(fs.readFileSync(compare,'utf8'));eq(cases,old.cases,'all original node/document/history/presentation/navigation traces remain exact');}
 if(!baseline){const owner=fs.readFileSync(path.join(root,'src/lib/canvas/node-creation.ts'),'utf8');assert.ok(!/from\s+["'](?:react|next|@\/components)/.test(owner));assert.ok(!/fetch\(|localStorage|setTimeout|setInterval/.test(owner));checks+=2;}
 const report={status:baseline?'BASELINE_REPRODUCED':'PASS',mode:baseline?'baseline':'modified',cases,localeCases,checks,localizer:{actualCanvasInitializer:true,defaultFixtureLocale:'en',source:localizerSource,utf16Start:localizer.getStart(ast),utf16End:localizer.end,sha256:createHash('sha256').update(localizerSource).digest('hex'),canvasSourceSha256:createHash('sha256').update(source).digest('hex')},actualPageEntries:true,actualExistingNodeCommands:true,io:'recorded existing document/history/presentation ports;not PG or LocaleProvider/browser acceptance',comparison:compare?'EXACT':'NOT_REQUESTED',paidPosts:0};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log('CANVAS_NODE_CREATION='+(baseline?'BASELINE_REPRODUCED':'PASS')+' CASES='+cases.length+' LOCALE_CASES='+localeCases.length+' CHECKS='+checks+' TRACE='+(compare?'EXACT':'CAPTURED')+' ACTUAL_LOCALIZER=CANVAS_L ORIGINAL_DOCUMENT_HISTORY=1 NEW_TASK_SYSTEM=0 NETWORK=0');
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;});
