import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,rm,lstat,symlink} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Real isolated Node workers / HTTP / shared files; fixture engine, no DB or supplier.
const file=fileURLToPath(import.meta.url),project=path.resolve(path.dirname(file),'..');
const fixtureOwner='canvas-video-fusion-20261013';
if(process.argv[2]==='--worker'){
  assert.equal(process.env.NAUMI_MEDIA_RETIREMENT_FIXTURE,'1');
  const {MediaEngine}=await import('./video-fusion/media-engine.mjs');
  const original=MediaEngine.prototype.run;
  MediaEngine.prototype.run=async function(id,request,onProgress,signal){
    if(!request.fixtureHold)return original.call(this,id,request,onProgress,signal);
    this.active.set(id,{fixture:true});
    try{while(!signal.aborted){try{await lstat(path.join(this.sharedRoot,`release-${id}`));break;}catch{await new Promise(resolve=>setTimeout(resolve,20));}}signal.throwIfAborted();return {outputs:[],probes:[],stdout:''};}
    finally{this.active.delete(id);}
  };
  await import('./video-media-worker.mjs');
}else{
 let assertions=0;const equal=(a,b)=>{assert.deepEqual(a,b);assertions++;};
 const base=path.resolve(project,'output/saas-admin-20261022/retirement-'+randomUUID());
 assert(base.startsWith(path.resolve(project,'output/saas-admin-20261022')+path.sep));await mkdir(base,{recursive:true});
 const processes=[],secret='fixture-retirement-'+randomUUID();
 const wait=async(run,test,timeout=8000)=>{const deadline=Date.now()+timeout;let value;while(Date.now()<deadline){try{value=await run();if(test(value))return value;}catch{}await new Promise(resolve=>setTimeout(resolve,40));}throw Error('FIXTURE_WAIT_FAILED');};
 async function port(){const s=net.createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
 async function start(root,name){await mkdir(root,{recursive:true});const p=await port(),env={NODE_ENV:'test',MEDIA_WORKER_FIXTURE_OWNER:fixtureOwner,NAUMI_MEDIA_RETIREMENT_FIXTURE:'1',MEDIA_WORKER_SECRET:secret,MEDIA_JOB_DIR:root,MEDIA_WORKER_HOST:'127.0.0.1',MEDIA_WORKER_PORT:String(p),MEDIA_WORKER_CONCURRENCY:'1'};
  for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,[file,'--worker'],{cwd:project,env,stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);const done=new Promise(resolve=>child.once('exit',code=>resolve(code)));const worker={root,name,child,done,origin:`http://127.0.0.1:${p}`,log:()=>log};processes.push(worker);
  await wait(()=>call(worker,'GET','/health'),r=>r.status===200);return worker;
 }
 async function stop(worker){if(worker.stopped)return;if(worker.child.exitCode===null&&worker.child.signalCode===null){worker.child.kill('SIGTERM');await Promise.race([worker.done,new Promise((_,reject)=>setTimeout(()=>reject(Error('WORKER_STOP_TIMEOUT')),12000).unref())]);}assertions++;assert(worker.child.exitCode===0||(process.platform==='win32'&&worker.child.signalCode==='SIGTERM'));worker.stopped=true;}
 async function call(worker,method,url,body){const r=await fetch(worker.origin+url,{method,headers:{authorization:`Bearer ${secret}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});return {status:r.status,data:await r.json()};}
 const health=async w=>(await call(w,'GET','/health')).data;
 async function seed(root,id=randomUUID(),inspection=false){await mkdir(path.join(root,id,'inputs'),{recursive:true});const view={owner:'naumi-media-worker',id,digest:'fixture',inspection,status:'completed',processedSeconds:0,createdAt:new Date().toISOString(),finishedAt:new Date().toISOString(),result:{outputs:[],probes:[],stdout:''}};await writeFile(path.join(root,id,'worker-state.json'),JSON.stringify(view));return id;}
 async function receipt(root,id,value={id,status:'completed',retiredAt:new Date().toISOString()}){await mkdir(path.join(root,'.retired'),{recursive:true});await writeFile(path.join(root,'.retired',id+'.json'),JSON.stringify(value));}
 const jobRequest={action:'ffprobe',inputs:[],outputs:[],inspectOnly:true};
 try{
  const root=path.join(base,'handoff'),ids=[];for(let i=0;i<8;i++)ids.push(await seed(root));
  const old=await start(root,'old'),next=await start(root,'next');equal((await health(next)).terminal,8);
  for(const id of ids)equal((await call(old,'PATCH','/jobs/'+id)).status,200);
  if(process.argv.includes('--reproduce')){equal((await health(next)).terminal,8);equal((await call(next,'GET','/jobs/'+ids[0])).status,200);const fresh=randomUUID();await mkdir(path.join(root,fresh,'inputs'),{recursive:true});const blocked=await call(next,'POST','/jobs/'+fresh,jobRequest);equal(blocked.status,429);equal(blocked.data.error,'MEDIA_QUEUE_FULL');console.log('MEDIA_RETIREMENT_REPRODUCED real_worker_processes=2 shared_scratch=1 stale_terminal=8 old_patch_cleanup=1 new_post_429=1 supplier_calls=0');}
  else{
   equal((await health(next)).terminal,0);assertions++;assert([404,410].includes((await call(next,'GET','/jobs/'+ids[0])).status));equal((await call(next,'POST','/jobs/'+ids[0],jobRequest)).status,410);
   const fresh=randomUUID();await mkdir(path.join(root,fresh,'inputs'),{recursive:true});equal((await call(next,'POST','/jobs/'+fresh,jobRequest)).status,202);await wait(()=>call(next,'GET','/jobs/'+fresh),r=>r.data.status==='completed');equal((await call(next,'PATCH','/jobs/'+fresh)).status,200);
   await stop(next);const restarted=await start(root,'restarted');equal((await health(restarted)).terminal,0);equal((await call(restarted,'POST','/jobs/'+ids[1],jobRequest)).status,410);await stop(restarted);
   // A receipt present before startup suppresses cache restoration without deleting output files.
   const startRoot=path.join(base,'startup'),pre=await seed(startRoot);await receipt(startRoot,pre);const startup=await start(startRoot,'startup');equal((await health(startup)).terminal,0);equal((await call(startup,'GET','/jobs/'+pre)).status,410);equal((await lstat(path.join(startRoot,pre))).isDirectory(),true);await stop(startup);
   // Missing files and malformed/untrusted receipts do not prove acknowledgment.
   const invalidRoot=path.join(base,'invalid'),invalidIds=[];for(let i=0;i<8;i++)invalidIds.push(await seed(invalidRoot));const invalid=await start(invalidRoot,'invalid');
   const [missing,wrongId,wrongStatus,badTime,future,directory,link,large]=invalidIds;
   await rm(path.join(invalidRoot,missing),{recursive:true});
   await receipt(invalidRoot,wrongId,{id:randomUUID(),status:'completed',retiredAt:new Date().toISOString()});
   await receipt(invalidRoot,wrongStatus,{id:wrongStatus,status:'processing',retiredAt:new Date().toISOString()});
   await receipt(invalidRoot,badTime,{id:badTime,status:'completed',retiredAt:'yesterday'});
   await receipt(invalidRoot,future,{id:future,status:'completed',retiredAt:new Date(Date.now()+86400000).toISOString()});
   await mkdir(path.join(invalidRoot,'.retired',directory+'.json'));
   const linkTarget=path.join(invalidRoot,'receipt-target.json');await writeFile(linkTarget,JSON.stringify({id:link,status:'completed',retiredAt:new Date().toISOString()}));let symlinkSupported=true;try{await symlink(linkTarget,path.join(invalidRoot,'.retired',link+'.json'));}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code))throw error;symlinkSupported=false;await receipt(invalidRoot,link,{id:link,status:'completed',retiredAt:null});}
   await receipt(invalidRoot,large,{id:large,status:'completed',retiredAt:new Date().toISOString(),padding:'x'.repeat(4096)});
   equal((await health(invalid)).terminal,8);equal((await call(invalid,'GET','/jobs/'+missing)).status,200);equal((await call(invalid,'GET','/jobs/'+wrongId)).status,200);
   for(const id of invalidIds)if(id!==directory&&id!==link)await receipt(invalidRoot,id);
   await rm(path.join(invalidRoot,'.retired',directory+'.json'),{recursive:true});await receipt(invalidRoot,directory);
   await rm(path.join(invalidRoot,'.retired',link+'.json'));await receipt(invalidRoot,link);
   equal((await health(invalid)).terminal,0);await stop(invalid);
   // Active and queued work cannot be evicted by a terminal retirement marker.
   const activeRoot=path.join(base,'active'),active=await start(activeRoot,'active'),held=randomUUID(),queued=randomUUID();for(const id of [held,queued]){await mkdir(path.join(activeRoot,id,'inputs'),{recursive:true});equal((await call(active,'POST','/jobs/'+id,{...jobRequest,fixtureHold:true})).status,202);}
   await wait(()=>health(active),h=>h.running===1&&h.queued===1);await receipt(activeRoot,held);await receipt(activeRoot,queued);equal((await health(active)).running,1);equal((await health(active)).queued,1);equal((await call(active,'GET','/jobs/'+held)).data.status,'processing');equal((await call(active,'GET','/jobs/'+queued)).data.status,'queued');
   for(const id of [held,queued])await writeFile(path.join(activeRoot,'release-'+id),'fixture');await wait(()=>health(active),h=>h.running===0&&h.queued===0&&h.terminal===0);equal((await call(active,'GET','/jobs/'+held)).status,410);await stop(active);
   // Collector reconciliation runs without any health/GET request driving it.
   const collectRoot=path.join(base,'collector'),collectId=await seed(collectRoot),collector=await start(collectRoot,'collector');await receipt(collectRoot,collectId,{id:collectId,status:'completed',retiredAt:new Date(Date.now()-2*86400000).toISOString()});
   console.log('MEDIA_RETIREMENT_COLLECTOR_WAIT real_interval_ms=60000');
   await wait(async()=>{try{await lstat(path.join(collectRoot,'.retired',collectId+'.json'));return false;}catch{return true;}},v=>v,68000);
   equal((await health(collector)).terminal,0);equal((await lstat(path.join(collectRoot,collectId))).isDirectory(),true);await stop(collector);
   console.log(JSON.stringify({name:'MEDIA_SHARED_RETIREMENT_PASS',assertions,realWorkerProcesses:processes.length,sharedScratch:true,fixtureEngine:true,nativeSandbox:false,collectorRealInterval:true,symlinkTest:symlinkSupported?'passed':'windows-privilege-unavailable',databaseCalls:0,supplierCalls:0}));
  }
 }finally{for(const worker of processes.reverse())if(worker.child.exitCode===null)await stop(worker);for(const worker of processes)if(worker.child.exitCode!==0&&!(process.platform==='win32'&&worker.child.signalCode==='SIGTERM'))console.error(worker.log());await rm(base,{recursive:true,force:true});}
}
