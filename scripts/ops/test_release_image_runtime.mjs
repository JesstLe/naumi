// Bounded local Docker image QA. Real HTTP middleware/routes/worker; no provider keys.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{execFileSync}from'node:child_process';import{randomUUID}from'node:crypto';import{request}from'@playwright/test';
const out=path.resolve(process.env.NAUMI_REAL_COMPAT_OUTPUT),stateFile=path.join(out,'runtime.json'),s=JSON.parse(await fs.readFile(stateFile,'utf8'));
assert(s.controlledNew);const base='http://127.0.0.1:'+s.newPort,commit=process.env.NAUMI_REAL_COMPAT_EXPECT_COMMIT||'6272c5ecb95b67aca6858d949d5da26157f4b6c4',workerSecret='compat-real-next-only-worker-secret-20261016';
const run=args=>execFileSync(args[0],args.slice(1),{encoding:'utf8',windowsHide:true,timeout:45000}).trim();
const sql=text=>run(['docker','exec',s.pg,'psql','-U','fixture','-d','compat','-At','-c',text]);
for(const name of [s.pg,s.new].filter(Boolean)){const inspected=JSON.parse(run(['docker','inspect',name]))[0];assert.equal(inspected.Config.Labels['io.naumi.real-next-compat'],s.tag)}
let checks=0;const is=(a,b)=>{assert.equal(a,b);checks++};const api=await request.newContext({baseURL:base});
const releaseHeaders={'x-release-control-secret':s.releaseSecret};
const getStatus=async()=>{const r=await api.get('/api/internal/release/status',{headers:releaseHeaders});is(r.status(),200);return r.json()};
try{
 const ver=await(await api.get('/api/version')).json();is(ver.commit,commit);is(Number(ver.version),Number(process.env.NAUMI_REAL_COMPAT_EXPECT_VERSION||'1792132681'));
 is((await api.get('/api/internal/release/status')).status(),404);
 let status=await getStatus();is(status.identity.instanceId,s.releaseInstanceId);is(status.identity.commit,commit);is(status.identity.bootSource,'preload');is(status.transport.verified,true);is(status.coverage.level,'partial');is(status.observations.acceptedTasks,null);is(status.admission.mode,'open');
 const email='image-runtime-'+s.tag+'@example.test';const reg=await api.post('/api/auth/register',{data:{email,password:'fixture-image-runtime-password',name:'Image Runtime'}});is(reg.status(),200);
 const change=async action=>{const current=await getStatus();const r=await api.post('/api/internal/release/control',{headers:releaseHeaders,data:{...current.identity,expectedRevision:current.admission.revision,operationId:randomUUID(),action}});is(r.status(),200);return r.json()};
 await change('drain');status=await getStatus();is(status.admission.mode,'draining');
 const denied=await api.post('/api/agent',{data:{sessionId:'ag-image-'+randomUUID(),message:'fixture new claim must not run'}});is(denied.status(),503);is((await denied.json()).error,'RELEASE_DRAINING');
 await change('resume');is((await getStatus()).admission.mode,'open');
 // A genuinely empty synthetic DB has no accepted supplier work. One actual
 // receipted scan can only inspect empty queues; it must report processed=0.
 is(Number(sql('SELECT count(*) FROM app_artworks')),0);
 const tick=randomUUID(),boot=randomUUID(),headers={'x-video-worker-secret':workerSecret,'x-naumi-worker-tick-id':tick,'x-naumi-worker-instance-id':'image-fixture-worker','x-naumi-worker-boot-id':boot,'x-naumi-worker-commit':commit,'x-naumi-worker-target-instance-id':s.releaseInstanceId};
 const tickPath='/api/video/worker/tick',getPath=tickPath+'?tickId='+tick;
 is((await api.get(getPath,{headers:{...headers,'x-video-worker-secret':'wrong-secret'}})).status(),401);
 const posted=await api.post(tickPath,{headers});is(posted.status(),200);const accepted=await posted.json();is(accepted.receipt.phase,'completed');is(accepted.receipt.result.processed,0);is(accepted.server.bootId,status.identity.bootId);
 const got=await api.get(getPath,{headers});is(got.status(),200);const receipt=await got.json();is(receipt.receipt.tickId,tick);is(receipt.receipt.worker.bootId,boot);is(receipt.receipt.web.bootId,status.identity.bootId);
 const duplicate=await api.post(tickPath,{headers});is(duplicate.status(),200);is((await duplicate.json()).duplicate,true);
 is((await api.get(getPath,{headers:{...headers,'x-naumi-worker-target-instance-id':'wrong-web'}})).status(),409);
 const worker=s.worker='real-next-worker-'+s.tag;
 run(['docker','run','-d','--name',worker,'--label','io.naumi.real-next-compat='+s.tag,'--network',s.network,'--memory','128m','--memory-swap','128m','--cpus','.5','--pids-limit','64','--tmpfs','/tmp:rw,size=16m','-e','NODE_OPTIONS=--max-old-space-size=64','-e','NAUMI_WORKER_RELEASE_CONTROL=1','-e','NAUMI_WORKER_START_PAUSED=1','-e','NAUMI_WORKER_STATE_FILE=/tmp/fixture/state.json','-e','NAUMI_INSTANCE_ID=image-paused-worker','-e','NAUMI_WORKER_TARGET_INSTANCE_ID='+s.releaseInstanceId,'-e','VIDEO_WORKER_SECRET='+workerSecret,'-e','NAUMI_APP_ORIGIN=http://'+s.new+':3000','-e','VIDEO_WORKER_INTERVAL_MS=60000',s.candidateImage,'node','scripts/video-worker.mjs']);
 s.created.push(worker);await fs.writeFile(stateFile,JSON.stringify(s,null,2));
 const workerFetch=(url,body)=>JSON.parse(run(['docker','exec',worker,'node','-e',`fetch('http://127.0.0.1:3001${url}',{method:${JSON.stringify(body?'POST':'GET')},headers:{'x-video-worker-secret':${JSON.stringify(workerSecret)},'content-type':'application/json'},${body?'body:'+JSON.stringify(JSON.stringify(body))+',':''}}).then(async r=>{if(!r.ok)throw Error(r.status+':'+await r.text());console.log(JSON.stringify(await r.json()))}).catch(e=>{console.error(e);process.exit(1)})`]));
 let ws;for(let n=0;n<20;n++){try{ws=workerFetch('/status');break}catch{await new Promise(r=>setTimeout(r,200))}}assert(ws);
 is(ws.phase,'QUIESCENT');is(ws.paused,true);is(ws.activeTicks,0);is(ws.durableTickReceipts,true);is(ws.acceptedTasks,null);
 const control={action:'drain',operationId:randomUUID(),bootId:ws.bootId,expectedRevision:ws.revision};const controlled=workerFetch('/control',control);is(controlled.state.paused,true);is(workerFetch('/control',control).duplicate,true);
 is(Number(sql('SELECT count(*) FROM app_worker_tick_receipts')),1);
 const final=await getStatus();is(final.observations.unknownLeases,0);is(final.observations.trackedAcceptedWork,0);
 const result={result:'PASS',checks,image:s.candidateImageId,commit,version:ver.version,controlledNew:status,receipt,worker:workerFetch('/status'),supplierCalls:0,productionConnections:0};await fs.writeFile(path.join(out,'image-runtime-result.json'),JSON.stringify(result,null,2));
 console.log('IMAGE_RUNTIME=PASS CHECKS='+checks+' PRELOAD=EXACT DRAIN_NEW_CLAIM=503 RESUME=OPEN ACTUAL_RECEIPT_GET=200 EMPTY_SCAN=0 PAUSED_WORKER=128MiB REAL_SUPPLIER_CALLS=0');
}finally{await api.dispose()}
