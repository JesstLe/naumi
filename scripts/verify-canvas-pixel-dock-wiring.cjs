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
assert.equal(calls.length,2,'render and live paths both use the shared module');
let checked=0;for(const zoom of baseline?[1]:[.5,1,2])for(let index=0;index<calls.length;index++){
 const nodeScreen={left:480,cx:660,top:403,bottom:603};
 const env={...layout,nodeScreen,screen:nodeScreen,canvasSize:{width:1438,height:659},dockMetrics:{dockHeight:310,toolbarHeight:49.5,toolbarWidth:1384,dockMinimumHeight:178},selectedTextId:null,textComposerExpanded:false,mediaComposerExpanded:false,readOnly:false,selectedVideo:null,selected:{image:'/image.png'},protectImageNodeTitle:true,compactImageDock:true,viewportRef:{current:{zoom}},vp:{zoom}};
 const result=vm.runInNewContext(calls[index],env),titleTop=nodeScreen.top-38*zoom,titleBottom=nodeScreen.top-8*zoom;
 const overlap=Math.max(0,Math.min(result.toolbar.top+49.5,titleBottom)-Math.max(result.toolbar.top,titleTop));
 if(baseline)assert(overlap>0,'original actual caller must reproduce title occlusion');else assert.equal(overlap,0,'actual render/live call preserves title at '+zoom);
 checked++;
}
if(!baseline){
 let fn;
 (function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='updateLiveViewport')fn=n.getText(ast);ts.forEachChild(n,visit)})(ast);
 assert(fn,'actual live DOM updater exists');
 const dock={style:{}},toolbar={style:{}},env={...layout,zoomPercentLabel:()=>'',zoomPercentInput:()=>'',zoomLabelRef:{current:null},zoomButtonRef:{current:null},zoomInputRef:{current:null},
  t:()=>'',selectedNodeScreen:vp=>({left:631+vp.x,cx:714.5+vp.x,top:300,bottom:570}),canvasSize:{width:1440,height:900},
  dockMetrics:{dockHeight:420,toolbarHeight:50,toolbarWidth:620,dockMinimumHeight:178},selectedTextId:null,textComposerExpanded:false,mediaComposerExpanded:true,readOnly:false,
  protectImageNodeTitle:true,compactImageDock:true,selectedVideo:null,selected:null,panelRef:{current:dock},nodeToolbarRef:{current:toolbar},nodeRenamePositionRef:{current:null},textComposerDockRef:{current:null}};
 const run=vm.runInNewContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';updateLiveViewport',env);
 for(const [x,width] of [[0,620],[20,600],[0,620]]){
  run({x,y:0,zoom:1});assert.equal(dock.style.width,width+'px','pure pan updates side width without a React rerender');
  assert(parseFloat(dock.style.left)+parseFloat(dock.style.width)<=1432,'actual DOM width remains within canvas');checked++;
 }
}
console.log(`PIXEL_DOCK_WIRING=${baseline?'REPRODUCED':'PASS'} CHECKS=${checked} RENDER_AND_LIVE=REAL_SOURCE SUPPLIER_CALLS=0 EXIT=${baseline?1:0}`);
process.exitCode=baseline?1:0;
