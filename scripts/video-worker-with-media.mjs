import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const assert=(value,code)=>{if(!value)throw new Error(code);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settledWithin(promise,milliseconds){
  let timer;try{return await Promise.race([promise.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
async function closeServer(server){server.closeIdleConnections?.();await settledWithin(new Promise(resolve=>server.close(resolve)),1000);}

/** Only the independently reviewed Worker role may launch root media handling.
 * Child environments are allowlists, never copies of a Web/NAS/DB environment. */
export function combinedWorkerPlan(env=process.env,{platform=process.platform,uid=process.getuid?.(),pid=process.pid}={}){
  assert(platform==='linux'&&uid===0&&pid===1,'COMBINED_WORKER_REQUIRES_CONTAINER_ROOT_PID1');
  assert(env.NAUMI_MEDIA_WORKER==='1'&&env.NAUMI_WORKER_RELEASE_CONTROL==='1','COMBINED_WORKER_REVIEW_REQUIRED');
  assert(String(env.VIDEO_WORKER_SECRET||'').trim().length>=32&&String(env.MEDIA_WORKER_SECRET||'').trim().length>=32,'COMBINED_WORKER_SECRETS_REQUIRED');
  assert(/^[a-f0-9]{40}$/.test(env.SOURCE_COMMIT||''),'FIXED_WORKER_COMMIT_REQUIRED');
  assert(Number(env.NAUMI_WORKER_CONTROL_PORT||3001)===3001&&Number(env.MEDIA_WORKER_PORT||3002)===3002,'COMBINED_WORKER_PORTS_REQUIRED');
  assert(Number(env.MEDIA_WORKER_CONCURRENCY||1)===1,'COMBINED_WORKER_SINGLE_MEDIA_JOB_REQUIRED');
  assert(path.posix.isAbsolute(env.NAUMI_WORKER_STATE_FILE||''),'ABSOLUTE_SCANNER_STATE_REQUIRED');
  assert(path.posix.resolve(env.MEDIA_JOB_DIR||'/scratch')==='/scratch','COMBINED_WORKER_SCRATCH_REQUIRED');
  if(env.VIDEO_WORKER_INTERVAL_MS!==undefined)assert(/^[1-9]\d*$/.test(env.VIDEO_WORKER_INTERVAL_MS)&&Number(env.VIDEO_WORKER_INTERVAL_MS)>=5000&&Number(env.VIDEO_WORKER_INTERVAL_MS)<=2147483647,'INVALID_WORKER_INTERVAL');
  // These two process-start limits were applied only to the supervisor before
  // child allowlisting dropped them. Keep the reviewed bounded profile (2),
  // without copying arbitrary NODE_OPTIONS/preloads or Web/DB credentials.
  const bounded=env.NAUMI_NATIVE_MEMORY_PROFILE==='bounded';
  if(bounded)assert(env.UV_THREADPOOL_SIZE==='2'&&env.MALLOC_ARENA_MAX==='2','COMBINED_WORKER_BOUNDED_RUNTIME_REQUIRED');
  const common={PATH:env.PATH||'/usr/local/bin:/usr/bin:/bin',LANG:env.LANG||'C.UTF-8',NODE_ENV:'production',SOURCE_COMMIT:env.SOURCE_COMMIT,...(env.TZ?{TZ:env.TZ}:{}),
    ...(bounded?{UV_THREADPOOL_SIZE:'2',MALLOC_ARENA_MAX:'2'}:{})};
  const scannerEnv={...common,HOME:'/home/nextjs',TMPDIR:'/tmp',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_CONTROL_PORT:'3003',NAUMI_WORKER_PARENT_START:'1',
    NAUMI_WORKER_STATE_FILE:env.NAUMI_WORKER_STATE_FILE,NAUMI_WORKER_START_PAUSED:env.NAUMI_WORKER_START_PAUSED||'1',
    NAUMI_INSTANCE_ID:env.NAUMI_INSTANCE_ID||'',NAUMI_WORKER_TARGET_INSTANCE_ID:env.NAUMI_WORKER_TARGET_INSTANCE_ID||'',
    NAUMI_WORKER_TICK_PROTOCOL:env.NAUMI_WORKER_TICK_PROTOCOL||'1',NAUMI_APP_ORIGIN:env.NAUMI_APP_ORIGIN||'',VIDEO_WORKER_SECRET:env.VIDEO_WORKER_SECRET,
    ...(env.BUILD_VERSION?{BUILD_VERSION:env.BUILD_VERSION}:{}),...(env.VIDEO_WORKER_INTERVAL_MS?{VIDEO_WORKER_INTERVAL_MS:env.VIDEO_WORKER_INTERVAL_MS}:{})};
  const mediaEnv={...common,HOME:'/',TMPDIR:'/tmp',MEDIA_JOB_DIR:'/scratch',MEDIA_WORKER_SECRET:env.MEDIA_WORKER_SECRET,
    MEDIA_WORKER_HOST:'0.0.0.0',MEDIA_WORKER_PORT:'3002',MEDIA_WORKER_CONCURRENCY:'1',MEDIA_WORKER_START_PAUSED:env.MEDIA_WORKER_START_PAUSED==='0'?'0':'1'};
  return {version:env.SOURCE_COMMIT,workerSecret:env.VIDEO_WORKER_SECRET,mediaSecret:env.MEDIA_WORKER_SECRET,
    scanner:{name:'scanner',uid:1001,gid:1001,args:['--max-old-space-size=64',path.join(scriptDirectory,'video-worker.mjs')],env:scannerEnv},
    media:{name:'media',uid:0,gid:0,args:['--max-old-space-size=96',path.join(scriptDirectory,'video-media-worker.mjs')],env:mediaEnv},
    controlHost:'127.0.0.1',controlPort:3001,scannerPort:3003,mediaPort:3002,graceMs:12000};
}
export function verifiedMediaHealth(value,version){
  assert(value?.ok===true&&value.sandbox===true&&value.version===version&&typeof value.draining==='boolean'&&
    ['running','queued','terminal'].every(key=>integer(value[key]))&&integer(value.maxActive)&&value.maxActive>0&&value.concurrency===1,'MEDIA_WORKER_HEALTH_INVALID');
  return {ok:true,version:value.version,sandbox:true,draining:value.draining,running:value.running,queued:value.queued,terminal:value.terminal,maxActive:value.maxActive,concurrency:1};
}
export function verifiedScannerState(value,plan){
  assert(value&&value.commit===plan.version&&value.instanceId===plan.scanner.env.NAUMI_INSTANCE_ID&&value.durableControl===true&&
    typeof value.paused==='boolean'&&integer(value.revision),'SCANNER_WORKER_HEALTH_INVALID');return value;
}
async function boundedJson(response){
  const reader=response.body?.getReader();assert(reader,'WORKER_CONTROL_RESPONSE_MISSING');
  const chunks=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;assert(size<=128*1024,'WORKER_CONTROL_RESPONSE_TOO_LARGE');chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  finally{await reader.cancel().catch(()=>{});}
}
export function localControlRequest(port,headers,fetchImpl=fetch){
  return async(method,pathname,body)=>{
    const response=await fetchImpl(`http://127.0.0.1:${port}${pathname}`,{method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body}),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});
    return {status:response.status,data:await boundedJson(response)};
  };
}
/** Scanner's durable UUID/revision owns retries of both process controls. The
 * media endpoint is idempotent; ambiguous media responses must not create a new
 * scanner operation or return a successful partial acknowledgment. */
export function createCombinedWorkerControl({scannerRequest,mediaRequest,plan,scannerPermit=async()=>{},scannerPermitState=()=>undefined,isStopping=()=>false}){
  const mediaHealth=async()=>{const reply=await mediaRequest('GET','/health');assert(reply.status===200,'MEDIA_WORKER_HEALTH_HTTP');return verifiedMediaHealth(reply.data,plan.version);};
  const scannerStatus=async()=>{const reply=await scannerRequest('GET','/status');assert(reply.status===200,'SCANNER_STATUS_HTTP');return verifiedScannerState(reply.data,plan);};
  const status=async()=>{const state=await scannerStatus(),held=!state.paused&&scannerPermitState()===false;
    return {...state,...(held?{phase:'UNKNOWN',controlFault:'COMBINED_SCANNER_TICK_HELD',tickDrainComplete:false}:{}),mediaWorker:await mediaHealth()};};
  let queue=Promise.resolve();
  const control=body=>{
    const pending=queue.then(async()=>{
      assert(!isStopping(),'COMBINED_WORKER_STOPPING');
      const input=JSON.parse(body.toString());
      // A durable resume can be accepted while media is still draining. Keep
      // ticks held until both controls have acknowledged, including UUID retries.
      await scannerPermit(false);assert(!isStopping(),'COMBINED_WORKER_STOPPING');
      const reply=await scannerRequest('POST','/control',body);
      if(reply.status!==200)return reply;
      const value=reply.data,state=verifiedScannerState(value?.state,plan),receipt=value?.receipt;
      assert(['resume','drain','reconcile','prove-nonacceptance','reconcile-nonacceptance'].includes(input.action)&&receipt?.action===input.action&&integer(receipt.revision)&&receipt.revision===state.revision,'SCANNER_CONTROL_ACK_REQUIRED');
      const action=input.action==='resume'?'resume':'drain',draining=action==='drain';
      assert(state.paused===draining&&!(action==='resume'&&state.phase==='UNKNOWN'),'SCANNER_CONTROL_ADVANCED');
      assert(!isStopping(),'COMBINED_WORKER_STOPPING');
      const result=await mediaRequest('POST','/'+action,JSON.stringify({operationId:input.operationId,action,scannerAction:input.action}));
      assert(result.status===200&&result.data?.ok===true&&result.data.draining===draining,'MEDIA_WORKER_CONTROL_UNKNOWN');
      const health=await mediaHealth();assert(health.draining===draining,'MEDIA_WORKER_CONTROL_NOT_OBSERVED');
      assert(!isStopping(),'COMBINED_WORKER_STOPPING');
      if(action==='resume')await scannerPermit(true);
      return {status:200,data:{...value,state:{...state,mediaWorker:health}}};
    });queue=pending.catch(()=>{});return pending;
  };
  const alignStartup=async()=>{
    const state=await scannerStatus(),action=state.paused||state.phase==='UNKNOWN'?'drain':'resume';
    assert(!isStopping(),'COMBINED_WORKER_STOPPING');
    const reply=await mediaRequest('POST','/'+action,JSON.stringify({action,source:'durable-scanner-restart'}));
    assert(reply.status===200&&reply.data?.ok===true&&reply.data.draining===(action==='drain'),'MEDIA_WORKER_RESTART_ALIGNMENT_UNKNOWN');
    const health=await mediaHealth();assert(health.draining===(action==='drain'),'MEDIA_WORKER_RESTART_ALIGNMENT_UNKNOWN');
    return {...state,mediaWorker:health};
  };
  return {status,control,mediaHealth,alignStartup};
}
export async function createCombinedWorkerProxy(control,plan,{createServer=http.createServer,isStopping=()=>false}={}){
  const expected=createHash('sha256').update(plan.workerSecret).digest();
  const send=(response,status,value)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
  const server=createServer(async(request,response)=>{
    const supplied=createHash('sha256').update(String(request.headers['x-video-worker-secret']||'')).digest();
    if(!timingSafeEqual(expected,supplied)){send(response,401,{error:'UNAUTHORIZED'});return;}
    try{
      if(isStopping()){send(response,503,{error:'COMBINED_WORKER_STOPPING'});return;}
      if(request.method==='GET'&&request.url==='/status'){send(response,200,await control.status());return;}
      if(request.method!=='POST'||request.url!=='/control'){send(response,404,{error:'NOT_FOUND'});return;}
      let size=0;const chunks=[];
      for await(const chunk of request){size+=chunk.length;if(size>8192){send(response,413,{error:'CONTROL_BODY_TOO_LARGE'});return;}chunks.push(chunk);}
      const body=Buffer.concat(chunks);try{JSON.parse(body.toString());}catch{send(response,400,{error:'INVALID_JSON'});return;}
      const result=await control.control(body);send(response,result.status,result.data);
    }catch{send(response,503,{error:'COMBINED_WORKER_CONTROL_UNKNOWN'});}
  });
  server.requestTimeout=25000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(plan.controlPort,plan.controlHost,resolve);});return server;
}
export class CombinedWorkerSupervisor{
  constructor(plan,{spawnImpl=spawn,killImpl=process.kill.bind(process),fetchImpl=fetch,proxyFactory=createCombinedWorkerProxy,log=message=>console.log(message),sleepImpl=sleep}={}){
    this.plan=plan;this.spawn=spawnImpl;this.kill=killImpl;this.log=log;this.sleep=sleepImpl;this.proxyFactory=proxyFactory;this.children=new Map();this.stopping=false;this.exitCode=0;this.scannerPermit=false;
    this.done=new Promise(resolve=>{this.finish=resolve;});
    const scannerRequest=localControlRequest(plan.scannerPort,{'x-video-worker-secret':plan.workerSecret},fetchImpl),mediaRequest=localControlRequest(plan.mediaPort,{authorization:`Bearer ${plan.mediaSecret}`},fetchImpl);
    this.control=createCombinedWorkerControl({scannerRequest,mediaRequest,plan,scannerPermit:allowed=>this.setScannerPermit(allowed),scannerPermitState:()=>this.scannerPermit,isStopping:()=>this.stopping});
  }
  launch(spec){
    assert(!this.stopping,'COMBINED_WORKER_STOPPING');
    const child=this.spawn(process.execPath,spec.args,{cwd:path.dirname(scriptDirectory),uid:spec.uid,gid:spec.gid,env:spec.env,detached:true,windowsHide:true,stdio:spec.name==='scanner'?['ignore','inherit','inherit','ipc']:['ignore','inherit','inherit']});
    const record={child,closed:false,code:null,pending:new Map()};record.closedPromise=new Promise(resolve=>{record.closedResolve=resolve;});this.children.set(spec.name,record);
    child.on('message',message=>{if(message?.type==='naumi-worker-gate-ack')record.pending.get(message.id)?.(message);});
    const ended=(code,signal)=>{
      if(record.closed)return;record.closed=true;record.code=code;record.closedResolve();
      for(const complete of record.pending.values())complete(null);record.pending.clear();
      if(!this.stopping){this.log(JSON.stringify({event:'combined-worker-child-exit',child:spec.name,code,signal}));void this.shutdown(1);}
      else if(code!==0&&signal!=='SIGTERM')this.exitCode=Math.max(this.exitCode,code||1);
    };
    child.once('error',()=>ended(1,'spawn-error'));child.once('exit',ended);return record;
  }
  setScannerPermit(allowed,{start=false}={}){
    assert(!this.stopping,'COMBINED_WORKER_STOPPING');
    if(!allowed)this.scannerPermit=false;
    const record=this.children.get('scanner');assert(record&&!record.closed&&record.child.connected,'SCANNER_IPC_NOT_READY');
    const id=randomUUID();return new Promise((resolve,reject)=>{
      let complete=false;const finish=message=>{if(complete)return;complete=true;clearTimeout(timer);record.pending.delete(id);
        if(message?.allowed===allowed&&message?.started===start){this.scannerPermit=allowed;resolve();}else reject(new Error('SCANNER_PERMIT_UNKNOWN'));};
      const timer=setTimeout(()=>finish(null),2000);record.pending.set(id,finish);
      try{record.child.send({type:'naumi-worker-gate',id,allowed,start},error=>{if(error)finish(null);});}catch{finish(null);}
    });
  }
  async waitReady(name,read){
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){assert(!this.stopping&&!this.children.get(name)?.closed,'COMBINED_WORKER_CHILD_NOT_RUNNING');try{return await read();}catch{await this.sleep(100);}}
    throw new Error('COMBINED_WORKER_CHILD_NOT_READY');
  }
  async start(){
    try{
      this.launch(this.plan.media);await this.waitReady('media',()=>this.control.mediaHealth());
      this.launch(this.plan.scanner);await this.waitReady('scanner',async()=>{const state=await this.control.status();return verifiedScannerState(state,this.plan);});
      const state=await this.control.alignStartup();assert(!this.stopping,'COMBINED_WORKER_STOPPING');
      await this.setScannerPermit(!state.paused&&state.phase!=='UNKNOWN',{start:true});
      const proxy=await this.proxyFactory(this.control,this.plan,{isStopping:()=>this.stopping});
      if(this.stopping){await closeServer(proxy);throw new Error('COMBINED_WORKER_STOPPING');}this.proxy=proxy;
      this.log(JSON.stringify({event:'combined-worker-ready',version:this.plan.version,mediaPort:this.plan.mediaPort,scannerPort:this.plan.scannerPort,controlPort:this.plan.controlPort}));
    }catch(error){if(this.stopping&&this.exitCode===0){await this.shutdown(0);return this;}await this.shutdown(1);throw error;}
    return this;
  }
  async stopChild(name){
    const record=this.children.get(name);if(!record||record.closed)return;
    try{this.kill(-record.child.pid,'SIGTERM');}catch(error){if(error?.code!=='ESRCH')this.exitCode=1;}
    await settledWithin(record.closedPromise,this.plan.graceMs);
    if(!record.closed){this.exitCode=1;try{this.kill(-record.child.pid,'SIGKILL');}catch{}await settledWithin(record.closedPromise,1000);}
  }
  shutdown(code=0){
    this.exitCode=Math.max(this.exitCode,code);if(this.shutdownPromise)return this.shutdownPromise;
    this.stopping=true;
    this.shutdownPromise=(async()=>{
      await this.stopChild('scanner');await this.stopChild('media');
      if(this.proxy)await closeServer(this.proxy);
      this.log(JSON.stringify({event:'combined-worker-stopped',code:this.exitCode}));this.finish(this.exitCode);return this.exitCode;
    })();return this.shutdownPromise;
  }
}
async function main(){
  const supervisor=new CombinedWorkerSupervisor(combinedWorkerPlan());
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void supervisor.shutdown(0);});
  await supervisor.start();process.exit(await supervisor.done);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('COMBINED_WORKER_START_FAILED');process.exit(1);});
