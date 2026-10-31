'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,baseline=args.includes('--baseline'),root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.NATIVE_HTTP_EVIDENCE||'output/native-fixture-http'));
const text=fs.readFileSync(path.join(root,'scripts/video-fusion/harness.ts'),'utf8'),sf=ts.createSourceFile('harness.ts',text,99,true);let method;
(function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(sf)==='request')method=n.getText(sf);ts.forEachChild(n,visit);})(sf);assert.ok(method);
const compiled=ts.transpileModule('export const fixture={'+method+'};',{compilerOptions:{target:9,module:1}}).outputText;
let cases=0,checks=0;const normal=[],plain=x=>JSON.parse(JSON.stringify(x)),eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
const error=code=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error(code),{code})});
function setup(adapter){
 const calls=[],delays=[],timeouts=[],logs=[],controller=new AbortController();let ids=0;const module={exports:{}};
 const state={calls,delays,timeouts,logs,controller,get ids(){return ids;}};
 const context={module,exports:module.exports,Response,Headers,Error,baseUrl:'http://127.0.0.1:12345',seed:{cookies:{a:'nv_user=fixture-a',b:'nv_user=fixture-b'}},logs,randomUUID:()=>{ids++;return'fixture-generated-'+ids;},AbortSignal:{timeout(ms){timeouts.push(ms);return controller.signal;}},setTimeout(fn,ms){delays.push(ms);queueMicrotask(()=>{state.beforeDelay?.();fn();});},fetch:async(url,init)=>{calls.push({url,init});return adapter(state,calls.length);}};
 vm.runInNewContext(compiled,context);state.request=module.exports.fixture.request;state.trace=()=>({calls:calls.map(c=>({url:c.url,method:c.init.method,headers:c.init.headers,body:c.init.body??null})),delays,timeouts,ids});return state;
}
async function test(name,fn,stable=true){const value=await fn();if(stable)normal.push([name,value]);cases++;console.log('PASS '+name);}
async function rejected(p){try{await p;}catch(e){return e;}throw Error('EXPECTED_REJECTION');}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 await test('normal-read-original-actor-and-url',async()=>{const s=setup(()=>Response.json({id:'original'})),r=await s.request('a','GET','/api/canvas/timeline-nodes/original');eq(r.body,{id:'original'});eq(s.calls.length,1);eq(s.timeouts,[90000]);return {result:r.body,trace:s.trace()};});
 await test('normal-write-exact-original-body-and-operation',async()=>{const s=setup(()=>Response.json({accepted:true},{status:202})),r=await s.request('a','POST','/api/task',{idempotencyKey:'original-op',value:0});eq(r.status,202);eq(s.calls[0].init.headers['x-naumi-billing-operation-id'],'original-op');eq(s.ids,0);return {result:r.body,trace:s.trace()};});
 await test('foreign-actor-http-denial-is-visible',async()=>{const s=setup(()=>Response.json({error:'denied'},{status:403})),r=await s.request('b','GET','/api/task/original');eq(r.status,403);eq(s.calls[0].init.headers.cookie,'nv_user=fixture-b');eq(s.calls.length,1);return {result:r.body,trace:s.trace()};});
 for(const status of [400,402,404,409,429,500,503])await test('http-status-'+status+'-never-retried-or-reclassified',async()=>{const s=setup(()=>Response.json({error:'actual-'+status},{status})),r=await s.request('a','GET','/api/task/original');eq(r.status,status);eq(s.calls.length,1);eq(s.delays,[]);return {result:r.body,trace:s.trace()};});
 for(const method of ['POST','PATCH','DELETE'])await test('unknown-'+method+'-is-one-request',async()=>{const original=error('ECONNRESET'),s=setup(()=>{throw original;}),e=await rejected(s.request('a',method,'/api/task/original',{idempotencyKey:'original-op'}));eq(e.message,'Fixture HTTP '+method+' /api/task/original transport failed');ok(e.cause===original);eq(s.calls.length,1);eq(s.delays,[]);return {error:e.message,trace:s.trace()};});
 await test('nontransport-error-is-not-retried',async()=>{const original=new TypeError('invalid fixture input'),s=setup(()=>{throw original;}),e=await rejected(s.request('a','GET','/api/task/original'));ok(e.cause===original);eq(s.calls.length,1);return {error:e.message,trace:s.trace()};});
 await test('malformed-json-is-not-made-successful',async()=>{const original=new SyntaxError('invalid fixture JSON'),s=setup(()=>({status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>{throw original;}})),e=await rejected(s.request('a','GET','/api/task/original'));ok(e===original);eq(s.calls.length,1);return {error:e.message,trace:s.trace()};});
 await test('body-stream-failure-remains-visible',async()=>{const original=error('ECONNRESET'),s=setup(()=>({status:200,headers:new Headers({'content-type':'application/octet-stream'}),arrayBuffer:async()=>{throw original;}})),e=await rejected(s.request('a','GET','/api/task/original'));ok(e===original);eq(s.calls.length,1);return {error:e.message,trace:s.trace()};});
 await test('serialization-error-preserves-original-wrapper',async()=>{const s=setup(()=>{throw Error('must not fetch');}),body={};body.self=body;const e=await rejected(s.request('a','POST','/api/task',body));eq(e.message,'Fixture HTTP POST /api/task transport failed');eq(e.cause.name,'TypeError');eq(s.calls.length,0);return {error:e.message,cause:e.cause.name,trace:s.trace()};});
 await test('nonlocal-url-is-rejected-before-transport',async()=>{const s=setup(()=>{throw Error('must not fetch');}),e=await rejected(s.request('a','GET','//outside.invalid/path'));eq(e.message,'Fixture requests must stay in the fixture app');eq(s.calls.length,0);return {error:e.message,trace:s.trace()};});
 await test('same-read-recovers-transient-restart',async()=>{const first=error('ECONNRESET'),second=error('ECONNREFUSED'),s=setup((_s,n)=>{if(n<3)throw n===1?first:second;return Response.json({id:'original',state:'accepted'});});let result,e;try{result=await s.request('a','GET','/api/task/original');}catch(v){e=v;}if(baseline){ok(e?.cause===first);eq(s.calls.length,1);}else{eq(result.body,{id:'original',state:'accepted'});eq(s.calls.length,3);eq(s.delays,[250,500]);ok(s.calls.every(c=>c.init===s.calls[0].init));ok(s.calls.every(c=>c.url===s.calls[0].url));eq(s.ids,1);eq(s.timeouts,[90000]);}return {recovered:!e};},false);
 await test('persistent-transport-error-is-bounded-and-throws',async()=>{const original=error('ECONNRESET'),s=setup(()=>{throw original;}),e=await rejected(s.request('a','GET','/api/task/original'));ok(e.cause===original);eq(s.calls.length,baseline?1:5);eq(s.delays,baseline?[]:[250,500,750,1000]);eq(s.timeouts,[90000]);eq(s.ids,1);return {bounded:true};},false);
 await test('existing-deadline-aborts-without-retry',async()=>{const original=error('ECONNRESET'),s=setup(state=>{state.controller.abort(new DOMException('original deadline','TimeoutError'));throw original;}),e=await rejected(s.request('a','GET','/api/task/original'));ok(e.cause===original);eq(s.calls.length,1);eq(s.delays,[]);eq(s.timeouts,[90000]);return {error:e.message,trace:s.trace()};});
 await test('deadline-during-backoff-makes-no-extra-fetch',async()=>{const original=error('ECONNRESET'),s=setup(()=>{throw original;});s.beforeDelay=()=>s.controller.abort(new DOMException('original deadline','TimeoutError'));const e=await rejected(s.request('a','GET','/api/task/original'));eq(s.calls.length,1);eq(s.timeouts,[90000]);if(baseline){ok(e.cause===original);eq(s.delays,[]);}else{ok(e.cause===s.controller.signal.reason);eq(s.delays,[250]);}return {sameDeadline:true};},false);
 await test('actual-node-fetch-loopback-restart-and-lost-write-ack',async()=>{
  const calls=[],ports=[],logs=[],operation='10000000-0000-4000-8000-000000000001';let writes=0,reads=0,failedReads=0;
  const server=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);calls.push({path:req.url,method:req.method,cookie:req.headers.cookie,operation:req.headers['x-naumi-billing-operation-id'],body:Buffer.concat(parts).toString()});
   if(req.headers.cookie!=='nv_user=fixture-a'){res.writeHead(403,{'content-type':'application/json'});return res.end(JSON.stringify({error:'denied'}));}
   if(req.url==='/read/original'&&++reads===1){req.socket.destroy();return;}
   if(req.url==='/always-reset'){failedReads++;req.socket.destroy();return;}
   if(req.method==='POST'){writes++;req.socket.destroy();return;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({operationId:operation,accepted:true,writes}));
  });
  try{
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const module={exports:{}},origin='http://127.0.0.1:'+server.address().port;
   vm.runInNewContext(compiled,{module,exports:module.exports,Error,Response,AbortSignal,setTimeout,baseUrl:origin,seed:{cookies:{a:'nv_user=fixture-a',b:'nv_user=fixture-b'}},randomUUID:crypto.randomUUID,logs,fetch:async(url,init)=>{ports.push({url,init});return fetch(url,init);}});
   const request=module.exports.fixture.request;let readResult,readError;try{readResult=await request('a','GET','/read/original');}catch(e){readError=e;}
   eq(reads,baseline?1:2);if(baseline)ok(!!readError);else eq(readResult.body.operationId,operation);
   const recovered=ports.filter(p=>p.url.endsWith('/read/original'));ok(recovered.every(p=>p.init===recovered[0].init));ok(calls.filter(p=>p.path==='/read/original').every(p=>p.cookie==='nv_user=fixture-a'&&p.operation===calls[0].operation));
   const postError=await rejected(request('a','POST','/write/original',{idempotencyKey:operation}));ok(!!postError);eq(writes,1);eq(calls.filter(p=>p.method==='POST').length,1);
   const receipt=await request('a','GET','/receipt/original');eq(receipt.body,{operationId:operation,accepted:true,writes:1});
   const denied=await request('b','GET','/receipt/original');eq(denied.status,403);eq(calls.filter(p=>p.cookie==='nv_user=fixture-b').length,1);
   ok(!!await rejected(request('a','GET','/always-reset')));eq(failedReads,baseline?1:5);eq(writes,1);
   return {realLoopback:true,lostPostAck:'UNKNOWN',originalReceipt:'CONFIRMED',writes:1,postRequests:1,sameActorUrlHeadersAndSignal:true,foreign403Visible:true};
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
 });
 let comparison='CAPTURED';if(arg('--compare')){eq(normal,JSON.parse(fs.readFileSync(arg('--compare'),'utf8')).normal,'all original normal/HTTP/write/error traces exact');comparison='EXACT';}
 const result={status:baseline?'BASELINE_REPRODUCED':'PASS',cases,checks,comparison,normal,actualMethod:true,transport:'explicit negative-control ports plus actual Node fetch/loopback TCP',realLoopbackTCP:true,serverClosed:true,readTransientRecovered:!baseline,writeRetries:0,sameReadIdentity:true,originalDeadlineMs:90000,maxReadAttempts:baseline?1:5,sourceHash:crypto.createHash('sha256').update(text).digest('hex'),pg:0,supplierPosts:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`NATIVE_FIXTURE_HTTP=${result.status} CASES=${cases} CHECKS=${checks} NORMAL=${comparison} READ_RECOVERED=${Number(!baseline)} WRITE_RETRIES=0 ORIGINAL_DEADLINE_MS=90000 MAX_READ_ATTEMPTS=${result.maxReadAttempts} PG=0 SUPPLIER_POSTS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
