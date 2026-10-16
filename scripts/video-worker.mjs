import {WorkerRuntime,fileStateStore,createWorkerControlServer} from './worker-runtime.mjs';
const origin = String(process.env.NAUMI_APP_ORIGIN || "http://app:3000").replace(/\/+$/, "");
const secret = String(process.env.VIDEO_WORKER_SECRET || "");
const intervalMs = Math.max(5_000, Number(process.env.VIDEO_WORKER_INTERVAL_MS || 15_000));

if (secret.trim().length<32) {
  console.error("VIDEO_WORKER_SECRET must contain at least 32 characters");
  process.exit(1);
}

const controlled=process.env.NAUMI_WORKER_RELEASE_CONTROL==='1';
if(controlled&&(!process.env.NAUMI_WORKER_STATE_FILE||!process.env.NAUMI_INSTANCE_ID||!process.env.SOURCE_COMMIT)) {
  console.error('DURABLE_WORKER_CONTROL_CONFIG_REQUIRED');process.exit(1);
}
const worker=new WorkerRuntime({origin,secret,instanceId:process.env.NAUMI_INSTANCE_ID||'legacy',
  commit:process.env.SOURCE_COMMIT||'',startPaused:controlled&&process.env.NAUMI_WORKER_START_PAUSED!=='0',
  store:controlled?fileStateStore(process.env.NAUMI_WORKER_STATE_FILE):null,
  stopOnUncertain:controlled,log:message=>console.log(message)});
await worker.init();
const port=Number(process.env.NAUMI_WORKER_CONTROL_PORT||3001);
if(controlled&&(!Number.isInteger(port)||port<1||port>65535))throw Error('INVALID_WORKER_CONTROL_PORT');
const control=controlled?await createWorkerControlServer(worker,{port}):null;
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  if(stopping)return;stopping=true;
  void worker.shutdown().then(async complete=>{
    if(control)await new Promise(resolve=>control.close(resolve));
    console.log(complete?'WORKER_TICK_DRAIN=COMPLETE':'WORKER_TICK_DRAIN=UNKNOWN');
    process.exitCode=complete?0:2;
  }).catch(()=>{console.error('WORKER_TICK_DRAIN=UNKNOWN');process.exitCode=2;});
});
if(!stopping)await worker.start(intervalMs);
