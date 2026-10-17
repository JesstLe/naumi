#!/usr/bin/env node
/** One explicit full GC; no map enumeration/snapshot/business calls. */
import fs from 'node:fs';

const args=process.argv.slice(2),flag=name=>args.includes(name),value=(name,other)=>{const i=args.indexOf(name);return i<0?other:args[i+1];};
const pid=Number(value('--pid','0')),maxContexts=Number(value('--max-contexts','16')),maxMaps=Number(value('--max-maps','20000')),maxEntries=Number(value('--max-entries','200000'));
const port=9229,base=`http://127.0.0.1:${port}`,started=Date.now();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ensure=(ok,code)=>{if(!ok)throw new Error(code);};
const safeError=error=>/^[A-Z0-9_: -]+$/.test(String(error?.message))?error.message:'AUDIT_PROTOCOL_OR_IO_ERROR';
let socket,opened=false,complete=false,ownsInspector=false,closedConfirmed=false,workerTargets=0;
const contexts=new Map(),pending=new Map(),groups=[];let sequence=0;
function targetListeners(){
 const inodes=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[];}catch{return [];}}));
 return [...new Set(['tcp','tcp6'].flatMap(kind=>fs.readFileSync(`/proc/${pid}/net/${kind}`,'utf8').trim().split('\n').slice(1).flatMap(line=>{const c=line.trim().split(/\s+/);return c[3]==='0A'&&inodes.has(c[9])?[parseInt(c[1].split(':')[1],16)]:[]})))].sort((a,b)=>a-b);
}
const methodCounts={};
async function endpoint(){try{const r=await fetch(base+'/json/list',{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null;}catch{return null;}}
async function send(method,params={}){
 ensure(socket?.readyState===WebSocket.OPEN,'INSPECTOR_CONNECTION_NOT_OPEN');methodCounts[method]=(methodCounts[method]||0)+1;
 const id=++sequence;
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_CLIENT_DEADLINE_CANNOT_INTERRUPT_TARGET_GC'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
}
async function connect(url){
 socket=new WebSocket(url);
 socket.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data);}catch{return;}
  if(message.method==='Runtime.executionContextCreated')contexts.set(message.params.context.id,message.params.context);
  if(message.method==='Runtime.executionContextDestroyed')contexts.delete(message.params.executionContextId);
  if(message.method==='NodeWorker.attachedToWorker')workerTargets++;
  if(message.id){const job=pending.get(message.id);if(job){clearTimeout(job.timer);pending.delete(message.id);message.error?job.reject(new Error('CDP_METHOD_REJECTED')):job.resolve(message.result);}}
 });
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('INSPECTOR_CONNECT_FAILED')),{once:true});});
}


