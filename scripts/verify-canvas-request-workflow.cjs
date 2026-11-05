/** Complete original checkout versus request/workflow application. Real browser
 * primitives and application functions; transport/document ports are observed.
 * This is not the PG, packaged-product or supplier acceptance tier. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),{execFileSync}=require('node:child_process');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||process.env.CANVAS_REQUEST_WORKFLOW_EVIDENCE||'output/canvas-request-workflow'),oldRoot=path.resolve(arg('--baseline-root')||'output/refactor-r6q-20261027/baseline');
fs.mkdirSync(out,{recursive:true});let checks=0;const cases=[],check=(a,b,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);checks++;},pass=name=>cases.push(name);
const OLD_REF='ec7cfa5eeab089544a5d29df374d379c2630af32';
const text=(r,file)=>fs.existsSync(path.join(r,file))?fs.readFileSync(path.join(r,file),'utf8'):r===oldRoot?execFileSync('git',['show',OLD_REF+':'+file.replaceAll('\\','/')],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}):fs.readFileSync(path.join(r,file),'utf8');
function closure(r,name,globals){const file='src/components/canvas/canvas-client.tsx',s=text(r,file),ast=ts.createSourceFile(file,s,99,true,ts.ScriptKind.TSX);let found;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,walk);}walk(ast);assert.ok(found,name);const code=ts.transpileModule(found.getText(ast)+`;globalThis.__entry=${name};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const box={...globals,globalThis:null};box.globalThis=box;vm.runInNewContext(code,box,{filename:file});return box.__entry;}
function loader(r,overrides,globals={}){const cache=new Map();const load=file=>{file=path.resolve(r,file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(text(r,path.relative(r,file)),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=id=>{if(Object.hasOwn(overrides,id))return overrides[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+(path.extname(id)?'':'.ts'));throw Error('UNDECLARED_TEST_DEPENDENCY '+id);};vm.runInNewContext(code,{module:m,exports:m.exports,require:req,...primitives,...globals},{filename:file});return m.exports;};return load;}
const primitives={FormData,File,Blob,Headers,Request,Response,URL,Buffer,console,Date,Math,Promise,Set,Map,Array,Object,JSON,Error,encodeURIComponent,setTimeout,clearTimeout,structuredClone};
const byteSnapshot=async body=>body instanceof FormData?await Promise.all([...body].map(async([key,value])=>[key,typeof value==='string'?value:{name:value.name,type:value.type,sha:crypto.createHash('sha256').update(Buffer.from(await value.arrayBuffer())).digest('hex')}] )):body;
async function requestCase(r,isOld,spec){
 let current=true,epoch=1,workspace='personal',revision=1,quoteCount=0;const calls=[],frames=[],quoteScopes=[];
 const params=loader(r,{})('src/lib/canvas/generation-parameters.ts'),http=loader(r,{})('src/lib/imagegen/http.ts');
 const normalize=loader(r,{'zod':require('zod')})('src/lib/imagegen/reference-labels.ts');
 const record=async(kind,url,init,facts)=>{calls.push({kind,url,method:init.method,headers:Object.fromEntries(new Headers(init.headers)),body:await byteSnapshot(init.body),facts});return Response.json({ok:true});};
 const billing={quote:async (facts,scope)=>(quoteScopes.push(scope),quoteCount++,{version:1,credits:quoteCount===1?12:99,reserveCredits:12,feature:facts.feature,quantity:facts.quantity}),submit:async(url,init,quote,onIdentity)=>{onIdentity?.('original-task-id');return record('submit',url,init,quote);},quoteAndSubmit:async(url,init,facts,before)=>{before?.();return record('quoteAndSubmit',url,init,facts);}};
 const authHeader=async()=>{if(spec.stale){epoch++;current=false;if(spec.stale==='workspace-aba')revision+=2;}return {authorization:'Bearer fixture-auth','x-naumi-workspace':workspace};};
 const chooseFrame=async()=>null,frame=async(form,choose,isCurrent)=>{frames.push(form.get('format')?'detail':'legacy');if(!isCurrent())throw new http.ImagegenPreparationCancelled();if(spec.frame)form.set('ratio',spec.frame);};
 const imagegen={resolveCanvasDetailFrame:frame,resolveCanvasLegacyFrame:frame,submitCanvasImagegen:async(form,source,notice,scope)=>{calls.push({kind:'imagegen',source,owner:scope.owner,project:scope.project,body:await byteSnapshot(form),current:scope.isCurrent()});return Response.json({jobId:'fixture'});}};
 const model={adminConfiguredFeature:()=>!!spec.admin},feature={ensureFeatureModelSelection:async()=> 'managed-model',featureModelManaged:()=>!!spec.managed,chosenFeatureModel:()=> 'managed-model'};
 const active={key:'tree:fixture',members:[{id:'source',resolution:'4K'}]},project={current:{key:active.key}},account={current:'fixture-account'},contextEpoch={current:1};
 const form=spec.form?new FormData():null;for(const [key,value] of spec.fields||[])form.append(key,value==='FILE'?new File([new Uint8Array([1,2,3,4])],'ref.png',{type:'image/png'}):value);
 const init={method:spec.method||'POST',headers:{'x-custom':'preserved'},body:form||JSON.stringify(spec.body||{})};
 if(spec.retained)init.submission=loader(r,{})('src/lib/billing/client-submission.ts').createRetainedBillingSubmission();
 const globals={...primitives,...params,...normalize,...http,...imagegen,...model,...feature,billing,authHeader,currentWorkspace:()=>workspace,
   user:spec.guest?null:{email:'owner@fixture.test'},active,activeProjectRef:project,canvasAccountRef:account,canvasContextEpochRef:contextEpoch,frameChoice:{chooseFrame},
   flashTip:()=>{},genModel:'chosen-model',genQuality:'high',canvasToolQualities:{'canvas.expand':'low'},privateFetchRaw:(u,i)=>record('raw',String(u),i)};
 let fn;
 if(isOld)fn=closure(r,'privateFetch',globals);
 else{const scope={owner:'owner@fixture.test',project:active.key,workspace,isCurrent:()=>current&&revision===1&&epoch===1,assertCurrent(){if(!this.isCurrent())throw new http.ImagegenPreparationCancelled();}};
  const api=loader(r,{'zod':require('zod'),'../supabase':{authHeader},'../model-config/selection-policy':model,'../model-config/feature-client':feature,'../imagegen/canvas-client':imagegen})( 'src/lib/canvas/creation-request.ts');
  fn=(u,i)=>api.submitCanvasCreationRequest(u,i,{scope,authenticated:!spec.guest,sourceId:'source',sources:active.members,model:'chosen-model',quality:'high',toolQualities:globals.canvasToolQualities},{billing,request:globals.privateFetchRaw,chooseFrame,notice:()=>{}});
 }
 let error;
 try{await fn(spec.url,init);if(spec.retained){if(!isOld)check(quoteScopes,[{workspace:'personal',projectContext:'tree:fixture'}],'retained quote scope');await fn(spec.url,{...init,body:JSON.stringify({artworkId:'source',prompt:'changed after first attempt',quality:'max'})});check(quoteCount,1);check(calls[0].body,calls[1].body);check(calls[1].headers['x-naumi-billing-operation-id'],'original-task-id');check(calls[1].facts.credits,12);}}catch(e){error={message:e.message,status:e.status,accepted:e.accepted};}
 return {calls,frames,error};
}
async function requests(){
 const specs=[
  {url:'/api/health',method:'GET'},{url:'/api/custom-tool',body:{hello:'world'}},
  {url:'/api/generate-image',form:true,fields:[['prompt','same'],['userPrompt','same'],['image','FILE']]},
  {url:'/api/generate-image',form:true,frame:'4:3',fields:[['prompt','recipe'],['userPrompt','redo'],['ratio','auto'],['resolution','5K'],['count','9'],['targetWidth','999'],['image','FILE']]},
  {url:'/api/generate-image',guest:true,body:{prompt:'legacy',ratio:'bad',quality:'standard',resolution:'5K',count:0,targetHeight:50}},
  {url:'/api/aplus',form:true,fields:[['format','1:1'],['module','a'],['module','b'],['model','detail-model'],['image','FILE']]},
  {url:'/api/aplus',body:{modules:['a','b','c'],modelId:'model-override'}},
  {url:'/api/suite',body:{structure:'default'}},{url:'/api/suite',body:{structure:'custom',shots:'[1,2]'}},
  ...['/api/cutout','/api/canvas/image-tasks','/api/canvas/expand','/api/canvas/text-edit','/api/canvas/annotate','/api/canvas/text-generate','/api/canvas/assistant','/api/canvas/ocr','/api/video/generate'].map(url=>({url,body:{artworkId:'source',count:2,providerId:'p1',model:'explicit',ratio:'16:9'}})),
  {url:'/api/canvas/expand',retained:true,body:{artworkId:'source',prompt:'frozen request'}},
  {url:'/api/canvas/expand',admin:true,body:{artworkId:'source',model:'ignored'}},
  {url:'/api/canvas/expand',managed:true,body:{artworkId:'source',model:'ignored'}},
  {url:'/api/generate-image',form:true,fields:[['prompt','recipe'],['userPrompt','redo'],['ratio','1:1'],['canvasReferences','[]'],['image','FILE']]},
 ];
 for(const [i,spec] of specs.entries()){const a=await requestCase(oldRoot,true,spec),b=await requestCase(root,baseline,spec);if(!baseline&&['/api/canvas/annotate','/api/canvas/text-edit','/api/canvas/image-tasks'].includes(spec.url)){for(const call of a.calls){call.facts.ratio='auto';call.body=JSON.stringify({...JSON.parse(call.body),ratio:'auto'});}}check(b,a,'request '+i+' '+spec.url);pass('original request '+i+' '+spec.url);}
 for(const stale of ['account','workspace-aba']){const spec={url:'/api/canvas/expand',body:{artworkId:'source'},stale};const a=await requestCase(oldRoot,true,spec),b=await requestCase(root,baseline,spec);check(a.calls.length,1,'old late request observed');check(b.calls.length,baseline?1:0);if(!baseline)check(b.error?.accepted,false);pass(stale+' at auth boundary');}
}
function oldComfy(r,env){
 let timer;const positions=[],merged=[],history=[],notices=[],pending=[];
 const entry=closure(r,'runComfyWorkflow',{...primitives,readOnly:false,user:{email:'owner@fixture.test'},generationOperationRef:{current:new Set()},rfRef:{current:null},flowNodeSize:()=>({width:300,height:300}),artworkNodeSize:()=>({width:300,height:300}),X_GAP:90,browserRandomUUID:()=> 'fixed',setPendNodes:f=>{const n=f(pending);pending.splice(0,pending.length,...n);},window:{setInterval:cb=>(timer=cb,1),clearInterval:()=>{}},privateFetchRaw:async(url,init)=>{if(url==='/api/comfyui/run')return env.send();positions.push(JSON.parse(init.body));return Response.json({ok:true});},readJsonSafe:r=>r.json(),livePendingPosition:()=>({x:400,y:50}),mergeWorks:async ids=>(merged.push(ids),ids.map(id=>({id}))),pushAddUndo:(id)=>history.push(id),flashTip:m=>notices.push(m)});
 return {run:()=>entry({id:'source',canvasX:10,canvasY:20},{workflowId:'workflow',texts:{},seeds:{},numerics:{}}),positions,merged,history,notices,tick:()=>timer?.()};
}
async function workflows(){
 const output={ok:true,images:[{id:'image-a',url:'/media/a.png'},{id:'image-b',url:'/media/b.png'}],videos:[{url:'/media/v.mp4',mime:'video/mp4'}],videoArtworkId:'video-c'};
 const old=oldComfy(oldRoot,{send:async()=>Response.json(output)});await old.run();check(old.positions,[{id:'image-a',x:400,y:50},{id:'image-b',x:440,y:90},{id:'video-c',x:480,y:130}]);pass('original output order and offset placement');
 const late=oldComfy(oldRoot,{send:async()=>Response.json(output)});await late.run();check(late.positions.length,3);pass('baseline late-view output calls observed');
 const oldVideo=oldComfy(oldRoot,{send:async()=>Response.json({ok:true,taskId:'video-task',images:[],videos:[]},{status:202})});await oldVideo.run();assert.match(oldVideo.notices[0],/完成/);checks++;pass('baseline video 202 falsely reports completion');
 if(baseline)return;
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 let current=true,handler,posts=0,gets=0,positions=[],history=[],native=[],failPosition=false;
 const fetch=async(url,init={})=>{if(url==='/api/artworks/position'){positions.push(JSON.parse(init.body));if(failPosition){failPosition=false;return Response.json({error:'position unavailable'},{status:503});}return Response.json({ok:true});}if(init.method==='POST')posts++;else gets++;return handler(url,init);};
 const scope={owner:'owner@fixture.test',workspace:'personal',project:'tree:fixture',isCurrent:()=>current,assertCurrent(){if(!current)throw Error('stale');}};
 const headers=async s=>{s.assertCurrent();return new Headers({'x-naumi-workspace':s.workspace,'x-naumi-project-context':s.project});};
 const load=loader(root,{'./image-task-scope':{canvasImageTaskHeaders:headers},'../browser-crypto':{browserRandomUUID:()=>crypto.randomUUID()}},{fetch,window:{setInterval:()=>1,clearInterval:()=>{}}});
 const {createCanvasResultAttachment}=load('src/lib/canvas/result-attachment.ts'),{createCanvasComfyWorkflow,comfyRunReceiptKey}=load('src/lib/canvas/comfy-workflow.ts');
 const create=(key='base')=>createCanvasComfyWorkflow({sourceId:'source',payload:{workflowId:'workflow',texts:{positive:'fixture'},seeds:{seed:123},numerics:{}},receiptKey:key,storage,
  attach:createCanvasResultAttachment({layout:{kind:'offset',step:40},saveErrorText:'position failed',position:()=>({x:400,y:50}),merge:async(ids,isCurrent)=>{assert.equal(isCurrent(),true);return ids.map(id=>({id,image:'/media/'+id+'.png'}));},history:ids=>history.push(...ids)}),submitted:async id=>native.push(id),saving:()=>{}});
 handler=async()=>Response.json(output);const success=create();check((await success.run(scope)).state,'completed');check(positions,old.positions.map(point=>({...point,mode:'initialize'})));check(positions.every(point=>point.mode==='initialize'),true);check(history,old.history);check(posts,1);check(memory.has('base'),false);pass('new application preserves all original output placement and per-artwork history');
 handler=async()=>{current=false;return Response.json(output);};current=true;const stale=create('late'),before=positions.length;check((await stale.run(scope)).state,'stale');check(positions.length,before);current=true;check((await stale.run(scope)).state,'completed');check(positions.length,before+3);pass('late view does not attach; original view resumes known result without another POST');
 handler=async()=>{throw Error('dropped response');};const unknown=create('unknown');check((await unknown.run(scope)).state,'needs_review');const unknownId=memory.get('unknown'),beforePosts=posts;
 handler=async url=>{assert.ok(url.includes(encodeURIComponent(unknownId)));return Response.json({...output,state:'completed'});};const reloaded=create('unknown');check((await reloaded.run(scope)).state,'completed');check(posts,beforePosts);check(memory.has('unknown'),false);pass('lost response survives controller recreation and reads original receipt only');
 handler=async()=>Response.json({error:'not yet visible'},{status:404});const pendingKey='pending';memory.set(pendingKey,'original-unknown');const pending=create(pendingKey),pendingPosts=posts;check((await pending.run(scope)).state,'needs_review');check((await pending.run(scope)).state,'needs_review');check(posts,pendingPosts);check(memory.get(pendingKey),'original-unknown');pass('receipt 404 never authorizes a replacement POST');
 handler=async()=>Response.json(output);positions=[];history=[];failPosition=true;const local=create('local'),localPosts=posts;check((await local.run(scope)).state,'needs_review');check(history,[]);check((await local.run(scope)).state,'completed');check(posts,localPosts+1);check(history,['image-a','image-b','video-c']);pass('position rejection resumes saved outputs, no supplier rerun, history once');
 handler=async()=>Response.json({ok:true,taskId:'durable-video',images:[],videos:[]},{status:202});const video=create('video');check((await video.run(scope)).state,'submitted');check(native,['durable-video']);check(video.finished,true);pass('202 hands off to native video owner without completed-image projection');
 let release;handler=()=>new Promise(resolve=>{release=resolve;});const parallel=create('parallel'),first=parallel.run(scope),second=parallel.run(scope);assert.equal(first,second);checks++;await new Promise(resolve=>setImmediate(resolve));release(Response.json(output));await first;pass('one controller coalesces concurrent run calls');
 handler=async()=>Response.json({error:'endpoint missing',accepted:false},{status:400});const denied=create('denied');await assert.rejects(denied.run(scope),/endpoint missing/);checks++;check(memory.has('denied'),false);check(denied.finished,true);pass('explicitly unaccepted request releases old intent so corrected workflow input is not ignored');
 memory.set('failed','known-failed');handler=async()=>Response.json({state:'failed',message:'required nodes missing'});const failed=create('failed');check((await failed.run(scope)).state,'failed');check(failed.finished,true);check(memory.has('failed'),false);pass('known failed receipt closes original intent without automatic replay');
 // Actual Canvas composition: a pre-accept error releases the retained task,
 // while UNKNOWN still keeps its original controller and performs GET only.
 const runs=new Map(),pend=[],compositionBodies=[];
 const presentation=fs.existsSync(path.join(root,'src/lib/canvas/generation-presentation.ts'))?load('src/lib/canvas/generation-presentation.ts').createCanvasGenerationPresentation().bind('fixture-original-view'):undefined;
 const compositionPorts={...primitives,generationPresentation:presentation,...(fs.existsSync(path.join(root,'src/lib/canvas/generation-activity.ts'))?load('src/lib/canvas/generation-activity.ts'):{}),readOnly:false,user:{email:scope.owner},generationOperationRef:{current:new Set()},canvasAccountRef:{current:'account'},activeProjectRef:{current:{key:scope.project}},canvasContextEpochRef:{current:1},batchRunMountedRef:{current:true},
  comfyRunsRef:{current:runs},captureCanvasTaskOwner:()=>({capture:()=>scope,isVisible:scope.isCurrent,workspace:scope.workspace}),comfyRunReceiptKey,createCanvasComfyWorkflow,createCanvasResultAttachment,
  rfRef:{current:null},flowNodeSize:()=>({width:300,height:300}),artworkNodeSize:()=>({width:300,height:300}),X_GAP:90,browserRandomUUID:()=>crypto.randomUUID(),localStorage:storage,
  taskDocumentRef:{current:{merge:async ids=>ids.map(id=>({id,image:'/media/'+id+'.png'})),history:()=>{}}},videoTaskStore:{refresh:async()=>{}},livePendingPosition:()=>({x:400,y:50}),
  setPendNodes:fn=>{const next=fn(pend);pend.splice(0,pend.length,...next);},window:{setInterval:()=>1,clearInterval:()=>{}},flashTip:()=>{}};
 const hasRunOwner=fs.existsSync(path.join(root,'src/lib/canvas/workflow-runs.ts'));
 if(hasRunOwner){
  const pending=load('src/lib/canvas/pending-presentation.ts').createCanvasPendingPresentation().bind('fixture-original-view');
  pending.subscribe(()=>pend.splice(0,pend.length,...pending.getSnapshot()));compositionPorts.pendingPresentation=pending;
  compositionPorts.workflowRunsRef={current:load('src/lib/canvas/workflow-runs.ts').createCanvasWorkflowRuns()};
  compositionPorts.canvasGenerationRunContext=closure(root,'canvasGenerationRunContext',compositionPorts);
 }
 const composed=closure(root,'runComfyWorkflow',compositionPorts),originalKey=comfyRunReceiptKey(scope,'source');
 const source={id:'source',canvasX:10,canvasY:20},initialPayload={workflowId:'before-error',texts:{},seeds:{},numerics:{}};
 handler=async(url,init)=>{compositionBodies.push(JSON.parse(init.body));return Response.json({error:'endpoint missing',accepted:false},{status:400});};
 await assert.rejects(composed(source,initialPayload),/endpoint missing/);checks++;check(memory.has(originalKey),false);check(pend.length,0);
 handler=async(url,init)=>{compositionBodies.push(JSON.parse(init.body));return Response.json(output);};
 check((await composed(source,{...initialPayload,workflowId:'corrected-after-error'})).state,'completed');check(compositionBodies.map(body=>body.workflowId),['before-error','corrected-after-error']);check(memory.has(originalKey),false);
 handler=async()=>{throw Error('response lost');};check((await composed(source,initialPayload)).state,'needs_review');check(memory.has(originalKey),true);const compositionPosts=posts;
 handler=async(url,init)=>{assert.equal(init.method,undefined);checks++;return Response.json({...output,state:'completed'});};
 check((await composed(source,{...initialPayload,workflowId:'must-not-replace-unknown'})).state,'completed');check(posts,compositionPosts);check(memory.has(originalKey),false);pass('actual Canvas releases known-unaccepted input but retains and reads UNKNOWN original intent');
 const keys=[comfyRunReceiptKey(scope,'source'),comfyRunReceiptKey({...scope,owner:'other@fixture.test'},'source'),comfyRunReceiptKey({...scope,workspace:'tenant'},'source'),comfyRunReceiptKey({...scope,project:'tree:other'},'source')];check(new Set(keys).size,4);pass('browser receipts are partitioned by account, workspace, project and source');
 current=false;const stopped=create('stopped'),stoppedPosts=posts;check((await stopped.run(scope)).state,'stale');check(posts,stoppedPosts);check(memory.has('stopped'),false);pass('stale preparation never sends or persists a new operation');
}
(async()=>{await requests();await workflows();const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,baselineRoot:oldRoot,cases,checks,source:'FULL_CHECKOUT',transport:'OBSERVED_PORTS',productionSupplierCalls:0,realPG:false};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`CANVAS_REQUEST_WORKFLOW=PASS MODE=${report.mode} CASES=${cases.length} CHECKS=${checks} SOURCE=FULL_CHECKOUT UNKNOWN_REPOSTS=${baseline?'NOT_MEASURED':0} SUPPLIER=0`);})().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack,cases,checks},null,2)+'\n');console.error(error);process.exitCode=1;});
