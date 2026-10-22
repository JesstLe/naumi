import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {combinedWorkerPlan,createCombinedWorkerControl,createCombinedWorkerProxy,CombinedWorkerSupervisor} from './video-worker-with-media.mjs';

// Lifecycle fixtures only: injected process/kill/fetch/server implementations.
// No real child process, socket, sandbox, database or supplier call is executed.
const version='b'.repeat(40),operation='22222222-2222-4222-8222-222222222222';
const env={NAUMI_MEDIA_WORKER:'1',NAUMI_WORKER_RELEASE_CONTROL:'1',VIDEO_WORKER_SECRET:'synthetic-scanner-secret-at-least-32-characters',
  MEDIA_WORKER_SECRET:'synthetic-media-secret-at-least-32-characters',SOURCE_COMMIT:version,BUILD_VERSION:'1792674911',
  NAUMI_WORKER_STATE_FILE:'/release-state/worker.json',NAUMI_INSTANCE_ID:'synthetic-worker',NAUMI_WORKER_TARGET_INSTANCE_ID:'synthetic-web',
  NAUMI_APP_ORIGIN:'http://synthetic-web:3000',MEDIA_JOB_DIR:'/scratch',
  DATABASE_URL:'synthetic-database-secret',SETTINGS_SECRET:'synthetic-settings-secret',S3_SECRET_ACCESS_KEY:'synthetic-nas-secret'};
const plan=combinedWorkerPlan(env,{platform:'linux',uid:0,pid:1});
let assertions=0;
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++;};
const rejected=async(promise,pattern,message)=>{await assert.rejects(promise,pattern,message);assertions++;};
const state=(paused=true)=>({schemaVersion:1,instanceId:plan.scanner.env.NAUMI_INSTANCE_ID,commit:version,durableControl:true,revision:0,
  paused,phase:paused?'QUIESCENT':'IDLE',bootId:'33333333-3333-4333-8333-333333333333',activeTicks:0,unresolvedTicks:0});
