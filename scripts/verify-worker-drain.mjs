import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if(process.platform==='win32')throw new Error('POSIX SIGTERM acceptance requires the Linux fixture runtime');

const secret='fixture-only-worker-secret-20261014-not-production';
const responses=[];let ticks=0,disconnected=0,output='',exited=false,exitCode;
const supplier=http.createServer((req,res)=>{
 assert.equal(req.url,'/api/video/worker/tick');assert.equal(req.headers['x-video-worker-secret'],secret);
 ticks++;responses.push(res);res.on('close',()=>{if(!res.writableEnded)disconnected++;});
});
await new Promise(resolve=>supplier.listen(0,'127.0.0.1',resolve));
const port=supplier.address().port,probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const control=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const child=spawn(process.execPath,[fileURLToPath(new URL('./video-worker.mjs',import.meta.url))],{env:{PATH:process.env.PATH,NAUMI_APP_ORIGIN:`http://127.0.0.1:${port}`,VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',VIDEO_WORKER_CONTROL_PORT:String(control),VIDEO_WORKER_START_PAUSED:'1'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('exit',code=>{exited=true;exitCode=code;});
const wait=async(predicate,timeout=7000)=>{const until=Date.now()+timeout;while(!await predicate()){if(Date.now()>until)throw new Error('Fixture wait deadline');await new Promise(resolve=>setTimeout(resolve,20));}};
const request=async(path,method='GET',auth=secret)=>{const response=await fetch(`http://127.0.0.1:${control}${path}`,{method,headers:{authorization:`Bearer ${auth}`},signal:AbortSignal.timeout(2000)});return {status:response.status,data:response.status===200?await response.json():null};};
const release=res=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({processed:1,at:'fixture'}));};
try{
 await wait(()=>output.includes('private-control-ready'));assert.equal(ticks,0,'standby must not claim historical work');
 assert.equal((await request('/drain','POST','wrong')).status,401);assert.equal((await request('/status')).data.mode,'paused');
 await request('/resume','POST');await wait(()=>ticks===1);assert.equal((await request('/status')).data.running,true);
 await request('/resume','POST');assert.equal(ticks,1,'resume cannot double-submit an active tick');
 assert.equal((await request('/drain','POST')).data.mode,'draining');
 await new Promise(resolve=>setTimeout(resolve,5250));assert.equal(ticks,1);assert.equal(disconnected,0,'drain must not abort in-flight recoveries');
 release(responses[0]);await wait(async()=>{const s=(await request('/status')).data;return s.mode==='drained'&&!s.running;});
 assert.equal((await request('/status')).data.completedTicks,1);await request('/resume','POST');await wait(()=>ticks===2);
 child.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,100));assert.equal(exited,false,'SIGTERM waits for existing tick');assert.equal(disconnected,0);
 release(responses[1]);await wait(()=>exited);assert.equal(exitCode,0);assert.equal(ticks,2);assert.equal(disconnected,0);
 console.log('WORKER_DRAIN=PASS PRIVATE_LOOPBACK_AUTH STANDBY_CLAIMS0 ACTIVE_DRAIN_NO_ABORT_INTERVAL_NO_NEW_CLAIMS RESUME_SINGLE_TICK SIGTERM_WAITS_AND_EXIT0 PROVIDER_CALLS0');
}finally{
 if(!exited)child.kill('SIGKILL');for(const res of responses)if(!res.writableEnded)res.destroy();supplier.closeAllConnections();await new Promise(resolve=>supplier.close(resolve));
}
