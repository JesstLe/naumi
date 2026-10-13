import http from 'node:http';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat,readdir,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {MediaEngine,MEDIA_LIMITS,mediaJobDirectory} from './video-fusion/media-engine.mjs';

const secret=process.env.MEDIA_WORKER_SECRET||'';
if(secret.length<32)throw new Error('MEDIA_WORKER_SECRET_REQUIRED');
const expected=createHash('sha256').update(`Bearer ${secret}`).digest();
const root=path.resolve(process.env.MEDIA_JOB_DIR||'/scratch');
const fixture=process.env.MEDIA_WORKER_FIXTURE_OWNER==='canvas-video-fusion-20261013';
const engine=new MediaEngine({sharedRoot:root,fixture});
const jobs=new Map(),locks=new Map();let running=0,draining=false;
const terminal=status=>['completed','failed','cancelled'].includes(status);
await mkdir(root,{recursive:true,mode:0o700});
const retiredRoot=path.join(root,'.retired');await mkdir(retiredRoot,{recursive:true,mode:0o700});
async function atomicJson(file,value){const temporary=`${file}.${randomUUID()}.tmp`;try{await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,file);}finally{await rm(temporary,{force:true});}}
async function retiredState(id){mediaJobDirectory(root,id);return readFile(path.join(retiredRoot,`${id}.json`),'utf8').then(JSON.parse).catch(()=>null);}
async function retire(id,status){await atomicJson(path.join(retiredRoot,`${id}.json`),{id,status,retiredAt:new Date().toISOString()});}
if(!fixture){
  const id=randomUUID(),directory=mediaJobDirectory(root,id);await mkdir(path.join(directory,'inputs'),{recursive:true,mode:0o700});
  try{await engine.run(id,{action:'ffmpeg',inputs:[],outputs:[],args:['-version']});}
  finally{await rm(directory,{recursive:true,force:true});}
}
const authorized=request=>timingSafeEqual(expected,createHash('sha256').update(String(request.headers.authorization||'')).digest());
const send=(response,status,body)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(body));};
async function bodyOf(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>MEDIA_LIMITS.requestBytes)throw new Error('REQUEST_TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
async function persist(job){await atomicJson(path.join(mediaJobDirectory(root,job.id),'worker-state.json'),job.view);}
async function savedState(id){return readFile(path.join(mediaJobDirectory(root,id),'worker-state.json'),'utf8').then(JSON.parse).catch(()=>null);}
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
function capacity(){const values=[...jobs.values()];return {running,queued:values.filter(j=>j.view.status==='queued').length,terminal:values.filter(j=>terminal(j.view.status)).length};}
// Completed but unacknowledged output files survive a worker restart and still
// count against capacity. Pending snapshots are resumed only by the owning App.
for(const entry of await readdir(root,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^[0-9a-f-]{36}$/.test(entry.name))continue;
  const view=await savedState(entry.name);
  if(view?.owner==='naumi-media-worker'&&terminal(view.status))jobs.set(entry.name,{id:entry.name,digest:view.digest,controller:new AbortController(),view});
}
async function dispatch(){
  if(running>=MEDIA_LIMITS.concurrency)return;
  const job=[...jobs.values()].find(item=>item.view.status==='queued');if(!job)return;
  running++;job.view.status='processing';
  try{await persist(job);}catch{running--;job.view.status='failed';job.view.error='MEDIA_STATE_WRITE_FAILED';job.view.finishedAt=new Date().toISOString();void dispatch();return;}
  void engine.run(job.id,job.request,seconds=>{job.view.processedSeconds=seconds;},job.controller.signal)
    .then(result=>{job.view={...job.view,status:job.controller.signal.aborted?'cancelled':'completed',...(job.controller.signal.aborted?{}:{result}),finishedAt:new Date().toISOString()};})
    .catch(error=>{job.view={...job.view,status:job.controller.signal.aborted?'cancelled':'failed',error:String(error?.message||'MEDIA_PROCESS_FAILED').slice(0,2200),finishedAt:new Date().toISOString()};})
    .finally(async()=>{running--;await persist(job).catch(()=>{});void dispatch();});
  void dispatch();
}
const server=http.createServer(async(request,response)=>{
  if(!authorized(request)){send(response,401,{error:'UNAUTHORIZED'});return;}
  try{
    const url=new URL(request.url,'http://media-worker');
    if(request.method==='GET'&&url.pathname==='/health'){send(response,200,{ok:true,version:process.env.SOURCE_COMMIT||'fixture',sandbox:!fixture,draining,...capacity(),maxActive:MEDIA_LIMITS.queue});return;}
    if(request.method==='POST'&&['/drain','/resume'].includes(url.pathname)){draining=url.pathname==='/drain';send(response,200,{ok:true,draining,...capacity()});return;}
    const match=url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/);if(!match){send(response,404,{error:'NOT_FOUND'});return;}
    const id=match[1],directory=mediaJobDirectory(root,id);
    // A cancellation/acknowledgment marker lives outside the cleaned job folder:
    // a slow POST body cannot recreate a job after DELETE followed by PATCH.
    const requestBody=request.method==='POST'?await bodyOf(request):null;
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
        jobs.set(id,job);await persist(job);send(response,202,job.view);void dispatch();return;
      }
      const saved=job?job.view:await savedState(id);
      if(request.method==='GET'){const available=job||saved&&terminal(saved.status);send(response,available?200:404,available?saved:{error:'NOT_FOUND'});return;}
      if(request.method==='DELETE'){
        if(!terminal(job?.view.status||saved?.status))await retire(id,'cancelled');
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
  for(const entry of await readdir(retiredRoot,{withFileTypes:true})){
    if(!entry.isFile()||!/^([0-9a-f-]{36})\.json$/.test(entry.name))continue;
    const id=entry.name.slice(0,-5),receipt=await retiredState(id);
    if(receipt&&Date.now()-Date.parse(receipt.retiredAt)>86400000)await rm(path.join(retiredRoot,entry.name),{force:true});
  }
}
const collector=setInterval(()=>void collectInspectors().catch(()=>{}),60000);collector.unref();
server.requestTimeout=60000;server.headersTimeout=15000;
server.listen(Number(process.env.MEDIA_WORKER_PORT||3001),process.env.MEDIA_WORKER_HOST||'0.0.0.0',()=>console.log(JSON.stringify({event:'media-worker-ready',sandbox:!fixture})));
async function stop(){clearInterval(collector);for(const job of jobs.values())job.controller.abort();server.close();setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
