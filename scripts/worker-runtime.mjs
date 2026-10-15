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
    timeoutMs=300000,stopOnUncertain=true,clock=()=>new Date().toISOString(),log=()=>{}}) {
    assert(typeof secret==='string'&&secret.trim().length>=32,'WORKER_SECRET_REQUIRED',400);
    assert(Number.isInteger(timeoutMs)&&timeoutMs>0,'INVALID_TICK_TIMEOUT',400);
    this.origin=workerOrigin(origin);this.secret=secret;this.instanceId=instanceId;this.commit=commit;
    this.store=store;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.stopOnUncertain=stopOnUncertain;
    this.clock=clock;this.log=log;this.bootId=randomUUID();this.activePromise=null;this.timer=null;
    this.fault=null;this.initialized=false;this.stopping=false;this.writeQueue=Promise.resolve();this.controlQueue=Promise.resolve();
    this.state={schemaVersion:1,identity:{origin:this.origin,instanceId,commit},revision:0,
      paused:startPaused,uncertain:false,lastTick:null,operations:{}};
  }
  async init() {
    assert(!this.initialized,'WORKER_ALREADY_INITIALIZED');
    if(this.store) {
      assert(typeof this.instanceId==='string'&&this.instanceId.length>0&&
        /^[0-9a-f]{40}$/.test(this.commit),'FIXED_WORKER_IDENTITY_REQUIRED',400);
      const saved=await this.store.read();
      if(saved) {
        assert(saved.schemaVersion===1&&hash(saved.identity)===hash(this.state.identity),'WORKER_STATE_IDENTITY_MISMATCH');
        assert(Number.isSafeInteger(saved.revision)&&saved.revision>=0&&typeof saved.paused==='boolean'&&
          typeof saved.uncertain==='boolean'&&saved.operations&&typeof saved.operations==='object'&&
          !Array.isArray(saved.operations),'CORRUPT_WORKER_STATE');
        assert(saved.lastTick===null||saved.lastTick&&uuid(saved.lastTick.id)&&
          ['dispatched','complete','rejected','unknown'].includes(saved.lastTick.phase),'CORRUPT_WORKER_TICK');
        this.state=saved;
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
    const write=this.writeQueue.then(()=>this.store.write(value));
    this.writeQueue=write.catch(()=>{});
    try {await write;} catch(error) {this.fault='WORKER_STATE_WRITE_FAILED';this.state.paused=true;throw error;}
  }
  snapshot() {
    return {schemaVersion:1,bootId:this.bootId,instanceId:this.instanceId,commit:this.commit,
      origin:this.origin,observedAt:this.clock(),revision:this.state.revision,paused:this.state.paused,
      phase:this.fault||this.state.uncertain?'UNKNOWN':this.state.paused?(this.activePromise?'DRAINING':'QUIESCENT'):(this.activePromise?'RUNNING':'IDLE'),
      activeTicks:this.activePromise?1:0,unresolvedTicks:this.state.uncertain?1:0,
      tickDrainComplete:this.initialized&&!!this.store&&this.state.paused&&!this.activePromise&&
        !['dispatched','unknown'].includes(this.state.lastTick?.phase)&&!this.state.uncertain&&!this.fault,
      durableControl:!!this.store,lastTick:this.state.lastTick?{...this.state.lastTick}:null,
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
    assert(input&&['drain','resume'].includes(input.action)&&uuid(input.operationId)&&uuid(input.bootId)&&
      Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0,'INVALID_WORKER_CONTROL',400);
    const fingerprint=hash({action:input.action,bootId:input.bootId,expectedRevision:input.expectedRevision});
    assert(!this.fault,'WORKER_CONTROL_FAULT',503);
    const prior=this.state.operations[input.operationId];
    if(prior) {assert(prior.fingerprint===fingerprint,'WORKER_OPERATION_CONFLICT');return {duplicate:true,receipt:prior,state:this.snapshot()};}
    assert(!this.stopping||input.action==='drain','WORKER_STOPPING');
    assert(input.bootId===this.bootId,'WORKER_BOOT_CHANGED');
    assert(input.expectedRevision===this.state.revision,'WORKER_REVISION_CONFLICT');
    assert(input.action!=='resume'||!this.state.uncertain,'UNRESOLVED_TICK_BLOCKS_RESUME');
    assert(Object.keys(this.state.operations).length<4096,'WORKER_OPERATION_LOG_FULL');
    this.state.paused=input.action==='drain';this.state.revision++;
    const receipt={fingerprint,action:input.action,revision:this.state.revision,bootId:this.bootId,at:this.clock()};
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
    const tick={id:randomUUID(),phase:'dispatched',startedAt:this.clock()};this.state.lastTick=tick;
    // Persist intent before network dispatch: a crash cannot look like clean drain.
    try {await this.persist();}catch {return {error:'WORKER_STATE_WRITE_FAILED'};}
    let dispatched=false;
    try {
      // A concurrent drain may have won while the intent was being persisted.
      if(this.state.paused) {tick.phase='rejected';tick.reason='PAUSED_BEFORE_DISPATCH';await this.persist();return {skipped:true};}
      dispatched=true;
      const response=await this.fetch(`${this.origin}/api/video/worker/tick`,{
        method:'POST',headers:{'x-video-worker-secret':this.secret},signal:AbortSignal.timeout(this.timeoutMs)});
      if([401,403].includes(response.status)) {
        tick.phase='rejected';tick.httpStatus=response.status;await this.persist();return {rejected:true};
      }
      assert(response.ok,'TICK_HTTP_ERROR');
      const data=await response.json();assert(data?.ok===true,'INVALID_TICK_RESPONSE');
      tick.phase='complete';tick.finishedAt=this.clock();await this.persist();
      if(data.processed)this.log(`[video-worker] processed=${data.processed} at=${data.at}`);
      return data;
    } catch {
      tick.phase=dispatched?'unknown':'rejected';tick.finishedAt=this.clock();
      if(dispatched&&this.stopOnUncertain) {this.state.uncertain=true;this.state.paused=true;}
      try {await this.persist();}catch {/* snapshot retains the control fault */}
      this.log('[video-worker] TICK_OUTCOME_UNKNOWN');return {error:'TICK_OUTCOME_UNKNOWN'};
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
