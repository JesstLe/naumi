/** Whole-source original/current Canvas entry traces with existing real image
 * controller/request/presentation modules. Browser/document transports are fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm'),{build}=require('esbuild');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||process.env.PRIMARY_GENERATION_EVIDENCE||'output/canvas-primary-generation');
fs.mkdirSync(out,{recursive:true});process.env.CANVAS_IMAGE_SOURCE_ROOT=root;
const fixture=require('./verify-canvas-image-task-refactor.cjs'),plain=v=>JSON.parse(JSON.stringify(v));
(async()=>{
 const built=await fixture.bundle(),rows=[];let checks=0;
 const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
 const scenarios=['done','partial','reference-fails','cancelled','poll-transient','position-fails','sync-missing','workspace-aba','switch-project','unmounted','prepare-rejected','submit-unknown','terminal-failed','partial-error','needs-review','stored-recovery','malformed-query','ratio-warning','base-file','ref-urls','explicit-roles','transparent','ratiogen'];
 const record=(kind,scenario,f)=>({kind,scenario,post:f.state.post,polls:f.state.polls,forms:f.state.forms,positions:f.state.positions,history:f.state.history,notices:f.state.notices,error:f.state.error??null,remainingReceipts:f.state.storage.size});
 for(const kind of ['derived','blank'])for(const scenario of scenarios){
  const f=fixture.setup(kind,scenario,built);await f.run();
  if(scenario==='poll-transient'&&fixture.boundedReceipt){eq(f.state.post,1,'bounded GET continuation has one original submission');eq(f.state.polls,2,'transient followed by same-job GET');eq(f.state.history.length,1,'one attachment');}
  if(['poll-transient','position-fails','sync-missing'].includes(scenario)&&!(scenario==='poll-transient'&&fixture.boundedReceipt)){assert.equal(typeof f.retry(),'function');checks++;f.state.retried=true;await Promise.all([f.retry()(),f.retry()()]);eq(f.state.post,1,'known task/result retry never submits again');eq(f.state.history.length,1,'one result attachment after concurrent retry');}
  if(scenario==='reference-fails')eq(f.state.post,0,'failed references never submit');
  if(['cancelled','switch-project','unmounted','workspace-aba'].includes(scenario)){eq(f.state.history.length,0,'cancel/stale has no history');eq(f.state.positions.length,0,'cancel/stale has no placement');}
  if(scenario==='submit-unknown')eq(f.state.post,1,'unknown has no automatic repost');
  if(scenario==='done'){eq(f.state.post,1,'one submission');eq(f.state.history,[['result-1','result-2']],'all delivered outputs share one history entry');}
  eq(f.c.generationOperationRef.current.size,0,'busy ownership released');rows.push(record(kind,scenario,f));
 }
 for(const kind of ['derived','blank']){
  const f=fixture.setup(kind,'concurrent',built);await Promise.all([f.run(),f.run()]);eq(f.state.post,1,'concurrent entry has one submission');eq(f.state.history.length,1,'concurrent entry has one attachment');rows.push(record(kind,'concurrent',f));
 }
 for(const admission of ['readonly','no-user','locked','empty','generating','uploading','needs-attention','detail','detail-no-input']){
  const kind=['locked','empty'].includes(admission)?'derived':'blank',f=fixture.setup(kind,admission,built);let detail=[];
  if(admission==='readonly')f.c.readOnly=true;if(admission==='no-user')f.c.user=null;if(admission==='locked')f.c.isNodeLocked=()=>true;
  if(admission==='generating')f.c.setPendNodes(nodes=>nodes.map(n=>({...n,generating:true})));
  if(admission==='uploading')f.c.setPendNodes(nodes=>nodes.map(n=>({...n,uploading:true})));
  if(admission==='needs-attention')f.c.setPendNodes(nodes=>nodes.map(n=>({...n,needsAttention:true})));
  if(admission.startsWith('detail')){f.c.generationMode='detail';f.c.generateDetailSequence=async(source,refs,prompt,files,pend)=>{detail=[source.id,refs.map(a=>a.id),prompt,files.length,pend.id];};if(admission==='detail-no-input')f.c.active.members=[];}
  if(admission==='empty')await f.c.entry.runGen(f.src,'   ');else await f.run();
  eq(f.state.post,0,admission+' never starts a purchase');eq(f.state.history.length,0,admission+' has no attachment');
  if(admission==='detail')eq(detail,['source',['source'],'fixture prompt',0,'pend-A'],'detail delegates unchanged inputs');
  rows.push({...record(kind,admission,f),detail});
 }
 const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),functions={};
 (function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n;ts.forEachChild(n,visit);})(ast);
 let factories=0,preparers=0,textWrites=0;
 for(const name of ['runGen','generatePend',...(!baseline?['generatePreparedPend']:[])])(function visit(n){if(ts.isCallExpression(n)){const fn=n.expression.getText(ast);if(fn==='createCanvasImageTask')factories++;if(fn==='prepareCanvasImageTask')preparers++;if(fn==='persistTextNode')textWrites++;}ts.forEachChild(n,visit);})(functions[name]);
 eq(factories,baseline?2:0,'private task composition leaves React');eq(preparers,baseline?2:0,'request composition leaves React');eq(textWrites,baseline?1:0,'text writes leave React');
 if(!baseline){assert.match(functions.runGen.getText(ast),/runCanvasDerivedImage\(/);assert.match(functions.generatePend.getText(ast),/prepareImageText\(/);assert.match(functions.generatePend.getText(ast),/generatePreparedPend\(/);assert.match(functions.generatePreparedPend.getText(ast),/runCanvasBlankImage\(/);assert.match(functions.canvasImageRunContext.getText(ast),/canvasTextDocument\.attachImageResults/);checks+=5;}
 const comparison=arg('--compare');if(comparison)eq(rows,JSON.parse(fs.readFileSync(comparison,'utf8')).rows,'complete original/current request/result/placement/history/error trace');
 // Exercise the actual text-document owner independently of the Canvas VM ports.
 let textOwnerChecks=0;
 if(!baseline){
  const code=(await build({stdin:{contents:'export {createCanvasTextDocument} from "./src/lib/canvas/text-document";',resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'document-io',setup(b){b.onResolve({filter:/document-scope$/},()=>({path:'port',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const canvasDocumentFetch=(...a)=>__document.fetch(...a);',loader:'js'}));}}]})).outputFiles[0].text;
  const posts=[],storage=new Map();let current=true,fail=false;
  const module={exports:{}},box={module,exports:module.exports,require,console,structuredClone,Date,Map,Set,Response,AbortSignal,crypto:globalThis.crypto,__document:{fetch:async(_scope,_url,init)=>{const body=JSON.parse(init.body);posts.push(body);return fail?Response.json({error:'fixture save failure'},{status:503}):Response.json({persisted:true,node:{...body,base:undefined}});}}};
  vm.createContext(box);vm.runInContext(code,box);const owner=module.exports.createCanvasTextDocument({storage:()=>({getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}),notice:()=>{}});
  const scope={account:'actor',workspace:'personal',project:'tree:source',documentCurrent:()=>current,viewCurrent:()=>current,assertView:()=>assert.ok(current)};
  const doc=owner.bind(scope,'fixture@example.test','fixture@example.test',true),node={id:'text-a',projectKey:'tree:source',content:'original',targetIds:['existing'],canvasX:10,canvasY:20,width:320,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};
  doc.accept([node]);doc.set(nodes=>nodes.map(n=>({...n,content:'latest edited prompt',targetIds:[...n.targetIds,'manual-link']})));
  await doc.attachImageResults(['text-a'],['image-a','image-a','image-b']);
  eq(doc.getSnapshot().nodes[0].content,'latest edited prompt','attachment preserves latest text draft');eq(doc.getSnapshot().nodes[0].targetIds,['existing','manual-link','image-a','image-b'],'attachment merges and deduplicates links');eq(posts.length,1,'one original save queue request');eq(posts[0].content,'latest edited prompt','latest content persisted');textOwnerChecks+=4;
  await doc.attachImageResults(['deleted-text'],['image-a']);eq(posts.length,1,'deleted source is not revived');textOwnerChecks++;
  current=false;await doc.attachImageResults(['text-a'],['foreign']);eq(posts.length,1,'stale document never writes');eq(doc.getSnapshot().nodes[0].targetIds.includes('foreign'),false,'stale document does not change');textOwnerChecks+=2;current=true;
  const readonly=owner.bind(scope,'fixture@example.test','fixture@example.test',false);await readonly.attachImageResults(['text-a'],['readonly']);eq(posts.length,1,'readonly binding never writes');eq(doc.getSnapshot().nodes[0].targetIds.includes('readonly'),false,'readonly binding does not change');textOwnerChecks+=2;
  fail=true;await doc.attachImageResults(['text-a'],['retry-link']);eq(doc.getSnapshot().nodes[0].targetIds.includes('retry-link'),true,'save failure keeps visible links');assert.ok(doc.getSnapshot().unsaved>0);checks++;textOwnerChecks+=2;fail=false;await doc.retry();eq(doc.getSnapshot().unsaved,0,'original draft retry completes');textOwnerChecks++;
 }
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,cases:rows.length,checks,componentPrivateFactories:factories,componentRequestPreparers:preparers,componentTextWrites:textWrites,textOwnerChecks,trace:comparison?'EXACT':'CAPTURED',http:'FIXTURE',pg:false,external:0,rows};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`CANVAS_PRIMARY_GENERATION=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${rows.length} CHECKS=${checks} COMPONENT_PRIVATE_FACTORIES=${factories} COMPONENT_REQUEST_PREPARERS=${preparers} COMPONENT_TEXT_WRITES=${textWrites} TEXT_OWNER_CHECKS=${textOwnerChecks} ORIGINAL_TRACE=${report.trace} ACTUAL_CANVAS=1 HTTP=FIXTURE PG=0 EXTERNAL=0`);
})().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack},null,2));console.error(error);process.exitCode=1;});
