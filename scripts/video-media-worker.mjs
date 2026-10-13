import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import {MediaEngine,MEDIA_LIMITS,mediaJobDirectory} from './video-fusion/media-engine.mjs';

const secret=process.env.MEDIA_WORKER_SECRET||'';
if(secret.length<32)throw new Error('MEDIA_WORKER_SECRET_REQUIRED');
const expected=createHash('sha256').update(`Bearer ${secret}`).digest();
const root=path.resolve(process.env.MEDIA_JOB_DIR||'/scratch');
const fixture=process.env.MEDIA_WORKER_FIXTURE_OWNER==='canvas-video-fusion-20261013';
const engine=new MediaEngine({sharedRoot:root,fixture});
const jobs=new Map();let running=0;
await mkdir(root,{recursive:true,mode:0o700});
const authorized=request=>timingSafeEqual(expected,createHash('sha256').update(String(request.headers.authorization||'')).digest());
const send=(response,status,body)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(body));};
async function bodyOf(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>128*1024)throw new Error('REQUEST_TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
async function persist(job){await writeFile(path.join(mediaJobDirectory(root,job.id),'worker-state.json'),JSON.stringify(job.view),{mode:0o600});}
function publicView(job){return {...job.view};}
async function dispatch(){
  if(running>=MEDIA_LIMITS.concurrency)return;
  const job=[...jobs.values()].find(item=>item.view.status==='queued');if(!job)return;
  running++;job.view.status='processing';await persist(job);
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
    if(request.method==='GET'&&url.pathname==='/health'){send(response,200,{ok:true,version:process.env.SOURCE_COMMIT||'fixture',sandbox:!fixture,running,queued:[...jobs.values()].filter(j=>j.view.status==='queued').length});return;}
    const match=url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/);if(!match){send(response,404,{error:'NOT_FOUND'});return;}
    const id=match[1],directory=mediaJobDirectory(root,id);let job=jobs.get(id);
    if(request.method==='POST'){
      const requestBody=await bodyOf(request),digest=createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
      if(job){send(response,job.digest===digest?200:409,job.digest===digest?publicView(job):{error:'JOB_OPERATION_CONFLICT'});return;}
      if(jobs.size>=1000){send(response,429,{error:'MEDIA_QUEUE_FULL'});return;}
      const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('INVALID_JOB_DIRECTORY');
      const previous=await readFile(path.join(directory,'worker-state.json'),'utf8').then(JSON.parse).catch(()=>null);
      if(previous&&previous.digest!==digest){send(response,409,{error:'JOB_OPERATION_CONFLICT'});return;}
      if(previous&&['completed','failed','cancelled'].includes(previous.status)){
        send(response,200,previous);return;
      }
      job={id,request:requestBody,digest,controller:new AbortController(),view:{id,digest,status:'queued',processedSeconds:0,createdAt:new Date().toISOString()}};
      jobs.set(id,job);await persist(job);send(response,202,publicView(job));void dispatch();return;
    }
    if(!job){
      const saved=await readFile(path.join(directory,'worker-state.json'),'utf8').then(JSON.parse).catch(()=>null);
      if(saved&&['completed','failed','cancelled'].includes(saved.status)&&request.method==='GET'){send(response,200,saved);return;}
      if(saved&&['completed','failed','cancelled'].includes(saved.status)&&request.method==='PATCH'){await rm(directory,{recursive:true,force:true});send(response,200,{ok:true});return;}
      send(response,404,{error:'NOT_FOUND'});return;
    }
    if(request.method==='GET'){send(response,200,publicView(job));return;}
    if(request.method==='DELETE'){
      if(!['completed','failed','cancelled'].includes(job.view.status)){
        job.controller.abort();if(job.view.status==='queued'){job.view.status='cancelled';job.view.finishedAt=new Date().toISOString();await persist(job);}
      }
      send(response,202,publicView(job));return;
    }
    if(request.method==='PATCH'&&['completed','failed','cancelled'].includes(job.view.status)){
      // Acknowledgment follows durable App publication; only this UUID's copies are removed.
      jobs.delete(id);await rm(directory,{recursive:true,force:true});send(response,200,{ok:true});return;
    }
    send(response,405,{error:'METHOD_NOT_ALLOWED'});
  }catch(error){send(response,400,{error:String(error?.message||'MEDIA_REQUEST_FAILED').slice(0,2200)});}
});
server.listen(Number(process.env.MEDIA_WORKER_PORT||3001),process.env.MEDIA_WORKER_HOST||'0.0.0.0',()=>console.log(JSON.stringify({event:'media-worker-ready',sandbox:!fixture})));
async function stop(){for(const job of jobs.values())job.controller.abort();server.close();setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