const report={schemaVersion:1,kind:'one-shot-node-inspector-gc',targetPid:pid,status:'HOLD',ordinaryDrainReceipt:null,gcCalls:0,inspectorOpenedByTool:false,inspectorClosedConfirmed:false,reachableStateGuarantee:'V8 GC preserves reachable objects; no application drain claim',warning:'Full GC pauses the target; client timeout cannot interrupt target GC; RSS reduction is not guaranteed',protocolMethods:methodCounts};
function memory(){
 const status=fs.readFileSync(`/proc/${pid}/status`,'utf8'),mi=fs.readFileSync('/proc/meminfo','utf8');
 const out={targetRssBytes:Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]||0)*1024,hostMemAvailableBytes:Number(mi.match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024};
 for(const name of ['memory.current','memory.peak','memory.events']){try{const raw=fs.readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();out[name]=name==='memory.events'?Object.fromEntries(raw.split('\n').map(s=>s.split(' ').map((v,i)=>i?Number(v):v))):Number(raw);}catch{}}
 return out;
}
try{
 ensure(process.platform==='linux'&&process.env.NODE_OPTIONS===''&&Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'LINUX_CONTAINER_LOCAL_PID_AND_EMPTY_NODE_OPTIONS_REQUIRED');
 ensure(process.execArgv.includes('--max-old-space-size=64'),'CLIENT_HEAP_64_MIB_REQUIRED');
 ensure(flag('--allow-sigusr1')&&flag('--accept-full-gc'),'EXPLICIT_SIGUSR1_AND_FULL_GC_OPT_IN_REQUIRED');
 const cmd=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean),env=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0');
 ensure(/(?:^|\/)node$/.test(fs.readlinkSync(`/proc/${pid}/exe`)),'TARGET_EXECUTABLE_NOT_NODE');
 ensure(!cmd.some(x=>/^--(?:inspect|debug)/.test(x))&&!env.some(x=>x.startsWith('NODE_OPTIONS=')&&/--(?:inspect|debug)/.test(x)),'TARGET_PREEXISTING_DEBUG_OPTIONS_REJECTED');
 const allowed=String(value('--allowed-target-listen-ports','3000')).split(',').map(Number);ensure(allowed.every(n=>Number.isInteger(n)&&n>0&&n<65536&&n!==port),'EXPLICIT_BUSINESS_LISTENER_ALLOWLIST_REQUIRED');
 report.listenersBefore=targetListeners();ensure(report.listenersBefore.every(n=>allowed.includes(n)),'UNEXPECTED_TARGET_LISTENER_POSSIBLE_EXISTING_INSPECTOR');
 report.memoryBefore=memory();const minimum=Number(value('--min-mem-available-mib','1024'));ensure(minimum>=1024&&report.memoryBefore.hostMemAvailableBytes>=minimum*1048576,'HOST_MEMORY_HEADROOM_BELOW_EXPLICIT_GC_GATE');
 ensure(await endpoint()===null,'EXISTING_INSPECTOR_OR_DEBUGGER_NOT_TOUCHED');
 process.kill(pid,'SIGUSR1');opened=true;
 let targets;for(let n=0;n<50;n++){targets=await endpoint();if(Array.isArray(targets)&&targets.length)break;await sleep(50);}
 ensure(targets?.length===1,'INSPECTOR_NOT_READY_OR_MULTIPLE_TARGETS');
 ensure(new URL(targets[0].webSocketDebuggerUrl).hostname==='127.0.0.1','INSPECTOR_NOT_CONTAINER_LOOPBACK');
 await connect(targets[0].webSocketDebuggerUrl);
 const who=await send('Runtime.evaluate',{expression:'({pid:process.pid,node:process.version})',returnByValue:true,silent:true});
 ensure(who.result?.value?.pid===pid,'INSPECTOR_TARGET_PID_MISMATCH');ownsInspector=true;report.inspectorOpenedByTool=true;report.nodeVersion=who.result.value.node;
 report.heapBefore=await send('Runtime.getHeapUsage');
 const limit=Number(value('--max-target-heap-mib','4096'));ensure(limit>0&&limit<=8192&&report.heapBefore.usedSize<=limit*1048576,'TARGET_HEAP_OVER_EXPLICIT_GC_GATE');
 report.gcCalls++;await send('HeapProfiler.collectGarbage');
 report.heapAfter=await send('Runtime.getHeapUsage');report.memoryAfterGc=memory();complete=true;
}catch(error){report.holdReason=safeError(error);}
finally{
 if(ownsInspector&&socket?.readyState===WebSocket.OPEN){try{await send('Runtime.evaluate',{expression:'setImmediate(()=>process.getBuiltinModule("node:inspector").close()); true',returnByValue:true,silent:true});}catch{report.holdReason??='INSPECTOR_CLOSE_REQUEST_NOT_ACKNOWLEDGED';}}
 try{socket?.close();}catch{}
 if(ownsInspector){for(let n=0;n<50;n++){if(await endpoint()===null){closedConfirmed=true;break;}await sleep(50);}try{closedConfirmed=closedConfirmed&&JSON.stringify(targetListeners())===JSON.stringify(report.listenersBefore);}catch{closedConfirmed=false;}}
 report.inspectorClosedConfirmed=closedConfirmed;
 if(opened&&!closedConfirmed)report.holdReason??='OWNED_INSPECTOR_CLOSURE_NOT_CONFIRMED';
 try{report.memoryAfterCleanup=memory();}catch{}
 report.status=complete&&closedConfirmed&&!report.holdReason?'GC_COMPLETED_NOT_DRAIN':'HOLD';report.elapsedMs=Date.now()-started;
 console.log(JSON.stringify(report));if(report.status==='HOLD')process.exitCode=2;
}
