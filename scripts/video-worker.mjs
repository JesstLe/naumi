import {WorkerRuntime,fileStateStore,createWorkerControlServer} from './worker-runtime.mjs';
const origin = String(process.env.NAUMI_APP_ORIGIN || "http://app:3000").replace(/\/+$/, "");
const secret = String(process.env.VIDEO_WORKER_SECRET || "");
const intervalMs = Math.max(5_000, Number(process.env.VIDEO_WORKER_INTERVAL_MS || 15_000));

if (secret.trim().length<32) {
  console.error("VIDEO_WORKER_SECRET must contain at least 32 characters");
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs > 2_147_483_647) { console.error("Invalid worker interval configuration"); process.exit(1); }
const controlled=process.env.NAUMI_WORKER_RELEASE_CONTROL==='1';
const execution=process.env.NAUMI_WORKER_EXECUTION||'http';
if(!['http','direct'].includes(execution))throw Error('INVALID_WORKER_EXECUTION_MODE');
const direct=execution==='direct';
if(direct&&!controlled)throw Error('DIRECT_WORKER_REQUIRES_DURABLE_CONTROL');
if (!controlled && (process.env.VIDEO_WORKER_CONTROL_PORT || process.env.VIDEO_WORKER_START_PAUSED === '1')) {
  await import('./video-worker-legacy.mjs');
} else {
if(controlled&&(!process.env.NAUMI_WORKER_STATE_FILE||!process.env.NAUMI_INSTANCE_ID||!process.env.SOURCE_COMMIT)) {
  console.error('DURABLE_WORKER_CONTROL_CONFIG_REQUIRED');process.exit(1);
}
const application=direct?await(await import('../dist/worker/application.cjs')).createDirectWorkerApplication():null;
const worker=new WorkerRuntime({origin,secret,instanceId:process.env.NAUMI_INSTANCE_ID||'legacy',
  commit:process.env.SOURCE_COMMIT||'',startPaused:controlled&&process.env.NAUMI_WORKER_START_PAUSED!=='0',
  store:controlled?fileStateStore(process.env.NAUMI_WORKER_STATE_FILE):null,
  stopOnUncertain:controlled,log:message=>console.log(message),
  ...(application?{tickTransport:application,targetInstanceId:application.identity.instanceId}:{})});
await worker.init().catch(async error=>{await application?.close().catch(()=>{});throw error;});
// Only the same-container supervisor enables this gate. A restored unpaused
// scanner must wait for media readiness before its first tick, and every resume
// stays held until both durable scanner and media acknowledgments are observed.
const parentControlled=process.env.NAUMI_WORKER_PARENT_START==='1';
if(parentControlled&&(!controlled||typeof process.send!=='function'))throw Error('WORKER_PARENT_IPC_REQUIRED');
let parentAllowed=!parentControlled,releaseStart;
const startPermit=parentControlled?new Promise(resolve=>{releaseStart=resolve;}):Promise.resolve();
if(parentControlled){const tick=worker.tick.bind(worker);worker.tick=()=>parentAllowed?tick():Promise.resolve({skipped:true});}
const port=Number(process.env.NAUMI_WORKER_CONTROL_PORT||3001);
if(controlled&&(!Number.isInteger(port)||port<1||port>65535))throw Error('INVALID_WORKER_CONTROL_PORT');
const control=controlled?await createWorkerControlServer(worker,{port}):null;
let stopping=false;
const stop=()=>{
  if(stopping)return;stopping=true;
  parentAllowed=false;releaseStart?.();
  void worker.shutdown().then(async complete=>{
    if(control)await new Promise(resolve=>control.close(resolve));
    await application?.close();
    if(parentControlled&&process.connected)process.disconnect();
    console.log(complete?'WORKER_TICK_DRAIN=COMPLETE':'WORKER_TICK_DRAIN=UNKNOWN');
    process.exitCode=complete?0:2;
  }).catch(()=>{console.error('WORKER_TICK_DRAIN=UNKNOWN');process.exitCode=2;});
};
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
if(parentControlled){
  process.on('message',message=>{
    if(stopping||message?.type!=='naumi-worker-gate'||typeof message.id!=='string'||typeof message.allowed!=='boolean'||typeof message.start!=='boolean')return;
    parentAllowed=message.allowed;if(message.start)releaseStart();
    process.send({type:'naumi-worker-gate-ack',id:message.id,allowed:parentAllowed,started:message.start},error=>{if(error)stop();});
  });
  process.once('disconnect',stop);
  const deadline=setTimeout(stop,60000);deadline.unref();await startPermit;clearTimeout(deadline);
}
if(!stopping)await worker.start(intervalMs);

}
