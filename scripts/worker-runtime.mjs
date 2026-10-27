// Server-only worker lifecycle. A drained tick loop is NOT proof that App jobs,
// supplier operations, Agent sessions or database leases have drained.
import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';

export class WorkerControlError extends Error {
  constructor(code, status=409) { super(code); this.status=status; }
}
const assert=(ok, code, status)=>{if(!ok)throw new WorkerControlError(code,status);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Only bounded error codes/names, never URL, response body, SQL or secrets.
export function tickFailure(error) {
  const valid=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(value)?value:undefined;
  return {code:valid(error?.code)||valid(error instanceof WorkerControlError?error.message:undefined)||valid(error?.name)||'UNCLASSIFIED',
    ...(valid(error?.cause?.code)?{cause:valid(error.cause.code)}:{})};
}

export function workerOrigin(value) {
  const parsed=new URL(value);
  assert(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&
    parsed.pathname==='/'&&!parsed.search&&!parsed.hash,'INVALID_WORKER_ORIGIN',400);
  return parsed.origin;
}

export function fileStateStore(filename) {
  assert(path.isAbsolute(filename),'ABSOLUTE_WORKER_STATE_REQUIRED',400);
  const directory=path.dirname(filename);
  let initialized=false;
  async function prepare() {
    if(initialized)return;
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    const resolved=await fs.realpath(directory);
    assert(resolved===path.resolve(directory),'STATE_DIRECTORY_SYMLINK_FORBIDDEN',400);
    initialized=true;
  }
  return {
    async read() {
      await prepare();
      try {
        const stat=await fs.lstat(filename);
        assert(stat.isFile()&&!stat.isSymbolicLink(),'INVALID_WORKER_STATE_FILE',400);
        assert(stat.size<=4*1024*1024,'WORKER_STATE_TOO_LARGE',400);
        return JSON.parse(await fs.readFile(filename,'utf8'));
      } catch(error) {if(error.code==='ENOENT')return null;throw error;}
    },
    async write(value) {
      await prepare();
      const temporary=path.join(directory,`.worker-${randomUUID()}.tmp`);
      let handle;
      try {
        handle=await fs.open(temporary,'wx',0o600);
        await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();await handle.close();handle=null;
        await fs.rename(temporary,filename);
        if(process.platform!=='win32') {const d=await fs.open(directory,'r');try{await d.sync();}finally{await d.close();}}
      } finally {await handle?.close();await fs.rm(temporary,{force:true});}
    },
  };
}

export class WorkerRuntime {
  constructor({origin,secret,instanceId,commit,store=null,startPaused=false,fetchImpl=fetch,
    targetInstanceId=process.env.NAUMI_WORKER_TARGET_INSTANCE_ID,timeoutMs=300000,stopOnUncertain=true,clock=()=>new Date().toISOString(),log=()=>{},tickTransport=null}) {
    assert(typeof secret==='string'&&secret.trim().length>=32,'WORKER_SECRET_REQUIRED',400);
    assert(Number.isInteger(timeoutMs)&&timeoutMs>0,'INVALID_TICK_TIMEOUT',400);
    this.origin=workerOrigin(origin);this.secret=secret;this.instanceId=instanceId;this.commit=commit;this.targetInstanceId=targetInstanceId;
    this.store=store;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.stopOnUncertain=!!store||stopOnUncertain;
    assert(!tickTransport||tickTransport.mode==='direct'&&store&&typeof tickTransport.dispatch==='function'&&typeof tickTransport.read==='function','INVALID_DIRECT_WORKER_TRANSPORT',400);
    this.transport=tickTransport;
    if(tickTransport)assert(tickTransport.identity?.instanceId===instanceId&&tickTransport.identity?.commit===commit&&
      uuid(tickTransport.identity?.bootId)&&targetInstanceId===instanceId,'DIRECT_WORKER_IDENTITY_MISMATCH',400);
    this.clock=clock;this.log=log;this.bootId=randomUUID();this.activePromise=null;this.timer=null;
    this.fault=null;this.initialized=false;this.stopping=false;this.writeQueue=Promise.resolve();this.controlQueue=Promise.resolve();
    this.state={schemaVersion:1,identity:{origin:this.origin,instanceId,commit,...(store?{targetInstanceId}: {})},revision:0,
      paused:startPaused,uncertain:false,lastTick:null,operations:{}};
    if(tickTransport){this.state.identity.executionMode='direct';this.bootId=tickTransport.identity.bootId;}
  }
  async init() {
    assert(!this.initialized,'WORKER_ALREADY_INITIALIZED');
    if(this.store) {
      assert(typeof this.instanceId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(this.instanceId)&&
        /^[0-9a-f]{40}$/.test(this.commit)&&typeof this.targetInstanceId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(this.targetInstanceId),'FIXED_WORKER_IDENTITY_REQUIRED',400);
      const saved=await this.store.read();
      if(saved) {
        assert(saved.schemaVersion===1&&hash(saved.identity)===hash(this.state.identity),'WORKER_STATE_IDENTITY_MISMATCH');
        assert(Number.isSafeInteger(saved.revision)&&saved.revision>=0&&typeof saved.paused==='boolean'&&
          typeof saved.uncertain==='boolean'&&saved.operations&&typeof saved.operations==='object'&&
          !Array.isArray(saved.operations),'CORRUPT_WORKER_STATE');
        assert(saved.lastTick===null||saved.lastTick&&uuid(saved.lastTick.id)&&
          ['dispatched','complete','rejected','unknown'].includes(saved.lastTick.phase),'CORRUPT_WORKER_TICK');
        this.state=saved;
        if(saved.lastTick?.phase==='dispatched'&&!saved.paused&&saved.lastTick.controlRevision===saved.revision)
          saved.lastTick.autoRecoveryRevision=saved.revision;
        if(['dispatched','unknown'].includes(saved.lastTick?.phase)) {this.state.paused=true;this.state.uncertain=true;this.state.lastTick.phase='unknown';}
        if(saved.uncertain)this.state.paused=true;
      }
      await this.persist();
    }
    this.initialized=true;return this.snapshot();
  }
  async persist() {
    if(!this.store)return;
    const value=structuredClone(this.state);
    const write=this.writeQueue.then(()=>{assert(Buffer.byteLength(JSON.stringify(value))<=4*1024*1024,'WORKER_STATE_TOO_LARGE');return this.store.write(value);});
    this.writeQueue=write.catch(()=>{});
    try {await write;} catch(error) {this.fault='WORKER_STATE_WRITE_FAILED';this.state.paused=true;throw error;}
  }
  snapshot() {
    return {schemaVersion:1,bootId:this.bootId,instanceId:this.instanceId,commit:this.commit,
      origin:this.origin,observedAt:this.clock(),revision:this.state.revision,paused:this.state.paused,
      targetInstanceId:this.targetInstanceId,...(this.transport?{executionMode:'direct',...this.transport.snapshot()}:{}),
      phase:this.fault||this.state.uncertain?'UNKNOWN':this.state.paused?(this.activePromise?'DRAINING':'QUIESCENT'):(this.activePromise?'RUNNING':'IDLE'),
      activeTicks:this.activePromise?1:0,unresolvedTicks:this.state.uncertain?1:0,
      automaticRecoveryEligible:this.state.paused&&this.state.uncertain&&this.state.lastTick?.autoRecoveryRevision===this.state.revision,
      tickDrainComplete:this.initialized&&!!this.store&&this.state.paused&&!this.activePromise&&
        !['dispatched','unknown'].includes(this.state.lastTick?.phase)&&!this.state.uncertain&&!this.fault&&(!this.transport||this.transport.snapshot().backgroundTasks===0),
      durableControl:!!this.store,durableTickReceipts:!!this.store,receiptProtocol:this.store?1:null,lastTick:this.state.lastTick?{...this.state.lastTick}:null,
      activeTickAgeMs:this.activePromise&&this.state.lastTick?Math.max(0,Date.parse(this.clock())-Date.parse(this.state.lastTick.startedAt)):0,
      // Intentionally unknown: no unsafe translation of HTTP tick counts into jobs.
      workerLeases:null,acceptedTasks:null,agentSessions:null,controlFault:this.fault};
  }
  control(input) {
    const result=this.controlQueue.then(()=>this.applyControl(input));
    this.controlQueue=result.catch(()=>{});return result;
  }
  async applyControl(input) {
    assert(this.initialized,'WORKER_NOT_INITIALIZED');
    assert(this.store,'DURABLE_CONTROL_NOT_ENABLED',503);
    assert(input&&['drain','resume','reconcile'].includes(input.action)&&uuid(input.operationId)&&uuid(input.bootId)&&
      Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0,'INVALID_WORKER_CONTROL',400);
    assert(input.action!=='reconcile'||uuid(input.tickId),'INVALID_WORKER_RECONCILE',400);
    const fingerprint=hash({action:input.action,bootId:input.bootId,expectedRevision:input.expectedRevision,...(input.action==='reconcile'?{tickId:input.tickId}:{})});
    assert(!this.fault,'WORKER_CONTROL_FAULT',503);
    const prior=this.state.operations[input.operationId];
    if(prior) {assert(prior.fingerprint===fingerprint,'WORKER_OPERATION_CONFLICT');return {duplicate:true,receipt:prior,state:this.snapshot()};}
    assert(!this.stopping||input.action==='drain','WORKER_STOPPING');
    assert(input.bootId===this.bootId,'WORKER_BOOT_CHANGED');
    assert(input.expectedRevision===this.state.revision,'WORKER_REVISION_CONFLICT');
    assert(input.action!=='resume'||!this.state.uncertain&&!['dispatched','unknown'].includes(this.state.lastTick?.phase),'UNRESOLVED_TICK_BLOCKS_RESUME');
    assert(Object.keys(this.state.operations).length<4096,'WORKER_OPERATION_LOG_FULL');
    if(input.action==='reconcile')return this.reconcile(input,fingerprint);
    this.state.paused=input.action==='drain';this.state.revision++;
    const receipt={fingerprint,action:input.action,revision:this.state.revision,bootId:this.bootId,at:this.clock()};
    this.state.operations[input.operationId]=receipt;
    await this.persist();return {duplicate:false,receipt,state:this.snapshot()};
  }
  tickHeaders(tick) {
    return {'x-video-worker-secret':this.secret,'x-naumi-worker-tick-id':tick.id,
      'x-naumi-worker-instance-id':tick.workerInstanceId,'x-naumi-worker-boot-id':tick.workerBootId,
      'x-naumi-worker-commit':tick.workerCommit,'x-naumi-worker-target-instance-id':tick.targetWebInstanceId};
  }
  async receiptResponse(response,tick) {
    assert(response.ok,'TICK_RECEIPT_HTTP_ERROR');
    let data;
    if(response.body?.getReader) {
      const reader=response.body.getReader(),chunks=[];let length=0;
      try {for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;assert(length<=16384,'TICK_RECEIPT_TOO_LARGE');chunks.push(part.value);}data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      finally {await reader.cancel().catch(()=>{});}
    } else data=await response.json();
    const r=data?.receipt,server=data?.server;
    if(this.transport)assert(server?.role==='worker','DIRECT_TICK_EXECUTOR_ROLE_MISMATCH');
    assert(server?.instanceId===tick.targetWebInstanceId&&server.commit===tick.workerCommit&&uuid(server.bootId),'TICK_SERVER_IDENTITY_MISMATCH');
    assert(r?.schemaVersion===1&&r.tickId===tick.id&&r.worker?.instanceId===tick.workerInstanceId&&
      r.worker.bootId===tick.workerBootId&&r.worker.commit===tick.workerCommit&&r.web?.instanceId===tick.targetWebInstanceId&&
      r.web.commit===tick.workerCommit&&uuid(r.web.bootId),'TICK_RECEIPT_IDENTITY_MISMATCH');
    assert(data.ok===true&&r.phase==='completed'&&r.result?.ok===true&&
      Number.isFinite(Date.parse(r.acceptedAt))&&Number.isFinite(Date.parse(r.completedAt))&&Date.parse(r.completedAt)>=Date.parse(r.acceptedAt),'TICK_NOT_DURABLY_COMPLETED');
    return {receipt:r,server,result:r.result};
  }
  async reconcile(input,fingerprint) {
    assert(!this.activePromise,'WORKER_TICK_STILL_ACTIVE');
    assert(this.state.paused&&this.state.uncertain&&this.state.lastTick?.phase==='unknown'&&this.state.lastTick.id===input.tickId,'WORKER_TICK_NOT_UNRESOLVED');
    const tick=this.state.lastTick;
    assert(uuid(tick.workerBootId)&&tick.workerInstanceId===this.instanceId&&tick.workerCommit===this.commit&&tick.targetWebInstanceId===this.targetInstanceId,'WORKER_TICK_ORIGINAL_IDENTITY_MISSING');
    // Never POST during reconciliation. Missing/running/unknown/unreachable/mismatched evidence leaves state unchanged.
    let verified;
    try {verified=await this.receiptResponse(this.transport?await this.transport.read(tick):await this.fetch(`${this.origin}/api/video/worker/tick?tickId=${tick.id}`,{method:'GET',headers:this.tickHeaders(tick),signal:AbortSignal.timeout(Math.min(this.timeoutMs,10000))}),tick);}
    catch {throw new WorkerControlError('WORKER_TICK_RECONCILE_UNVERIFIED');}
    assert(input.expectedRevision===this.state.revision,'WORKER_REVISION_CONFLICT');
    tick.phase='complete';tick.finishedAt=verified.receipt.completedAt;
    tick.serverReceiptSha256=hash(verified.receipt);tick.reconciledAt=this.clock();
    this.state.uncertain=false;this.state.paused=true;this.state.revision++;
    const receipt={fingerprint,action:'reconcile',tickId:tick.id,revision:this.state.revision,bootId:this.bootId,
      originalWorkerBootId:tick.workerBootId,web:verified.receipt.web,observedServer:verified.server,
      serverReceiptSha256:tick.serverReceiptSha256,serverReceipt:verified.receipt,at:this.clock()};
    this.state.operations[input.operationId]=receipt;
    await this.persist();return {duplicate:false,receipt,state:this.snapshot()};
  }
  tick() {
    assert(this.initialized,'WORKER_NOT_INITIALIZED');
    if(this.state.paused||this.fault||this.activePromise||this.state.uncertain)return Promise.resolve({skipped:true});
    // Install the promise before touching storage or dispatching network work.
    const work=Promise.resolve().then(()=>this.dispatch());this.activePromise=work;
    return work.finally(()=>{if(this.activePromise===work)this.activePromise=null;});
  }
  async dispatch() {
    if(this.state.paused||this.fault)return {skipped:true};
    const tick={id:randomUUID(),phase:'dispatched',startedAt:this.clock(),controlRevision:this.state.revision,...(this.store?{
      workerBootId:this.bootId,workerInstanceId:this.instanceId,workerCommit:this.commit,targetWebInstanceId:this.targetInstanceId}: {})};this.state.lastTick=tick;
    // Persist intent before network dispatch: a crash cannot look like clean drain.
    try {await this.persist();}catch {return {error:'WORKER_STATE_WRITE_FAILED'};}
    let dispatched=false;
    try {
      // A concurrent drain may have won while the intent was being persisted.
      if(this.state.paused) {tick.phase='rejected';tick.reason='PAUSED_BEFORE_DISPATCH';await this.persist();return {skipped:true};}
      dispatched=true;
      const response=this.transport?await this.transport.dispatch(tick):await this.fetch(`${this.origin}/api/video/worker/tick`,{
        method:'POST',headers:this.store?this.tickHeaders(tick):{'x-video-worker-secret':this.secret},signal:AbortSignal.timeout(this.timeoutMs)});
      tick.httpStatus=response.status;
      if(!this.store&&[401,403].includes(response.status)) {
        tick.phase='rejected';tick.httpStatus=response.status;await this.persist();return {rejected:true};
      }
      assert(response.ok,'TICK_HTTP_ERROR');
      const verified=this.store?await this.receiptResponse(response,tick):null;
      const data=verified?verified.result:await response.json();assert(data?.ok===true,'INVALID_TICK_RESPONSE');
      if(verified)tick.serverReceiptSha256=hash(verified.receipt);
      tick.durationMs=Math.max(0,Date.parse(this.clock())-Date.parse(tick.startedAt));
      if(data.phasesMs)tick.phasesMs=data.phasesMs;
      if(data.mediaRecovery)tick.mediaRecovery=data.mediaRecovery;
      tick.phase='complete';tick.finishedAt=this.clock();await this.persist();
      if(data.processed)this.log(`[video-worker] processed=${data.processed} at=${data.at}`);
      return data;
    } catch (error) {
      tick.phase=dispatched?'unknown':'rejected';tick.finishedAt=this.clock();
      tick.failure=tickFailure(error);tick.durationMs=Math.max(0,Date.parse(tick.finishedAt)-Date.parse(tick.startedAt));
      if(dispatched&&this.stopOnUncertain) {
        // A manual drain during the HTTP call wins over automatic recovery.
        if(!this.state.paused&&tick.controlRevision===this.state.revision)tick.autoRecoveryRevision=this.state.revision;
        this.state.uncertain=true;this.state.paused=true;
      }
      try {await this.persist();}catch {/* snapshot retains the control fault */}
      this.log('[video-worker] TICK_OUTCOME_UNKNOWN '+JSON.stringify({tickId:tick.id,httpStatus:tick.httpStatus,durationMs:tick.durationMs,...tick.failure}));return {error:'TICK_OUTCOME_UNKNOWN'};
    }
  }
  start(intervalMs=15000) {
    assert(!this.timer&&!this.stopping&&Number.isInteger(intervalMs)&&intervalMs>=5,'INVALID_WORKER_INTERVAL',400);
    this.timer=setInterval(()=>{void this.tick();},intervalMs);return this.tick();
  }
  async shutdown() {
    this.stopping=true;clearInterval(this.timer);this.timer=null;this.state.paused=true;
    let failed=false;try{await this.persist();}catch{failed=true;}
    await this.activePromise;
    if(this.transport)try{if(!await this.transport.drain())failed=true;}catch{failed=true;}
    try{await this.persist();}catch{failed=true;}
    return !failed&&!this.activePromise&&!this.state.uncertain&&!this.fault&&
      !['dispatched','unknown'].includes(this.state.lastTick?.phase);
  }
}

export async function createWorkerControlServer(runtime,{host='127.0.0.1',port=0}={}) {
  assert(runtime.store,'DURABLE_CONTROL_NOT_ENABLED',503);
  const expected=createHash('sha256').update(runtime.secret).digest();
  const send=(response,status,value)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
  const server=http.createServer(async(request,response)=>{
    const supplied=createHash('sha256').update(String(request.headers['x-video-worker-secret']||'')).digest();
    if(!timingSafeEqual(expected,supplied)) {send(response,401,{error:'UNAUTHORIZED'});return;}
    try {
      if(request.method==='GET'&&request.url==='/status') {send(response,200,runtime.snapshot());return;}
      if(request.method!=='POST'||request.url!=='/control') {send(response,404,{error:'NOT_FOUND'});return;}
      let size=0;const chunks=[];
      for await(const chunk of request) {size+=chunk.length;assert(size<=8192,'CONTROL_BODY_TOO_LARGE',413);chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkerControlError('INVALID_JSON',400);}
      send(response,200,await runtime.control(input));
    } catch(error) {send(response,error instanceof WorkerControlError?error.status:503,{error:error instanceof WorkerControlError?error.message:'WORKER_CONTROL_FAILED'});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return server;
}
