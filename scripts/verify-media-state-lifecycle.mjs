/** Actual media HTTP process and native filesystem. Only engine completion and
 * precisely named filesystem faults are controlled; no DB or supplier exists. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const file=fileURLToPath(import.meta.url),args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const source=path.resolve(option('--source-root','.'));
if(args.includes('--worker')){
  assert.equal(process.env.NAUMI_MEDIA_STATE_FIXTURE,'1');
  const root=path.resolve(process.env.MEDIA_JOB_DIR);
  assert.equal((await fs.readFile(path.join(root,'.owner'),'utf8')),process.env.MEDIA_STATE_FIXTURE_OWNER);
  const native={writeFile:fs.writeFile.bind(fs),rename:fs.rename.bind(fs),rm:fs.rm.bind(fs),readFile:fs.readFile.bind(fs)};
  const marker=async name=>native.readFile(path.join(root,name),'utf8').then(()=>true,()=>false);
  const take=async name=>{if(!await marker(name))return false;await native.rm(path.join(root,name));return true;};
  const jobId=name=>{
    const relative=path.relative(root,String(name));assert(!relative.startsWith('..')&&!path.isAbsolute(relative));
    return relative.split(path.sep)[0];
  };
  fs.writeFile=async(name,data,...rest)=>{
    if(String(name).includes('worker-state.json')&&typeof data==='string'&&JSON.parse(data).status==='processing'){
      const id=jobId(name);
      if(await take('fail-processing-'+id))throw Object.assign(Error('fixture-processing-write'),{code:'EACCES'});
    }
    if(String(name).includes('worker-state.json')&&typeof data==='string'&&JSON.parse(data).status==='queued'){
      const id=jobId(name);
      if(await take('fail-initial-'+id)){
        await native.writeFile(path.join(root,'initial-fault-fired-'+id),'1');
        throw Object.assign(Error('fixture-primary-write'),{code:'EIO'});
      }
    }
    return native.writeFile(name,data,...rest);
  };
  fs.rm=async(name,...rest)=>{
    if(String(name).includes('worker-state.json')&&await take('fail-cleanup-'+jobId(name)))
      throw Object.assign(Error('fixture-secondary-cleanup'),{code:'EPERM'});
    return native.rm(name,...rest);
  };
  fs.rename=async(from,to)=>{
    if(String(to).endsWith('worker-state.json')){
      const view=JSON.parse(await native.readFile(from,'utf8')),id=jobId(to);
      if(view.status==='completed'&&await marker('hold-terminal-'+id)){
        await native.writeFile(path.join(root,'terminal-entered-'+id),'1');
        while(!await marker('release-terminal-'+id))await new Promise(r=>setTimeout(r,10));
      }
      try{return await native.rename(from,to);}
      catch(error){await native.writeFile(path.join(root,'rename-failed-'+id),error.code||'UNKNOWN');throw error;}
    }
    return native.rename(from,to);
  };
  syncBuiltinESMExports();
  const {MediaEngine}=await import(pathToFileURL(path.join(source,'services/media-worker/engine.mjs')));
  MediaEngine.prototype.run=async function(id){
    this.active.set(id,{fixture:true});
    try{
      await native.writeFile(path.join(root,'engine-'+id),'1',{flag:'wx'});
      return {outputs:[],probes:[],stdout:'original-fixture-result'};
    }finally{this.active.delete(id);}
  };
  await import(pathToFileURL(path.join(source,'services/media-worker/main.mjs')));
}else{
  const baseline=option('--mode','modified')==='baseline';
  const out=path.resolve(option('--out','output/media-state-lifecycle'));
  await fs.mkdir(out,{recursive:true});
  const root=path.join(out,'scratch-'+randomUUID()),owner=randomUUID();await fs.mkdir(root);await fs.writeFile(path.join(root,'.owner'),owner);
  const hash=async name=>createHash('sha256').update(await fs.readFile(name)).digest('hex');
  const originalHash=await hash(path.join(source,'services/media-worker/main.mjs'));
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const secret='r7e-local-media-state-fixture-only-0123456789',env={};
  for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'test',MEDIA_WORKER_FIXTURE_OWNER:'canvas-video-fusion-20261013',NAUMI_MEDIA_STATE_FIXTURE:'1',MEDIA_STATE_FIXTURE_OWNER:owner,MEDIA_WORKER_SECRET:secret,MEDIA_JOB_DIR:root,MEDIA_WORKER_HOST:'127.0.0.1',MEDIA_WORKER_PORT:String(port),MEDIA_WORKER_CONCURRENCY:'1'});
  const child=spawn(process.execPath,[file,'--worker','--source-root',source],{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const closed=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));
  let checks=0;const rows=[],eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const call=async(method,url,body)=>{const response=await fetch('http://127.0.0.1:'+port+url,{method,headers:{authorization:'Bearer '+secret,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});return {status:response.status,body:await response.json()};};
  const exists=name=>fs.lstat(path.join(root,name)).then(()=>true,()=>false);
  const wait=async(run,test)=>{for(let i=0;i<150;i++){const result=await run();if(test(result))return result;await new Promise(r=>setTimeout(r,20));}throw Error('FIXTURE_WAIT_FAILED');};
  const request={action:'ffprobe',inputs:[],outputs:[],inspectOnly:true};
  const prepare=async()=>{const id=randomUUID();await fs.mkdir(path.join(root,id,'inputs'),{recursive:true});return id;};
  try{
    await wait(()=>call('GET','/health').catch(()=>null),r=>r?.status===200);
    for(const cleanupFault of [false,true]){
      const id=await prepare();await fs.writeFile(path.join(root,'fail-initial-'+id),'1');
      if(cleanupFault)await fs.writeFile(path.join(root,'fail-cleanup-'+id),'1');
      const rejected=await call('POST','/jobs/'+id,request);eq(rejected.status,400,'failed initial persistence is not accepted');
      eq(rejected.body.error,baseline&&cleanupFault?'fixture-secondary-cleanup':'fixture-primary-write','original persistence error is preserved');
      eq(await exists('engine-'+id),false,'unaccepted request never executes');
      const observed=await call('GET','/jobs/'+id);eq(observed.status,baseline?200:404,'no ghost queue entry after failed acceptance');
      const retry=await call('POST','/jobs/'+id,request);eq(retry.status,baseline?200:202,'same original unaccepted intent can be submitted');
      if(!baseline){const result=await wait(()=>call('GET','/jobs/'+id),r=>r.body.status==='completed');eq(result.body.result.stdout,'original-fixture-result','original result');eq(await exists('engine-'+id),true,'exactly one engine execution marker');eq((await call('PATCH','/jobs/'+id)).status,200,'acknowledgment');}
      else eq(await exists('engine-'+id),false,'baseline duplicate remains stranded without executing');
      rows.push({name:cleanupFault?'primary-error-survives-cleanup':'failed-initial-save-has-no-ghost',first:rejected.status,afterFailure:observed.status,retry:retry.status});
    }
    const processing=await prepare();await fs.writeFile(path.join(root,'fail-processing-'+processing),'1');
    eq((await call('POST','/jobs/'+processing,request)).status,202,'queued snapshot is accepted before dispatch');
    const failed=await wait(()=>call('GET','/jobs/'+processing),r=>r.body.status==='failed');
    eq(failed.body.error,'MEDIA_STATE_WRITE_FAILED','original public error contract stays stable');
    eq(await exists('engine-'+processing),false,'failed processing snapshot never launches the engine');
    eq((await call('POST','/jobs/'+processing,request)).status,200,'known failure does not silently execute again');
    eq((await call('PATCH','/jobs/'+processing)).status,200,'failure acknowledgment still cleans original job');
    rows.push({name:'processing-save-native-cause',publicError:failed.body.error,engineInvocations:0});
    const id=await prepare();await fs.writeFile(path.join(root,'hold-terminal-'+id),'1');eq((await call('POST','/jobs/'+id,request)).status,202,'accepted original');
    await wait(()=>exists('terminal-entered-'+id),Boolean);
    let settled=false;const get=call('GET','/jobs/'+id).then(value=>{settled=true;return value;});await new Promise(r=>setTimeout(r,150));
    eq(settled,baseline,'GET cannot expose terminal while terminal rename is held');
    if(baseline){eq((await get).body.status,'completed','baseline exposes completion early');eq((await call('PATCH','/jobs/'+id)).status,200,'baseline allows early removal');await fs.writeFile(path.join(root,'release-terminal-'+id),'1');eq(await wait(()=>exists('rename-failed-'+id),Boolean),true,'baseline cleanup races terminal rename');}
    else{await fs.writeFile(path.join(root,'release-terminal-'+id),'1');eq((await get).body.status,'completed','completion is available after persistence');eq(JSON.parse(await fs.readFile(path.join(root,id,'worker-state.json'),'utf8')).status,'completed','terminal state exists before acknowledgment');eq((await call('PATCH','/jobs/'+id)).status,200,'acknowledgment cleans after persistence');eq(await exists('rename-failed-'+id),false,'no post-cleanup terminal rename');}
    rows.push({name:'terminal-persistence-and-acknowledgment',earlyTerminal:baseline,renameAfterRemoval:baseline});
    const diagnostics=stderr.split('\n').filter(x=>x.startsWith('{')).map(x=>{try{return JSON.parse(x);}catch{return null;}}).filter(x=>x?.event==='media-state-write-failed');
    eq(diagnostics.length,baseline?0:4,'native failure step/code is observable without logging paths or requests');
    if(!baseline){eq(diagnostics.map(x=>x.code),['EIO','EIO','EPERM','EACCES'],'primary and cleanup native codes');for(const d of diagnostics)eq(Object.keys(d).sort(),['code','event','id','operation','step'],'minimal diagnostic fields');}
    eq(await hash(path.join(source,'services/media-worker/main.mjs')),originalHash,'selected source bytes unchanged by tests');
    const result={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',cases:rows.length,checks,actualWorkerProcess:true,actualHttp:true,actualNativeFilesystem:true,engine:'controlled completion only',suppliers:0,diagnostics,rows};
    await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
    console.log(`MEDIA_STATE_LIFECYCLE=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${rows.length} CHECKS=${checks} INITIAL_GHOST=${baseline?1:0} EARLY_TERMINAL=${baseline?1:0} PRIMARY_ERROR=${baseline?'MASKED':'PRESERVED'} NATIVE_DIAGNOSTICS=${diagnostics.length} SUPPLIER_CALLS=0`);
  }finally{
    // Release any fixture gate before stopping our one child.
    for(const name of await fs.readdir(root))if(name.startsWith('hold-terminal-'))await fs.writeFile(path.join(root,name.replace('hold-terminal-','release-terminal-')),'1');
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const stopped=await closed;
    await fs.writeFile(path.join(out,'WORKER.log'),stdout+stderr);await fs.writeFile(path.join(out,'CLEANUP.json'),JSON.stringify({status:'PASS',stopped,ownChildStopped:true,sourceUnchanged:await hash(path.join(source,'services/media-worker/main.mjs'))===originalHash},null,2)+'\n');
    assert(path.resolve(root).startsWith(out+path.sep));await fs.rm(root,{recursive:true,force:true});
  }
}
