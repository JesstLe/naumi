import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
const secret='fixture-packaged-legacy-independent-secret-20261017';
let calls=0,child,logs='';
const app=http.createServer((request,response)=>{
 assert.equal(request.url,'/api/video/worker/tick');assert.equal(request.method,'POST');assert.equal(request.headers['x-video-worker-secret'],secret);
 calls++;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,processed:0}));
});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
try{
 child=spawn(process.execPath,['/app/scripts/video-worker.mjs'],{cwd:'/app',env:{...process.env,NAUMI_WORKER_RELEASE_CONTROL:'0',VIDEO_WORKER_CONTROL_PORT:'3001',VIDEO_WORKER_START_PAUSED:'1',VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',NAUMI_APP_ORIGIN:`http://127.0.0.1:${app.address().port}`},stdio:['ignore','pipe','pipe']});
 const done=new Promise(resolve=>child.once('exit',resolve));child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
 const request=(method,path,auth=true)=>fetch('http://127.0.0.1:3001'+path,{method,headers:auth?{authorization:'Bearer '+secret}:{},signal:AbortSignal.timeout(1500)});
 let ready=false;for(let index=0;index<100;index++){if(child.exitCode!==null)throw Error('Packaged worker exited: '+logs);try{if((await request('GET','/status')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Packaged control readiness');
 assert.equal((await request('GET','/status',false)).status,401);
 const initial=await (await request('GET','/status')).json();assert.equal(initial.mode,'paused');assert.equal(initial.completedTicks,0);assert.equal(calls,0);
 assert.equal((await request('POST','/resume')).status,200);
 let status;for(let index=0;index<100;index++){status=await (await request('GET','/status')).json();if(status.completedTicks===1)break;await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(status.completedTicks,1);assert.equal(calls,1);
 const drained=await (await request('POST','/drain')).json();assert.equal(drained.mode,'drained');assert.equal(drained.running,false);
 child.kill('SIGTERM');assert.equal(await done,0);assert.equal(calls,1);
 console.log(JSON.stringify({ok:true,scope:'actual-fixed-image-legacy-entrypoint',sourceCommit:process.env.SOURCE_COMMIT,version:process.env.BUILD_VERSION,pausedWithoutTicks:true,unauthorizedControlDenied:true,resumeOneRealAppTick:true,drainAndGracefulShutdown:true,supplierCalls:0}));
}finally{if(child?.exitCode===null)child.kill('SIGKILL');app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
