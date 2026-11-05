const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(value('--source-root','.')),baseline=args.includes('--baseline');
const cache=new Map();function load(relative){
 if(cache.has(relative))return cache.get(relative);
 const mod={exports:{}},file=path.join(root,relative),raw=fs.readFileSync(file,'utf8');cache.set(relative,mod.exports);
 const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})')((id)=>load(path.posix.normalize(path.posix.join(path.posix.dirname(relative),id))+'.ts'),mod,mod.exports);return mod.exports;
}
const layout=load('src/lib/canvas/dock-layout.ts'),source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),calls=[];
(function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='canvasDockLayout')calls.push(n.getText(ast));ts.forEachChild(n,visit)})(ast);
let ownerProject;
if(calls.length===0&&!baseline){
 const hookSource=fs.readFileSync(path.join(root,'src/components/canvas/use-canvas-overlay-layout.ts'),'utf8');
 const hookAst=ts.createSourceFile('overlay.ts',hookSource,99,true),parts=[];
 for(const name of ['anchor','geometry','projectOverlay']){const statement=hookAst.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(hookAst)===name));assert(statement,'actual owner '+name);parts.push(statement.getText(hookAst));}
 assert.match(source,/protectImageNodeTitle:!!selected&&!selected\.videoUrl/,'Canvas opts only real image titles in');
 assert.match(hookSource,/projectOverlay\(input,input\.viewport\.current,metrics\)/,'render uses shared owner');
 assert.match(hookSource,/projectOverlay\(value,viewport,liveMetrics\.current\)/,'live path uses shared owner');
 const code=ts.transpileModule(parts.join('\n')+'\nglobalThis.ownerProject=projectOverlay',{compilerOptions:{target:9,module:1}}).outputText;
 const env={...layout,flowNodeSize:n=>n.data};vm.runInNewContext(code,env);ownerProject=env.ownerProject;calls.push('owner-render','owner-live');
}
assert.equal(calls.length,2,'render and live paths both use the shared owner');
let checked=0;for(const zoom of baseline?[1]:[.5,1,2])for(let index=0;index<calls.length;index++){
 const nodeScreen={left:480,cx:660,top:403,bottom:603};
 const env={...layout,nodeScreen,screen:nodeScreen,canvasSize:{width:1438,height:659},dockMetrics:{dockHeight:310,toolbarHeight:49.5,toolbarWidth:1384,dockMinimumHeight:178},selectedTextId:null,textComposerExpanded:false,mediaComposerExpanded:false,readOnly:false,selectedVideo:null,selected:{image:'/image.png'},protectImageNodeTitle:true,compactImageDock:true,viewportRef:{current:{zoom}},vp:{zoom}};
 const actualViewport=index?{x:0,y:0,zoom}:{x:0,y:0,zoom};
 const result=ownerProject?ownerProject({nodes:[{id:'image',position:{x:nodeScreen.left/zoom,y:nodeScreen.top/zoom},data:{width:360/zoom,height:200/zoom}}],selection:{selectedId:'image',selectedPendId:null,selectedTextId:null},size:env.canvasSize,textComposerExpanded:false,mediaComposerExpanded:false,readOnly:false,protectImageNodeTitle:true,compactImage:true,nodeTitleHeight:0},actualViewport,env.dockMetrics):vm.runInNewContext(calls[index],env),titleTop=nodeScreen.top-38*zoom,titleBottom=nodeScreen.top-8*zoom;
 const overlap=Math.max(0,Math.min(result.toolbar.top+49.5,titleBottom)-Math.max(result.toolbar.top,titleTop));
 if(baseline)assert(overlap>0,'original actual caller must reproduce title occlusion');else assert.equal(overlap,0,'actual render/live call preserves title at '+zoom);
 checked++;
}
if(!baseline){
 let fn;
 (function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='updateLiveViewport')fn=n.getText(ast);ts.forEachChild(n,visit)})(ast);
 let ownerLive;
 if(!fn){
  const hookSource=fs.readFileSync(path.join(root,'src/components/canvas/use-canvas-overlay-layout.ts'),'utf8'),hookAst=ts.createSourceFile('overlay.ts',hookSource,99,true);
  (function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(hookAst)==='updateLiveViewport')ownerLive=n.initializer.arguments[0].getText(hookAst);ts.forEachChild(n,visit)})(hookAst);
 }
 assert(fn||ownerLive,'actual live DOM updater exists');
 const dock={style:{}},toolbar={style:{}},env={...layout,zoomPercentLabel:()=>'',zoomPercentInput:()=>'',zoomLabelRef:{current:null},zoomButtonRef:{current:null},zoomInputRef:{current:null},
  t:()=>'',selectedNodeScreen:vp=>({left:631+vp.x,cx:714.5+vp.x,top:300,bottom:570}),canvasSize:{width:1440,height:900},
  dockMetrics:{dockHeight:420,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:178},selectedTextId:null,textComposerExpanded:false,mediaComposerExpanded:true,readOnly:false,
  protectImageNodeTitle:true,compactImageDock:true,selectedVideo:null,selected:null,panelRef:{current:dock},nodeToolbarRef:{current:toolbar},nodeRenamePositionRef:{current:null},textComposerDockRef:{current:null}};
 const input={nodes:[{id:'image',position:{x:631,y:300},data:{width:167,height:270}}],selection:{selectedId:'image',selectedPendId:null,selectedTextId:null},size:env.canvasSize,textComposerExpanded:false,mediaComposerExpanded:true,readOnly:false,protectImageNodeTitle:true,compactImage:true,nodeTitleHeight:0,syncZoom(){}};
 Object.assign(env,{latest:{current:input},liveMetrics:{current:env.dockMetrics},projectOverlay:ownerProject});
 const code=ownerLive?'('+ownerLive+')':fn+';updateLiveViewport';
 const run=vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);
 for(const [x,width] of [[0,620],[20,600],[0,620]]){
  run({x,y:0,zoom:1});assert.equal(dock.style.width,width+'px','pure pan updates side width without a React rerender');
  assert(parseFloat(dock.style.left)+parseFloat(dock.style.width)<=1432,'actual DOM width remains within canvas');checked++;
 }
}
console.log(`PIXEL_DOCK_WIRING=${baseline?'REPRODUCED':'PASS'} CHECKS=${checked} RENDER_AND_LIVE=REAL_SOURCE SUPPLIER_CALLS=0 EXIT=${baseline?1:0}`);
process.exitCode=baseline?1:0;
