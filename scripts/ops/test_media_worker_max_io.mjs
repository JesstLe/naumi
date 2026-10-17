import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

assert.equal(process.platform,'linux');assert.equal(process.getuid?.(),0);
assert.equal(process.env.MEDIA_MEMORY_VERIFY_OWNER,'canvas-video-fusion-20261013');
for (const name of ['DATABASE_URL','SETTINGS_SECRET','R2_SECRET_ACCESS_KEY','S3_SECRET_ACCESS_KEY','VIDEO_API_KEY']) assert.equal(process.env[name],undefined);
const config=JSON.parse(await fs.readFile('/probe/config.json','utf8'));
assert.equal(process.env.SOURCE_COMMIT,config.sourceCommit);
assert.equal(config.owner,'canvas-video-fusion-20261013');assert.equal(config.inputBytes,249*1024*1024);assert.equal(config.jobs.length,2);
assert.equal(new Set(config.jobs.map(j=>j.id)).size,2);
for(const job of config.jobs)assert.match(job.id,/^[a-f0-9-]{36}$/);
const routes=await fs.readFile('/proc/net/route','utf8');assert.ok(!routes.split('\n').slice(1).some(row=>row.trim().split(/\s+/)[1]==='00000000'));
const headers={authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET,'content-type':'application/json'};
const call=async(method,route,body)=>{
  const r=await fetch('http://127.0.0.1:3001'+route,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  return {status:r.status,body:await r.json()};
};
const timeline=[];
for(let n=0;n<120;n++){
  try{const r=await call('GET','/health');if(r.status===200&&r.body.ok&&r.body.sandbox)break;}catch{}
  if(n===119)throw Error('MEDIA_READY_TIMEOUT');await new Promise(r=>setTimeout(r,250));
}
const unauthorized=await fetch('http://127.0.0.1:3001/health');assert.equal(unauthorized.status,401);
await Promise.all(config.jobs.map(async job=>{
  const response=await call('POST','/jobs/'+job.id,{action:'ffmpeg',inputs:[{name:'input-0.wav',bytes:config.inputBytes,sha256:config.inputSha256}],outputs:['large.wav'],args:['-stream_loop','1','-i','asset:0','-c:a','pcm_s16le','output:0']});
  assert.equal(response.status,202);timeline.push({id:job.id,event:'accepted',at:Date.now()});
}));
let peakRunning=0,finished=[];const until=Date.now()+230000;
while(Date.now()<until){
  const health=await call('GET','/health');assert.equal(health.status,200);peakRunning=Math.max(peakRunning,health.body.running);
  finished=await Promise.all(config.jobs.map(async job=>{const r=await call('GET','/jobs/'+job.id);assert.equal(r.status,200);return r.body;}));
  if(finished.every(j=>['completed','failed','cancelled'].includes(j.status)))break;
  await new Promise(r=>setTimeout(r,100));
}
const verified=[];
for (const [index,job] of finished.entries()){
  assert.equal(job.status,'completed',String(job.error||job.status));const item=job.result.outputs[0];
  assert.equal(item.name,'large.wav');assert.ok(item.bytes>497*1024*1024&&item.bytes<=500*1024*1024);
  const file=path.join('/scratch',config.jobs[index].id,'results/large.wav');const hash=createHash('sha256');
  for await(const block of createReadStream(file))hash.update(block);
  assert.equal(hash.digest('hex'),item.sha256);assert.ok(item.probe.audioCodecs.includes('pcm_s16le'));
  verified.push({id:job.id,bytes:item.bytes,sha256:item.sha256,durationSeconds:item.probe.durationSeconds});
}
assert.equal(peakRunning,2);assert.equal(verified.length,2);
const result={result:'PASS',scope:'actual-private-media-worker-http-two-max-io-jobs',sourceCommit:config.sourceCommit,peakRunning,verified,timeline,inputBytes:config.inputBytes,inputSha256:config.inputSha256,productionConnections:0,supplierCalls:0,fixtureAdaptations:['synthetic PCM silence WAV input','Node HTTP client inside the media cgroup adds client overhead']};
await fs.writeFile('/scratch/PROBE_RESULT.json',JSON.stringify(result,null,2));
console.log('MEDIA_MAX_IO=PASS CONCURRENT=2 INPUT_MIB=249 OUTPUT_MIB_PER_JOB='+verified.map(x=>(x.bytes/1048576).toFixed(2)).join(','));
