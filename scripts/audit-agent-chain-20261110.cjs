// Read-only defect reproduction against actual current source. No DB, supplier,
// production credentials or real network. BUG_REPRODUCED does not mean repaired.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto'),ts=require('typescript'),esbuild=require('esbuild');
const root=process.cwd(),out=path.resolve(process.env.AGENT_AUDIT_OUT||'output/agent-chain-audit-20261110');
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),results=[],sources={};
function extract(file,name,kind='function'){
 const source=read(file),ast=ts.createSourceFile(file,source,99,true),found=[];
 function visit(n){if((kind==='function'&&ts.isFunctionDeclaration(n)||kind==='class'&&ts.isClassDeclaration(n))&&n.name?.text===name)found.push(n);ts.forEachChild(n,visit);}visit(ast);
 assert.equal(found.length,1,`${file}:${name} is unique`);const node=found[0];
 sources[file]={sha256:createHash('sha256').update(source).digest('hex')};
 return node.getText(ast).replace(/^export\s+/,'');
}
function evaluate(code,ports={}){
 const env={console,Buffer,Error,TypeError,Date,Promise,Map,Set,URL,URLSearchParams,Request,Response,Headers,File,Blob,FormData,TextDecoder,TextEncoder,ReadableStream,AbortController,AbortSignal,DOMException,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,crypto:{randomUUID},process:{env:{}},fetch:()=>{throw Error('AUDIT_NETWORK_FORBIDDEN')},...ports};
 vm.createContext(env);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:99,module:1}}).outputText,env);return env;
}
function bundle(files){
 for(const file of files)sources[file]={sha256:createHash('sha256').update(read(file)).digest('hex')};
 const built=esbuild.buildSync({stdin:{contents:files.map(f=>`export * from './${f}';`).join('\n'),resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',conditions:['react-server']});
 const m={exports:{}};vm.runInThisContext('(function(module,exports,require){'+built.outputFiles[0].text+'\n})')(m,m.exports,require);return m.exports;
}
async function finding(id,title,run){const evidence=await run();results.push({id,title,status:'BUG_REPRODUCED',evidence});console.log('BUG_REPRODUCED '+id+' '+title);}
const R='src/lib/agent/runtime.ts',W='src/app/api/agent/route.ts',G='src/lib/agent-gateway/executor.ts',C='public/agent/naumi.mjs';
async function main(){
 const lib=bundle(['src/lib/agent/harness.ts','src/lib/agent/workbench-session.ts','src/lib/agent/execution-evidence.ts']);
 await finding('A01','long assistant history blocks the next turn',async()=>{
  const body={message:'continue',sessionId:'ag-audit',history:[{role:'assistant',content:'a'.repeat(4001)}]};
  let code;try{await lib.readHarnessBody(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify(body)}));}catch(e){code=e.code;}
  assert.equal(code,'INPUT_INVALID');
  let manyCode;try{await lib.readHarnessBody(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify({...body,history:Array.from({length:101},()=>({role:'user',content:'x'}))})}));}catch(e){manyCode=e.code;}
  assert.equal(manyCode,'INPUT_INVALID');return {assistantChars:4001,code,messages:101,manyCode,allowedOutputChars:lib.HARNESS_LIMITS.outputChars};
 });
 await finding('A02','ring buffer invalidates SSE and polling offsets',()=>{
  const session={events:Array.from({length:400},(_,n)=>({type:'old',data:{n}})),harness:{sanitize:x=>x}};
  const c=evaluate(extract(R,'appendSessionEvent'));c.appendSessionEvent(session,'tool_end',{id:'new-result'});
  const cursor=400,delivered=session.events.slice(cursor);assert.equal(delivered.length,0);assert.equal(session.events.at(-1).data.id,'new-result');
  assert.ok(read(W).includes('cursor < session.events.length'));assert.ok(read('src/lib/agent/canvas.ts').includes('cursor < session.events.length'));
  return {cursorBefore:cursor,lengthAfter:session.events.length,terminalRetained:true,eventsDelivered:delivered.length};
 });
 await finding('A03','canvas persistence failure strands running flags',async()=>{
  const session={events:[],agent:{state:{messages:[]}},running:false,canvasExecuting:false};
  const c=evaluate(extract('src/lib/agent/canvas.ts','runCanvasAgentLocal'),{
   authenticatedEmail:async()=> 'audit@example.test',dbEnabled:true,NextResponse:Response,checkRateLimit:async()=>true,record:x=>x||{},readHarnessBody:async r=>r.json(),
   resolveImageSkill:async()=>null,listArtworksByIds:async()=>[],authorizeVideoProject:async()=>{},currentModelExecution:()=>null,MODEL_ID:'fixture',
   canvasProjectSessionPrefix:()=> 'cv-audit-',createHash,randomUUID,releaseRuntimeEnabled:()=>false,configuredToolCost:async()=>0,
   getOrCreateSession:async()=>session,continuationTurn:()=>undefined,appendSessionEvent:(s,type,data)=>s.events.push({type,data}),
   persistAgentSession:async()=>{throw Object.assign(Error('fixture CAS conflict'),{code:'AGENT_SESSION_CONFLICT'});},
  });
  await assert.rejects(c.runCanvasAgentLocal(new Request('http://fixture.invalid/api/canvas/assistant',{method:'POST',body:JSON.stringify({sessionId:'ag-audit-run',projectKey:'tree:test',messages:[{role:'user',content:'hello'}]})})),/CAS conflict/);
  assert.equal(session.running,true);assert.equal(session.canvasExecuting,true);return {running:session.running,canvasExecuting:session.canvasExecuting,modelCalls:0};
 });
 async function runWorkbench(frames){
  const owner=lib.createWorkbenchSession();owner.activateAccount('audit@example.test');let messages=[],error=null,saves=0;
  const context={ready:true,busy:false,unavailable:false,allowed:true,authenticated:true,uploading:false,input:'request',attachments:[],messages:[],skill:null,
   sessionId:()=> 'ag-audit',headers:async()=>({}),setMessages:change=>{messages=typeof change==='function'?change(messages):change;},
   setError:value=>error=value,setInput:()=>{},setAttachments:()=>{},setBusy:()=>{},setRunning:()=>{},installSession:()=>{},refreshSessions:async()=>{},requestSignIn:()=>{},invalidateAccount:()=>{},
   request:async(url,init)=>{if(url==='/api/agent')return new Response(frames.map(([type,data])=>`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});saves++;return Response.json({ok:true});},
  };await owner.send(context);return {messages,error,saves};
 }
 await finding('A04','workbench discards partial text on error or unframed EOF',async()=>{
  const partial='retained draft before interruption';
  const errored=await runWorkbench([['delta',{text:partial}],['error',{message:'network interrupted'}]]);
  const eof=await runWorkbench([['delta',{text:partial}]]);
  assert.ok(!JSON.stringify(errored.messages).includes(partial));assert.ok(!JSON.stringify(eof.messages).includes(partial));
  return {errorTerminal:errored.messages.at(-1),cleanEofTerminal:eof.messages.at(-1),cleanEofError:eof.error,cleanEofAutosaves:eof.saves};
 });
 async function workbenchRoute(stopReason,attention){
  const session={id:'ag-audit',events:[],running:false,canvasExecuting:false,title:'audit',harness:{publicText:x=>x},agent:{state:{messages:[]},abort(){},async prompt(){
   session.agent.state.messages.push({role:'assistant',stopReason,content:[{type:'text',text:'model claims complete'}]});
   if(attention)session.events.push({type:'attention',data:{kind:'restricted',message:'operation denied',code:'FEATURE_ACCESS_DENIED'}});
  }}};
  const c=evaluate(extract(W,'handlePut'),{authedEmail:async()=> 'audit@example.test',NextResponse:Response,readHarnessBody:lib.readHarnessBody,assertHarnessSessionId:lib.assertHarnessSessionId,
   checkRateLimit:async()=>true,resolveImageSkill:async()=>null,getOpenAISettings:async()=>({apiKey:'fixture'}),requestedTextModel:()=> 'fixture',MODEL_ID:'fixture',agentVisionEnabled:()=>false,
   getOrCreateSession:async()=>session,randomUUID,appendSessionEvent:(s,type,data)=>s.events.push({type,data}),buildTaskPlan:()=>[],persistAgentSession:async()=>{},
   primeAgentSystemPrompt:()=>{},classifyAgentFailure:e=>({message:e.message}),markVisionUnsupported:()=>false,HarnessError:lib.HarnessError,
  });const response=await c.handlePut(new Request('http://fixture.invalid/api/agent',{method:'PUT',body:JSON.stringify({sessionId:'ag-audit',message:'request'})}));return response.text();
 }
 await finding('A05','workbench reports truncated model output as final success',async()=>{const wire=await workbenchRoute('length');assert.ok(wire.includes('event: final'));assert.ok(!wire.includes('event: error'));return {stopReason:'length',wire};});
 await finding('A06','workbench final ignores authoritative restricted attention',async()=>{const wire=await workbenchRoute('stop',true);assert.ok(wire.includes('operation denied'));assert.ok(wire.includes('"reply":"model claims complete"'));return {wire};});
 await finding('A07','workbench native media is skipped by vision loader',async()=>{
  let fetches=0;const c=evaluate(extract(R,'resolveVisionImages'),{VISION_MAX_IMAGES:6,VISION_MAX_BYTES:8388608,VISION_ALLOWED_HOST_RE:/(^|\.)(imgdd\.cc|youmind\.com|cms-assets\.youmind\.com)$/i,
   process:{env:{INTERNAL_APP_ORIGIN:'http://127.0.0.1:3000'}},assertMediaUrl:()=>{},publicImageBytes:async()=>{throw Error('not called')},fetch:async()=>{fetches++;return new Response('image',{headers:{'content-type':'image/png'}});},readBoundedBytes:async()=>Buffer.from('image')});
  const relative=await c.resolveVisionImages(['/media/upload.png'],'fixture-cookie');const publicUrl=await c.resolveVisionImages(['https://site.example/media/upload.png'],'fixture-cookie');const internal=await c.resolveVisionImages(['http://127.0.0.1:3000/media/upload.png'],'fixture-cookie');
  assert.equal(relative.length,0);assert.equal(publicUrl.length,0);assert.equal(internal.length,1);return {relativeImages:relative.length,publicSiteImages:publicUrl.length,internalImages:internal.length,controlledFetches:fetches};
 });
 await finding('A08','read-only gateway token can persist uploads',async()=>{
  let writes=0;const c=evaluate(extract('src/app/api/agent-gateway/v1/uploads/route.ts','POST'),{MAX_UPLOAD_BYTES:12582912,
   gatewayRoute:async(req,run)=>run({email:'audit@example.test',token:{scopes:['read']},origin:'https://site.example'}),assertAgentToolAccess:async()=>{},
   saveAgentUpload:async()=>{writes++;return {url:'/media/test.png',id:'fixture'};},publicMediaUrl:(url,origin)=>origin+url,gatewayJson:(data,status)=>Response.json(data,{status})});
  const data=new FormData();data.append('file',new File(['fixture'],'test.png',{type:'image/png'}));const response=await c.POST(new Request('http://fixture.invalid',{method:'POST',body:data}));assert.equal(response.status,201);assert.equal(writes,1);return {scopes:['read'],status:response.status,persistenceCalls:writes,actualDatabaseWrites:0};
 });
 await finding('A09','harness loses known rejection metadata before gateway classification',async()=>{
  const c=evaluate(extract(G,'failure'),{HarnessError:lib.HarnessError,FeatureAccessError:class extends Error{}});
  const original=Object.assign(Error('balance insufficient'),{deterministic:true,status:402,code:'INSUFFICIENT_CREDITS'});
  const before=c.failure(original),h=new lib.AgentHarness('audit@example.test','ag-audit');h.configure([{name:'write',write:true,parameters:{type:'object',properties:{}}}]);h.begin('run',()=>{});h.permit('write',{},'call');let caught;
  try{await h.execute('write',{},'call',undefined,async()=>{throw original;});}catch(e){caught=e;}finally{h.finish();}
  const after=c.failure(caught);assert.equal(before.state,'rejected');assert.equal(after.error.submitted,'unknown');assert.equal(after.state,'failed');return {before,after};
 });
 await finding('A10','CLI marks submitted-unknown failures as ordinary failure',()=>{
  const c=evaluate(extract(C,'exitForCall'),{EXIT:{ok:0,failed:1,usage:2,auth:3,budget:4,unknown:5}});const exit=c.exitForCall({state:'failed',error:{code:'TOOL_TIMEOUT',submitted:'unknown'}});assert.equal(exit,1);return {state:'failed',submitted:'unknown',actualExit:exit,documentedUnknownExit:5};
 });
 await finding('A11','pre-header transport failure loses operation ID in CLI and MCP',async()=>{
  const code=extract(C,'CliError','class')+'\n'+['failureExit','request','streamCall'].map(n=>extract(C,n)).join('\n');
  const c=evaluate(code,{API:'/api/agent-gateway/v1',VERSION:'fixture',EXIT:{ok:0,failed:1,usage:2,auth:3,budget:4,unknown:5},fetch:async()=>{throw Error('socket closed before headers');}});
  const operationId='11111111-1111-4111-8111-111111111111';let error;try{await c.streamCall({site:'http://127.0.0.1',token:'fixture'},{tool:'generate_image',arguments:{},operationId});}catch(e){error=e;}
  assert.equal(error.exit,5);assert.equal(error.detail,undefined);assert.ok(!error.message.includes(operationId));return {exit:error.exit,message:error.message,structuredOperationId:null,actualNetwork:0};
 });
 await finding('A12','media job outputs omitted from gateway media receipts',()=>{
  const outputs=lib.resultMediaUrls({details:{job:{status:'completed',outputs:[{url:'/media/video-result.mp4',artworkId:'video-result'}]}}});
  assert.deepEqual(outputs,[]);return {tool:'get_video_media_task',shape:'details.job.outputs[].url',media:outputs};
 });
 await finding('A13','free A-plus preparation consumes quoted token budget',async()=>{
  const c=evaluate(extract('src/lib/billing/agent.ts','agentBillingPrecheck'),{dbEnabled:true,agentQuote:async()=>({quote:{configVersion:1,requestedCredits:24},label:'A+',threshold:0}),fingerprint:()=> 'fixture-billing-id',getUser:async()=>({creditsTotal:0,creditsUsed:0})});
  const session={email:'audit@example.test',id:'gw-audit',cred:{}};const block=await c.agentBillingPrecheck(session,'generate_aplus',{},'call');assert.equal(block,undefined);assert.equal(session.preparedBilling.billingCredits,24);
  const quote=evaluate(extract(G,'serverQuote'),{agentBillingPrecheck:c.agentBillingPrecheck});const credits=await quote.serverQuote({tool:{name:'generate_aplus'},args:{},session:{billing:session,harness:{sanitize:x=>x},bundle:null}},'call');
  assert.equal(credits,24);return {preparationActualCharge:0,userBalance:0,budgetReservation:credits,quoteFixture:24};
 });
 await finding('A14','gateway marks unavailable image inspection successful',async()=>{
  const c=evaluate(extract(G,'runReserved'),{sessionId:()=> 'gw-audit',currentCreationContext:()=>null,withFrozenCreation:(_,run)=>run(),startCreation:async()=>null,withAcceptedExecution:(_,run)=>run(),
   recordAgentToolEvidence:async()=>true,finishCreation:async()=>{},toOutput:x=>({text:'inspection unavailable',details:x.details,media:[]})});
  const outcome=await c.runReserved({email:'audit@example.test',origin:'https://site.example'}, {session:{harness:{begin(){},permit(){},finish(){}}},tool:{name:'verify_image_output',execute:async()=>({content:[{type:'text',text:'inspection unavailable'}],details:{verificationStatus:'unavailable'}})},args:{}},{operationId:'fixture'},undefined,()=>{});
  assert.equal(outcome.state,'succeeded');return {verificationStatus:outcome.output.details.verificationStatus,state:outcome.state};
 });
 await finding('A15','gateway replay ignores original request semantics',async()=>{
  const digest=evaluate(['argumentsDigest','canonical'].map(n=>extract('src/lib/agent-gateway/calls.ts',n)).join('\n'),{createHash});let existingDigest;
  const c=evaluate(extract(G,'beginGatewayCall'),{prepare:async(_,input)=>({tool:{name:input.tool},args:input.arguments,timeoutMs:1}),argumentsDigest:digest.argumentsDigest,
   existingCall:async(_,id,tool,hash)=>existingDigest===hash?{operationId:id,state:'succeeded',tool}:null,serverQuote:async()=>0,startAccountWork:async()=>({}),endAccountWork:async()=>{},reserveCall:async(_,input)=>{existingDigest=input.digest;return {reserved:true};}});
  const base={tool:'generate_image',arguments:{prompt:'a product'},operationId:'same-id'};const first=await c.beginGatewayCall({token:{}},{...base,request:'red background'});assert.ok(first.run);
  const next=await c.beginGatewayCall({token:{}},{...base,request:'blue background'});assert.ok(next.replay);return {firstOriginalRequest:'red background',secondOriginalRequest:'blue background',secondResponse:'replay, not 409',modelCalls:0};
 });
 await finding('A16','history uses local busy state and can delete another slot active session',async()=>{
  const projectKey='tree:audit',prefix='cv-'+createHash('sha256').update('project:'+projectKey).digest('hex').slice(0,12)+'-',id=prefix+'test';let deletes=0;
  const saved={id,title:'active remotely',messages:[{role:'user',content:'working'}],steps:[{type:'canvas_turn',turnId:'turn',message:'working',messageIndex:0},{type:'agent_start'}]};
  const c=evaluate(extract('src/lib/agent/canvas-history.ts','canvasAgentHistory'),{authenticatedEmail:async()=> 'audit@example.test',NextResponse:Response,
   listArtworks:async()=>[],listArtworksByIds:async()=>[],canvasSessionPrefix:anchor=>'cv-'+createHash('sha256').update(anchor).digest('hex').slice(0,12)+'-',
   canvasProjectSessionPrefix:()=>prefix,getSession:()=>null,getAgentSession:async()=>saved,AgentHarness:lib.AgentHarness,continuationTurn:()=>undefined,
   removeRuntimeSession:()=> 'missing',deleteAgentSession:async()=>{deletes++;}});
  const url=`http://fixture.invalid/api/canvas/assistant?projectKey=${projectKey}&id=${id}`;
  const view=await (await c.canvasAgentHistory(new Request(url))).json();const removed=await c.canvasAgentHistory(new Request(url,{method:'DELETE'}));
  assert.equal(view.session.running,false);assert.equal(view.session.status,'failed');assert.equal(removed.status,200);assert.equal(deletes,1);
  assert.ok(!extract('src/app/api/agent/session/route.ts','DELETE').includes('routeAgentToOwner'));
  return {scenario:'persisted active turn, owner on another slot; current process has no local session',displayed:view.session.status,running:view.session.running,deleteStatus:removed.status,deleteCalls:deletes};
 });
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'reproductions.json'),JSON.stringify({baseline:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tier:'actual modules and extracted production functions; controlled ports; no PG/network/provider',sources,results},null,2));
 console.log(`AGENT_CHAIN_AUDIT REPRODUCED=${results.length} REPAIRED=0 NETWORK=0 DB=0 SUPPLIER=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
