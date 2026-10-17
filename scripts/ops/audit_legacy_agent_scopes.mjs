#!/usr/bin/env node
/** Observe the actual declared Agent closure bindings, never application calls.
 * This is a scoped observation, not all application work or a retirement permit.
 * queryObjects forces full GC; the client deadline cannot bound that intrinsic.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),value=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]},flag=k=>args.includes(k);
const ensure=(v,c)=>{if(!v)throw Error(c)},hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pid=Number(value('--pid','0')),started=Date.now(),base='http://127.0.0.1:9229';
let socket,opened=false,owned=false,closed=false,complete=false,sequence=0,workers=0,cleanup=null;
const contexts=new Map(),scripts=new Map(),pending=new Map(),groups=[];
const report={schemaVersion:1,kind:'legacy-agent-closure-observation',status:'HOLD',targetPid:pid,
 coverage:'declared-bindings-of-intrinsic-function-prototype-matches',ordinaryDrainReceipt:null,allApplicationRuntimeObserved:false,
 allDeclaredModuleScopesEnumerated:false,functionPrototypeCoverage:'partial-prototype-based-enumeration',
 requiresReviewedCompleteAgentModuleInventory:true,sourceAutonomousAuditComplete:false,
 applicationMethodsCalled:false,heapSnapshotTaken:false,debuggerPausedByAudit:false,fullGcRequiredByQueryObjects:true,
 countsSemantics:'matched-function-clone-upper-bound',modules:[],clones:[],functionsScanned:0,
 counts:{sessionEntries:0,creatingEntries:0},scopeKindsSeen:{},warnings:['QueryObjects forces full GC; client deadline cannot bound intrinsic target pause',
 'Only declared Agent bindings are observed; ingress, background/task and source closure proofs remain required']};
function listeners(){
 const inodes=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(n=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${n}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[]}catch{return []}}));
 return [...new Set(['tcp','tcp6'].flatMap(k=>fs.readFileSync(`/proc/${pid}/net/${k}`,'utf8').trim().split('\n').slice(1).flatMap(l=>{const c=l.trim().split(/\s+/);return c[3]==='0A'&&inodes.has(c[9])?[parseInt(c[1].split(':')[1],16)]:[]})))].sort((a,b)=>a-b);
}
async function endpoint(){try{const r=await fetch(base+'/json/list',{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null}catch{return null}}
async function send(method,params={}){
 ensure(socket?.readyState===WebSocket.OPEN,'INSPECTOR_NOT_CONNECTED');const id=++sequence;
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_CLIENT_DEADLINE_CANNOT_INTERRUPT_TARGET_GC'))},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
}
async function properties(id){return send('Runtime.getProperties',{objectId:id,ownProperties:true,generatePreview:false})}
async function length(id){const r=await send('Runtime.callFunctionOn',{objectId:id,functionDeclaration:'function(){return this.length}',returnByValue:true,silent:true,throwOnSideEffect:true});ensure(!r.exceptionDetails&&Number.isSafeInteger(r.result?.value)&&r.result.value>=0,'NATIVE_ARRAY_LENGTH_UNKNOWN');return r.result.value}
async function verifiedCoreFunction(remote,expected,natives){
 ensure(remote?.type==='function'&&remote.subtype!=='proxy'&&remote.objectId&&remote.description===expected,'TRUSTED_CORE_FUNCTION_UNAVAILABLE');
 const props=await properties(remote.objectId);
 ensure(!props.internalProperties?.some(p=>p.name==='[[TargetFunction]]'),'BOUND_CORE_FUNCTION_REJECTED');
 const location=props.internalProperties?.find(p=>p.name==='[[FunctionLocation]]')?.value?.value;
 if(expected.includes('[native code]'))ensure(!location,'NATIVE_CORE_FUNCTION_LOCATION_CHANGED');
 else{
  const script=scripts.get(location?.scriptId),key=script?.url?.replace(/^node:/,'');
  ensure(key&&Object.hasOwn(natives,key),'CORE_FUNCTION_SCRIPT_UNKNOWN');
  const loaded=await send('Debugger.getScriptSource',{scriptId:location.scriptId});
  ensure(typeof loaded.scriptSource==='string'&&hash(loaded.scriptSource)===hash(natives[key]),'CORE_FUNCTION_SOURCE_CHANGED');
 }
 return remote.objectId;
}
async function safeCleanupReferences(natives,expected){
 // Descriptor inspection does not call a replacement process getter. Only
 // exact functions backed by this same Node binary's built-in source run.
 const global=await send('Runtime.evaluate',{expression:'this',returnByValue:false,objectGroup:'agent-safe-cleanup',silent:true,throwOnSideEffect:true});
 ensure(global.result?.objectId&&global.result.subtype!=='proxy'&&!global.exceptionDetails,'TARGET_GLOBAL_UNAVAILABLE');
 const accessors=await send('Runtime.getProperties',{objectId:global.result.objectId,ownProperties:true,accessorPropertiesOnly:true,generatePreview:false});
 const getter=accessors.result.find(p=>p.name==='process')?.get;
 const getterId=await verifiedCoreFunction(getter,expected.getProcess,natives);
 const process=await send('Runtime.callFunctionOn',{objectId:getterId,functionDeclaration:'function(){return this()}',returnByValue:false,objectGroup:'agent-safe-cleanup',silent:true});
 ensure(process.result?.objectId&&process.result.subtype!=='proxy'&&!process.exceptionDetails,'TRUSTED_PROCESS_UNAVAILABLE');
 const props=await properties(process.result.objectId),get=props.result.find(p=>p.name==='getBuiltinModule')?.value;
 const getId=await verifiedCoreFunction(get,expected.getBuiltin,natives);
 const handles={process:process.result.objectId};
 const requested=[['node:inspector','close','close'],['node:timers','setImmediate','schedule']];
 for(const [module,name,role]of requested){
  const loaded=await send('Runtime.callFunctionOn',{objectId:getId,functionDeclaration:'function(id){return this(id)}',arguments:[{value:module}],objectGroup:'agent-safe-cleanup',returnByValue:false,silent:true});
  ensure(loaded.result?.objectId&&loaded.result.subtype!=='proxy'&&!loaded.exceptionDetails,'CORE_MODULE_UNAVAILABLE');
  const fields=await properties(loaded.result.objectId),fn=fields.result.find(p=>p.name===name)?.value;
  handles[role]=await verifiedCoreFunction(fn,expected[role],natives);
 }
 if(flag('--observe-native-continuations')){
  // Optional observation failure must not discard already-verified cleanup.
  try{
   const loaded=await send('Runtime.callFunctionOn',{objectId:getId,functionDeclaration:'function(id){return this(id)}',arguments:[{value:'node:timers'}],objectGroup:'agent-safe-cleanup',returnByValue:false,silent:true});
   ensure(loaded.result?.objectId&&loaded.result.subtype!=='proxy'&&!loaded.exceptionDetails,'CORE_MODULE_UNAVAILABLE');
   const fields=await properties(loaded.result.objectId);
   handles.timeout=await verifiedCoreFunction(fields.result.find(p=>p.name==='setTimeout')?.value,expected.timeout,natives);
   handles.requests=await verifiedCoreFunction(props.result.find(p=>p.name==='_getActiveRequests')?.value,expected.requests,natives);
  }catch(error){handles.continuationError=error.message;}
 }
 report.trustedCoreCleanupValidated=true;return handles;
}

async function observeNativeContinuations(handles,expected,natives,deadline){
 ensure(!handles.continuationError,handles.continuationError);
 const observation={coverage:'default-node-builtin-timer-prototypes-and-native-active-request-snapshot',
  allApplicationContinuationsObserved:false,ordinaryDrainReceipt:null,activeRequests:null,
  classes:[],activeTimers:0,destroyedTimers:0,callbacks:[],unknown:0};
 report.nativeContinuations=observation;
 const sourceHashes=new Map();
 const group='native-continuations';groups.push(group);
 for(const [exportRole,className]of [['timeout','Timeout'],['schedule','Immediate']]){
  deadline();const fn=await properties(handles[exportRole]);
  const scopeId=fn.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;
  ensure(scopeId,'BUILTIN_TIMER_SCOPES_UNAVAILABLE');
  const scopes=await properties(scopeId),items=scopes.result.filter(p=>/^\d+$/.test(p.name));
  ensure(items.length<=32,'BUILTIN_TIMER_SCOPE_LIMIT');let ctor=null;
  for(const item of items){
   if(!item.value?.objectId||!/^Closure\b/.test(item.value.description||''))continue;
   const fields=await properties(item.value.objectId),candidate=fields.result.find(p=>p.name===className)?.value;
   if(!candidate)continue;ensure(!ctor,'AMBIGUOUS_BUILTIN_TIMER_CLASS');
   ctor=await verifiedCoreFunction(candidate,expected[className],natives);
  }
  ensure(ctor,'BUILTIN_TIMER_CLASS_UNAVAILABLE');
  const props=await properties(ctor),prototype=props.result.find(p=>p.name==='prototype')?.value;
  ensure(prototype?.objectId&&prototype.subtype!=='proxy','BUILTIN_TIMER_PROTOTYPE_UNAVAILABLE');
  const queried=await send('Runtime.queryObjects',{prototypeObjectId:prototype.objectId,objectGroup:group});
  ensure(queried.objects?.subtype==='array','BUILTIN_TIMER_QUERY_FAILED');
  const count=await length(queried.objects.objectId);ensure(count<=2048,'BUILTIN_TIMER_OBJECT_LIMIT');
  const timers=await properties(queried.objects.objectId),entries=timers.result.filter(p=>/^\d+$/.test(p.name));
  ensure(entries.length===count,'BUILTIN_TIMER_ARRAY_INCOMPLETE');
  const summary={className,matched:count,active:0,destroyed:0};observation.classes.push(summary);
  for(const entry of entries){
   deadline();const timer=entry.value;
   if(!timer?.objectId||timer.subtype==='proxy'){observation.unknown++;continue;}
   const state=await properties(timer.objectId),destroyed=state.result.find(p=>p.name==='_destroyed');
   if(destroyed?.value?.value===true){summary.destroyed++;observation.destroyedTimers++;continue;}
   if(destroyed?.value?.value!==false){observation.unknown++;continue;}
   summary.active++;observation.activeTimers++;
   let callback=state.result.find(p=>p.name===(className==='Timeout'?'_onTimeout':'_onImmediate'))?.value;
   if(callback?.type!=='function'||!callback.objectId||callback.subtype==='proxy'){observation.unknown++;continue;}
   let detail,location,boundDepth=0;
   for(;boundDepth<=4;boundDepth++){
    detail=await properties(callback.objectId);
    location=detail.internalProperties?.find(p=>p.name==='[[FunctionLocation]]')?.value?.value;
    if(location)break;
    const target=detail.internalProperties?.find(p=>p.name==='[[TargetFunction]]')?.value;
    if(target?.type!=='function'||!target.objectId||target.subtype==='proxy')break;
    callback=target;
   }
   const script=scripts.get(location?.scriptId);
   if(!script){observation.unknown++;continue;}
   if(!sourceHashes.has(location.scriptId)){
    const source=await send('Debugger.getScriptSource',{scriptId:location.scriptId});
    ensure(typeof source.scriptSource==='string'&&Buffer.byteLength(source.scriptSource)<=2*1048576,'TIMER_CALLBACK_SOURCE_BOUND');
    sourceHashes.set(location.scriptId,hash(source.scriptSource));
   }
   const builtinKey=script.url?.replace(/^node:/,'');
   observation.callbacks.push({className,scriptUrlSha256:hash(script.url||''),scriptSourceSha256:sourceHashes.get(location.scriptId),
    builtinSourceVerified:!!(builtinKey&&Object.hasOwn(natives,builtinKey)&&hash(natives[builtinKey])===sourceHashes.get(location.scriptId)),
    line:location.lineNumber,column:location.columnNumber,boundDepth});
  }
 }
 deadline();const requests=await send('Runtime.callFunctionOn',{objectId:handles.requests,
  functionDeclaration:'function(){return this()}',objectGroup:group,returnByValue:false,silent:true});
 ensure(!requests.exceptionDetails&&requests.result?.subtype==='array','NATIVE_ACTIVE_REQUESTS_UNAVAILABLE');
 observation.activeRequests=await length(requests.result.objectId);
 ensure(observation.unknown===0,'NATIVE_CONTINUATION_STATE_UNKNOWN');
 observation.completedSnapshot=true;
}
try{
 ensure(process.platform==='linux'&&process.env.NODE_OPTIONS===''&&Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'LINUX_LOCAL_TARGET_REQUIRED');
 ensure(flag('--allow-sigusr1')&&flag('--accept-full-gc'),'EXPLICIT_INSPECTOR_FULL_GC_OPT_IN_REQUIRED');
 ensure(hash(fs.readFileSync(`/proc/${pid}/exe`))===hash(fs.readFileSync(process.execPath)),'SAME_NODE_BINARY_REQUIRED');
 const natives=process.binding('natives'),expected={getProcess:Object.getOwnPropertyDescriptor(globalThis,'process')?.get?.toString(),
  getBuiltin:process.getBuiltinModule.toString(),close:process.getBuiltinModule('node:inspector').close.toString(),
  schedule:process.getBuiltinModule('node:timers').setImmediate.toString()};
 if(flag('--observe-native-continuations')){
  const timers=process.getBuiltinModule('node:timers'),timer=timers.setTimeout(()=>{},60000),immediate=timers.setImmediate(()=>{});
  try{
   expected.Timeout=Object.getPrototypeOf(timer).constructor.toString();expected.Immediate=Object.getPrototypeOf(immediate).constructor.toString();
   expected.timeout=timers.setTimeout.toString();expected.requests=process._getActiveRequests.toString();
  }finally{timers.clearTimeout(timer);timers.clearImmediate(immediate);}
 }
 const maxFunctions=Number(value('--max-functions','100000')),maxAuditMs=Number(value('--max-audit-ms','120000'));
 ensure(Number.isSafeInteger(maxFunctions)&&maxFunctions>0&&maxFunctions<=250000&&Number.isSafeInteger(maxAuditMs)&&maxAuditMs>=1000&&maxAuditMs<=300000,'BOUNDED_LIMITS_REQUIRED');
 const deadline=()=>ensure(Date.now()-started<maxAuditMs,'AUDIT_DEADLINE_EXCEEDED');
 const contract=JSON.parse(Buffer.from(value('--contract-base64',''),'base64').toString('utf8'));
 ensure(contract.schemaVersion===1&&Array.isArray(contract.modules)&&contract.modules.length>0&&contract.modules.length<=16,'DECLARED_MODULE_CONTRACT_REQUIRED');
 const prepared=[];
 for(const m of contract.modules){
  ensure(typeof m.path==='string'&&m.path.startsWith('/')&&fs.realpathSync(m.path)===m.path&&/^[a-f0-9]{64}$/.test(m.sha256),'FIXED_MODULE_SOURCE_REQUIRED');
  const raw=fs.readFileSync(m.path);ensure(hash(raw)===m.sha256,'DECLARED_SOURCE_BYTES_CHANGED');const source=raw.toString('utf8');
  ensure(typeof m.header==='string'&&m.header.length>0&&m.header.length<256&&source.split(m.header).length===2&&
   typeof m.bindingClause==='string'&&m.bindingClause.length>0&&source.includes(m.bindingClause)&&
   [m.functionName,m.sessions,m.creating].every(s=>typeof s==='string'&&/^[$A-Z_a-z][$\w]*$/.test(s))&&m.sessions!==m.creating,'UNAMBIGUOUS_SOURCE_BINDINGS_REQUIRED');
  const start=source.indexOf(m.header),end=start+m.header.length,lines=[0];for(let i=0;i<source.length;i++)if(source[i]==='\n')lines.push(i+1);
  prepared.push({...m,source,start,end,lines});
 }
 ensure(new Set(prepared.map(m=>m.path)).size===prepared.length,'DUPLICATE_DECLARED_MODULE');
 report.contractSha256=hash(JSON.stringify(contract));
 const cmd=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean),env=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0');
 ensure(/(?:^|\/)node$/.test(fs.readlinkSync(`/proc/${pid}/exe`))&&!cmd.some(s=>/^--(?:inspect|debug)/.test(s))&&!env.some(s=>s.startsWith('NODE_OPTIONS=')&&/--(?:inspect|debug)/.test(s)),'EXISTING_DEBUG_TARGET_REJECTED');
 const allowed=value('--allowed-target-listen-ports','3000').split(',').map(Number);
 ensure(allowed.every(n=>Number.isInteger(n)&&n>0&&n<65536&&n!==9229),'LISTENER_ALLOWLIST_REQUIRED');
 report.targetListeningPortsBefore=listeners();ensure(report.targetListeningPortsBefore.every(p=>allowed.includes(p))&&await endpoint()===null,'EXISTING_INSPECTOR_OR_UNKNOWN_LISTENER');
 process.kill(pid,'SIGUSR1');opened=true;let targets;
 for(let i=0;i<50;i++){targets=await endpoint();if(targets?.length)break;await sleep(50)}
 ensure(targets?.length===1&&new URL(targets[0].webSocketDebuggerUrl).hostname==='127.0.0.1','LOOPBACK_INSPECTOR_REQUIRED');
 ensure(listeners().includes(9229),'INSPECTOR_LISTENER_NOT_OWNED_BY_TARGET');owned=true;
 socket=new WebSocket(targets[0].webSocketDebuggerUrl);
 socket.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.method==='Runtime.executionContextCreated')contexts.set(m.params.context.id,m.params.context);
  if(m.method==='Runtime.executionContextDestroyed')contexts.delete(m.params.executionContextId);
  if(m.method==='Debugger.scriptParsed')scripts.set(m.params.scriptId,m.params);
  if(m.method==='Debugger.paused')report.debuggerPausedByAudit=true;
  if(m.method==='NodeWorker.attachedToWorker')workers++;
  if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error('CDP_METHOD_REJECTED')):p.resolve(m.result)}}
 });
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('INSPECTOR_CONNECTION_FAILED')),{once:true})});
 await send('Runtime.enable');await send('NodeWorker.enable',{waitForDebuggerOnStart:false});await send('Debugger.setSkipAllPauses',{skip:true});await send('Debugger.enable',{maxScriptsCacheSize:32*1048576});await sleep(100);
 cleanup=await safeCleanupReferences(natives,expected);
 ensure(contexts.size>0&&contexts.size<=1024&&scripts.size<=20000&&!report.debuggerPausedByAudit&&workers===0,'BOUNDED_REALM_OR_WORKER_COVERAGE');
 const heap=await send('Runtime.getHeapUsage');ensure(heap.usedSize<=256*1048576,'TARGET_HEAP_TOO_LARGE');
 const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]||0);ensure(available>=1048576,'HOST_MEMORY_HEADROOM_TOO_SMALL');
 const before=[...contexts.keys()].sort((a,b)=>a-b),bound=new Map();
 for(const m of prepared){
  for(const s of [...scripts.values()].filter(s=>s.url===m.path||s.url==='file://'+m.path||s.hash===m.sha256)){
   const source=await send('Debugger.getScriptSource',{scriptId:s.scriptId});ensure(typeof source.scriptSource==='string'&&hash(source.scriptSource)===m.sha256,'LOADED_DECLARED_SOURCE_CHANGED');
   ensure(contexts.has(s.executionContextId),'DECLARED_CONTEXT_NOT_ENUMERATED');bound.set(s.scriptId,{...m,contextId:s.executionContextId});
  }
  ensure([...bound.values()].some(b=>b.path===m.path),'DECLARED_MODULE_NOT_LOADED');
 }
 report.modules=prepared.map(m=>({path:m.path,sha256:m.sha256,functionName:m.functionName,sessions:m.sessions,creating:m.creating}));
 for(const contextId of [...new Set([...bound.values()].map(b=>b.contextId))]){
  deadline();const group='agent-scopes-'+process.pid+'-'+contextId;groups.push(group);
  const literal=await send('Runtime.evaluate',{expression:'(function auditedIntrinsic(){})',contextId,objectGroup:group,silent:true,throwOnSideEffect:true});
  ensure(literal.result?.objectId&&!literal.exceptionDetails,'INTRINSIC_FUNCTION_UNAVAILABLE');
  const meta=await properties(literal.result.objectId),prototype=meta.internalProperties?.find(p=>p.name==='[[Prototype]]')?.value?.objectId;
  ensure(prototype,'INTRINSIC_FUNCTION_PROTOTYPE_UNKNOWN');
  const query=await send('Runtime.queryObjects',{prototypeObjectId:prototype,objectGroup:group});deadline();ensure(query.objects?.objectId,'FUNCTION_QUERY_FAILED');
  const total=await length(query.objects.objectId);ensure(report.functionsScanned+total<=maxFunctions,'FUNCTION_SCAN_LIMIT_EXCEEDED');report.functionsScanned+=total;
  for(let start=0;start<total;start+=128){
   deadline();const batch=await send('Runtime.callFunctionOn',{objectId:query.objects.objectId,
    functionDeclaration:'function(start,count){let out=[];for(let i=0;i<count&&start+i<this.length;i++)out[i]=this[start+i];return out}',
    arguments:[{value:start},{value:128}],objectGroup:group,returnByValue:false,silent:true,throwOnSideEffect:true});
   ensure(batch.result?.objectId&&!batch.exceptionDetails,'FUNCTION_BATCH_UNKNOWN');const items=await properties(batch.result.objectId);
   for(const item of items.result.filter(r=>/^\d+$/.test(r.name))){
    const remote=item.value;if(remote?.type!=='function'||remote.subtype==='proxy'||!remote.objectId)continue;
    const names=prepared.filter(m=>new RegExp('^(?:async\\s+)?function\\s+'+m.functionName.replace(/[$]/g,'\\$&')+'\\s*\\(').test(remote.description||''));
    if(!names.length)continue;deadline();const details=await properties(remote.objectId),location=details.internalProperties?.find(p=>p.name==='[[FunctionLocation]]')?.value?.value;
    const m=bound.get(location?.scriptId);if(!m||m.contextId!==contextId||!names.some(n=>n.path===m.path))continue;
    const offset=m.lines[location.lineNumber]+location.columnNumber;if(!Number.isSafeInteger(offset)||offset<m.start||offset>m.end)continue;
    const scopes=details.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value?.objectId;ensure(scopes,'DECLARED_FUNCTION_SCOPES_MISSING');
    const scopeList=await properties(scopes);ensure(scopeList.result.filter(p=>/^\d+$/.test(p.name)).length<=32,'SCOPE_LIST_LIMIT');let found=null;
    for(const scope of scopeList.result.filter(p=>/^\d+$/.test(p.name)&&p.value?.objectId)){
     const kind=(scope.value.description||'').match(/^([A-Za-z]+)\b/)?.[1]||'Other';
     report.scopeKindsSeen[kind]=(report.scopeKindsSeen[kind]||0)+1;
     if(!['Closure','Block'].includes(kind))continue;
     const fields=await properties(scope.value.objectId),a=fields.result.find(p=>p.name===m.sessions)?.value,b=fields.result.find(p=>p.name===m.creating)?.value;
     if(!a&&!b)continue;ensure(a?.subtype==='map'&&b?.subtype==='map'&&a.objectId&&b.objectId,'DECLARED_BINDING_NOT_NATIVE_MAP');ensure(!found,'AMBIGUOUS_BINDING_SCOPE');
     const counts=[];for(const map of [a,b]){const props=await properties(map.objectId),entries=props.internalProperties?.find(p=>p.name==='[[Entries]]')?.value?.objectId;ensure(entries,'NATIVE_MAP_ENTRIES_UNKNOWN');counts.push(await length(entries))}
     found=counts;
    }
    ensure(found,'DECLARED_BINDINGS_NOT_FOUND');ensure(report.clones.length<64,'DECLARED_CLONE_LIMIT');
    report.clones.push({path:m.path,scriptId:location.scriptId,contextId,sessionEntries:found[0],creatingEntries:found[1]});
    report.counts.sessionEntries+=found[0];report.counts.creatingEntries+=found[1];
   }
  }
 }
 for(const [scriptId]of bound)ensure(report.clones.some(c=>c.scriptId===scriptId),'DECLARED_SCRIPT_CLONES_NOT_OBSERVED');
 if(flag('--observe-native-continuations'))await observeNativeContinuations(cleanup,expected,natives,deadline);
 ensure(JSON.stringify(before)===JSON.stringify([...contexts.keys()].sort((a,b)=>a-b))&&workers===0&&!report.debuggerPausedByAudit,'REALM_OR_WORKER_SET_CHANGED');
 deadline();report.allMatchedPrototypeFunctionsProcessed=true;complete=true;
}catch(error){report.holdReason=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'AGENT_SCOPE_OBSERVATION_FAILED'}
finally{
 if(owned&&socket?.readyState===WebSocket.OPEN){
  for(const objectGroup of groups)try{await send('Runtime.releaseObjectGroup',{objectGroup})}catch{report.holdReason??='OBJECT_GROUP_RELEASE_UNKNOWN'}
  try{await send('Debugger.disable')}catch{report.holdReason??='DEBUGGER_DISABLE_UNKNOWN'}
  if(cleanup)try{await send('Runtime.callFunctionOn',{objectId:cleanup.schedule,
   functionDeclaration:'function(close){this(()=>{try{close()}catch{}});return true}',arguments:[{objectId:cleanup.close}],returnByValue:true,silent:true})}catch{report.holdReason??='INSPECTOR_CLOSE_UNKNOWN'}
  else{report.safeCleanupUnavailable=true;report.holdReason??='SAFE_NATIVE_CLEANUP_UNAVAILABLE'}
 }
 try{socket?.close()}catch{}
 if(owned)for(let i=0;i<50;i++){if(await endpoint()===null){closed=true;break}await sleep(50)}
 if(owned&&closed)try{closed=JSON.stringify(listeners())===JSON.stringify(report.targetListeningPortsBefore)}catch{closed=false}
 report.inspectorOpenedByAudit=owned;report.inspectorClosedConfirmed=closed;if(opened&&!closed)report.holdReason??='INSPECTOR_CLOSURE_UNKNOWN';
 report.status=complete&&closed&&!report.holdReason?(report.counts.sessionEntries||report.counts.creatingEntries?'OBSERVED_DECLARED_BINDINGS_NONEMPTY':'OBSERVED_DECLARED_BINDINGS_PARTIAL'):'HOLD';
 report.elapsedMs=Date.now()-started;report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report));if(report.status==='HOLD')process.exitCode=2;
}
