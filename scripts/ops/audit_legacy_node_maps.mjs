#!/usr/bin/env node
/** Explicit container-local inspector audit. No app handlers, heap snapshot,
 * breakpoint, Debugger.pause, forced termination, model calls or raw identities.
 * IMPORTANT: V8 queryObjects performs full GC and whole-heap scanning. Client
 * limits DO NOT bound that intrinsic pause/allocation. Requires explicit opt-in.
 */
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

// Executed once per prototype's query result, inside the target VM. Only own
// data descriptors; no getters/agent methods/Promise.then/application callbacks.
const hashSource=function(s){
 const bytes=Array.from(unescape(encodeURIComponent(s)),c=>c.charCodeAt(0)),length=bytes.length*8;
 bytes.push(128);while(bytes.length%64!==56)bytes.push(0);for(let n=7;n>=0;n--)bytes.push(n>=4?0:(length>>>(n*8))&255);
 const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const R=(x,n)=>(x>>>n)|(x<<(32-n));
 for(let offset=0;offset<bytes.length;offset+=64){const w=[];for(let i=0;i<16;i++)w[i]=(bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3];for(let i=16;i<64;i++)w[i]=((R(w[i-2],17)^R(w[i-2],19)^(w[i-2]>>>10))+w[i-7]+(R(w[i-15],7)^R(w[i-15],18)^(w[i-15]>>>3))+w[i-16])|0;let[a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(R(e,6)^R(e,11)^R(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0,t2=((R(a,2)^R(a,13)^R(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}[a,b,c,d,e,f,g,h].forEach((x,i)=>H[i]=(H[i]+x)|0);}
 return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
}.toString();
const summarize=function(maxMaps,maxEntries,hashKey){
 const keyShape=key=>typeof key==='string'&&key.indexOf('::')>0&&key.lastIndexOf('::')<key.length-2;
 const iter=Map.prototype.entries,sizeGetter=Object.getOwnPropertyDescriptor(Map.prototype,'size').get;
 const result={maps:this.length,emptyMaps:0,scannedEntries:0,candidates:[],nonMapPrototypeMatches:0,mapAccessErrors:0,truncated:false};
 if(this.length>maxMaps){result.truncated=true;return result;}
 for(let index=0;index<this.length;index++){
  const map=this[index];let size;
  // A subclass prototype itself inherits Map.prototype but has no [[MapData]].
  // Intrinsic size rejects it without executing any user property/trap.
  try{size=sizeGetter.call(map);}catch{result.nonMapPrototypeMatches++;continue;}
  if(size===0){result.emptyMaps++;continue;}
  if(result.scannedEntries+size>maxEntries){result.truncated=true;break;}
  try{for(const [key,value] of iter.call(map)){
   result.scannedEntries++;
   if(!keyShape(key)||value===null||!['object','function'].includes(typeof value))continue;
   if(key.length>4096){result.truncated=true;break;}
   // Do not touch value properties until the inspector confirms it is not a
   // Proxy. Only bounded matching keys get remote object handles, not all Maps.
   result.candidates.push({keyHash:hashKey(key),value});
  }}catch{result.mapAccessErrors++;}
  if(result.candidates.length>2000){result.truncated=true;break;}
 }
 return result;
}.toString();
const classify=function(expectedHash,hashKey){
 for(const key of ['id','sessionId','email','agent','running','canvasExecuting','persistPending','toolResultsPending']){const d=Object.getOwnPropertyDescriptor(this,key);if(d&&!('value'in d))return {unknown:true};}
 const own=key=>{const d=Object.getOwnPropertyDescriptor(this,key);return d&&'value'in d?{value:d.value}:null;};
 const id=own('id')||own('sessionId'),email=own('email'),agent=own('agent'),running=own('running'),canvas=own('canvasExecuting');
 if(!id&&!email&&!agent&&!running)return {unknown:true};
 if(!id||!email||!agent||!running||typeof id.value!=='string'||typeof email.value!=='string'||typeof running.value!=='boolean'||canvas&&typeof canvas.value!=='boolean')return {unknown:true};
 if(hashKey(email.value.trim().toLowerCase()+'::'+id.value)!==expectedHash)return {unknown:true};
 return {session:true,keyHash:expectedHash,running:running.value,canvasExecuting:canvas?.value===true,tmp:id.value.startsWith('tmp-'),persistValue:own('persistPending')?.value,toolValue:own('toolResultsPending')?.value};
}.toString();

const publicSummary={schemaVersion:1,kind:'legacy-node-inspector-map-observation',coverage:'partial-heap-map-shape-observation',contextMapEnumerationComplete:false,sourceConfirmedNativeMapConstructionRequired:true,countsSemantics:'per-context-sum-upper-bound',uniqueCountsGuaranteed:false,ordinaryDrainReceipt:null,targetPid:pid,inspectorWasOpen:false,inspectorOpenedByAudit:false,inspectorClosedConfirmed:false,fullGcRequiredByQueryObjects:true,heapSnapshotTaken:false,debuggerPausedByAudit:false,applicationMethodsCalled:false,limits:{maxContexts,maxMaps,maxEntries},contexts:[],counts:{sessions:0,running:0,canvasExecuting:0,tmp:0,creatingPromises:0,pendingCreating:0,settledCreating:0,promiseStateUnknown:0,persistReferences:0,toolResultReferences:0,pendingPersist:0,pendingToolResults:0,unknownSessionLike:0},identityHashes:[],sessionObservations:[],creatingObservations:[],warnings:['QueryObjects forces full GC and whole-heap iteration; target pause/allocation cannot be bounded by client deadline','One observation is not a complete drain; role/admission/socket/PG/task preservation checks remain required']};
publicSummary.observedAt=new Date().toISOString();publicSummary.monotonicNs=process.hrtime.bigint().toString();

try{
 ensure(process.platform==='linux'&&process.env.NODE_OPTIONS===''&&Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'LINUX_CONTAINER_LOCAL_PID_AND_EMPTY_NODE_OPTIONS_REQUIRED');
 ensure(flag('--allow-sigusr1')&&flag('--accept-full-gc'),'EXPLICIT_SIGUSR1_AND_FULL_GC_OPT_IN_REQUIRED');
 ensure(maxContexts>=1&&maxContexts<=32&&maxMaps>=1&&maxMaps<=50000&&maxEntries>=1&&maxEntries<=500000,'BOUNDED_LIMITS_REQUIRED');
 const cmd=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean),env=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0');
 const executable=fs.readlinkSync(`/proc/${pid}/exe`);ensure(/(?:^|\/)node$/.test(executable),'TARGET_EXECUTABLE_NOT_NODE');
 ensure(!cmd.some(x=>/^--(?:inspect|debug)/.test(x))&&!env.some(x=>x.startsWith('NODE_OPTIONS=')&&/--(?:inspect|debug)/.test(x)),'TARGET_PREEXISTING_DEBUG_OPTIONS_REJECTED');
 const allowedPorts=String(value('--allowed-target-listen-ports','3000')).split(',').map(Number);ensure(allowedPorts.every(n=>Number.isInteger(n)&&n>0&&n<65536&&n!==port),'EXPLICIT_BUSINESS_LISTENER_ALLOWLIST_REQUIRED');
 publicSummary.targetListeningPortsBefore=targetListeners();ensure(publicSummary.targetListeningPortsBefore.every(n=>allowedPorts.includes(n)),'UNEXPECTED_TARGET_LISTENER_POSSIBLE_EXISTING_INSPECTOR');
 const previous=await endpoint();ensure(previous===null,'EXISTING_INSPECTOR_OR_DEBUGGER_NOT_TOUCHED');
 process.kill(pid,'SIGUSR1');opened=true;
 let targets;
 for(let n=0;n<50;n++){targets=await endpoint();if(Array.isArray(targets)&&targets.length)break;await sleep(50);}
 ensure(targets?.length===1,'INSPECTOR_NOT_READY_OR_MULTIPLE_TARGETS');
 const target=targets[0];ensure(new URL(target.webSocketDebuggerUrl).hostname==='127.0.0.1','INSPECTOR_NOT_CONTAINER_LOOPBACK');
 await connect(target.webSocketDebuggerUrl);
 const who=await send('Runtime.evaluate',{expression:'({pid:process.pid,node:process.version})',returnByValue:true,silent:true});
 ensure(who.result?.value?.pid===pid,'INSPECTOR_TARGET_PID_MISMATCH');ownsInspector=true;
 publicSummary.nodeVersion=who.result.value.node;publicSummary.inspectorOpenedByAudit=true;
 await send('Runtime.enable');
 try{await send('NodeWorker.enable',{waitForDebuggerOnStart:false});publicSummary.workerDiscoveryAvailable=true;}catch{throw new Error('NODE_WORKER_DISCOVERY_UNAVAILABLE');}
 await sleep(100);
 const heapBefore=await send('Runtime.getHeapUsage');
 publicSummary.heapBeforeBytes=heapBefore.usedSize;publicSummary.targetHeapThresholdBytes=Number(value('--max-target-heap-mib','512'))*1048576;
 ensure(Number.isFinite(publicSummary.targetHeapThresholdBytes)&&publicSummary.targetHeapThresholdBytes>0&&publicSummary.targetHeapThresholdBytes<=512*1048576&&heapBefore.usedSize<=publicSummary.targetHeapThresholdBytes,'TARGET_HEAP_TOO_LARGE_FOR_FULL_GC_AUDIT');
 const meminfo=fs.readFileSync('/proc/meminfo','utf8'),available=Number(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024;
 publicSummary.hostMemAvailableBytes=available;
 ensure(available>=Number(value('--min-mem-available-mib','1024'))*1048576,'HOST_MEMORY_HEADROOM_BELOW_EXPLICIT_AUDIT_GATE');
 publicSummary.observedExecutionContexts=contexts.size;
 const requestedContexts=value('--context-ids','');
 const selected=requestedContexts?requestedContexts.split(',').map(Number):null;
 ensure(!selected||(selected.length<=maxContexts&&new Set(selected).size===selected.length&&selected.every(id=>Number.isSafeInteger(id)&&id>0&&contexts.has(id))),'EXPLICIT_SELECTED_CONTEXTS_INVALID');
 ensure(contexts.size>0&&contexts.size<=(selected?1024:maxContexts),'EXECUTION_CONTEXT_LIMIT_OR_MISSING');
 const allContextIds=[...contexts.keys()].sort((a,b)=>a-b);
 const initialContextIds=selected?[...selected].sort((a,b)=>a-b):allContextIds,seenPrototypes=[];
 publicSummary.contextSelection=selected?'explicit-subset-not-complete':'all-enumerated';
 publicSummary.selectedContextIds=initialContextIds;
 for(const contextId of initialContextIds){
  const group='legacy-map-audit-'+process.pid+'-'+contextId;
  groups.push(group);
  try{
   const prototype=await send('Runtime.evaluate',{expression:'Map.prototype',contextId,objectGroup:group,silent:true,throwOnSideEffect:true,timeout:1000});
   ensure(prototype.result?.objectId&&!prototype.exceptionDetails,'MAP_PROTOTYPE_UNAVAILABLE');
   let duplicate=false;
   for(const other of seenPrototypes){try{const equal=await send('Runtime.callFunctionOn',{objectId:prototype.result.objectId,functionDeclaration:'function(other){return this===other}',arguments:[{objectId:other}],returnByValue:true,silent:true});if(equal.result?.value){duplicate=true;break;}}catch{publicSummary.crossRealmEqualityComparisonsUnsupported=true;}}
   if(duplicate){publicSummary.contexts.push({contextId,duplicatePrototype:true});continue;}
   // Preserve prototype handles until all contexts are compared; one GC per
   // genuinely distinct realm Map prototype, never explicit gc()/snapshot.
   seenPrototypes.push(prototype.result.objectId);
   const queried=await send('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup:group});
   ensure(queried.objects?.objectId,'MAP_QUERY_FAILED');
   const collected=await send('Runtime.callFunctionOn',{objectId:queried.objects.objectId,functionDeclaration:'function(a,b){return ('+summarize+').call(this,a,b,('+hashSource+'))}',arguments:[{value:maxMaps},{value:maxEntries}],returnByValue:false,objectGroup:group,silent:true});
   ensure(collected.result?.objectId&&!collected.exceptionDetails,'MAP_SUMMARY_FAILED');
   const fields=await send('Runtime.getProperties',{objectId:collected.result.objectId,ownProperties:true,generatePreview:false});
   const plain=await send('Runtime.callFunctionOn',{objectId:collected.result.objectId,functionDeclaration:'function(){return {maps:this.maps,emptyMaps:this.emptyMaps,scannedEntries:this.scannedEntries,nonMapPrototypeMatches:this.nonMapPrototypeMatches,truncated:this.truncated,mapAccessErrors:this.mapAccessErrors}}',returnByValue:true,silent:true});
   const data=plain.result?.value;if(data&&(data.truncated||data.mapAccessErrors))publicSummary.scanFailure={contextId,...data};ensure(data&&!data.truncated&&!data.mapAccessErrors,'MAP_SCAN_LIMIT_OR_ACCESS_ERROR');
   const candidatesId=fields.result.find(x=>x.name==='candidates')?.value?.objectId;
   ensure(candidatesId,'MAP_CANDIDATES_UNAVAILABLE');
   const entries=await send('Runtime.getProperties',{objectId:candidatesId,ownProperties:true,generatePreview:false});
   const counts=publicSummary.counts;let sessions=0,creating=0;
   for(const entry of entries.result.filter(x=>/^\d+$/.test(x.name))){
    const item=await send('Runtime.getProperties',{objectId:entry.value.objectId,ownProperties:true,generatePreview:false});
    const keyHash=item.result.find(x=>x.name==='keyHash')?.value?.value,remote=item.result.find(x=>x.name==='value')?.value;
    ensure(/^[a-f0-9]{64}$/.test(keyHash),'KEY_HASH_INVALID');
    if(!remote?.objectId||remote.subtype==='proxy'){counts.unknownSessionLike++;continue;}
    if(remote.subtype==='promise'){
     creating++;counts.creatingPromises++;
     const properties=await send('Runtime.getProperties',{objectId:remote.objectId,ownProperties:true,generatePreview:false});
     const state=properties.internalProperties?.find(x=>x.name==='[[PromiseState]]')?.value?.value;
     publicSummary.creatingObservations.push({keyHash,promiseState:['pending','fulfilled','rejected'].includes(state)?state:'unknown'});
     if(state==='pending')counts.pendingCreating++;else if(['fulfilled','rejected'].includes(state))counts.settledCreating++;else counts.promiseStateUnknown++;
     continue;
    }
    const classified=await send('Runtime.callFunctionOn',{objectId:remote.objectId,functionDeclaration:'function(h){return ('+classify+').call(this,h,('+hashSource+'))}',arguments:[{value:keyHash}],returnByValue:false,objectGroup:group,silent:true});
    ensure(!classified.exceptionDetails,'VALUE_CLASSIFICATION_FAILED');
    const properties=await send('Runtime.getProperties',{objectId:classified.result.objectId,ownProperties:true,generatePreview:false});
    const record=Object.fromEntries(properties.result.map(row=>[row.name,row.value?.value]));
    if(record?.unknown){counts.unknownSessionLike++;continue;}
    if(!record?.session)continue;
    sessions++;counts.sessions++;counts.running+=Number(record.running);counts.canvasExecuting+=Number(record.canvasExecuting);counts.tmp+=Number(record.tmp);publicSummary.identityHashes.push(record.keyHash);
    const observation={keyHash:record.keyHash,running:record.running,canvasExecuting:record.canvasExecuting,tmp:record.tmp,persistState:'absent',toolResultsState:'absent'};
    for(const [name,countField,pendingField] of [['persistValue','persistReferences','pendingPersist'],['toolValue','toolResultReferences','pendingToolResults']]){
     const promise=properties.result.find(row=>row.name===name)?.value;if(!promise||promise.type==='undefined')continue;
     counts[countField]++;
     const observationField=name==='persistValue'?'persistState':'toolResultsState';
     if(promise.subtype!=='promise'){counts.promiseStateUnknown++;observation[observationField]='unknown';continue;}
     const p=await send('Runtime.getProperties',{objectId:promise.objectId,ownProperties:true,generatePreview:false});
     const state=p.internalProperties?.find(row=>row.name==='[[PromiseState]]')?.value?.value;
     observation[observationField]=['pending','fulfilled','rejected'].includes(state)?state:'unknown';
     if(state==='pending')counts[pendingField]++;else if(!['fulfilled','rejected'].includes(state))counts.promiseStateUnknown++;
    }
    publicSummary.sessionObservations.push(observation);
   }
   publicSummary.contexts.push({contextId,maps:data.maps,emptyMaps:data.emptyMaps,nonMapPrototypeMatches:data.nonMapPrototypeMatches,scannedEntries:data.scannedEntries,sessions,creatingPromises:creating});

  }finally{/* object groups released after cross-context prototype dedupe */}
 }
 ensure([...contexts.keys()].sort((a,b)=>a-b).join(',')===allContextIds.join(','),'CONTEXT_SET_CHANGED_DURING_AUDIT');
 publicSummary.workerTargets=workerTargets;ensure(workerTargets===0,'WORKER_ISOLATES_REQUIRE_SEPARATE_AUDIT');
 publicSummary.contextMapEnumerationComplete=!selected;publicSummary.uniqueCountsGuaranteed=initialContextIds.length===1;
 const aggregate=new Map();for(const row of publicSummary.sessionObservations){const old=aggregate.get(row.keyHash);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw new Error('SAME_KEY_SESSION_STATE_CONFLICT');aggregate.set(row.keyHash,row);}
 publicSummary.sessionObservations=[...aggregate.values()].sort((a,b)=>a.keyHash.localeCompare(b.keyHash));publicSummary.identityHashes=[...new Set(publicSummary.identityHashes)].sort();
 publicSummary.coverage=selected?'selected-context-native-map-prototypes':'all-enumerated-context-native-map-prototypes';
 complete=true;
}catch(error){publicSummary.holdReason=safeError(error);}
finally{
 if(ownsInspector&&socket?.readyState===WebSocket.OPEN){
  for(const objectGroup of groups){try{await send('Runtime.releaseObjectGroup',{objectGroup});}catch{publicSummary.holdReason??='OBJECT_GROUP_RELEASE_NOT_CONFIRMED';}}
  try{await send('Runtime.evaluate',{expression:'setImmediate(()=>process.getBuiltinModule("node:inspector").close()); true',returnByValue:true,silent:true});}catch{publicSummary.warnings.push('Inspector close request not acknowledged');}
 }
 try{socket?.close();}catch{}
 if(ownsInspector){for(let n=0;n<50;n++){if(await endpoint()===null){closedConfirmed=true;break;}await sleep(50);}}
 if(ownsInspector&&closedConfirmed){try{closedConfirmed=JSON.stringify(targetListeners())===JSON.stringify(publicSummary.targetListeningPortsBefore);}catch{closedConfirmed=false;}}
 publicSummary.inspectorClosedConfirmed=closedConfirmed;
 if(opened&&!closedConfirmed)publicSummary.holdReason??='AUDIT_OPENED_INSPECTOR_CLOSURE_NOT_CONFIRMED';
 const c=publicSummary.counts;
 publicSummary.status=!publicSummary.holdReason&&complete&&closedConfirmed?(c.running||c.canvasExecuting||c.pendingCreating||c.pendingPersist||c.pendingToolResults||c.promiseStateUnknown||c.unknownSessionLike?'OBSERVED_ACTIVE_OR_UNKNOWN':'OBSERVED_MAPS_IDLE'):'HOLD';
 publicSummary.elapsedMs=Date.now()-started;publicSummary.protocolMethods=methodCounts;
 publicSummary.finishedAt=new Date().toISOString();publicSummary.finishedMonotonicNs=process.hrtime.bigint().toString();
 console.log(JSON.stringify(publicSummary));
 if(publicSummary.status==='HOLD')process.exitCode=2;
}
