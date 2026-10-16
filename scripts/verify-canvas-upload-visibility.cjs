const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),esbuild=require('esbuild');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/canvas-upload-visibility-20261016');
const root=mode==='BASELINE'?path.join(out,'baseline'):mode==='ROLLBACK'?path.join(out,'rollback-copy'):process.cwd();
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const load=file=>{const code=esbuild.buildSync({entryPoints:[path.resolve(file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const c=vm.createContext({module:{exports:{}},exports:{},require});vm.runInContext(code,c);return c.module.exports;};
const {placeGenerationPreview}=load('src/lib/canvas/generation-feedback.ts');
const start=source.indexOf('      const firstCanvasSize = preparedCanvasSizes[0]'),end=source.indexOf('      const batchRects = entries.map',start);
assert.ok(start>0&&end>start);
const nodes=[{id:'local',position:{x:0,y:0},width:320,height:260},{id:'remote',position:{x:3000,y:20000},width:500,height:500}];const originals=JSON.stringify(nodes);
const run=(items=nodes)=>{const entries=[{pos:{x:0,y:0}}];const c=vm.createContext({preparedCanvasSizes:[{width:120,height:452}],NODE_W:320,NODE_H:280,NODE_LABEL_H:0,Y_GAP:48,ctx:{x:0,y:0},rfNodes:items,rfRef:{current:{getNodes:()=>items}},flowNodeSize:n=>({width:n.width,height:n.height}),importScopeRef:{current:null},scope:{rects:[]},batchWidth:120,batchHeight:452,entries,relative:[{x:0,y:0}],placeGenerationPreview});vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:99}}).outputText,c);return entries[0].pos;};
const position=run();
if(mode!=='MODIFIED'){assert.ok(position.y>20000);assert.match(source,/rfRef.current.fitView\(/);assert.ok(!source.includes('data-testid="canvas-import-locate"'));console.log(`${mode}=PASS UPLOAD_Y=${position.y} FOCUS=QUEUED LOCATE=ABSENT EXIT=0`);process.exit(0);}
assert.ok(Math.hypot(position.x,position.y)<1000,JSON.stringify(position));assert.equal(JSON.stringify(nodes),originals);
assert.deepEqual(run([]),{x:100,y:-86});
const {canvasFocusViewport}=load('src/lib/canvas/upload-visibility.ts');
for(const view of [{width:1072,height:900},{width:390,height:844}])for(const node of [{x:-4741,y:-6157,width:120,height:452},{x:20000,y:30000,width:400,height:400}]){
 const vp=canvasFocusViewport(node,view,{top:64,left:8,right:8,bottom:84});assert.ok(vp.zoom>.0486);const left=node.x*vp.zoom+vp.x,top=node.y*vp.zoom+vp.y;assert.ok(left>=0&&top>=0&&left+node.width*vp.zoom<=view.width&&top+node.height*vp.zoom<=view.height);
}
assert.equal(canvasFocusViewport({x:NaN,y:0,width:1,height:1},{width:1,height:1},{top:0,bottom:0,left:0,right:0}),null);
assert.match(source,/instance.setViewport\(target/);assert.match(source,/setFlowReady\(value => value \+ 1\)/);assert.match(source,/nodeIds: added/);assert.match(source,/data-testid="canvas-import-locate"/);assert.match(source,/importScopeRef.current === scope/);assert.ok(!source.includes('baseY = Math.max(...existingRects'));
console.log('MODIFIED=PASS UPLOAD=NEARBY EXISTING_COORDS=UNCHANGED FOCUS=DIRECT_VIEWPORT DESKTOP_MOBILE=VISIBLE LOCATE=PRESENT EXIT=0');
