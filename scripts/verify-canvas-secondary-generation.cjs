/** Whole-checkout actual Canvas callers, not copied task implementations.
 * Narrow browser/HTTP ports come from the existing task verifier. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||process.env.SECONDARY_GENERATION_EVIDENCE||'output/canvas-secondary-generation');
fs.mkdirSync(out,{recursive:true});process.env.TASK_SOURCE_ROOT=root;process.env.TASK_EVIDENCE=out;
const fixture=require('./verify-canvas-task-boundaries.cjs');
const data=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const built=await fixture.bundle(),rows=[];let checks=0;
 const eq=(a,b,message)=>{assert.deepEqual(data(a),data(b),message);checks++;};
 for(const kind of ['cutout','expand','annotate','detail','detail-blank'].filter(kind=>fixture.editKinds.includes(kind))){
  for(const scenario of ['done','rejected','submit-unknown','position-fails','sync-missing','project-switch','project-aba','unmounted','auth-aba']){
   const f=fixture.setup(kind,scenario,built);await f.run();
   const initial={posts:f.state.posts,positions:f.state.positions.length,history:f.state.history.length};
   if(['project-switch','project-aba','unmounted'].includes(scenario))f.restore();
   const retry=f.retry();
   if(typeof retry==='function'&&scenario!=='auth-aba'){
    f.state.retried=true;await Promise.all([retry(),retry()]);
   }
   if(['done','position-fails','sync-missing'].includes(scenario)){
    eq(f.state.posts,1,kind+' original accepted request');eq(f.state.quotes,1,kind+' original quote');eq(f.state.history.length,1,kind+' one attachment');
   }
   if(['project-switch','project-aba','unmounted'].includes(scenario)){
    eq(initial.positions,0,kind+' late attempt does not attach');eq(f.state.posts,1,kind+' original accepted request remains');
    if(kind!=='detail')eq(f.state.history.length,1,kind+' original view continuation');
   }
   if(scenario==='submit-unknown'){
    eq(f.state.supplier,1,kind+' no supplier replay');eq(f.state.quotes,1,kind+' no requote');eq(f.state.forms[0],f.state.forms[1],kind+' retained request bytes');
    eq(f.state.headers[0]['x-naumi-billing-operation-id'],f.state.headers[1]['x-naumi-billing-operation-id'],kind+' original operation');
   }
   if(scenario==='auth-aba')eq(f.state.posts,0,kind+' auth ABA never submits');
   eq(f.state.intervals.size,0,kind+' timer cleanup');
   rows.push({kind,scenario,initial,posts:f.state.posts,supplier:f.state.supplier,quotes:f.state.quotes,polls:f.state.polls,history:f.state.history,positions:f.state.positions,
    // Compare creative request bytes separately from random operation headers.
    forms:f.state.forms,frames:f.state.frames});
  }
 }
 for(const scenario of ['partial','poll-fails','poll-malformed','short-done','cancelled']){
  const f=fixture.setup('detail-blank',scenario,built);await f.run();const retry=f.retry();if(retry){f.state.retried=true;await retry();}
  if(scenario==='cancelled')eq(f.state.posts,0,'detail cancellation never submits');else eq(f.state.posts,1,'detail partial/poll retains job');
  rows.push({kind:'detail-blank',scenario,posts:f.state.posts,supplier:f.state.supplier,quotes:f.state.quotes,polls:f.state.polls,history:f.state.history,positions:f.state.positions,forms:f.state.forms,frames:f.state.frames});
 }
 const client=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',client,99,true,4),functions={};
 (function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n;ts.forEachChild(n,visit);})(ast);
 const names=['landEditResult','generateDetailSequence','runComfyWorkflow'];let privateFactories=0,timers=0;
 for(const name of names){assert.ok(functions[name]);checks++;(function visit(n){if(ts.isCallExpression(n)&&['createCanvasEditTask','createCanvasDetailTask','createCanvasComfyWorkflow','createCanvasResultAttachment','createRetainedBillingSubmission'].includes(n.expression.getText(ast)))privateFactories++;if(ts.isCallExpression(n)&&n.expression.getText(ast)==='window.setInterval')timers++;ts.forEachChild(n,visit);})(functions[name]);}
 eq(privateFactories,baseline?8:0,'execution/attachment/retained-request composition leaves React');eq(timers,baseline?2:0,'presentation timers leave React');eq(client.includes('const comfyRunsRef='),baseline,'retained workflow controllers leave React');
 if(!baseline){
  assert.match(functions.landEditResult.getText(ast),/runCanvasEdit\(/);assert.match(functions.generateDetailSequence.getText(ast),/runCanvasDetail\(/);assert.match(functions.runComfyWorkflow.getText(ast),/workflowRunsRef\.current!\.run\(/);checks+=3;
 }
 const comparison=arg('--compare');if(comparison){const expected=JSON.parse(fs.readFileSync(comparison,'utf8'));eq(rows,expected.rows,'full original versus current request/result/placement/history trace');}
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,cases:rows.length,checks,componentPrivateFactories:privateFactories,componentTimers:timers,actualCanvasCallers:true,transport:'EXISTING_FIXTURE_PORTS',realPg:false,supplierCalls:'FIXTURE',externalCalls:0,rows};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_SECONDARY_GENERATION=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${rows.length} CHECKS=${checks} COMPONENT_PRIVATE_FACTORIES=${privateFactories} COMPONENT_TIMERS=${timers} ORIGINAL_REQUEST_RESULT_TRACE=${comparison?'EXACT':'CAPTURED'} ACTUAL_CANVAS=1 UNKNOWN_SUPPLIER_REPLAY=0 KNOWN_RESULT_REPOST=0 EXTERNAL=0 SUPPLIER=FIXTURE`);
})().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack},null,2));console.error(error);process.exitCode=1;});
