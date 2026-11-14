/** Real atomic files and an independent HTTP Worker. Faults target rename only;
 * no supplier/DB, engine reruns, state rewrites, or validation bypass exists. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {spawn} from 'node:child_process';
import net from 'node:net';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const source=path.resolve(option('--source-root','.')),baseline=args.includes('--baseline'),file=fileURLToPath(import.meta.url);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(args.includes('--worker')){
 assert.equal(process.env.NAUMI_ATOMIC_FIXTURE,'1');
 const root=process.env.MEDIA_JOB_DIR,native={rename:fs.rename.bind(fs),readFile:fs.readFile.bind(fs),writeFile:fs.writeFile.bind(fs)};
 const attempts=new Map();fs.rename=async(from,to)=>{
  const view=JSON.parse(await native.readFile(from,'utf8')),phase=String(to).endsWith('worker-state.json')?view.status:'retirement',key=view.id+':'+phase,n=(attempts.get(key)||0)+1;attempts.set(key,n);
  await native.writeFile(path.join(root,'attempt-'+key.replace(':','-')),String(n));
  if(n<=2)throw Object.assign(Error('fixture-native-contention'),{code:process.platform==='win32'?'EPERM':'EBUSY'});
  return native.rename(from,to);
 };syncBuiltinESMExports();
 const {MediaEngine}=await import(pathToFileURL(path.join(source,'services/media-worker/engine.mjs')));
 MediaEngine.prototype.run=async function(id){await native.writeFile(path.join(root,'engine-'+id),'1',{flag:'wx'});return {outputs:[],probes:[],stdout:'same-original-result'};};
 await import(pathToFileURL(path.join(source,'services/media-worker/main.mjs')));
 process.on('message',message=>{if(message==='stop')process.emit('SIGTERM');});
}else{
 const out=path.resolve(option('--out','output/media-atomic-replace'));await fs.mkdir(out,{recursive:true});
 const root=path.join(out,'scratch-'+randomUUID());await fs.mkdir(root);
 const native={rename:fs.rename.bind(fs),readFile:fs.readFile.bind(fs),writeFile:fs.writeFile.bind(fs)},platform=Object.getOwnPropertyDescriptor(process,'platform');
 const {createMediaStateStore}=await import(pathToFileURL(path.join(source,'services/media-worker/state-store.mjs'))),store=createMediaStateStore(root);await store.initialize();
 let cases=0;const check=(name,run)=>{run();cases++;console.log('ATOMIC_CHECK='+name+' PASS');};
 const id=randomUUID();await fs.mkdir(path.join(root,id));const target=path.join(root,id,'worker-state.json');
 const original={id,status:'queued',sequence:1};await native.writeFile(target,JSON.stringify(original));
 let renames=0,paths=[],observed=[];const fault=Object.assign(Error('fixture-native-contention'),{code:'EPERM'});
 fs.rename=async(from,to)=>{renames++;paths.push(String(from));observed.push(JSON.parse(await native.readFile(to,'utf8')));if(renames<=2)throw fault;return native.rename(from,to);};syncBuiltinESMExports();Object.defineProperty(process,'platform',{...platform,value:'win32'});
 try{
  let caught;try{await store.save({id,view:{id,status:'processing',sequence:2}});}catch(error){caught=error;}
  if(baseline){assert.equal(caught,fault);assert.equal(renames,1);assert.deepEqual(JSON.parse(await native.readFile(target,'utf8')),original);console.log('MEDIA_ATOMIC_REPLACE_BASELINE=REPRODUCED INPUT=two_transient_EPERM'+' RENAME_ATTEMPTS=1 ORIGINAL_STATE=queued RESULT=EPERM ENGINE_CALLS=0');process.exitCode=0;}
  else{
   const transientState=JSON.parse(await native.readFile(target,'utf8'));check('transient-windows-rename-recovers-without-rewrite',()=>{assert.equal(caught,undefined);assert.equal(renames,3);assert.equal(new Set(paths).size,1);assert(observed.every(v=>v.sequence===1));assert.equal(transientState.sequence,2);});
   for(const code of ['EPERM','EACCES','EBUSY']){
    renames=0;const error=Object.assign(Error('persistent-'+code),{code});fs.rename=async()=>{renames++;throw error;};syncBuiltinESMExports();let seen;const start=Date.now();try{await store.save({id,view:{id,status:'failed',sequence:3}});}catch(e){seen=e;}
    const savedBytes=await native.readFile(target,'utf8');check('persistent-'+code+'-bounded-preserves-original-error-and-snapshot',()=>{assert.equal(seen,error);assert.equal(renames,6);assert(Date.now()-start<4000);assert.equal(JSON.parse(savedBytes).sequence,2);});
   }
  }
 }finally{fs.rename=native.rename;syncBuiltinESMExports();Object.defineProperty(process,'platform',platform);}
 // End the intentionally old behavior test without running a new-contract suite.
 if(baseline){assert.equal((await fs.readdir(path.join(root,id))).filter(x=>x.endsWith('.tmp')).length,0);}
 else{
  for(const [os,code,expected] of [['linux','EPERM',1],['linux','EACCES',1],['win32','EIO',1],['win32','ENOENT',1]]){
   Object.defineProperty(process,'platform',{...platform,value:os});let attempts=0;const error=Object.assign(Error('permanent'),{code});fs.rename=async()=>{attempts++;throw error;};syncBuiltinESMExports();let seen;try{await store.save({id,view:{id,status:'failed'}});}catch(e){seen=e;}finally{fs.rename=native.rename;syncBuiltinESMExports();Object.defineProperty(process,'platform',platform);}
   check(os+'-'+code+'-not-retried',()=>{assert.equal(seen,error);assert.equal(attempts,expected);});
  }
  let writes=0;const denied=Object.assign(Error('write-denied'),{code:'EACCES'});fs.writeFile=async()=>{writes++;throw denied;};syncBuiltinESMExports();let seen;try{await store.save({id,view:{id,status:'failed'}});}catch(e){seen=e;}finally{fs.writeFile=native.writeFile;syncBuiltinESMExports();}
  check('write-permission-error-not-retried',()=>{assert.equal(seen,denied);assert.equal(writes,1);});
  const files=await fs.readdir(path.join(root,id));const saved=JSON.parse(await fs.readFile(target,'utf8'));check('no-temporary-or-corrupt-files',()=>{assert.equal(files.filter(x=>x.endsWith('.tmp')).length,0);assert.equal(saved.sequence,2);});
  // Independent Worker with deterministic first-two rename contention on every
  // phase: queued -> processing -> completed -> retirement. Engine is single-use.
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const secret='fixture-media-atomic-0123456789abcdef0123456789',env={...process.env,NAUMI_ATOMIC_FIXTURE:'1',MEDIA_WORKER_FIXTURE_OWNER:'canvas-video-fusion-20261013',MEDIA_WORKER_SECRET:secret,MEDIA_JOB_DIR:root,MEDIA_WORKER_HOST:'127.0.0.1',MEDIA_WORKER_PORT:String(port),MEDIA_WORKER_CONCURRENCY:'1'};
  let child,closed,stdout='',stderr='';const launch=()=>{child=spawn(process.execPath,[file,'--worker','--source-root',source],{cwd:source,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);closed=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));};
  const call=async(method,url,body)=>{const r=await fetch('http://127.0.0.1:'+port+url,{method,headers:{authorization:'Bearer '+secret,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(6000)});return {status:r.status,body:await r.json()};};
  const until=async(fn,test)=>{for(let i=0;i<150;i++){const value=await fn().catch(()=>null);if(test(value))return value;await wait(20);}throw Error('ATOMIC_HTTP_WAIT_TIMEOUT');};
  const stop=async()=>{child.send('stop');const result=await Promise.race([closed,wait(6000).then(()=>{throw Error('WORKER_DRAIN_TIMEOUT');})]);child=undefined;assert.equal(result.code,0);};
  const job=randomUUID(),request={action:'ffprobe',inputs:[],outputs:[],inspectOnly:true};await fs.mkdir(path.join(root,job,'inputs'),{recursive:true});
  try{
   launch();await until(()=>call('GET','/health'),r=>r?.status===200);const accepted=await call('POST','/jobs/'+job,request);check('http-acceptance-persisted-before-response',()=>assert.equal(accepted.status,202));
   const result=await until(()=>call('GET','/jobs/'+job),r=>r?.body.status==='completed');
   check('http-original-result-and-one-engine-after-all-phase-retries',()=>{assert.equal(result.body.result.stdout,'same-original-result');});assert.equal(await fs.readFile(path.join(root,'engine-'+job),'utf8'),'1');
   for(const phase of ['queued','processing','completed'])assert.equal(await fs.readFile(path.join(root,'attempt-'+job+'-'+phase),'utf8'),'3');
   await stop();launch();await until(()=>call('GET','/health'),r=>r?.status===200);const restored=await call('GET','/jobs/'+job),duplicate=await call('POST','/jobs/'+job,request);
   check('worker-restart-recovers-original-terminal-without-reexecution',()=>{assert.equal(restored.body.result.stdout,'same-original-result');assert.equal(duplicate.status,200);assert.equal(duplicate.body.result.stdout,'same-original-result');});
   const ack=await call('PATCH','/jobs/'+job);check('retirement-atomic-retries-before-cleanup',()=>assert.equal(ack.status,200));assert.equal(await fs.readFile(path.join(root,'attempt-'+job+'-retirement'),'utf8'),'3');assert.equal((await call('GET','/jobs/'+job)).status,410);assert.equal((await call('POST','/jobs/'+job,request)).status,410);
   check('acknowledged-original-operation-never-replays',()=>assert.equal(stderr.includes('media-state-write-failed'),false));await stop();
   await fs.writeFile(path.join(out,'WORKER.log'),stdout+'\n'+stderr);console.log('MEDIA_ATOMIC_REPLACE=PASS CASES='+cases+' REAL_FILES=true REAL_HTTP_WORKER=true RESTART=true ENGINE_CALLS=1 SUPPLIER_CALLS=0');
  }finally{if(child)await stop();}
 }
}
