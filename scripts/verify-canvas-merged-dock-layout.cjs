const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path');
function load(ref){const cache={};function get(file){
 if(cache[file])return cache[file];
 const src=ref?cp.execFileSync('git',['show',ref+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8'),m={exports:{}};cache[file]=m.exports;
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal((code.diagnostics||[]).filter(x=>x.category===1).length,0);
 vm.runInThisContext('(function(require,module,exports){'+code.outputText+'\n})')(id=>get(path.posix.join(path.posix.dirname(file),id)+'.ts'),m,m.exports);return m.exports;
}return get('src/lib/canvas/dock-layout.ts');}
const merged=load(),main=load('3ac639d95b6dd0ae6983cb55c1dce3e43092fd44'),mapping=load('9d687bf07c244050c0b5423e36282225ac717654');
let sameMain=0,sameMapping=0,expanded=0;
for(const width of [390,768,1024,1438])for(const height of [480,659,844,1000])for(const zoom of [.5,1,2])for(const top of [150,300,403,600]){
 const input={nodeScreen:{left:30,cx:170,top,bottom:top+200*zoom},canvasSize:{width,height},dockMetrics:{dockHeight:310,toolbarHeight:49.5,toolbarWidth:1384,dockMinimumHeight:178},selectedTextId:null,textComposerExpanded:false,readOnly:false};
 assert.deepEqual(merged.canvasDockLayout({...input,mediaComposerExpanded:true}),main.canvasDockLayout({...input,mediaComposerExpanded:true}));sameMain++;
 const protectedInput={...input,nodeTitleHeight:38*zoom,protectNodeTitle:true};
 assert.deepEqual(merged.canvasDockLayout(protectedInput),mapping.canvasDockLayout(protectedInput));sameMapping++;
 const result=merged.canvasDockLayout({...protectedInput,mediaComposerExpanded:true}),safe=merged.canvasOverlaySafeArea(input.canvasSize),titleTop=top-38*zoom,titleBottom=top;
 const above=Math.max(0,Math.min(height-safe.bottom,titleTop-12)-safe.top),below=Math.max(0,height-safe.bottom-Math.max(safe.top,titleBottom+12));
 const capacity=Math.max(above-49.5-12,below-49.5-12,above>=49.5?below:0,below>=49.5?above:0);
 if(capacity>=178){
  assert(result.dock.height>=178);assert.equal(result.dock.height,result.dock.maxHeight);
  const overlap=(y,h)=>y<titleBottom&&y+h>titleTop;
  assert(!overlap(result.dock.top,result.dock.height));assert(!overlap(result.toolbar.top,49.5));
  assert(result.dock.top>=safe.top&&result.dock.top+result.dock.height<=height-safe.bottom);
  assert(result.toolbar.top>=safe.top&&result.toolbar.top+49.5<=height-safe.bottom);
  assert.deepEqual(result,merged.canvasDockLayout({...protectedInput,dockMetrics:{...input.dockMetrics,dockHeight:result.dock.height},mediaComposerExpanded:true}),'resize must not oscillate');expanded++;
 }
}
console.log('MERGED_DOCK_COMPOSITION=PASS UNPROTECTED_MAIN_EXACT='+sameMain+' COLLAPSED_MAPPING_EXACT='+sameMapping+' EXPANDED_TITLE_CASES='+expanded+' MEASUREMENT_STABLE=YES');

