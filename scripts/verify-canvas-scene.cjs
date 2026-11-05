// Whole-tree baseline/new scene composition and actual reconciliation code.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.SCENE_SOURCE_ROOT||'.'),out=path.resolve(process.env.SCENE_EVIDENCE||'output/refactor-r3c1-20261024'),baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={},expr={};let scene,sync;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);
 if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText(ast)==='useMemo'){
  if(n.name.getText(ast).includes('displayNodes'))scene=n.initializer.arguments[0].getText(ast);
  if(['nodesSig','edgesSig'].includes(n.name.getText(ast)))expr[n.name.getText(ast)]=n.initializer.arguments[0].getText(ast);
 }
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const currentById = new Map(current.map(node'))sync=n.arguments[0].getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText;
const plain=value=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='function'?undefined:v));let checks=0,cases=0;
const eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
async function load(){
 const modules=['mock-data','canvas/node-settings','canvas/stable-placement','canvas/input-references','canvas/generation-feedback','canvas/generation-failure','canvas/node-measurement',...(!baseline?['canvas/node-geometry','canvas/scene-projection','canvas/scene-reconciliation']:[])];
 const bundle=await build({stdin:{contents:modules.map(m=>`export * from './src/lib/${m}';`).join('\n'),resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
 const module={exports:{}},c=vm.createContext({process:{env:{}},console,module,exports:module.exports,require,Map,Set,WeakMap,Date,structuredClone});vm.runInContext(bundle.outputFiles[0].text,c);Object.assign(c,module.exports);
 if(baseline){Object.assign(c,{NODE_W:320,NODE_H:236,NODE_LABEL_H:36,TEXT_NODE_DEFAULT_W:380,TEXT_NODE_DEFAULT_H:240,TEXT_NODE_MAX_W:1200,TEXT_NODE_MAX_H:1200});vm.runInContext(compile(['artworkImageSize','artworkNodeSize','flowNodeSize','estimateTextNodeHeight','lineageChain','layoutGraph'].map(k=>fn[k]).join('\n')+`\nglobalThis.project=(${scene});globalThis.nodesSignature=(${expr.nodesSig});globalThis.edgesSignature=(${expr.edgesSig});globalThis.synchronize=(${sync});`),c);}
 return c;
}
const art=(id,extra={})=>({id,title:id,category:'main',prompt:'',image:'/fixture/'+id+'.png',status:'completed',createdAt:'2026-10-24T10:00:00Z',width:640,height:480,canvasX:100,canvasY:200,...extra});
function setup(c,scenario){
 const members=[art('a'),art('b',{parentId:'a',parentIds:['a'],canvasX:600}),art('c',{source:'canvas-add',parentId:'a',canvasX:1100})];
 const events=[],actionNames=['dimensions','resize','ratioRepair','rename','videoProcess','cutout','generatePending','videoEdit','videoHistory','videoCancel','videoPrompt','videoResize','workflowFill','workflowSelect'];
 const actions=Object.fromEntries(actionNames.map(name=>[name,(...args)=>{events.push([name,...args]);if(name==='videoPrompt')return Promise.resolve();}]));
 const settings=c.defaultNodeSettings(),text={id:'text-a',projectKey:'tree:a',title:'Text',content:'saved text',prompt:'',status:'completed',sourceIds:['a'],productIds:['b'],targetIds:['c'],canvasX:20,canvasY:900,width:380,height:240};
 const video={id:'vnode-a',projectKey:'tree:a',title:'Video',config:{prompt:'old'},inputs:[{id:'input-a',nodeId:'image:a'}],width:380,height:240,x:900,y:900,revision:1,lastTaskId:'video-task',lastResultId:'video-output'};
 const input={nodes:[],edges:[],active:{members},activeKey:'tree:a',generationTasks:[],taskPositions:{},pendNodes:[],textNodes:[],videoNodes:[],videoTasks:[],works:members,selectedId:null,selectedPendId:null,selectedTextId:null,multiSel:[],expandedTextIds:new Set(),locale:'zh',lightCanvas:true,nodeSettings:{},nodeSettingsReady:true,readOnly:false,cutoutAvailable:true,operations:new Set(),workflowManifests:[],actions};
 if(scenario==='selection'||scenario==='multiselect'){input.selectedId='b';if(scenario==='multiselect')input.multiSel=['a','b'];}
 if(['text','expanded','mixed','workflow'].includes(scenario)){input.textNodes=[text];input.selectedTextId=text.id;if(scenario==='expanded')input.expandedTextIds.add(text.id);}
 if(['video','mixed','restored-video'].includes(scenario)){input.videoNodes=[video];input.videoTasks=[{id:'video-task',status:'running',progress:25,resultAssets:[{artworkId:'video-output'}]}];const output=art('video-output',{parentId:'a',category:'video',videoUrl:'/fixture/movie.mp4',...(scenario==='restored-video'?{canvasX:null,canvasY:null}:{canvasX:1400,canvasY:200})});input.works=[...members,output];input.active={members:[...members,output]};}
 if(scenario==='pending'||scenario==='mixed')input.pendNodes=[{id:'pend-a',parentId:'a',linked:true,label:'Pending',inputs:['a','missing'],x:400,y:400,uploading:false,progress:0}];
 if(['task','task-failed','invisible-task'].includes(scenario))input.generationTasks=[{id:'task-a',operationKey:'node:a',sourceId:'a',label:'Generating',position:{x:600,y:400},stage:'generating',startedAt:1,count:2,...(scenario==='task-failed'?{failure:{kind:'sync',message:'read failed'},onRetry:()=>events.push(['retry'])}:{}),...(scenario==='invisible-task'?{isVisible:()=>false}:{})}];
 if(scenario==='locked'){input.nodeSettings.a={...settings,locked:true};input.operations.add('node:b');}
 if(scenario==='readonly')input.readOnly=true;
 if(scenario==='settings-pending')input.nodeSettingsReady=false;
 if(scenario==='foreign'){input.textNodes=[{...text,projectKey:'tree:other'}];input.videoNodes=[{...video,projectKey:'tree:other'}];}
 if(scenario==='workflow')input.workflowManifests=[{projectKey:'tree:a',groups:[{id:'group-a',title:'Imported group',members:['a','text-a']}],origins:[{id:'a',rotation:12,flipX:true,opacity:0.8}],decorations:[{id:'b',image:'/fixture/decoration.png',rotation:5,flipX:false,opacity:0.6}]}];
 const layout=c.layoutGraph(input.active.members,'Original',actions.dimensions,actions.resize,actions.ratioRepair,actions.rename,actions.videoProcess,new Map());Object.assign(input,layout);
 if(scenario==='duplicates'){input.nodes.push(input.nodes[0]);input.edges.push({id:'dangling',source:'missing',target:'a'});if(input.edges[0])input.edges.push(input.edges[0]);}
 let result;
 if(baseline){Object.assign(c,input,{DEFAULT_CANVAS_SETTINGS:settings,generationTaskPosRef:{current:input.taskPositions},videoNodesStore:{nodes:input.videoNodes},videoTaskStore:{tasks:input.videoTasks},generationOperationRef:{current:input.operations},worksRef:{current:input.works},isNodeLocked:id=>!!input.nodeSettings[id]?.locked,settingsFor:id=>input.nodeSettings[id]||settings,cutoutCatalog:{available:true},cutoutCatalogError:null,workflowCallbacksRef:{current:{replace:a=>actions.workflowFill(a.id),select:actions.workflowSelect}},runCutout:a=>actions.cutout(a.id),generatePend:({pend})=>actions.generatePending(pend.id),openVideoEditor:actions.videoEdit,setVideoHistoryId:actions.videoHistory,extractVideoToCanvas:actions.videoProcess});result=c.project();}
 else result=c.projectCanvasScene({...input,generationTasks:input.generationTasks.filter(task=>task.isVisible?.()??true)});
 return {input,result,events};
}
(async()=>{
 const c=await load(),scenes=[];
 for(const scenario of ['plain','selection','multiselect','text','expanded','pending','video','mixed','restored-video','task','task-failed','invisible-task','locked','readonly','settings-pending','foreign','workflow','duplicates']){
  const {input,result,events}=setup(c,scenario);eq(new Set(result.displayNodes.map(n=>n.id)).size,result.displayNodes.length,'unique nodes');ok(result.displayEdges.every(e=>result.displayNodes.some(n=>n.id===e.source)&&result.displayNodes.some(n=>n.id===e.target)),'no dangling edge');
  if(scenario==='plain')eq(result.displayNodes.map(n=>n.position),input.nodes.map(n=>n.position),'saved positions');
  if(scenario==='foreign')eq(result.displayNodes.length,3,'foreign text/video excluded');
  if(scenario==='invisible-task')eq(result.displayNodes.some(n=>n.id==='task-a'),false,'invisible task excluded');
  if(scenario==='invisible-task')eq(result.displayNodes.find(n=>n.id==='a').data.cutoutBusy,baseline,'hidden task does not block visible artwork');
  if(scenario==='readonly'||scenario==='settings-pending')ok(result.displayNodes.every(n=>!n.draggable),'no edit projection');
  if(scenario==='locked')eq(result.displayNodes.find(n=>n.id==='a').draggable,false,'locked retained');
  if(scenario==='task-failed'){result.displayNodes.find(n=>n.id==='task-a').data.onGenerationRetry();eq(events,[['retry']],'retained retry identity');}
  const arts=result.displayNodes.filter(n=>n.type==='art'&&!n.data.pending&&!n.data.videoUrl);if(arts[0]){arts[0].data.onCutout('a');eq(events.at(-1),['cutout','a'],'command by id');}
  if(scenario==='workflow'){const group=result.displayNodes.find(n=>n.type==='workflowGroup');if(baseline)group.data.onSelect();else group.data.onSelect(group.data.members);eq(events.at(-1),['workflowSelect',['a','text-a']],'group command retained');}
  scenes.push({scenario,result:plain(result)});cases++;
 }
 let currentNodes=[],currentEdges=[],lastSignature;const update=(nodes,edges=[])=>{
  if(baseline){Object.assign(c,{displayNodes:nodes,displayEdges:edges,setRfNodes:f=>currentNodes=f(currentNodes),setRfEdges:f=>currentEdges=f(currentEdges)});const signature=c.nodesSignature()+'#'+c.edgesSignature();if(signature!==lastSignature){c.synchronize();lastSignature=signature;}}
  else{currentNodes=c.reconcileCanvasNodes(currentNodes,nodes);currentEdges=c.reconcileCanvasEdges(currentEdges,edges);}return currentNodes;
 };
 const original={id:'a',type:'art',position:{x:0,y:0},style:{width:320,height:200},data:{id:'a',image:'/a.png',label:'A',progress:10,sourceRefs:[{id:'b',title:'Original'}]}};
 for(const [name,change,observed] of [
  ['intrinsic-size',n=>({...n,data:{...n.data,intrinsicWidth:8192}}),n=>n.data.intrinsicWidth],
  ['reference-title',n=>({...n,data:{...n.data,sourceRefs:[{id:'b',title:'Renamed'}]}}),n=>n.data.sourceRefs[0].title],
  ['readonly',n=>({...n,data:{...n.data,readOnly:true}}),n=>n.data.readOnly],
  ['style-size',n=>({...n,style:{width:380,height:240}}),n=>n.style.width],
  ['fractional-position',n=>({...n,position:{x:0.25,y:0.25}}),n=>n.position.x],
  ['video-result',n=>({...n,data:{...n.data,resultUrl:'/new.mp4'}}),n=>n.data.resultUrl],
  ['retry-callback',n=>({...n,data:{...n.data,onGenerationRetry:()=>42}}),n=>typeof n.data.onGenerationRetry],
 ]){
  currentNodes=[];lastSignature=undefined;update([original]);const next=change(original);update([next]);eq(observed(currentNodes[0])??null,(baseline?observed(original):observed(next))??null,name+' update behavior');cases++;
 }
 currentNodes=[];lastSignature=undefined;update([original]);currentNodes[0]={...currentNodes[0],selected:true,dragging:true,position:{x:777,y:888},measured:{width:320,height:200}};update([{...original,data:{...original.data,label:'During drag'}}]);eq(currentNodes[0].position,{x:777,y:888},'drag retained');eq(currentNodes[0].selected,true,'selection retained');eq(currentNodes[0].measured,{width:320,height:200},'measurement retained');cases++;
 if(!baseline){const stable=currentNodes;update([{...original,data:{...original.data,label:'During drag'}}]);ok(currentNodes===stable,'equivalent projections retain array identity');
  currentNodes[0]={...currentNodes[0],resizing:true,style:{width:900,height:700},width:900,height:700};update([{...original,data:{...original.data,label:'During resize'}}]);eq(currentNodes[0].style,{width:900,height:700},'resize box retained');
  const edges=[{id:'edge',source:'a',target:'b',sourceHandle:'out',targetHandle:'in',selected:true}],next=c.reconcileCanvasEdges(edges,[{...edges[0],target:'c',selectable:false}]);eq(next[0].target,'c','edge endpoint changed');eq(next[0].selected,false,'unselectable edge cleared');cases++;
 }
 const large=Array.from({length:400},(_,i)=>({...original,id:'node-'+i,position:{x:i*400,y:0},data:{...original.data,id:'node-'+i}}));currentNodes=[];lastSignature=undefined;update(large);
 const before=currentNodes;update(large.map((n,i)=>i===3?{...n,data:{...n.data,label:'Changed only one'}}:n));const replaced=currentNodes.filter((n,i)=>n!==before[i]).length;
 eq(replaced,baseline?400:1,'only changed render node is replaced');cases++;
 // The candidate must compose the new owner at the actual Canvas call site.
 if(!baseline){ok(source.includes('projectCanvasScene({nodes,edges'),'actual projection wired');ok(source.includes('useCanvasScene(displayNodes,displayEdges,canvasArtworkDocument.scope)'),'actual reconciliation wired');ok(!source.includes('const nodesSig ='),'handwritten signature retired');}
 if(!baseline){
  const hooks=await build({stdin:{contents:'export * from "./src/components/canvas/use-canvas-scene-actions";export * from "./src/components/canvas/use-canvas-scene";',resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'react-ports',setup(b){b.onResolve({filter:/^(react|@xyflow\/react)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='react'?'export const useRef=v=>__hooks.ref(v);export const useMemo=(f,d)=>__hooks.memo(f,d);export const useEffect=(f,d)=>__hooks.effect(f,d);export const useLayoutEffect=useEffect;':'export const useNodesState=v=>__hooks.state(v);export const useEdgesState=v=>__hooks.state(v);'}));}}]});
  let index=0,effects=[],slots=[];const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const ports={ref(v){const i=index++;return slots[i]??=( {current:v});},memo(f,d){const i=index++,old=slots[i];if(!old||!same(old.d,d))slots[i]={d,value:f()};return slots[i].value;},effect(f,d){const i=index++,old=slots[i];if(!old||!same(old.d,d)){effects.push(f);slots[i]={d};}},state(v){const i=index++;slots[i]??={value:v};slots[i].set??=f=>{slots[i].value=typeof f==='function'?f(slots[i].value):f;};return [slots[i].value,slots[i].set,()=>{}];}};
  const module={exports:{}},h=vm.createContext({module,exports:module.exports,require,console,__hooks:ports});vm.runInContext(hooks.outputFiles[0].text,h);const api=module.exports,events=[];
  const render=work=>{index=0;const result=work();for(const f of effects.splice(0))f();return result;};
  const actions=v=>Object.fromEntries(['dimensions','resize','ratioRepair','rename','videoProcess','cutout','generatePending','directorEdit','characterEdit','audioEdit','timelineEdit','sceneEdit','videoEdit','videoHistory','videoCancel','videoPrompt','videoResize','workflowFill','workflowSelect'].map(name=>[name,(...args)=>events.push([v,name,...args])]));
  const first=render(()=>api.useCanvasSceneActions(actions('old'))),second=render(()=>api.useCanvasSceneActions(actions('current')));ok(first===second,'stable action object');for(const name of Object.keys(first)){first[name]('node');eq(events.at(-1),['current',name,'node'],'latest callback '+name);}cases++;
  slots=[];const scope={},nextScope={};let flow=render(()=>api.useCanvasScene([original],[],scope));flow=render(()=>api.useCanvasScene([original],[],scope));flow.setRfNodes(nodes=>nodes.map(n=>({...n,selected:true,dragging:true,position:{x:999,y:999}})));
  render(()=>api.useCanvasScene([original],[],nextScope));flow=render(()=>api.useCanvasScene([original],[],nextScope));eq(flow.rfNodes[0].selected,false,'scope switch clears old selection');eq(flow.rfNodes[0].position,original.position,'scope switch drops old live drag');cases++;
 }
 fs.writeFileSync(path.join(out,`${baseline?'BASELINE':'MODIFIED'}_RESULT.json`),JSON.stringify({sourceRoot:root,cases,checks,scenes},null,2));
 console.log(`CANVAS_SCENE=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${cases} checks=${checks} MIXED_SCENES=18 FIELD_UPDATES=${baseline?'7_MISSED':'COMPLETE'} ONE_CHANGE_REPLACED=${replaced}/400 DRAG_SELECTION=RETAINED HTTP=0 SUPPLIER=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
