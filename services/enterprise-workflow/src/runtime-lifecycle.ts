import {randomUUID,timingSafeEqual} from 'node:crypto';
import type {Server,IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import {RuntimeError,type RuntimeConfig,type RuntimeBundle} from './runtime-config';
const command=z.strictObject({installationId:z.string(),releaseId:z.string(),slot:z.string(),bootId:z.string().uuid(),role:z.enum(['api','worker']),operationId:z.string().uuid(),reason:z.string().trim().min(1).max(500)});
function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...(status===503?{'retry-after':'2','connection':'close'}:{})});res.end(JSON.stringify(value));}
export function installRuntimeLifecycle(server:Server,c:RuntimeConfig,b:RuntimeBundle,role:'api'|'worker',ready:()=>Promise<unknown>,close:()=>Promise<void>){
 const original=server.listeners('request')[0] as ((req:IncomingMessage,res:ServerResponse)=>unknown)|undefined;server.removeAllListeners('request');
 const bootId=randomUUID(),startedAt=new Date().toISOString();let acceptingWork=false,activationId:string|null=null;let draining=false,stopping=false,activeRequests=0,activeWork=0,operationId:string|null=null,autoStop=false,drainStarted:number|null=null;
 const state=()=>({status:stopping?'stopping':draining?activeRequests+activeWork?'draining':'drained':'running',installationId:c.installationId,slot:c.slot,bootId,role,releaseId:b.releaseId,gitRevision:b.gitRevision,developmentBuild:b.sourceDirty,productSha256:b.productSha256,schemaVersion:b.schemaVersion,startedAt,activeRequests,activeWork,acceptingWork:role==='worker'?acceptingWork&&!draining:!draining,activationId,operationId,drainElapsedMs:drainStarted?Date.now()-drainStarted:0,rssBytes:process.memoryUsage().rss});
 const stop=async()=>{if(stopping||activeRequests+activeWork)return;stopping=true;await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await close();console.log('RUNTIME_STOPPED: '+JSON.stringify({role,slot:c.slot,bootId,activeRequests,activeWork}));};
 const changed=()=>{if(draining&&autoStop&&!activeRequests&&!activeWork)void stop().catch(()=>{console.error('RUNTIME_STOP_FAILED');process.exitCode=1;});};
 const beginDrain=(id:string,terminate=false)=>{if(!draining){draining=true;operationId=id;drainStarted=Date.now();console.log('RUNTIME_DRAIN_STARTED: '+JSON.stringify({role,slot:c.slot,bootId,operationId}));}autoStop||=terminate;changed();};
 server.on('request',(req,res)=>{void(async()=>{
  const port=role==='api'?c.apiPort:c.workerPort;if(req.headers.host!==`127.0.0.1:${port}`)return json(res,400,{error:'HOST_REQUIRED'});const u=new URL(req.url||'/','http://127.0.0.1:'+port);
  if(u.pathname.startsWith('/internal/lifecycle/')){
   const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+c.controlToken);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(res,401,{error:'CONTROL_AUTH_REQUIRED'});
   if(u.search)return json(res,400,{error:'CONTROL_QUERY_INVALID'});if(req.method==='GET'&&u.pathname==='/internal/lifecycle/status')return json(res,200,state());
   if(req.method!=='POST'||!['/internal/lifecycle/drain','/internal/lifecycle/stop','/internal/lifecycle/activate'].includes(u.pathname))return json(res,404,{error:'NOT_FOUND'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON_REQUIRED'});let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>8192)return json(res,413,{error:'BODY_TOO_LARGE'});chunks.push(chunk);}let input;try{input=command.parse(JSON.parse(Buffer.concat(chunks).toString()));}catch{return json(res,400,{error:'CONTROL_INPUT_INVALID'});}
   if(input.installationId!==c.installationId||input.releaseId!==b.releaseId||input.slot!==c.slot||input.bootId!==bootId||input.role!==role)return json(res,409,{error:'CONTROL_TARGET_CHANGED'});
   if(u.pathname.endsWith('/activate')){if(role!=='worker'||draining)return json(res,409,{error:'WORKER_ACTIVATION_NOT_ALLOWED'});if(activationId){if(activationId!==input.operationId)return json(res,409,{error:'ACTIVATION_OPERATION_CHANGED'});return json(res,202,{...state(),replayed:true});}try{await ready();}catch{return json(res,503,{error:'RUNTIME_NOT_READY'});}if(draining)return json(res,409,{error:'WORKER_ACTIVATION_NOT_ALLOWED'});if(activationId){if(activationId!==input.operationId)return json(res,409,{error:'ACTIVATION_OPERATION_CHANGED'});return json(res,202,{...state(),replayed:true});}acceptingWork=true;activationId=input.operationId;console.log('RUNTIME_WORKER_ACTIVATED: '+JSON.stringify({slot:c.slot,bootId,activationId}));return json(res,202,state());}
   if(operationId&&operationId!==input.operationId)return json(res,409,{error:'DRAIN_OPERATION_CHANGED'});
   if(u.pathname.endsWith('/drain')){beginDrain(input.operationId);return json(res,202,state());}
   if(!draining||activeRequests+activeWork)return json(res,409,{error:'DRAIN_INCOMPLETE',...state()});json(res,202,state());setTimeout(()=>void stop().catch(()=>{console.error('RUNTIME_STOP_FAILED');process.exitCode=1;}),50);return;
  }
  if(req.method==='GET'&&u.pathname==='/healthz')return json(res,200,{...state(),status:'alive'});
  if(req.method==='GET'&&u.pathname==='/readyz'){if(draining)return json(res,503,{...state(),ready:false,error:'DRAINING'});try{return json(res,200,{...state(),ready:true,checks:await ready()});}catch(e){return json(res,503,{...state(),ready:false,error:e instanceof RuntimeError?e.code:'RUNTIME_NOT_READY'});}}
  if(draining)return json(res,503,{error:'RUNTIME_DRAINING',releaseId:b.releaseId});
  if(role==='worker'||!original)return json(res,404,{error:'NOT_FOUND'});
  activeRequests++;let responseDone=false,handlerDone=false,finished=false;const done=()=>{if(!finished&&responseDone&&handlerDone){finished=true;activeRequests--;changed();}};res.once('finish',()=>{responseDone=true;done();});res.once('close',()=>{responseDone=true;done();});
  try{await original.call(server,req,res);}catch{if(!res.headersSent)json(res,500,{error:'RUNTIME_REQUEST_FAILED'});else res.destroy();}finally{handlerDone=true;done();}
 })().catch(()=>{if(!res.headersSent)json(res,500,{error:'RUNTIME_REQUEST_FAILED'});else res.destroy();});});
 server.maxConnections=256;server.maxRequestsPerSocket=100;
 const signal=()=>beginDrain(operationId??randomUUID(),true);process.once('SIGTERM',signal);process.once('SIGINT',signal);
 server.once('close',()=>{process.removeListener('SIGTERM',signal);process.removeListener('SIGINT',signal);});
 return {state,get draining(){return draining;},get acceptingWork(){return acceptingWork&&!draining;},async work<T>(fn:()=>Promise<T>){if(draining||!acceptingWork)throw new RuntimeError('RUNTIME_NOT_ACCEPTING_WORK');activeWork++;try{return await fn();}finally{activeWork--;changed();}}};
}
