#!/usr/bin/env node
/** Read-only script/context inventory. No heap scan, application call, stop or
 * drain claim. The compiled-source catalogue is checked against actual bytes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]},has=key=>args.includes(key);
const pid=Number(get('--pid','0')),hash=data=>createHash('sha256').update(data).digest('hex');
const ensure=(ok,code)=>{if(!ok)throw Error(code)},port=9229,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,opened=false,owned=false,closed=false,complete=false,sequence=0,workers=0;
const contexts=new Map(),scripts=new Map(),pending=new Map();
const report={schemaVersion:1,kind:'legacy-node-script-realm-observation',status:'HOLD',targetPid:pid,heapScanPerformed:false,heapSnapshotTaken:false,applicationMethodsCalled:false,debuggerPausedByAudit:false,ordinaryDrainReceipt:null,sourceClosureProven:false,observedAt:new Date().toISOString()};
function listeners(){
 const inodes=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[]}catch{return []}}));
 return [...new Set(['tcp','tcp6'].flatMap(kind=>fs.readFileSync(`/proc/${pid}/net/${kind}`,'utf8').trim().split('\n').slice(1).flatMap(line=>{const c=line.trim().split(/\s+/);return c[3]==='0A'&&inodes.has(c[9])?[parseInt(c[1].split(':')[1],16)]:[]})))].sort((a,b)=>a-b);
}
async function endpoint(){try{const r=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null}catch{return null}}
async function send(method,params={}){
 ensure(socket?.readyState===WebSocket.OPEN,'INSPECTOR_NOT_CONNECTED');const id=++sequence;
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_OBSERVATION_TIMEOUT'))},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
}
try{
 ensure(process.platform==='linux'&&process.env.NODE_OPTIONS===''&&Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'LINUX_LOCAL_TARGET_REQUIRED');
 ensure(has('--allow-sigusr1'),'EXPLICIT_INSPECTOR_OPT_IN_REQUIRED');
 const root=get('--compiled-root','/app/.next/server'),entry=get('--entry','/app/server.js');
 ensure(path.isAbsolute(root)&&path.isAbsolute(entry)&&fs.realpathSync(root)===root&&fs.realpathSync(entry)===entry,'EXACT_COMPILED_PATHS_REQUIRED');
 const compressed=get('--catalogue-gzip-base64',''),plain=get('--catalogue-base64','');
 ensure(!(compressed&&plain),'ONE_SOURCE_CATALOGUE_REQUIRED');
 const catalogue=JSON.parse((compressed?gunzipSync(Buffer.from(compressed,'base64'),{maxOutputLength:2*1048576}):Buffer.from(plain,'base64')).toString('utf8'));
 ensure(Array.isArray(catalogue)&&catalogue.length>0&&catalogue.length<=5000,'BOUNDED_SOURCE_CATALOGUE_REQUIRED');
 const actual=[];function walk(p){const s=fs.lstatSync(p);ensure(!s.isSymbolicLink(),'COMPILED_SYMLINK');if(s.isDirectory())for(const n of fs.readdirSync(p).sort())walk(path.join(p,n));else if(/\.(?:js|mjs|cjs)$/.test(p))actual.push(p)}
 walk(entry);walk(root);const expected=catalogue.map(row=>row.path).sort();ensure(JSON.stringify([...actual].sort())===JSON.stringify(expected)&&new Set(expected).size===expected.length,'COMPILED_FILE_SET_CHANGED');
 const agents=[];
 for(const row of catalogue){ensure(/^[a-f0-9]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.size)&&row.size>=0,'INVALID_SOURCE_IDENTITY');const raw=fs.readFileSync(row.path);ensure(raw.length===row.size&&hash(raw)===row.sha256,'COMPILED_BYTES_CHANGED');const source=raw.toString('utf8');if(source.includes('lastUsedAt')&&source.includes('canvasExecuting')&&source.includes('new Map'))agents.push(row)}
 ensure(agents.length>0&&agents.length<=16,'AGENT_RUNTIME_SOURCE_REVIEW_REQUIRED');
 report.compiledCatalogueSha256=hash(JSON.stringify(catalogue));report.compiledFilesVerified=catalogue.length;report.agentRuntimeModules=agents.map(row=>({path:row.path,sha256:row.sha256,size:row.size}));
 const command=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean),env=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0');
 ensure(/(?:^|\/)node$/.test(fs.readlinkSync(`/proc/${pid}/exe`))&&!command.some(x=>/^--(?:inspect|debug)/.test(x))&&!env.some(x=>x.startsWith('NODE_OPTIONS=')&&/--(?:inspect|debug)/.test(x)),'PREEXISTING_DEBUG_TARGET_REJECTED');
 const allowed=get('--allowed-target-listen-ports','3000').split(',').map(Number);ensure(allowed.every(n=>Number.isInteger(n)&&n>0&&n<65536&&n!==port),'LISTENER_ALLOWLIST_REQUIRED');
 report.targetListeningPortsBefore=listeners();ensure(report.targetListeningPortsBefore.every(n=>allowed.includes(n))&&await endpoint()===null,'PREEXISTING_INSPECTOR_OR_LISTENER');
 process.kill(pid,'SIGUSR1');opened=true;let targets;
 for(let n=0;n<50;n++){targets=await endpoint();if(targets?.length)break;await sleep(50)}
 ensure(targets?.length===1&&new URL(targets[0].webSocketDebuggerUrl).hostname==='127.0.0.1','LOOPBACK_TARGET_REQUIRED');
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
 const who=await send('Runtime.evaluate',{expression:'({pid:process.pid,node:process.version})',returnByValue:true,silent:true});ensure(who.result?.value?.pid===pid,'TARGET_PID_CHANGED');owned=true;report.nodeVersion=who.result.value.node;
 await send('Runtime.enable');await send('NodeWorker.enable',{waitForDebuggerOnStart:false});await send('Debugger.setSkipAllPauses',{skip:true});await send('Debugger.enable',{maxScriptsCacheSize:32*1048576});await sleep(100);
 ensure(contexts.size>0&&contexts.size<=1024&&scripts.size>0&&scripts.size<=20000&&workers===0&&!report.debuggerPausedByAudit,'BOUNDED_CONTEXT_SCRIPT_OR_WORKER_COVERAGE');
 const before=[...contexts.keys()].sort((a,b)=>a-b),matches=[];
 for(const module of agents){
  const candidates=[...scripts.values()].filter(s=>s.hash===module.sha256||s.url===module.path||s.url==='file://'+module.path);
  for(const candidate of candidates){const source=await send('Debugger.getScriptSource',{scriptId:candidate.scriptId});ensure(typeof source.scriptSource==='string'&&hash(source.scriptSource)===module.sha256,'LOADED_AGENT_SOURCE_CHANGED');ensure(contexts.has(candidate.executionContextId),'AGENT_CONTEXT_NOT_ENUMERATED');matches.push({path:module.path,sha256:module.sha256,scriptId:candidate.scriptId,contextId:candidate.executionContextId})}
 }
 ensure(JSON.stringify(before)===JSON.stringify([...contexts.keys()].sort((a,b)=>a-b)),'CONTEXT_SET_CHANGED');
 report.executionContexts=before;report.scriptsReported=scripts.size;report.agentScripts=matches;report.agentRuntimeContextIds=[...new Set(matches.map(m=>m.contextId))].sort((a,b)=>a-b);report.workerTargets=workers;
 report.unloadedAgentModules=agents.filter(m=>!matches.some(s=>s.path===m.path)).map(m=>({path:m.path,sha256:m.sha256}));
 complete=true;
}catch(error){report.holdReason=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'SCRIPT_REALM_OBSERVATION_FAILED'}
finally{
 if(owned&&socket?.readyState===WebSocket.OPEN){
  try{await send('Debugger.disable')}catch{report.holdReason??='DEBUGGER_DISABLE_NOT_CONFIRMED'}
  try{await send('Runtime.evaluate',{expression:'setImmediate(()=>process.getBuiltinModule("node:inspector").close()); true',returnByValue:true,silent:true})}catch{report.holdReason??='INSPECTOR_CLOSE_REQUEST_UNKNOWN'}
 }
 try{socket?.close()}catch{}
 if(owned)for(let n=0;n<50;n++){if(await endpoint()===null){closed=true;break}await sleep(50)}
 if(owned&&closed)try{closed=JSON.stringify(listeners())===JSON.stringify(report.targetListeningPortsBefore)}catch{closed=false}
 report.inspectorOpenedByAudit=owned;report.inspectorClosedConfirmed=closed;if(opened&&!closed)report.holdReason??='INSPECTOR_CLOSURE_UNKNOWN';
 report.status=complete&&closed&&!report.holdReason?'OBSERVED_SCRIPT_REALMS':'HOLD';report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report));if(report.status==='HOLD')process.exitCode=2;
}
