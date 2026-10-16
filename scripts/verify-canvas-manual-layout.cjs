const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),esbuild=require('esbuild');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/canvas-manual-layout-20261016');
const root=mode==='BASELINE'?path.join(out,'baseline'):mode==='ROLLBACK'?path.join(out,'rollback-copy'):process.cwd();
const file='src/components/canvas/canvas-client.tsx',source=fs.readFileSync(path.join(root,file),'utf8');
function fns(s){const a=ts.createSourceFile('canvas.tsx',s,99,true,4),map={};function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)map[n.name.text]=n.getText(a);ts.forEachChild(n,visit)}visit(a);return map;}
const functions=fns(source);
const plain=v=>JSON.parse(JSON.stringify(v));
function moduleAt(file){const output=esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const context=vm.createContext({module:{exports:{}},exports:{},require,console});vm.runInContext(output,context);return context.module.exports;}
const feedback=moduleAt('src/lib/canvas/generation-feedback.ts');
const stable=mode==='MODIFIED'?moduleAt('src/lib/canvas/stable-placement.ts'):{};
const context=vm.createContext({Map,NODE_W:300,X_GAP:90,Y_GAP:48,artworkNodeSize:a=>({width:a.width,height:a.height}),artworkImageSize:a=>({width:a.width,height:a.height}),...stable});
vm.runInContext(ts.transpileModule(functions.layoutGraph,{compilerOptions:{target:99}}).outputText,context);
const art=(id,parentId,extra={})=>({id,parentId,width:300,height:200,createdAt:id,...extra});
const initial=[art('A'),art('B','A')],added=[...initial,art('C','A')],cache=new Map();
const render=arts=>plain(context.layoutGraph(arts,'',...Array(5).fill(()=>{}),cache).nodes);
const before=render(initial),after=render(added),moved=before.some(n=>JSON.stringify(n.position)!==JSON.stringify(after.find(a=>a.id===n.id).position));
const existing={x:400,y:100},size={width:384,height:384},obstacles=[{x:500,y:100,width:380,height:260}];
if(mode!=='MODIFIED'){
 assert.equal(moved,true);assert.match(source,/\[snapGrid, setSnapGrid\] = useState\(true\)/);assert.deepEqual(plain(feedback.placeGenerationPreview(existing,size,obstacles)),{x:400,y:408});
 console.log(`${mode}=PASS EXISTING_PLACEHOLDER=RELOCATED GRAPH_REFRESH=MOVED SNAP_DEFAULT=ON EXIT=0`);process.exit(0);
}
assert.equal(moved,false);assert.match(source,/\[snapGrid, setSnapGrid\] = useState\(false\)/);
assert.deepEqual(plain(feedback.generationPositionForTask(existing,existing,size,obstacles)),existing);
const unchanged=plain(Array.from(cache));render(added.map(a=>({...a,width:a.width*2,height:a.height*3})));assert.deepEqual(plain(Array.from(cache)),unchanged,'metadata loads do not reposition nodes');
const saved=render(added.map(a=>a.id==='B'?{...a,canvasX:-917.25,canvasY:333.5}:a));assert.deepEqual(saved.find(n=>n.id==='B').position,{x:-917.25,y:333.5});
const loaded=stable.readPlacementCache(JSON.stringify(Array.from(cache)));assert.deepEqual(plain(Array.from(loaded)),plain(Array.from(cache)));assert.equal(stable.readPlacementCache('{bad').size,0);
const cycle=stable.stableArtworkPositions([art('X','Y'),art('Y','X')],new Map());assert.equal(cycle.size,2);
const live={position:{x:317.25,y:-91.5},dragging:true};assert.deepEqual(plain(stable.canvasNodePosition({position:{x:0,y:0}},live)),{...live});
const many=Array.from({length:400},(_,i)=>({x:400,y:i*420,width:384,height:384}));const nearby=feedback.placeGenerationPreview(existing,size,many);assert.ok(Math.hypot(nearby.x-existing.x,nearby.y-existing.y)<1000);
const receipt=moduleAt('src/lib/imagegen/canvas-receipts.ts');const data=new Map();const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const id='00000000-0000-4000-8000-000000000001';
receipt.saveCanvasReceipt(storage,'a@example.test','project',{id,nodeId:'node:A',x:10,y:20});receipt.saveCanvasReceipt(storage,'b@example.test','project',{id,nodeId:'node:A',x:30,y:40});
receipt.moveCanvasReceipt(storage,'a@example.test','project','node:A',live.position);
assert.deepEqual(plain(receipt.canvasReceipts(storage,'a@example.test','project')[0].receipt),{id,nodeId:'node:A',...live.position});assert.equal(receipt.canvasReceipts(storage,'b@example.test','project')[0].receipt.x,30);
const taskCtx=vm.createContext({generationTaskPosRef:{current:{}},generationTaskSizeRef:{current:{}},rfRef:{current:{getNodes:()=>[]}},rfNodes:[],generationPositionForTask:feedback.generationPositionForTask,generationPlaceholderSize:feedback.generationPlaceholderSize});
vm.runInContext(ts.transpileModule(functions.reserveGenerationPosition,{compilerOptions:{target:99}}).outputText,taskCtx);
const p1=taskCtx.reserveGenerationPosition('task-1',existing,size),p2=taskCtx.reserveGenerationPosition('task-2',existing,size);assert.notDeepEqual(plain(p1),plain(p2),'parallel submissions reserve independently before React render');
assert.match(functions.generateDetailSequence,/const livePosition = generationTaskPosRef\.current\[taskId\]/);assert.match(functions.generatePend,/generationPositionForTask\(livePend, livePend/);
assert.match(functions.landEditResult,/livePendingPosition\(pendingId/);assert.match(functions.runComfyWorkflow,/livePendingPosition\(pendingId/);
for(const name of ['runGen','runCutout','generatePend','generateDetailSequence'])assert.match(functions[name],/expectJsonOk\(response, t\("canvas.saveFailed"\)\)/,name+' checks placement persistence');
assert.match(source,/onNodeDrag=\{\(_, node\) => \{\s*rememberGenerationDrag/);
assert.equal((source.match(/smartLayout\(input, currentEdges\)/g)||[]).length,1);assert.match(functions.tidyLayout,/await applyHistory\(act, false\)/);assert.match(functions.tidyLayout,/pushUndo\(act\)/);
const baseline=fs.readFileSync(path.join(out,'baseline',file),'utf8'),beforeFns=fns(baseline);
const printed=s=>ts.createPrinter({removeComments:true}).printFile(ts.createSourceFile('x.tsx',s,99,true,4));
const withoutEpochGuard=s=>printed(s).replace(/RequestInit & \{\s*isCurrent\?: \(\) => boolean;\s*\}/,'RequestInit').replace(/, isCurrent: init\.isCurrent/g,'');
assert.match(functions.privateFetch,/isCurrent:\s*init\.isCurrent/);
assert.equal(withoutEpochGuard(functions.privateFetch),withoutEpochGuard(beforeFns.privateFetch),'auth, metering and model dispatch unchanged except explicitly integrated account-epoch guard');
function payloads(s){const a=ts.createSourceFile('x.tsx',s,99,true,4),r=[];function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['fd','form'].includes(n.expression.expression.getText(a))&&['append','set'].includes(n.expression.name.text))r.push(n.getText(a).replace(/\r\n/g,'\n'));ts.forEachChild(n,visit)}visit(a);return r;}
assert.deepEqual(payloads(source),payloads(baseline),'supplier payloads unchanged');
console.log('MODIFIED=PASS NEW_PREVIEW=NEARBY EXISTING_PLACEHOLDER=EXACT DRAG_REFRESH=EXACT COMPLETION=LIVE_POSITION RECEIPT=ISOLATED RELOAD=STABLE TIDY=MANUAL SNAP_DEFAULT=OFF PAID_CALLS=0 EXIT=0');
