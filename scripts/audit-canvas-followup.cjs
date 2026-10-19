/* Read-only follow-up audit. Actual source functions; mocked IO, no provider/server access. */
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{createRequire}=require('node:module');
const root=process.cwd(),sourceRoot=path.resolve(process.argv[2]||root),out=path.resolve(process.env.AUDIT2_OUT||'output/canvas-followup-policy-review47-20261019');
const source=fs.readFileSync(sourceRoot+'/src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={};let pushUndo;
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='pushUndo')pushUndo=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,walk)}walk(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const inject=(c,names)=>vm.runInContext(compile(names.map(n=>{assert.ok(fn[n],n);return fn[n]}).join('\n')),c);
const file=path.join(root,'scripts/verify-canvas-generation-failure.cjs');
const h={require:createRequire(file),process:{cwd:()=>root,argv:['node','audit',sourceRoot],env:{}},console,Response,File,FormData,Blob,setTimeout};
vm.createContext(h);vm.runInContext(fs.readFileSync(file,'utf8').split('(async()=>{const rows=[];')[0]+';globalThis.setup=setup;',h);
const rows=[];const record=(id,reproduced,input,actual)=>{
 const classification=id==='detail-resolution'?'DESIGN_REVIEW':reproduced?'CONFIRMED_DEFECT':'CONTROL_PASS';
 rows.push({id,observedDifference:reproduced,classification,input,actual});
};
async function main(){
 // Image editing shares this path, unlike runGen/detail failure retention.
 for(const scenario of ['http502','transport','position-fails','missing-result','success']){
  let nodes=[],peak=0,notices=[],undo=[];
  const c={Error,console,readOnly:false,user:{email:'fixture@example.test'},canvasContextEpochRef:{current:0},activeProjectRef:{current:{key:'project-A'}},generationOperationRef:{current:new Set()},rfRef:{current:{getNode:()=>({position:{x:100,y:100}})}},flowNodeSize:()=>({width:320}),artworkNodeSize:()=>({width:320}),X_GAP:40,browserRandomUUID:()=> 'fixture',window:{setInterval:()=>1,clearInterval:()=>{}},setPendNodes:f=>{nodes=f(nodes);peak=Math.max(peak,nodes.length)},readJsonSafe:r=>r.json(),livePendingPosition:(_,pos)=>pos,privateFetchRaw:async()=>Response.json({ok:true},{status:scenario==='position-fails'?503:200}),mergeWorks:async()=>scenario==='missing-result'?[]:[{id:'result-A',image:'/result.png'}],pushAddUndo:id=>undo.push(id),applyServerUser:()=>{},flashTip:s=>notices.push(s)};
  vm.createContext(c);inject(c,['landEditResult']);
  await c.landEditResult({id:'source-A'},async()=>{if(scenario==='transport')throw Error('fixture transport');return Response.json(scenario==='http502'?{error:'fixture gateway'}:{id:'result-A'},{status:scenario==='http502'?502:200})},'扩图');
  assert.equal(peak,1);assert.equal(nodes.length,0);assert.equal(c.generationOperationRef.current.size,0);
  assert.equal(undo.length,scenario==='success'?1:0);assert.equal(notices.length,1);
  record('edit-'+scenario,scenario!=='success',scenario,{created:peak,remaining:nodes.length,operationLock:0,resultInUndo:undo.length,notice:notices[0]});
 }
 // Capture full detail -> privateFetch -> billing boundary. Auth quality remains valid;
 // selected resolution is the demonstrated bug (quality is deliberately not inferred).
 {
  const {c}=h.setup('done');let captured;
  Object.assign(c,{Error,Headers,MAX_GENERATION_COUNT:4,MAX_TOTAL_IMAGES:6,DETAIL_MODULE_ORDER:['hero'],fmt:v=>v,genResolution:'4K',genQuality:'high',authHeader:async()=>({'x-naumi-image-quality':'high'}),billing:{quoteAndSubmit:async(url,init,quote)=>{captured={url,wireResolution:init.body.get('resolution'),format:init.body.get('format'),quotedResolution:quote.resolution,quotedRatio:quote.ratio??null,qualityHeader:init.headers.get('x-naumi-image-quality')};return Response.json({error:'fixture stops before billing execution'},{status:400})}}});
  inject(c,['privateFetch','generateDetailSequence']);await c.generateDetailSequence(c.source,[c.source],'fixture');
  assert.equal(captured.wireResolution,null);assert.equal(captured.quotedResolution,'1K');assert.equal(captured.format,'3:4');assert.equal(captured.qualityHeader,'high');
  record('detail-resolution',true,{selectedResolution:'4K',selectedRatio:'3:4'},captured);
 }
 // The normal success path still reads task position, while pending-node drags
 // update the pending ref. Compare source-task drag which works correctly.
 for(const pending of [false,true]){
  const {c,state}=h.setup('done');let saved;
  Object.assign(c,{Error,MAX_GENERATION_COUNT:4,MAX_TOTAL_IMAGES:6,DETAIL_MODULE_ORDER:['hero'],fmt:v=>v,NODE_W:320,artworkNodeSize:()=>({height:512})});
  inject(c,['generateDetailSequence','rememberGenerationDrag']);
  c.privateFetch=async(url,init)=>{if(init?.method==='POST')return Response.json({jobId:'aplus-fixture'});
   const id=pending?c.pend.id:c.generationTasks[0].id;c.rememberGenerationDrag(id,{x:777,y:888});c.rfRef.current.getNode=()=>({position:{x:777,y:888}});
   return Response.json({status:'done',done:1,shots:[{id:'result',status:'done',url:'/result.png'}]})};
  c.privateFetchRaw=async(url,init)=>{if(url==='/api/artworks/position')saved=JSON.parse(init.body);return Response.json({artworks:state.artifacts,ok:true})};
  await c.generateDetailSequence(c.source,[c.source],'fixture',[],pending?c.pend:undefined);
  assert.equal(c.generationTasks.length,0);assert.equal(saved.x,pending?500:777);assert.equal(saved.y,pending?200:888);
  record(pending?'detail-pending-drag':'detail-source-drag-control',pending,{dragged:{x:777,y:888}},saved);
 }
 // React state setters are represented by in-memory setters; all history and
 // project-opening business functions themselves are extracted without edits.
 for(const switchProject of [false,true]){
  const sourceA={id:'result-A',image:'/a.png'},sourceB={id:'result-B',image:'/b.png'};let requests=[];
  const c={Error,console,Promise,Map,Set,WeakMap,structuredClone,AbortSignal,readOnly:false,user:{email:'fixture@example.test'},canvasAccountRef:{current:'same-account'},active:{key:'project-A',members:[sourceA]},activeProjectRef:{current:{key:'project-A',members:[sourceA]}},activeKey:'project-A',undoStack:[],redoStack:[],works:[sourceA,sourceB],historyBusyRef:{current:false},historyAttemptsRef:{current:new WeakMap()},textSaveQueuesRef:{current:new Map()},videoNodesStore:{flush:async()=>{},getNode:()=>null},unsavedTextRef:{current:new Set()},setUnsavedTextCount:()=>{},setHistorySaving:()=>{},browserRandomUUID:()=> 'fixture-history-operation',t:k=>k,L:s=>s,expectJsonOk:r=>r.json(),flashTip:s=>{throw Error(s)},privateFetchRaw:async(url,init)=>{requests.push({url,body:JSON.parse(init.body),active:c.activeKey});return Response.json({ok:true})},ocrRequestEpochRef:{current:0},setOcrArtworkId:()=>{},setOcrSegments:()=>{},setOcrStatus:()=>{},resetImportScope:()=>{},setSelectedId:()=>{},setSelectedTextId:()=>{},setPendNodes:()=>{},setCreatingNew:()=>{},setBrowsing:()=>{},setSidebarOpen:()=>{},localStorage:{setItem:()=>{}},setTextNodes:()=>{}};
  c.setUndoStack=f=>c.undoStack=typeof f==='function'?f(c.undoStack):f;c.setRedoStack=f=>c.redoStack=typeof f==='function'?f(c.redoStack):f;c.setWorks=f=>c.works=f(c.works);
  c.setActiveKey=key=>{c.activeKey=key;c.active={key,members:key==='project-B'?[sourceB]:[sourceA]};c.activeProjectRef.current=c.active};
  vm.createContext(c);inject(c,['openProject','pushAddUndo','applyHistory','doUndo']);vm.runInContext(compile('globalThis.pushUndo=('+pushUndo+');'),c);
  c.pushAddUndo('result-A',c.works);assert.equal(c.undoStack.length,1);
  if(switchProject)c.openProject('project-B');await c.doUndo();
  assert.equal(requests.length,1);assert.equal(requests[0].body.operations[0].id,'result-A');assert.equal(requests[0].body.operations[0].visible,false);assert.ok(!c.works.some(w=>w.id==='result-A'));
  record(switchProject?'cross-project-undo':'same-project-undo-control',switchProject,{createdIn:'project-A',undoIn:c.activeKey},{request:requests[0],sourceAStillLocal:c.works.some(w=>w.id==='result-A')});
 }
 // Admin mappings are intentionally allowed to differ from display values.
 const {mapResolution}=require(root+'/src/lib/model-config/resolution-policy.ts');
 const {policyQuality}=require(root+'/src/lib/model-config/quality-policy.ts');
 const policies=[];
 for(const wire of ['1K','4K']){
  const body={model:'fixture',size:'legacy',resolution:'stale'};
  mapResolution(body,{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'4K':wire}},'4K','3:4');
  assert.equal(body.resolution,wire);assert.equal(body.size,undefined);assert.equal(body.aspect_ratio,'3:4');assert.equal(body.model,'fixture');
  policies.push({id:'resolution-4K-to-'+wire,classification:'EXPECTED_DESIGN',actual:body});
 }
 const omitted={model:'fixture',size:'legacy',resolution:'old',image_size:'old',image_config:{image_size:'old'},generationConfig:{imageConfig:{imageSize:'old'}}};
 mapResolution(omitted,{mode:'omit',field:'resolution',ratioField:'aspect_ratio',values:{}},'4K','3:4');
 assert.equal(omitted.resolution,undefined);assert.equal(omitted.size,undefined);assert.equal(omitted.image_size,undefined);assert.equal(omitted.image_config.image_size,undefined);assert.equal(omitted.generationConfig.imageConfig.imageSize,undefined);
 policies.push({id:'resolution-omit',classification:'EXPECTED_DESIGN',actual:omitted});
 let missing;try{mapResolution({}, {mode:'map',field:'resolution',values:{}},'4K')}catch(e){missing=e.code}assert.equal(missing,'MODEL_PARAMETER_UNAVAILABLE');
 policies.push({id:'missing-map-is-error',classification:'EXPECTED_DESIGN',actual:missing});
 const quality=policyQuality({mode:'map',choices:[{id:'high',label:'高',value:'medium'}]},'high');assert.equal(quality,'medium');
 policies.push({id:'quality-high-to-medium',classification:'EXPECTED_DESIGN',actual:quality});
 const noQuality=policyQuality({mode:'omit',choices:[{id:'high',label:'高'}]},'high');assert.equal(noQuality,undefined);
 policies.push({id:'quality-omit',classification:'EXPECTED_DESIGN',actual:null});
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sourceRoot,cases:rows,policies,confirmedBugGroups:3,designReviewGroups:1,liveConfigurationVerified:false,supplierCalls:0},null,2));
 for(const row of rows)console.log(`${row.id}: ${row.classification} ${JSON.stringify(row.actual)}`);
 for(const row of policies)console.log(`${row.id}: ${row.classification} ${JSON.stringify(row.actual)}`);
 console.log(`FOLLOWUP_AUDIT=PASS BEHAVIOR_CASES=${rows.length} POLICY_CASES=${policies.length} CONFIRMED_BUG_GROUPS=3 DESIGN_REVIEW_GROUPS=1 SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
