// Complete source-root A/B; actual old Canvas handlers versus retained tasks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.TEXT_TASK_SOURCE_ROOT||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(process.env.TEXT_TASK_EVIDENCE||'output/refactor-r3d-20261024');fs.mkdirSync(out,{recursive:true});
const billingSource=fs.readFileSync(path.join(root,'src/lib/billing/client.tsx'),'utf8'),billingAst=ts.createSourceFile('billing.tsx',billingSource,99,true,4),callbacks={};(function walk(n){if(ts.isVariableDeclaration(n)&&['submit','quoteAndSubmit'].includes(n.name.getText(billingAst)))callbacks[n.name.getText(billingAst)]=n.initializer.getText(billingAst);ts.forEachChild(n,walk);})(billingAst);
const src=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',src,99,true,4),fn={};(function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);ts.forEachChild(n,walk);})(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText,plain=x=>JSON.parse(JSON.stringify(x));let cases=0,checks=0;
const eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;},test=async(name,run)=>{await run();cases++;console.log('CASE='+name+' PASS')};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const node=(id='text-a')=>({id,projectKey:'tree:A',title:'original',prompt:'',content:'before',status:'idle',canvasX:10,canvasY:20,width:380,height:240,sourceIds:[],productIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
async function load(){const files=['src/lib/canvas/document-scope.ts','src/lib/billing/client-intent.ts',...(fs.existsSync(path.join(root,'src/lib/billing/client-response.ts'))?['src/lib/billing/client-response.ts']:[]),...(!baseline?['src/lib/canvas/text-task.ts','src/lib/canvas/text-task-request.ts','src/lib/canvas/text-task-controller.ts']:[])];const result=await build({stdin:{contents:files.map(p=>'export * from '+JSON.stringify(path.join(root,p))+';').join('\n'),loader:'ts',resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'ports'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'ports'}));b.onLoad({filter:/.*/,namespace:'ports'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const currentWorkspace=()=>__workspace.name,currentWorkspaceRevision=()=>__workspace.revision;'}));}}]});const fixtureModule={exports:{}},c={module:fixtureModule,exports:fixtureModule.exports,__workspace:{name:'personal',revision:0},console,Error,Map,Set,WeakMap,Promise,Headers,Response,Request,FormData,Date,TextEncoder,TextDecoder,TransformStream,URL,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(result.outputFiles[0].text,c);return Object.assign(c,fixtureModule.exports);}
function setup(c,request){
 const context=c.createCanvasDocumentContext(),scope=context.render('user','tree:A'),state={nodes:[node()],posts:[],quotes:0,currentPrice:3,saveCalls:0,saveOk:true,supplier:0,histories:[],models:[],error:'',beforeReply:async()=>{},beforeSubmit:async()=>{},save:async()=>{},lost:false};
 const receipts=new Map();const quote=async()=>{state.quotes++;return {feature:'canvas.text-generate',credits:state.currentPrice,reserveCredits:state.currentPrice,quantity:1,version:1}};
 c.fetch=async(url,init)=>{const headers=new Headers(init.headers),id=headers.get('x-naumi-billing-operation-id');state.posts.push({id,body:JSON.parse(init.body),price:Number(headers.get('x-naumi-billing-credits'))});if(state.rejectOnce){state.rejectOnce=false;return Response.json({accepted:false,error:'invalid input'},{status:422})}if(state.failureOnce){const failure=state.failureOnce;state.failureOnce=undefined;return Response.json({...failure,operationId:failure.operationId==='CURRENT'?`tool-${id}`:failure.operationId},{status:502});}let result=receipts.get(id);if(!result){state.supplier++;result={text:'generated answer',model:'text-model'};receipts.set(id,result);}await state.beforeReply();if(state.lost){state.lost=false;throw Error('response lost')}return Response.json(result);};
 const storage=new Map();Object.assign(c,{useCallback:f=>f,user:{email:'user'},intents:{current:new Map()},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},browserRandomUUID:()=>crypto.randomUUID(),invalidateBrowserData(){},refresh:async()=>{},toast(){},window:{dispatchEvent(){}},MODEL_CATALOG_REFRESH:'refresh',getQuote:quote});
 vm.runInContext(compile(`{const submit=${callbacks.submit};const quoteAndSubmit=${callbacks.quoteAndSubmit};globalThis.billing={quote:getQuote,submit,quoteAndSubmit};}`),c);
 const submit=c.billing.submit;
 const document={getSnapshot:()=>({nodes:state.nodes}),set:f=>{if(scope.documentCurrent())state.nodes=f(state.nodes)},save:async n=>{state.saveCalls++;await state.save();return state.saveOk?n:null}};
 const ports={document,changed(){},model:m=>state.models.push(m),history:n=>state.histories.push(n),errorText:'text failed',submit:async(r,retained,s)=>{await state.beforeSubmit();s.assertView();const init={method:'POST',headers:{'content-type':'application/json','x-naumi-billing-intent-slot':r.node.id,...(r.operationId?{'x-naumi-billing-operation-id':r.operationId}:{})},body:JSON.stringify(r.payload)};return retained.submit({quote,submit},'/api/canvas/text-generate',init,{feature:'canvas.text-generate',quantity:1},s.assertView);}};
 let task,run;
 if(!baseline){task=c.createCanvasTextTask(request||c.generalTextTask(state.nodes[0],'write prompt','Text'));run=()=>task.run(scope,ports);}
 else{Object.assign(c,{readOnly:false,nodeSettingsReady:true,isNodeLocked:()=>false,selectedText:state.nodes[0],textPrompt:'write prompt',textModel:'old',generationOperationRef:{current:new Set()},canvasContextEpochRef:{current:0},canvasAccountRef:{current:'user'},batchRunMountedRef:{current:true},setTextError:e=>state.error=e,setTextModel:m=>state.models.push(m),setTextNodes:document.set,persistTextNode:document.save,t:k=>k,readJsonSafe:r=>r.json(),privateFetch:async(url,init)=>{await state.beforeSubmit();return c.billing.quoteAndSubmit(url,init,{feature:'canvas.text-generate',quantity:1})}});vm.runInContext(compile(fn.generateTextNode),c);run=()=>c.generateTextNode({node:state.nodes[0],prompt:'write prompt'});}
 return {state,scope,context,ports,task,run};
}
(async()=>{
 const c=await load();
 await test('known-answer-save-retry-zero-regeneration',async()=>{const f=setup(c);f.state.saveOk=false;eq(await f.run(),false);eq(f.state.nodes[0].content,'generated answer');f.state.saveOk=true;eq(await f.run(),true);eq(f.state.supplier,baseline?2:1);eq(f.state.quotes,baseline?2:1);});
 await test('lost-response-retains-original-price-operation',async()=>{const f=setup(c);f.state.lost=true;eq(await f.run(),false);f.state.currentPrice=99;eq(await f.run(),true);eq(f.state.posts.map(p=>p.price),baseline?[3,99]:[3,3]);eq(f.state.quotes,baseline?2:1);eq(f.state.posts.length,2);eq(f.state.posts[0].id===f.state.posts[1].id,true);eq(f.state.supplier,1);});
 await test('completed-response-after-project-switch-is-saved',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const running=f.run();await entered.promise;f.context.render('user','tree:B');if(baseline)c.canvasContextEpochRef.current++;g.resolve();eq(await running,!baseline);eq(f.state.saveCalls,baseline?0:1);eq(f.state.models,[]);});
 if(!baseline){
  await test('general-writing-request-keeps-explicit-instruction-and-body-separate',()=>{
    const original={...node(),prompt:'saved old instruction',content:'  latest body\nwith detail  ',sourceIds:['text-source']},request=c.generalTextTask(original,'  explicit new instruction  ','Text');
    eq(request.payload.prompt,'explicit new instruction');eq(request.node.prompt,'explicit new instruction');eq(request.payload.content,original.content);eq(request.node.content,original.content);eq(request.payload.sourceIds,['text-source']);eq(original.prompt,'saved old instruction');
  });
  await test('body-polish-ignores-supplied-old-instruction-preserves-writing-draft',()=>{
    const original={...node(),prompt:'saved writing instruction',content:'latest body'},request=c.generalTextTask(original,'must not leak into polish','Text','polish');
    ok(request.payload.prompt.startsWith('润色当前正文'));ok(!request.payload.prompt.includes('must not leak'));eq(request.node.prompt,'saved writing instruction');eq(request.payload.content,'latest body');eq(original.prompt,'saved writing instruction');
    const implicit=c.generalTextTask(original,'  ','Text');eq(implicit.payload.prompt,request.payload.prompt);eq(implicit.node.prompt,'');
    const empty=c.generalTextTask({...original,content:'',status:'completed'},'old input','Text','polish');eq(empty.payload.prompt,'');eq(empty.node.prompt,'saved writing instruction');
  });
  await test('polish-task-success-and-history-preserve-saved-writing-instruction',async()=>{
    const original={...node(),prompt:'keep this writing instruction',content:'polish this body'},request=c.generalTextTask(original,'ignored','Text','polish'),f=setup(c,request),history=[];
    f.state.nodes=[original];f.ports.historyEdit=(before,after)=>history.push({before,after});
    eq(await f.run(),true);eq(f.state.nodes[0].prompt,original.prompt);eq(f.state.nodes[0].content,'generated answer');eq(f.state.posts[0].body.prompt,request.payload.prompt);eq(history.length,1);eq(history[0].before.prompt,original.prompt);eq(history[0].after.prompt,original.prompt);eq(history[0].before.content,original.content);
  });
  await test('polish-unknown-failure-retains-body-draft-and-original-resume',async()=>{
    const original={...node(),prompt:'keep saved instruction',content:'original body'},request=c.generalTextTask(original,'ignored','Text','polish'),f=setup(c,request);
    f.state.nodes=[original];f.state.lost=true;eq(await f.run(),false);eq(f.state.nodes[0].content,original.content);eq(f.state.nodes[0].prompt,original.prompt);
    f.state.nodes=[{...f.state.nodes[0],prompt:'newer manual instruction'}];eq(await f.run(),true);eq(f.state.nodes[0].prompt,'newer manual instruction');eq(f.state.posts.length,2);eq(f.state.posts[1].body,f.state.posts[0].body);eq(f.state.posts[1].id,f.state.posts[0].id);eq(f.state.supplier,1);
  });
  await test('same-task-double-click-one-flight',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const one=f.run();await entered.promise;const two=f.run();g.resolve();await Promise.all([one,two]);eq(f.state.posts.length,1);eq(f.state.saveCalls,1);});
  for(const kind of ['account','workspace','project'])await test('before-dispatch-'+kind+'-ABA',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeSubmit=()=>{entered.resolve();return g.promise};const pending=f.run();await entered.promise;if(kind==='account'){f.context.render('other','tree:A');f.context.render('user','tree:A')}else if(kind==='project'){f.context.render('user','tree:B');f.context.render('user','tree:A')}else{c.__workspace.name='tenant';c.__workspace.revision++;c.__workspace.name='personal';c.__workspace.revision++;}g.resolve();eq(await pending,false);eq(f.state.posts.length,0);});
  await test('known-answer-survives-account-switch-explicit-resume',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const pending=f.run();await entered.promise;f.context.render('other','tree:A');g.resolve();eq(await pending,false);eq(f.state.saveCalls,0);const current=f.context.render('user','tree:A');const doc={...f.ports.document,set:update=>{f.state.nodes=update(f.state.nodes)}};eq(await f.task.run(current,{...f.ports,document:doc}),true);eq(f.state.posts.length,1);eq(f.state.saveCalls,1);});
  await test('manual-newer-fields-survive-answer',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const pending=f.run();await entered.promise;f.state.nodes=[{...f.state.nodes[0],width:620,sourceIds:['new-reference'],content:'manual draft'}];g.resolve();eq(await pending,true);eq(f.state.nodes[0].width,620);eq(f.state.nodes[0].sourceIds,['new-reference']);eq(f.state.nodes[0].content,'manual draft');});
  await test('deleted-node-not-resurrected',async()=>{const f=setup(c),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const pending=f.run();await entered.promise;f.state.nodes=[];g.resolve();eq(await pending,false);eq(f.state.nodes,[]);eq(f.state.saveCalls,0);eq(f.task.getSnapshot().hasResult,true);});
  for(const mode of ['reverse','assist'])await test(mode+'-request-save-history-once',async()=>{const source=mode==='reverse'?{id:'art',canvasX:10,canvasY:20}:node(),product={id:'product',title:'Product'},request=c.derivedTextTask({source,mode,product:mode==='assist'?product:undefined,project:'tree:A',title:mode,productTitle:'Product',position:{x:10,y:20,width:300},gap:96});eq(request.node.canvasX,406);eq(request.payload.mode,mode);const f=setup(c,request);f.state.saveOk=false;eq(await f.run(),false);eq(f.state.histories.length,0);f.state.saveOk=true;eq(await f.run(),true);eq(f.state.histories.length,1);eq(f.state.posts.length,1);if(mode==='assist')eq(f.state.nodes.find(n=>n.id===request.node.id).content,'@Product\n\ngenerated answer');});
  await test('batch-stops-queued-starts-after-navigation',async()=>{const f=setup(c),owner=c.createCanvasTextTasks(),g=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return g.promise};const requests=[1,2,3].map(i=>c.derivedTextTask({source:{id:'art'+i},mode:'reverse',project:'tree:A',title:'Reverse',productTitle:'',position:{x:10,y:20,width:300},gap:96}));const running=owner.batch(f.scope,'reverse',requests,f.ports);await entered.promise;for(let i=0;i<200&&f.state.posts.length<2;i++)await new Promise(r=>setTimeout(r,1));eq(f.state.posts.length,2);f.context.render('user','tree:B');g.resolve();eq(await running,{succeeded:2,failed:0,skipped:1});eq(f.state.posts.length,2);eq(f.state.histories.length,3);eq(f.state.nodes.filter(n=>n.status==='failed').length,1);eq(f.state.nodes.find(n=>n.id===requests[2].node.id).error,'画布已切换，此图片尚未提交反推');});
  await test('same-text-different-nodes-distinct-paid-intents',async()=>{const f=setup(c),owner=c.createCanvasTextTasks();f.state.nodes.push(node('text-b'));const one=c.generalTextTask(f.state.nodes[0],'identical prompt','Text'),two=c.generalTextTask(f.state.nodes[1],'identical prompt','Text');await Promise.all([owner.execute(f.scope,one,f.ports),owner.execute(f.scope,two,f.ports)]);eq(f.state.posts.length,2);ok(f.state.posts[0].id!==f.state.posts[1].id);eq(f.state.supplier,2);});
  await test('known-rejection-allows-edited-new-intent',async()=>{const f=setup(c),owner=c.createCanvasTextTasks();f.state.rejectOnce=true;eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'bad prompt','Text'),f.ports),false);eq(owner.retryable(f.scope,'text-a'),false);eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'corrected prompt','Text'),f.ports),true);eq(f.state.posts[1].body.prompt,'corrected prompt');ok(f.state.posts[0].id!==f.state.posts[1].id);eq(f.state.supplier,1);});
  await test('unknown-new-prompt-resumes-old-body',async()=>{const f=setup(c),owner=c.createCanvasTextTasks();f.state.lost=true;await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'original prompt','Text'),f.ports);eq(owner.retryable(f.scope,'text-a'),true);await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'changed prompt','Text'),f.ports);eq(f.state.posts[1].body.prompt,'original prompt');eq(f.state.posts[1].id,f.state.posts[0].id);eq(f.state.supplier,1);});
  await test('new-session-task-does-not-override-persisted-client-intent',async()=>{const f=setup(c),owner=c.createCanvasTextTasks();f.state.lost=true;await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'original prompt','Text'),f.ports);const restoredOwner=c.createCanvasTextTasks();await restoredOwner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'original prompt','Text'),f.ports);eq(f.state.posts.length,2);eq(f.state.posts[0].id,f.state.posts[1].id);eq(f.state.supplier,1);});
  await test('five-reverse-slots-before-submit-three-results-two-readable-failures-one-history',async()=>{
    const f=setup(c),owner=c.createCanvasTextTasks(),g=gate(),entered=gate();let calls=0,history=[];
    const requests=[0,1,2,3,4].map(i=>c.derivedTextTask({source:{id:'art-'+i},mode:'reverse',project:'tree:A',title:'Reverse',productTitle:'',position:{x:10,y:i*280,width:300},gap:96}));
    const ports={...f.ports,historyBatch:records=>history.push(records),submit:async r=>{calls++;entered.resolve();await g.promise;const id=r.payload.sourceIds[0];return id==='art-2'?Response.json({accepted:false,error:'fixture model unavailable'},{status:422}):Response.json({text:id==='art-3'?'   ':'prompt-'+id});}};
    const running=owner.batch(f.scope,'reverse',requests,ports);await entered.promise;eq(f.state.nodes.filter(n=>requests.some(r=>r.node.id===n.id)).length,5);eq(calls,2);g.resolve();eq(await running,{succeeded:3,failed:2,skipped:0});eq(calls,5);eq(history.length,1);eq(history[0].length,5);eq(history[0].filter(n=>n.status==='failed').length,2);ok(history[0].filter(n=>n.status==='failed').every(n=>n.error&&n.content===''));eq(f.state.saveCalls,5);
  });
  await test('terminal-receipt-shared-helper-strict-identity-and-charge',()=>{
    const receipt={terminal:true,status:'failed',operationId:'tool-original',chargedCredits:0};
    for(const charge of [0,3,Number.MAX_SAFE_INTEGER])eq(c.isTerminalBillingFailure({...receipt,chargedCredits:charge},'original'),true);
    for(const charge of [-1,0.5,NaN,Infinity,'0',undefined])eq(c.isTerminalBillingFailure({...receipt,chargedCredits:charge},'original'),false);
    for(const value of [{...receipt,terminal:false},{...receipt,status:'unknown'},{...receipt,operationId:'tool-foreign'},null,[]])eq(c.isTerminalBillingFailure(value,'original'),false);
    eq(c.isTerminalBillingFailure(receipt,undefined),false);eq(c.isTerminalBillingFailure(receipt,''),false);
  });
  for(const chargedCredits of [0,3])await test('identity-bound-terminal-failure-explicit-new-content-'+chargedCredits,async()=>{
    const f=setup(c),owner=c.createCanvasTextTasks();f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',terminal:true,status:'failed',operationId:'CURRENT',chargedCredits};
    eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'old prompt','Text'),f.ports),false);eq(owner.state(f.scope,'text-a').phase,'rejected');eq(f.state.posts.length,1);
    f.state.nodes=[{...f.state.nodes[0],content:'new explicitly edited body'}];f.state.currentPrice=99;
    eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'new prompt','Text'),f.ports),true);eq(f.state.posts.length,2);ok(f.state.posts[0].id!==f.state.posts[1].id);eq(f.state.posts[1].body.content,'new explicitly edited body');eq(f.state.posts[1].body.prompt,'new prompt');eq(f.state.posts.map(p=>p.price),[3,99]);
  });
  for(const failure of ['TEXT_OUTPUT_IMAGE','TEXT_OUTPUT_REFUSED','TEXT_OUTPUT_LIMIT','TEXT_OUTPUT_EMPTY'].map(code=>({code})).concat([{code:'TEXT_OUTPUT_LIMIT',terminal:true,status:'failed',operationId:'tool-foreign',chargedCredits:0},{code:'TEXT_OUTPUT_LIMIT',terminal:true,status:'failed',operationId:'CURRENT',chargedCredits:-1}]))await test('unknown-output-error-keeps-original-id-body-price-'+failure.code+'-'+(failure.operationId||'bare')+'-'+(failure.chargedCredits??'none'),async()=>{
    const f=setup(c),owner=c.createCanvasTextTasks();f.state.failureOnce=failure;
    eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'original prompt','Text'),f.ports),false);eq(owner.state(f.scope,'text-a').phase,'retry');eq(f.state.posts.length,1);
    f.state.currentPrice=99;f.state.nodes=[{...f.state.nodes[0],content:'later edited body'}];
    eq(await owner.execute(f.scope,c.generalTextTask(f.state.nodes[0],'changed prompt','Text'),f.ports),true);eq(f.state.posts.length,2);eq(f.state.posts[1].id,f.state.posts[0].id);eq(f.state.posts[1].body,f.state.posts[0].body);eq(f.state.posts.map(p=>p.price),[3,3]);eq(f.state.quotes,1);eq(f.state.supplier,1);
  });
  // Execute the actual Canvas admission callback as well as the retained task.
  // Save failure has no CAS conflict; a generic unsaved draft still blocks POST.
  let prepareExpression;
  (function find(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useCanvasTextTasks'){const p=n.arguments[1]?.properties?.find(p=>p.name?.getText(ast)==='prepare');if(p)prepareExpression=p.initializer.getText(ast);}ts.forEachChild(n,find);})(ast);
  ok(prepareExpression,'actual Canvas prepare callback');
  function admission(f,document,autosave={flushAll:async()=>[]}){
    return vm.runInNewContext(compile('('+prepareExpression+')'),{Error,textAutosave:autosave,canvasTextDocument:document,textWriteBarrierRef:{current:0},historyBusyRef:{current:false},isNodeLocked:()=>false});
  }
  await test('linked-source-save-null-no-cas-conflict-blocks-paid-post',async()=>{
    const f=setup(c),source={...node('text-source'),content:'unsaved linked body',status:'completed'};
    f.task.request.node.sourceIds=['text-source'];f.task.request.payload.sourceIds=['text-source'];f.state.nodes.push(source);
    let sourceSaves=0;const document={...f.ports.document,conflicts:{},flush:async()=>[null],getSnapshot:()=>({nodes:f.state.nodes,unsaved:1}),save:async n=>{if(n.id===source.id){sourceSaves++;return null;}return n;}};
    f.ports.document=document;f.ports.prepare=admission(f,document);
    eq(await f.run(),false);eq(sourceSaves,1);eq(f.state.posts.length,0);eq(f.state.supplier,0);eq(f.task.getSnapshot().phase,'retry');eq(f.task.request.payload.sourceIds,['text-source']);eq(f.task.request.payload.projectKey,'tree:A');
  });
  await test('source-save-ack-precedes-paid-post-result-save-retry-history-once',async()=>{
    const f=setup(c),source={...node('text-source'),content:'linked body',status:'completed'},entered=gate(),ack=gate(),events=[],history=[];
    f.task.request.node.sourceIds=['text-source'];f.task.request.payload.sourceIds=['text-source'];f.state.nodes.push(source);
    let firstResult=true;const document={...f.ports.document,conflicts:{},flush:async()=>[],save:async n=>{if(n.id===source.id){events.push('source:start');entered.resolve();await ack.promise;events.push('source:ack');return n;}if(n.content==='generated answer'&&firstResult){firstResult=false;return null;}return n;}};
    f.ports.document=document;f.ports.prepare=admission(f,document);f.ports.historyEdit=(before,after)=>history.push({before,after});f.state.beforeSubmit=async()=>events.push('paid:post');
    const first=f.run();await entered.promise;eq(f.state.posts.length,0);ack.resolve();eq(await first,false);eq(f.task.getSnapshot().hasResult,true);eq(history.length,0);eq(await f.run(),true);eq(await f.run(),true);eq(events,['source:start','source:ack','paid:post']);eq(f.state.posts.length,1);eq(f.state.supplier,1);eq(history.length,1);eq(history[0].before.content,'before');eq(history[0].after.content,'generated answer');
  });

  await test('terminal-partial-preserves-body-and-explicit-apply-without-model-call',async()=>{
    const f=setup(c);f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'回复尚未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'第一段已生成正文'};
    eq(await f.run(),false);eq(f.task.getSnapshot().phase,'incomplete');eq(f.state.nodes[0].content,'before');eq(await f.run(),false);eq(f.state.posts.length,1);
    eq(await f.task.acceptPartial(f.scope,f.ports),true);eq(f.state.nodes[0].content,'第一段已生成正文');eq(f.state.posts.length,1);
  });
  await test('partial-cache-refresh-owner-isolation-and-explicit-continuation-new-identity',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),request=c.generalTextTask(f.state.nodes[0],'write','Text');
    f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'回复尚未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'已保留正文'};
    eq(await tasks.execute(f.scope,request,f.ports),false);eq(tasks.state(f.scope,'text-a').phase,'incomplete');
    const restored=c.createCanvasTextTasks();eq(restored.state(f.scope,'text-a').partial.text,'已保留正文');eq(restored.state({...f.scope,account:'foreign'},'text-a').phase,'idle');
    const original=f.state.posts[0].id;eq(await restored.continueWriting(f.scope,'text-a',f.ports),true);eq(f.state.posts.length,2);ok(f.state.posts[1].id!==original);eq(f.state.posts[1].body.continuationOf,original);
  });
  await test('unknown-continuation-refresh-retains-new-original-operation-not-another-continuation',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),request=c.generalTextTask(f.state.nodes[0],'write','Text');
    f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'回复尚未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'未完成正文'};
    await tasks.execute(f.scope,request,f.ports);f.state.lost=true;eq(await tasks.continueWriting(f.scope,'text-a',f.ports),false);
    const second=f.state.posts[1],restored=c.createCanvasTextTasks();eq(restored.state(f.scope,'text-a').phase,'retry');eq(await restored.resume(f.scope,'text-a',f.ports),true);eq(f.state.posts[2].id,second.id);eq(f.state.posts[2].body,second.body);
  });
  await test('partial-apply-save-retry-preserves-known-text-no-regeneration',async()=>{
    const f=setup(c);f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'保留正文'};
    await f.run();f.state.saveOk=false;eq(await f.task.acceptPartial(f.scope,f.ports),false);eq(f.task.getSnapshot().hasResult,true);f.state.saveOk=true;eq(await f.run(),true);eq(f.state.posts.length,1);
  });

  await test('restored-pending-never-overwrites-newer-document-before-receipt-or-on-result',async()=>{
    const f=setup(c),original=c.generalTextTask(f.state.nodes[0],'old intent','Text');original.operationId='restored-original';
    f.state.nodes=[{...f.state.nodes[0],title:'new title',content:'new manual body',canvasX:999,sourceIds:['new-source']}];
    const task=c.createCanvasTextTask(original,{pending:true});f.ports.prepare=async()=>{throw Error('Restored receipt must never save the cached request snapshot')};
    const gate_=gate(),entered=gate();f.state.beforeReply=()=>{entered.resolve();return gate_.promise};const running=task.run(f.scope,f.ports);await entered.promise;eq(f.state.nodes[0].content,'new manual body');eq(f.state.nodes[0].title,'new title');eq(f.state.nodes[0].canvasX,999);eq(f.state.nodes[0].sourceIds,['new-source']);f.state.nodes[0].content='edited during receipt lookup';gate_.resolve();eq(await running,true);eq(f.state.nodes[0].content,'edited during receipt lookup');eq(f.state.nodes[0].title,'new title');eq(f.state.nodes[0].canvasX,999);
  });

  await test('restored-pending-keeps-edits-made-before-refresh-even-without-an-inflight-edit',async()=>{
    const f=setup(c),original=c.generalTextTask(f.state.nodes[0],'old intent','Text');original.operationId='restored-with-new-body';
    f.state.nodes=[{...f.state.nodes[0],content:'manual body saved after acceptance',title:'new title',canvasX:999}];
    const task=c.createCanvasTextTask(original,{pending:true});f.ports.prepare=async()=>{throw Error('No cached document save on receipt lookup')};
    eq(await task.run(f.scope,f.ports),true);eq(f.state.nodes[0].content,'manual body saved after acceptance');eq(f.state.nodes[0].title,'new title');eq(f.state.nodes[0].canvasX,999);
  });
  await test('discard-terminal-partial-keeps-body-and-enables-edited-new-intent-no-auto-post',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),req=c.generalTextTask(f.state.nodes[0],'old intent','Text');f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'部分内容'};
    await tasks.execute(f.scope,req,f.ports);eq(await tasks.discardPartial(f.scope,'text-a',f.ports),true);eq(f.state.nodes[0].content,'before');eq(f.state.posts.length,1);eq(c.createCanvasTextTasks().state(f.scope,'text-a').phase,'idle');
    await tasks.execute(f.scope,c.generalTextTask(f.state.nodes[0],'edited intent','Text'),f.ports);eq(f.state.posts[1].body.prompt,'edited intent');ok(f.state.posts[1].id!==f.state.posts[0].id);
  });
  for(const terminal of [true,false])await test('stream-error-intent-release-only-for-proved-terminal-'+terminal,async()=>{
    const f=setup(c),init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'stream'})},quote=await c.billing.quote({feature:'canvas.text-generate'});
    let id;c.fetch=async(_url,r)=>{id=new Headers(r.headers).get('x-naumi-billing-operation-id');const error={terminal,status:'failed',operationId:`tool-${id}`,chargedCredits:0,error:'incomplete'};return new Response(`event: error\ndata: ${JSON.stringify(error)}\n\n`,{headers:{'content-type':'text/event-stream'}});};
    await (await c.billing.submit('/api/canvas/assistant',init,quote)).text();let keys=0;const storage=c.localStorage;c.localStorage={...storage,removeItem:k=>{keys++;storage.removeItem(k)}};c.fetch=async(_u,r)=>Response.json({code:'OPERATION_PENDING',operationId:`tool-${new Headers(r.headers).get('x-naumi-billing-operation-id')}`},{status:409});
    // The callback lexical scope sees the same storage object; observe the next supplied ID directly.
    let next;c.fetch=async(_u,r)=>{next=new Headers(r.headers).get('x-naumi-billing-operation-id');return Response.json({code:'OPERATION_PENDING'},{status:409});};await c.billing.submit('/api/canvas/assistant',init,quote);eq(next===id,!terminal);
  });

  await test('failed-continuation-retains-earlier-proved-partial',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),req=c.generalTextTask(f.state.nodes[0],'write','Text');
    f.state.failureOnce={code:'TEXT_OUTPUT_LIMIT',error:'未写完',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT',partialText:'先前已保留的回复'};await tasks.execute(f.scope,req,f.ports);
    const original=tasks.state(f.scope,'text-a').partial.operationId;
    f.state.failureOnce={code:'TEXT_OUTPUT_REFUSED',error:'调整要求后重试',terminal:true,status:'failed',chargedCredits:0,operationId:'CURRENT'};
    eq(await tasks.continueWriting(f.scope,'text-a',f.ports),false);eq(tasks.state(f.scope,'text-a').phase,'incomplete');eq(tasks.state(f.scope,'text-a').partial.operationId,original);eq(tasks.state(f.scope,'text-a').partial.text,'先前已保留的回复');eq(f.state.posts.length,2);
  });

  await test('ordinary-unknown-refresh-retains-original-payload-operation-and-later-manual-body',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),req=c.generalTextTask(f.state.nodes[0],'original writing intent','Text');f.state.lost=true;
    eq(await tasks.execute(f.scope,req,f.ports),false);const first=f.state.posts[0];f.state.nodes[0].content='later manual body';f.state.nodes[0].prompt='new draft instruction';
    const restored=c.createCanvasTextTasks();eq(restored.state(f.scope,'text-a').phase,'retry');eq(await restored.resume(f.scope,'text-a',f.ports),true);eq(f.state.posts[1].id,first.id);eq(f.state.posts[1].body,first.body);eq(f.state.nodes[0].content,'later manual body');eq(f.state.supplier,1);
  });

  await test('ordinary-first-identity-is-durable-before-paid-post-and-before-any-response',async()=>{
    const f=setup(c),tasks=c.createCanvasTextTasks(),req=c.generalTextTask(f.state.nodes[0],'original instruction','Text');
    const originalFetch=c.fetch;let checked=false;
    c.fetch=async(url,init)=>{
      const restored=c.createCanvasTextTasks();eq(restored.state(f.scope,'text-a').phase,'retry');eq(restored.retryable(f.scope,'text-a'),true);checked=true;
      return originalFetch(url,init);
    };
    eq(await tasks.execute(f.scope,req,f.ports),true);eq(checked,true);eq(f.state.supplier,1);
  });
  await test('all-actual-callers-use-task-owner',()=>{ok(fn.generateTextNode.includes('textTasks.run'));ok(fn.reversePromptsForSelection.includes('textTasks.batch'));ok(fn.assistWriteForNodes.includes('textTasks.batch'));ok(!fn.reversePromptsForSelection.includes('privateFetch'));ok(src.includes('submission,isCurrent:scope.viewCurrent'));ok(src.includes('textTasks.retryable(selectedText.id)'));});
 }
 const result={mode:baseline?'BASELINE':'MODIFIED',cases,checks,root,supplier:'fixture',external:0};fs.writeFileSync(path.join(out,result.mode+'_RESULT.json'),JSON.stringify(result,null,2));console.log(`CANVAS_TEXT_TASKS=PASS mode=${result.mode} cases=${cases} checks=${checks} SAVE_RETRY=${baseline?'REGENERATES':'ORIGINAL_TEXT'} UNKNOWN=${baseline?'CLIENT_INTENT_CACHE':'RETAINED_OPERATION'} NAVIGATION=${baseline?'RESULT_DROPPED':'ORIGINAL_DOCUMENT'} EXTERNAL=0`);
})().catch(e=>{console.error(e);process.exitCode=1;});
