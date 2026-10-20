/* Read-only source-function fixtures. No HTTP, database, provider or server access. */
require('tsx/cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const ts = require('typescript');
const root = process.cwd();
const baseline = process.argv.includes('--baseline');
const sourceRoot = path.resolve(process.argv[2] || root);
const out = path.resolve(process.env.AUDIT_OUT || 'output/canvas-postrelease-audit47-20261019');
const canvas = fs.readFileSync(path.join(sourceRoot, 'src/components/canvas/canvas-client.tsx'), 'utf8');
const aplus = fs.readFileSync(path.join(sourceRoot, 'src/app/api/aplus/route.ts'), 'utf8');
function extract(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = {}; let recovery;
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name) functions[n.name.text] = n.getText(ast);
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.arguments[0]?.getText(ast).includes('canvasReceipts(sessionStorage,owner,project)')) recovery = n.arguments[0].getText(ast);
    ts.forEachChild(n, visit);
  }
  visit(ast); return {functions, recovery};
}
const extracted = extract(canvas, 'canvas.tsx');
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
// Reuse the existing committed harness, but not its test runner or output writes.
const harnessPath = path.join(root, 'scripts/verify-canvas-generation-failure.cjs');
const harness = fs.readFileSync(harnessPath, 'utf8').split('(async()=>{const rows=[];')[0];
assert.ok(harness.includes('function setup(scenario)'));
const hc = {require:createRequire(harnessPath),process:{cwd:()=>root,argv:['node','audit',sourceRoot],env:{}},console,Response,FormData,File,Blob,setTimeout};
vm.createContext(hc); vm.runInContext(harness + '\nglobalThis.makeSetup=setup;', hc);
const rows = [];
function record(id, input, actual, expected, reproduced) {rows.push({id,input,actual,expected,reproduced});}
function setupDetail(scenario) {
  const {c,state} = hc.makeSetup(scenario);
  Object.assign(c,{MAX_GENERATION_COUNT:4,MAX_TOTAL_IMAGES:6,DETAIL_MODULE_ORDER:['hero'],fmt:v=>v});
  let peak = 0; const set = c.setGenerationTasks;
  c.setGenerationTasks=f=>{set(f);peak=Math.max(peak,c.generationTasks.length)};
  state.peak=()=>peak;
  vm.runInContext(compile(extracted.functions.generateDetailSequence),c);
  return {c,state};
}
async function main() {
  const af=extract(aplus,'aplus.ts').functions;
  const sizeContext={...require(root+'/src/lib/imagegen/request-size.ts')};vm.createContext(sizeContext);vm.runInContext(compile((af.ratioFor || '')+'\n'+af.sizeFor),sizeContext);
  for (const ratio of ['3:4','2:3','9:16','1:1']) {
    const {c,state}=setupDetail('done');c.genRatio=ratio;
    c.privateFetch=async(url,options)=>{state.format=options.body.get('format');return Response.json({error:'fixture stops before provider'},{status:400})};
    await c.generateDetailSequence(c.source,[c.source],'fixture');
    const actual={format:state.format,size:sizeContext.sizeFor(state.format,'gpt-image-2',!baseline)};
    const mismatch=baseline && ratio!=='1:1';
    assert.equal(actual.format,baseline && ['3:4','2:3'].includes(ratio)?'aplus-web':ratio);
    assert.equal(actual.size,baseline ? (ratio==='1:1'?'1024x1024':ratio==='9:16'?'1024x1536':'1536x1024') : ({'3:4':'1152x1536','2:3':'1024x1536','9:16':'864x1536','1:1':'1024x1024'})[ratio]);
    record('detail-ratio-'+ratio,ratio,actual,'Requested aspect ratio remains exact',mismatch);
  }
  {
    const {c,state}=setupDetail('reference-fails');
    await c.generateDetailSequence(c.source,[c.source],'fixture');
    const actual={created:state.peak(),remaining:c.generationTasks.length,retainedFailure:c.generationTasks.some(t=>!!t.failure),networkSubmissions:state.post};
    assert.equal(actual.created,1);assert.equal(actual.remaining,baseline?0:1);assert.equal(actual.retainedFailure,!baseline);assert.equal(actual.networkSubmissions,0);
    record('detail-failure-placeholder','Reference read rejects',actual,'One visible failure placeholder remains',baseline);
    const normal=hc.makeSetup('reference-fails');await normal.c.runGen(normal.c.source,'fixture',{ratio:'3:4'});
    assert.equal(normal.c.generationTasks[0].failure.kind,'not-started');
    record('standard-failure-control','Same read failure in runGen',{remaining:normal.c.generationTasks.length,failure:normal.c.generationTasks[0].failure.kind},'One failure placeholder remains',false);
  }
  {
    const {c}=hc.makeSetup('reference-fails');await c.runGen(c.source,'fixture',{ratio:'3:4'});
    c.source.status='completed';c.activeProjectRef.current.members=[c.source];
    c.rfRef.current.getNodes=()=>[];c.isNodeLocked=()=>false;c.canFeature=()=>true;c.hasRenderableImage=()=>true;
    c.selectionRunTargets=require(path.join(root,'src/lib/canvas/selection-run.ts')).selectionRunTargets;
    vm.runInContext(compile(extracted.functions.currentSelectionRunTargets),c);
    assert.equal(c.generationOperationRef.current.size,0);
    const blocked=c.currentSelectionRunTargets(['source']).length;
    c.generationTasks=[];const clear=c.currentSelectionRunTargets(['source']).length;
    assert.equal(blocked,baseline?0:1);assert.equal(clear,1);
    record('batch-failed-node','Retained not-started failure, no active operation lock',{withFailure:blocked,withoutFailure:clear},'Both produce one runnable target',baseline);
  }
  for(const loaded of [false,true]) {
    let cleared=0,positions=0,scheduled=0;
    const results=loaded?[{id:'result',image:'/media/result.png'}]:[];
    const receipt={key:'fixture-receipt',receipt:{id:'fixture-job',nodeId:'node:source',x:400,y:200}};
    const c={...require(root+'/src/lib/canvas/generation-failure.ts'),imageOutputWarningText:require(root+'/src/lib/imagegen/output-advisory.ts').imageOutputWarningText,user:{email:'fixture@example.test'},readOnly:false,works:[],active:{key:'project'},sessionStorage:{},canvasReceipts:()=>[receipt],generationOperationRef:{current:new Set()},worksRef:{current:[]},NODE_LABEL_H:24,
      pollImagegen:async()=>({status:'succeeded',artifacts:[{artworkId:'result',height:512}]}),privateFetchRaw:async(url)=>{if(url==='/api/artworks/position'){positions++;return {ok:true}}return {ok:true,json:async()=>({artworks:results})}},pushAddUndoMany:()=>{},flashTip:()=>{},clearCanvasReceipt:()=>{cleared++},setTimeout:()=>{scheduled++;return 1},clearTimeout:()=>{},console,
      canvasAccountRef:{current:'fixture'},targetEmail:null,invalidateBrowserData:()=>{},expectJsonOk:async r=>r.json(),t:k=>k,setWorks:updater=>{c.works=typeof updater==='function'?updater(c.works):updater},authHeader:async()=>({}),fetch:async()=>{throw Error('fixture account read fails')}};
    vm.createContext(c);
    vm.runInContext(compile(extracted.functions.mergeWorks+'\n'+extracted.functions.refetchWorks),c);
    // Capture the promise of the original effect's first sync; no branching changes.
    assert.ok(extracted.recovery.includes('void sync();'));
    vm.runInContext(compile('globalThis.cleanup=('+extracted.recovery.replace('void sync();','globalThis.firstSync=sync();')+')();'),c);
    await c.firstSync;c.cleanup();
    assert.equal(cleared,loaded||baseline?1:0);assert.equal(positions,1);assert.equal(scheduled,!loaded&&!baseline?1:0);
    record(loaded?'recovery-loaded-control':'recovery-missing-result',{status:'succeeded',resultLoaded:loaded},{receiptCleared:cleared,nextPollScheduled:scheduled,resultPresent:results.length===1},loaded?'Clear receipt after result appears':'Retain receipt while result is missing',!loaded&&baseline);
  }
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'audit-results.json'),JSON.stringify({sourceRoot,cases:rows,remainingBugGroups:baseline?4:0,supplierCalls:0},null,2)+'\n');
  for(const row of rows) console.log(`${row.id}: ${row.reproduced?'REPRODUCED':'CONTROL_PASS'} ${JSON.stringify(row.actual)}`);
  console.log(`${baseline?'BASELINE':'MODIFIED'}=PASS CASES=9 REMAINING_BUG_GROUPS=${baseline?4:0} SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