const health=(draining=true)=>({ok:true,version,sandbox:true,draining,running:0,queued:0,terminal:2,maxActive:8,concurrency:1});
const jsonResponse=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const requestBody=(action,id=operation,revision=0)=>Buffer.from(`{ "operationId": "${id}", "action": "${action}", "bootId": "33333333-3333-4333-8333-333333333333", "expectedRevision": ${revision} }`);
function controlFixture({paused=true}={}){
  const f={events:[],state:state(paused),health:health(),permit:false,receipts:new Map(),requests:[],mediaBodies:[],mainWrites:0,mediaFailure:false,stopping:false};
  f.control=createCombinedWorkerControl({plan,scannerPermit:async allowed=>{f.events.push('permit:'+allowed);f.permit=allowed;},scannerPermitState:()=>f.permit,isStopping:()=>f.stopping,
    scannerRequest:async(method,url,raw)=>{
      if(method==='GET'){f.events.push('scanner-status');return {status:200,data:structuredClone(f.state)};}
      f.events.push('scanner-control');f.requests.push(raw);const input=JSON.parse(raw);
      let receipt=f.receipts.get(input.operationId);
      if(!receipt){f.mainWrites++;f.state.revision++;f.state.paused=input.action!=='resume';f.state.phase=f.state.paused?'QUIESCENT':'IDLE';
        receipt={action:input.action,revision:f.state.revision,operationId:input.operationId};f.receipts.set(input.operationId,receipt);}
      return {status:200,data:{state:structuredClone(f.state),receipt:structuredClone(receipt)}};
    },mediaRequest:async(method,url,raw)=>{
      f.events.push(method==='GET'?'media-health':'media-'+url.slice(1));
      if(method==='GET')return {status:200,data:structuredClone(f.health)};
      f.mediaBodies.push(JSON.parse(raw));if(f.mediaFailure)throw Error('Synthetic media control timeout');
      f.health.draining=url==='/drain';return {status:200,data:{ok:true,draining:f.health.draining}};
    }});
  return f;
}
function fakeLifecycle({paused=false,stallHealth=false,stallProxy=false}={}){
  const f={events:[],children:new Map(),signals:[],state:state(paused),health:health(),healthEntered:false,proxyClosed:0};
  let releaseHealth,releaseProxy;
  const healthGate=stallHealth?new Promise(resolve=>{releaseHealth=resolve;}):null;
  const proxyGate=stallProxy?new Promise(resolve=>{releaseProxy=resolve;}):null;
  f.releaseHealth=()=>releaseHealth?.();f.releaseProxy=()=>releaseProxy?.();
  const proxy={closeIdleConnections(){},close(callback){f.events.push('proxy-close');f.proxyClosed++;queueMicrotask(callback);}};
  const testPlan={...plan,graceMs:1};
  f.supervisor=new CombinedWorkerSupervisor(testPlan,{
    spawnImpl:(_executable,args,options)=>{
      const name=args.some(value=>value.endsWith('video-media-worker.mjs'))?'media':'scanner';
      f.events.push('spawn-'+name);const child=new EventEmitter();child.pid=700001+f.children.size;child.connected=name==='scanner';child.options=options;child.name=name;child.ignoreTerm=false;
      child.send=(message,callback)=>{f.events.push(`gate:${message.allowed}:${message.start}`);callback?.(null);
        queueMicrotask(()=>child.emit('message',{type:'naumi-worker-gate-ack',id:message.id,allowed:message.allowed,started:message.start}));};
      f.children.set(name,child);return child;
    },killImpl:(pid,signal)=>{
      assert(pid<0,'Only fake process groups are signalled');const child=[...f.children.values()].find(value=>value.pid===-pid);assert(child,'Signal is confined to a known fake child');
      f.events.push(`kill-${child.name}:${signal}`);f.signals.push({name:child.name,signal});
      if(signal!=='SIGTERM'||!child.ignoreTerm)queueMicrotask(()=>child.emit('exit',signal==='SIGTERM'?0:null,signal));
    },fetchImpl:async(url,options)=>{
      const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');
      if(parsed.port==='3002'){
        equal(options.headers.authorization,'Bearer '+plan.mediaSecret,'Media uses only the media authorization');
        if(parsed.pathname==='/health'){f.events.push('media-health');f.healthEntered=true;if(healthGate)await healthGate;return jsonResponse(f.health);}
        f.events.push('media-'+parsed.pathname.slice(1));f.health.draining=parsed.pathname==='/drain';return jsonResponse({ok:true,draining:f.health.draining});
      }
      assert.equal(parsed.port,'3003');f.events.push('scanner-status');equal(options.headers['x-video-worker-secret'],plan.workerSecret,'Scanner uses only scanner authentication');
      return jsonResponse(f.state);
    },proxyFactory:async()=>{f.events.push('proxy-start');if(proxyGate)await proxyGate;return proxy;},log:()=>{},sleepImpl:async()=>{},
  });
  return f;
}
async function main(){
  equal({uid:plan.scanner.uid,gid:plan.scanner.gid},{uid:1001,gid:1001},'Scanner privilege is distinct from media supervision');
  equal({uid:plan.media.uid,gid:plan.media.gid},{uid:0,gid:0},'Media process retains sandbox supervisor privilege');
  equal(plan.scanner.env.NAUMI_WORKER_CONTROL_PORT,'3003','Scanner listens on its private child control port');
  equal(plan.media.env.MEDIA_WORKER_PORT,'3002','Media listens on its dedicated child port');
  for(const secretKey of ['DATABASE_URL','SETTINGS_SECRET','S3_SECRET_ACCESS_KEY']){
    equal(secretKey in plan.scanner.env,false,`Scanner does not inherit ${secretKey}`);equal(secretKey in plan.media.env,false,`Media does not inherit ${secretKey}`);
  }
  equal('MEDIA_WORKER_SECRET' in plan.scanner.env,false,'Media authentication is not copied to scanner');
  equal('VIDEO_WORKER_SECRET' in plan.media.env,false,'Scanner authentication is not copied to media');
  for(const overrides of [{platform:'win32',uid:0,pid:1},{platform:'linux',uid:1001,pid:1},{platform:'linux',uid:0,pid:20}]){assert.throws(()=>combinedWorkerPlan(env,overrides),/CONTAINER_ROOT_PID1/);assertions++;}
  for(const change of [{NAUMI_MEDIA_WORKER:'0'},{MEDIA_WORKER_CONCURRENCY:'2'},{MEDIA_JOB_DIR:'/data'},{MEDIA_WORKER_PORT:'3001'}]){assert.throws(()=>combinedWorkerPlan({...env,...change},{platform:'linux',uid:0,pid:1}));assertions++;}

  const f=controlFixture(),raw=requestBody('resume'),original=Buffer.from(raw);
  const resumed=await f.control.control(raw);
  equal(resumed.status,200,'Both controls produce one combined acknowledgement');
  assert.strictEqual(f.requests[0],raw,'Scanner receives the exact original raw Buffer');assertions++;
  equal(raw,original,'Original whitespace, request body and UUID are preserved');
  equal(f.events,['permit:false','scanner-control','media-resume','media-health','permit:true'],'Ticks are permitted only after scanner ACK and observed media mode');
  equal(f.mediaBodies[0],{operationId:operation,action:'resume',scannerAction:'resume'},'Media audit uses the same operation UUID');

  const partial=controlFixture();partial.mediaFailure=true;
  await rejected(partial.control.control(raw),/Synthetic media control timeout/,'Partial response cannot acknowledge the combined operation');
  equal(partial.state.paused,false,'Main scanner actually accepted resume before simulated media failure');
  equal(partial.permit,false,'A partial resume keeps ticks held');
  const held=await partial.control.status();equal(held.phase,'UNKNOWN','Durable resume with held ticks is visibly unknown');equal(held.controlFault,'COMBINED_SCANNER_TICK_HELD','Held state exposes its exact control fault');
  partial.mediaFailure=false;await partial.control.control(raw);
  equal(partial.mainWrites,1,'Retry reuses the scanner acknowledgement instead of advancing its revision');
  assert.strictEqual(partial.requests[0],partial.requests[1]);assertions++;
  equal(partial.permit,true,'Original UUID retry releases ticks only after media recovers');

  const drain=requestBody('drain','55555555-5555-4555-8555-555555555555',1);
  await f.control.control(drain);const beforeStale=f.mediaBodies.length;
  await rejected(f.control.control(raw),/SCANNER_CONTROL_ACK_REQUIRED/,'Stale resume receipt cannot override a later drain');
  equal(f.mediaBodies.length,beforeStale,'Stale control does not reapply media mode');equal(f.health.draining,true,'Later drain remains effective');
  const reconciled=controlFixture();reconciled.state.phase='UNKNOWN';await reconciled.control.control(requestBody('reconcile'));
  equal(reconciled.mediaBodies.map(value=>value.action),['drain'],'Reconciliation never resumes media');equal(reconciled.permit,false,'Reconciliation never permits a tick');
  for(const paused of [true,false]){
    const startup=controlFixture({paused});await startup.control.alignStartup();
    equal(startup.mediaBodies[0].action,paused?'drain':'resume','Startup uses actual durable scanner paused state');
    equal(startup.permit,false,'Startup alignment itself does not release the scanner gate');
  }
  const stopping=controlFixture();stopping.stopping=true;await rejected(stopping.control.control(raw),/STOPPING/,'Stopping supervisor cannot resume either child');equal(stopping.mainWrites,0,'Stopping rejects before scanner mutation');

  const lifecycle=fakeLifecycle();await lifecycle.supervisor.start();
  assert(lifecycle.events.indexOf('media-health')<lifecycle.events.indexOf('spawn-scanner'));assertions++;
  assert(lifecycle.events.indexOf('media-resume')<lifecycle.events.indexOf('gate:true:true'));assertions++;
  assert(lifecycle.events.indexOf('gate:true:true')<lifecycle.events.indexOf('proxy-start'));assertions++;
  equal(lifecycle.children.get('scanner').options.stdio,['ignore','inherit','inherit','ipc'],'Scanner gate has an explicit IPC channel');
  equal(lifecycle.children.get('media').options.stdio,['ignore','inherit','inherit'],'Media process does not inherit scanner IPC');
  equal(await lifecycle.supervisor.shutdown(0),0,'Graceful parent shutdown succeeds');
  equal(lifecycle.signals,[{name:'scanner',signal:'SIGTERM'},{name:'media',signal:'SIGTERM'}],'Scanner exits before the media service');equal(lifecycle.proxyClosed,1,'Control proxy closes exactly once');

  const crashed=fakeLifecycle();await crashed.supervisor.start();crashed.children.get('media').emit('exit',1,'SIGSEGV');
  equal(await crashed.supervisor.done,1,'An unexpected child exit fails the parent');
  equal(crashed.signals,[{name:'scanner',signal:'SIGTERM'}],'Unexpected media exit shuts down its scanner peer');
  const escalated=fakeLifecycle();await escalated.supervisor.start();escalated.children.get('scanner').ignoreTerm=true;
  equal(await escalated.supervisor.shutdown(0),1,'A non-terminating child produces a failed shutdown');
  equal(escalated.signals,[{name:'scanner',signal:'SIGTERM'},{name:'scanner',signal:'SIGKILL'},{name:'media',signal:'SIGTERM'}],'Kill escalation is bounded and confined to fake child groups');

  const interrupted=fakeLifecycle({stallHealth:true});const startInterrupted=interrupted.supervisor.start();
  while(!interrupted.healthEntered)await new Promise(resolve=>setImmediate(resolve));
  await interrupted.supervisor.shutdown(0);interrupted.releaseHealth();await startInterrupted;equal(await interrupted.supervisor.done,0,'SIGTERM during startup is a graceful shutdown');
  equal(interrupted.children.has('scanner'),false,'No scanner is launched after startup shutdown');equal(interrupted.events.includes('proxy-start'),false,'No proxy is exposed after startup shutdown');
  const lateProxy=fakeLifecycle({stallProxy:true});const lateStart=lateProxy.supervisor.start();
  while(!lateProxy.events.includes('proxy-start'))await new Promise(resolve=>setImmediate(resolve));
  await lateProxy.supervisor.shutdown(0);lateProxy.releaseProxy();await lateStart;equal(await lateProxy.supervisor.done,0,'Late proxy does not turn graceful shutdown into a startup failure');equal(lateProxy.proxyClosed,1,'Late proxy is not leaked');

  // Exercise the actual proxy handler through a fake server, including its 503
  // boundary. No real listen/socket operation is invoked.
  let handler;const fakeServer=new EventEmitter();fakeServer.listen=(_port,_host,ready)=>queueMicrotask(ready);
  await createCombinedWorkerProxy(partial.control,plan,{createServer:callback=>{handler=callback;return fakeServer;}});
  const proxyRequest=async({method='GET',url='/status',auth=true,body=Buffer.alloc(0)}={})=>{
    const request={method,url,headers:auth?{'x-video-worker-secret':plan.workerSecret}:{},async *[Symbol.asyncIterator](){if(body.length)yield body;}};
    let result;await handler(request,{writeHead(status,headers){result={status,headers};},end(value){result.body=JSON.parse(value);}});return result;
  };
  equal((await proxyRequest({auth:false})).status,401,'Proxy rejects missing authentication');
  equal((await proxyRequest()).status,200,'Authenticated proxy status exposes observed composite health');
  equal((await proxyRequest({method:'POST',url:'/control',body:Buffer.from('{invalid')})).status,400,'Proxy rejects malformed control JSON');
  equal((await proxyRequest({method:'POST',url:'/control',body:Buffer.alloc(8193,32)})).status,413,'Proxy bounds the original raw control body');
  partial.mediaFailure=true;const failedProxy=await proxyRequest({method:'POST',url:'/control',body:raw});
  equal(failedProxy.status,503,'Parent proxy converts partial control failure into a non-acknowledgement');equal(failedProxy.body,{error:'COMBINED_WORKER_CONTROL_UNKNOWN'},'Failure response contains no internal request or secret');
  process.stdout.write(`COMBINED_WORKER_LIFECYCLE=PASS assertions=${assertions} real_processes=0 network_calls=0 supplier_calls=0 sandbox_acceptance=false\n`);
}
await main();
