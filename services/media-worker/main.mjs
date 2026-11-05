import http from 'node:http';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdir,readFile,lstat,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {MediaEngine,MEDIA_LIMITS,mediaJobDirectory} from './engine.mjs';
import {createMediaStateStore} from './state-store.mjs';

const secret=process.env.MEDIA_WORKER_SECRET||'';
if(secret.length<32)throw new Error('MEDIA_WORKER_SECRET_REQUIRED');
const expected=createHash('sha256').update(`Bearer ${secret}`).digest();
const root=path.resolve(process.env.MEDIA_JOB_DIR||'/scratch');
const fixture=process.env.MEDIA_WORKER_FIXTURE_OWNER==='canvas-video-fusion-20261013';
const engine=new MediaEngine({sharedRoot:root,fixture});
const concurrency=Number(process.env.MEDIA_WORKER_CONCURRENCY||MEDIA_LIMITS.concurrency);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MEDIA_LIMITS.concurrency)throw new Error('INVALID_MEDIA_WORKER_CONCURRENCY');
const jobs=new Map(),locks=new Map();let running=0,draining=process.env.MEDIA_WORKER_START_PAUSED==='1',stopping=false;
const terminal=status=>['completed','failed','cancelled'].includes(status);
const state=createMediaStateStore(root);await state.initialize();
const {save:persist,read:savedState,retired:retiredState,retire,acknowledged:acknowledgedRetirement}=state;
if(!fixture){
  const id=randomUUID(),directory=mediaJobDirectory(root,id);await mkdir(path.join(directory,'inputs'),{recursive:true,mode:0o700});
  try{await engine.run(id,{action:'ffmpeg',inputs:[],outputs:[],args:['-version']});}
  finally{await rm(directory,{recursive:true,force:true});}
}
const authorized=request=>timingSafeEqual(expected,createHash('sha256').update(String(request.headers.authorization||'')).digest());
const send=(response,status,body)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(body));};
async function bodyOf(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>MEDIA_LIMITS.requestBytes)throw new Error('REQUEST_TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
async function removeJob(id){
  const directory=mediaJobDirectory(root,id),info=await lstat(directory).catch(()=>null);
  if(info&&(!info.isDirectory()||info.isSymbolicLink()))throw new Error('INVALID_JOB_DIRECTORY');
  if(engine.active.has(id))throw new Error('MEDIA_PROCESS_STILL_RUNNING');
  if(info)await rm(directory,{recursive:true,force:true});jobs.delete(id);
}
async function withJobLock(id,run){
  const previous=locks.get(id)||Promise.resolve();let release;const current=new Promise(resolve=>{release=resolve;});
  locks.set(id,current);await previous;
  try{return await run();}finally{release();if(locks.get(id)===current)locks.delete(id);}
}
// A peer sharing scratch may acknowledge a terminal job after this process
// restored it. Retirement proves acknowledgment; a missing directory does not.
async function reconcileRetiredJobs(){
  for(const id of jobs.keys())await withJobLock(id,async()=>{
    const job=jobs.get(id);if(!job||!terminal(job.view.status)||engine.active.has(id))return;
    if(await acknowledgedRetirement(id)){
      // Only evict local state. A peer owns any shared output/file cleanup.
      if(jobs.get(id)===job&&terminal(job.view.status)&&!engine.active.has(id))jobs.delete(id);
    }
  });
}
function capacity(){const values=[...jobs.values()];return {running,queued:values.filter(j=>j.view.status==='queued').length,terminal:values.filter(j=>terminal(j.view.status)).length};}
// Completed but unacknowledged output files survive a worker restart and still
// count against capacity. Pending snapshots are resumed only by the owning App.
for(const entry of await readdir(root,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^[0-9a-f-]{36}$/.test(entry.name))continue;
  const view=await savedState(entry.name);
  if(view?.owner==='naumi-media-worker'&&terminal(view.status)&&!await acknowledgedRetirement(entry.name))jobs.set(entry.name,{id:entry.name,digest:view.digest,controller:new AbortController(),view});
}
async function dispatch(){
  if(stopping||running>=concurrency)return;
  const job=[...jobs.values()].find(item=>item.view.status==='queued');if(!job)return;
  running++;job.view.status='processing';
  try{await persist(job);}catch{running--;job.view.status='failed';job.view.error='MEDIA_STATE_WRITE_FAILED';job.view.finishedAt=new Date().toISOString();void dispatch();return;}
  void engine.run(job.id,job.request,seconds=>{job.view.processedSeconds=seconds;},job.controller.signal)
    .then(result=>({...job.view,status:job.controller.signal.aborted?'cancelled':'completed',...(job.controller.signal.aborted?{}:{result}),finishedAt:new Date().toISOString()}))
    .catch(error=>({...job.view,status:job.controller.signal.aborted?'cancelled':'failed',error:String(error?.message||'MEDIA_PROCESS_FAILED').slice(0,2200),finishedAt:new Date().toISOString()}))
    .then(view=>withJobLock(job.id,async()=>{
      // GET/PATCH share this lock: an App cannot acknowledge/remove the result
      // directory while the terminal snapshot is still being renamed into it.
      // Keep known output available on storage failure, as before; the store
      // reports the actual failed native step/code without rerunning the engine.
      await persist({id:job.id,view}).catch(()=>{});job.view=view;
    }))
    .finally(()=>{running--;void dispatch();});
  void dispatch();
}
const server=http.createServer(async(request,response)=>{
  if(!authorized(request)){send(response,401,{error:'UNAUTHORIZED'});return;}
  try{
    const url=new URL(request.url,'http://media-worker');
    await reconcileRetiredJobs();
    if(request.method==='GET'&&url.pathname==='/health'){send(response,200,{ok:true,version:process.env.SOURCE_COMMIT||'fixture',sandbox:!fixture,draining,...capacity(),maxActive:MEDIA_LIMITS.queue,concurrency});return;}
    if(request.method==='POST'&&['/drain','/resume'].includes(url.pathname)){if(stopping){send(response,503,{error:'MEDIA_WORKER_STOPPING'});return;}draining=url.pathname==='/drain';send(response,200,{ok:true,draining,...capacity()});return;}
    const match=url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/);if(!match){send(response,404,{error:'NOT_FOUND'});return;}
    const id=match[1],directory=mediaJobDirectory(root,id);
    // A cancellation/acknowledgment marker lives outside the cleaned job folder:
    // a slow POST body cannot recreate a job after DELETE followed by PATCH.
    const requestBody=request.method==='POST'?await bodyOf(request):null;
    if(request.method==='POST')await reconcileRetiredJobs();
    await withJobLock(id,async()=>{
      let job=jobs.get(id);
      if(request.method==='POST'){
        const retired=await retiredState(id);
        if(retired){send(response,410,{error:'MEDIA_JOB_RETIRED'});return;}
        const digest=createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
        if(job){send(response,!job.digest||job.digest===digest?200:409,!job.digest||job.digest===digest?job.view:{error:'JOB_OPERATION_CONFLICT'});return;}
        const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('INVALID_JOB_DIRECTORY');
        const previous=await savedState(id);
        if(previous&&previous.digest&&previous.digest!==digest){send(response,409,{error:'JOB_OPERATION_CONFLICT'});return;}
        if(previous&&terminal(previous.status)){send(response,200,previous);return;}
        if(draining){send(response,429,{error:'MEDIA_WORKER_DRAINING'});return;}
        const counts=capacity();if(counts.running+counts.queued>=MEDIA_LIMITS.queue||counts.terminal>=8){send(response,429,{error:'MEDIA_QUEUE_FULL'});return;}
        job={id,request:requestBody,digest,controller:new AbortController(),view:{owner:'naumi-media-worker',id,digest,inspection:requestBody.inspectOnly===true,status:'queued',processedSeconds:0,createdAt:new Date().toISOString()}};
        // Publish acceptance only after its original queued snapshot is durable.
        await persist(job);jobs.set(id,job);send(response,202,job.view);void dispatch();return;
      }
      const saved=job?job.view:await savedState(id);
      if(request.method==='GET'){
        if((!job||terminal(job.view.status)&&!engine.active.has(id))&&await acknowledgedRetirement(id)){send(response,410,{error:'MEDIA_JOB_RETIRED'});return;}
        const available=job||saved&&terminal(saved.status);send(response,available?200:404,available?saved:{error:'NOT_FOUND'});return;}
      if(request.method==='DELETE'){
        if(!terminal(job?.view.status||saved?.status))await retire(id,'cancelled',false);
        if(!job&&!saved){
          await mkdir(directory,{recursive:true,mode:0o700});
          job={id,digest:null,controller:new AbortController(),view:{owner:'naumi-media-worker',id,digest:null,status:'cancelled',processedSeconds:0,createdAt:new Date().toISOString(),finishedAt:new Date().toISOString()}};
          jobs.set(id,job);await persist(job);
        }else if(job&&!terminal(job.view.status)){
          job.controller.abort();if(job.view.status==='queued'){job.view.status='cancelled';job.view.finishedAt=new Date().toISOString();await persist(job);}
        }else if(!job&&saved&&!terminal(saved.status)){
          job={id,digest:saved.digest,controller:new AbortController(),view:{...saved,status:'cancelled',finishedAt:new Date().toISOString()}};jobs.set(id,job);await persist(job);
        }
        send(response,202,job?.view||saved);return;
      }
      if(request.method==='PATCH'){
        if(!saved){if(await retiredState(id)){await removeJob(id);send(response,200,{ok:true});}else send(response,404,{error:'NOT_FOUND'});return;}
        if(!terminal(saved.status)||engine.active.has(id)){send(response,409,{error:'MEDIA_PROCESS_STILL_RUNNING'});return;}
        await retire(id,saved.status);await removeJob(id);send(response,200,{ok:true});return;
      }
      send(response,405,{error:'METHOD_NOT_ALLOWED'});
    });
  }catch(error){send(response,400,{error:String(error?.message||'MEDIA_REQUEST_FAILED').slice(0,2200)});}
});
// Unpublished ordinary outputs are retained until App acknowledgment. Only
// expired inspectors (no output files or billing task) can be reclaimed here.
async function collectInspectors(){
  await reconcileRetiredJobs();
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^[0-9a-f-]{36}$/.test(entry.name)||engine.active.has(entry.name))continue;
    const saved=await savedState(entry.name);
    const prepared=await readFile(path.join(root,entry.name,'prepared-state.json'),'utf8').then(JSON.parse).catch(()=>null);
    const inspector=saved?.owner==='naumi-media-worker'&&saved.inspection&&(terminal(saved.status)||!jobs.has(entry.name))?saved:!saved&&!jobs.has(entry.name)&&prepared?.owner==='naumi-media-app'&&prepared.inspection?prepared:null;
    if(!inspector||Date.now()-Date.parse(inspector.finishedAt||inspector.createdAt)<15*60*1000)continue;
    await withJobLock(entry.name,async()=>{if(!engine.active.has(entry.name)){await retire(entry.name,'cancelled');await removeJob(entry.name);}}).catch(()=>{});
  }
  // HTTP requests cannot remain alive for more than one minute. Keep retirement
  // receipts for a full day, including across worker restarts.
  await state.collectExpiredRetirements();
}
const collector=setInterval(()=>void collectInspectors().catch(()=>{}),60000);collector.unref();
server.requestTimeout=60000;server.headersTimeout=15000;
server.listen(Number(process.env.MEDIA_WORKER_PORT||3001),process.env.MEDIA_WORKER_HOST||'0.0.0.0',()=>console.log(JSON.stringify({event:'media-worker-ready',sandbox:!fixture})));
async function stop(){
  if(stopping)return;stopping=true;draining=true;clearInterval(collector);
  for(const job of jobs.values()){
    if(job.view.status==='queued'){job.view.status='cancelled';job.view.finishedAt=new Date().toISOString();await persist(job).catch(()=>{});}
    job.controller.abort();
  }
  const closed=new Promise(resolve=>server.close(resolve));server.closeIdleConnections?.();
  const deadline=Date.now()+10000;
  while((running||engine.active.size)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  if(running||engine.active.size){console.error('MEDIA_NATIVE_DRAIN_UNKNOWN');process.exit(2);}
  await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,1000))]);
  console.log('MEDIA_NATIVE_DRAIN=COMPLETE');process.exit(0);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
