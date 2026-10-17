import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

const secret='fixture-recovery-'.padEnd(40,'x'),commit='a'.repeat(40);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<180;i++){const v=await fn().catch(()=>null);if(v)return v;await wait(50)}throw Error('fixture deadline')}

test('real worker process survives clean restart and retains UNKNOWN after SIGKILL without a second POST',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-process-recovery-'));
 let child,posts=0,lose=false,dispatched=false;
 const tick=http.createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(404).end();return}
  posts++;dispatched=true;
  if(lose){req.socket.destroy();return}
  const worker={instanceId:req.headers['x-naumi-worker-instance-id'],bootId:req.headers['x-naumi-worker-boot-id'],commit};
  const web={instanceId:'web',bootId:'22222222-2222-4222-8222-222222222222',commit};
  res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,server:web,receipt:{schemaVersion:1,
   tickId:req.headers['x-naumi-worker-tick-id'],worker,web,phase:'completed',acceptedAt:new Date().toISOString(),
   completedAt:new Date().toISOString(),result:{ok:true,processed:0}}}));
 });
 await new Promise(r=>tick.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const env={...process.env,NODE_OPTIONS:'',NAUMI_APP_ORIGIN:`http://127.0.0.1:${tick.address().port}`,
  VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:'worker',
  NAUMI_WORKER_TARGET_INSTANCE_ID:'web',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',
  NAUMI_WORKER_CONTROL_PORT:String(port),NAUMI_WORKER_STATE_FILE:path.join(dir,'worker.json')};
 const request=async(body)=>{const r=await fetch(`http://127.0.0.1:${port}/${body?'control':'status'}`,{method:body?'POST':'GET',
  headers:{'x-video-worker-secret':secret},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(1000)});return {status:r.status,data:await r.json()}};
 const start=async()=>{child=spawn(process.execPath,['scripts/video-worker.mjs'],{env,stdio:['ignore','pipe','pipe']});return await until(async()=>{const r=await request();return r.status===200?r.data:null})};
 const control=async(action,s)=>request({action,operationId:crypto.randomUUID(),bootId:s.bootId,expectedRevision:s.revision});
 try{
  const first=await start();assert.equal(first.paused,true);assert.equal(posts,0);
  assert.equal((await control('resume',first)).status,200);
  const completed=await until(async()=>{const s=(await request()).data;return s.lastTick?.phase==='complete'?s:null});
  assert.equal(posts,1);assert.equal((await control('drain',completed)).status,200);
  child.kill('SIGTERM');await once(child,'exit');const second=await start();assert.notEqual(second.bootId,first.bootId);
  assert.equal(second.paused,true);assert.equal(second.lastTick.phase,'complete');assert.equal(posts,1);
  lose=true;dispatched=false;assert.equal((await control('resume',second)).status,200);
  const unknown=await until(async()=>{const s=(await request()).data;return dispatched&&s.phase==='UNKNOWN'?s:null});
  assert.equal(posts,2);child.kill('SIGKILL');await once(child,'exit');const third=await start();
  assert.equal(third.phase,'UNKNOWN');assert.equal(third.paused,true);assert.equal(third.lastTick.id,unknown.lastTick.id);
  assert.equal((await control('resume',third)).status,409);await wait(5500);assert.equal(posts,2);
  const saved=JSON.parse(await readFile(env.NAUMI_WORKER_STATE_FILE,'utf8'));
  assert.equal(saved.lastTick.id,unknown.lastTick.id);assert.equal(saved.uncertain,true);
 }finally{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit')}
  await new Promise(r=>tick.close(r));await rm(dir,{recursive:true,force:true});
 }
});
